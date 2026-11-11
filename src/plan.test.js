// Tests unitaires de src/plan.js (modele du 24/10/2026 : etat du reservoir, achat
// « juste ce qu'il faut » ou « plein » a chaque arret, carburant consomme + 0,80 EUR par
// arret). Chaque cas construit ses stations avec des prix et des km ronds pour que le
// resultat attendu soit calculable a la main (voir le commentaire de chaque test).
// Ne pas modifier plan.js pour faire passer ces tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {optimiserPlan, pleinsExtremites, autonomieUtile, coutVoyage, prixMax, prixMoyen, economieVsPlusCher} = require('./plan.js');

function presque(a, b, tol = 1e-9){ return Math.abs(a - b) < tol; }
const st = (s, km, p, e = 0) => ({s, km, e, p});

// ---- optimiserPlan ----

test('aucun arret necessaire quand total <= A : reste = A - total, voyage = pd x total', () => {
  const r = optimiserPlan([st('D', 5, 1.0)], 100, 80, 1);
  assert.deepStrictEqual(r.plan, []);
  assert.strictEqual(r.coutAchats, 0);
  assert.strictEqual(r.reste, 20);
  assert.ok(presque(r.voyage, 80));
  assert.strictEqual(optimiserPlan([], 100, 80, 1).voyage, null);   // pd inconnu : non chiffrable
});

test('infaisable : aucune station atteignable', () => {
  assert.deepStrictEqual(optimiserPlan([], 100, 150, 1), {plan: null});
  // Une station trop loin pour le plein de depart : infaisable aussi.
  assert.deepStrictEqual(optimiserPlan([st('S', 120, 1)], 100, 150, 1), {plan: null});
});

test('cas Montpellier -> Tours : la moins chere ATTEIGNABLE gagne, pas la plus tardive', () => {
  // A 370, total 660, 10 L/100. Il manque 290 km. BON (km 300, 0.85) et CHER (km 360, 1.05)
  // permettent tous deux un seul arret. Ancien modele : CHER (moins de reste a facturer).
  // Nouveau : BON, achat juste 290 km = 29 L a 0.85 = 24.65 EUR.
  const D = st('D', 5, 0.90), BON = st('BON', 300, 0.85), CHER = st('CHER', 360, 1.05), F = st('F', 655, 0.90);
  const r = optimiserPlan([D, BON, CHER, F], 370, 660, 0.1, {utiles: true});
  assert.deepStrictEqual(r.plan.map(e => e.s), ['BON']);
  assert.strictEqual(r.plan[0].plein, false);
  assert.ok(presque(r.plan[0].q, 290) && presque(r.plan[0].litres, 29) && presque(r.plan[0].arrivee, 70));
  assert.ok(presque(r.coutAchats, 24.65));
  // voyage = plein de depart (370 km a 0.90 = 33.30) + achats = 57.95 ; reste 0.
  assert.ok(presque(r.voyage, 57.95));
  assert.strictEqual(r.reste, 0);
  assert.ok(r.utiles.has('BON') && !r.utiles.has('CHER'));
});

test('utiles : une station a moins de 0,50 EUR de l\'optimum est retenue', () => {
  const D = st('D', 5, 0.90), BON = st('BON', 300, 0.85), BON2 = st('BON2', 305, 0.851), CHER = st('CHER', 360, 1.05);
  const r = optimiserPlan([D, BON, BON2, CHER], 370, 660, 0.1, {utiles: true});
  assert.ok(r.utiles.has('BON') && r.utiles.has('BON2') && !r.utiles.has('CHER'));
  assert.strictEqual(optimiserPlan([D, BON, BON2, CHER], 370, 660, 0.1).utiles, undefined);   // sans option : pas de passe arriere
});

test('plein a une station pas chere pour acheter moins a l\'arret cher impose ensuite', () => {
  // A 370, total 700. C1 (km 100, 0.70) puis E (km 400, 1.20), seule station atteignable
  // depuis C1 permettant de finir. Juste a C1 (30 km) puis 300 km a 1.20 = 21 + 360 ;
  // plein a C1 (100 km = 70) puis 230 km a 1.20 = 276 : 346 < 381.
  const D = st('D', 5, 0.90), C1 = st('C1', 100, 0.70), E = st('E', 400, 1.20);
  const r = optimiserPlan([D, C1, E], 370, 700, 1);
  assert.deepStrictEqual(r.plan.map(e => [e.s, e.plein, e.q]), [['C1', true, 100], ['E', false, 230]]);
  assert.ok(presque(r.coutAchats, 346));
  assert.ok(presque(r.voyage, 0.90 * 370 + 346));
});

test('deux arrets imposes par l\'autonomie, plan en km croissants, quantites exactes', () => {
  // A 100, total 250. S1 (km 90, 1.0), S2 (km 180, 1.1). Plein a S1 (90 km) -> S2 avec 10
  // -> juste 60 km a 1.1 = 66 : 156 ; juste a S1 (80) -> S2 vide -> 70 a 1.1 = 77 : 157.
  const D = st('D', 5, 1.0), S1 = st('S1', 90, 1.0), S2 = st('S2', 180, 1.1);
  const r = optimiserPlan([D, S1, S2], 100, 250, 1);
  assert.deepStrictEqual(r.plan.map(e => e.s), ['S1', 'S2']);
  assert.ok(presque(r.coutAchats, 156));
  assert.ok(presque(r.voyage, 100 + 156));
});

test('la penalite de 0,80 EUR evite un arret inutile', () => {
  // A 100, total 120 : un arret suffit (20 km a acheter). Deux stations a 1.0 a km 50 et
  // 60 : un seul arret retenu, jamais deux.
  const r = optimiserPlan([st('D', 5, 1.0), st('S1', 50, 1.0), st('S2', 60, 1.0)], 100, 120, 1);
  assert.strictEqual(r.plan.length, 1);
  assert.ok(presque(r.coutAchats, 20));
});

test('le detour compte a l\'aller et au retour : une station moins chere mais loin perd', () => {
  // A 100, total 150, 1 L/km. P (km 60, e 0, 1.00) : arrive avec 40, il manque 50 km -> 50.
  // L (km 60, e 1, 0.95) : arrive avec 39, il manque 52 km -> 49.40 : L gagne.
  // L a e 10 : arrive avec 30, il manque 70 km -> 66.50 : P gagne (le detour se paie).
  const r1 = optimiserPlan([st('D', 5, 1.0), st('P', 60, 1.00), st('L', 60, 0.95, 1)], 100, 150, 1);
  assert.strictEqual(r1.plan[0].s, 'L');
  assert.ok(presque(r1.coutAchats, 49.4));
  const r2 = optimiserPlan([st('D', 5, 1.0), st('P', 60, 1.00), st('L', 60, 0.95, 10)], 100, 150, 1);
  assert.strictEqual(r2.plan[0].s, 'P');
  assert.ok(presque(r2.coutAchats, 50));
});

test('elagage au-dela de 240 candidats : plan toujours faisable', () => {
  const cand = [];
  for(let k = 1; k <= 600; k++) cand.push(st('S' + k, k, 0.8 + ((k * 7) % 30) / 100));
  const r = optimiserPlan(cand, 200, 600, 0.07, {utiles: true});
  assert.ok(Array.isArray(r.plan) && r.plan.length >= 2 && r.plan.length <= 4);
  for(let i = 1; i < r.plan.length; i++) assert.ok(r.plan[i].km > r.plan[i - 1].km);
});

// ---- pleinsExtremites : plein au depart et a l'arrivee ----

test('depart : la moins chere dans les 15 premiers km, celles au-dela ignorees', () => {
  const r = pleinsExtremites([st('D1', 3, 0.90, 1), st('D2', 12, 0.85, 2), st('LOIN', 40, 0.70)], 600);
  assert.strictEqual(r.depart.s, 'D2');
});

test('a prix egal, le plus petit detour l\'emporte', () => {
  assert.strictEqual(pleinsExtremites([st('A1', 5, 0.85, 4), st('A2', 9, 0.85, 1)], 600).depart.s, 'A2');
});

test('arrivee : la moins chere dans les 15 derniers km', () => {
  const r = pleinsExtremites([st('M', 300, 0.60), st('F1', 590, 0.88, 3), st('F2', 598, 0.84, 1)], 600);
  assert.strictEqual(r.arrivee.s, 'F2');
  assert.strictEqual(r.depart, null);
});

test('aucune station : depart et arrivee null', () => {
  assert.deepStrictEqual(pleinsExtremites([], 600), {depart: null, arrivee: null});
});

// ---- autonomieUtile ----

test('autonomie saisie : elle prime sur le reservoir, reserve deduite', () => {
  assert.deepStrictEqual(autonomieUtile(7, 40, 600, 30), {plein: 600, A: 570, source: 'autonomie'});
});

test('sans autonomie : reservoir / conso x 100', () => {
  assert.deepStrictEqual(autonomieUtile(8, 40, 0, 50), {plein: 500, A: 450, source: 'reservoir'});
});

test('ni autonomie ni reservoir exploitable : null', () => {
  assert.strictEqual(autonomieUtile(7, 0, 0, 30), null);
  assert.strictEqual(autonomieUtile(0, 40, 0, 30), null);
});

test('autonomie saisie sans conso : l\'autonomie suffit a situer les arrets', () => {
  assert.deepStrictEqual(autonomieUtile(0, 0, 650, 30), {plein: 650, A: 620, source: 'autonomie'});
});

// ---- coutVoyage, prixMax, prixMoyen, economieVsPlusCher ----

test('coutVoyage : reprend le voyage du plan ; null si infaisable', () => {
  const r = optimiserPlan([st('D', 5, 0.90), st('BON', 300, 0.85)], 370, 660, 0.1);
  assert.ok(presque(coutVoyage([], r), r.voyage));
  assert.strictEqual(coutVoyage([], {plan: null}), null);
  assert.strictEqual(coutVoyage([], null), null);
});

test('prixMax : le plus cher du couloir ; vide -> null', () => {
  assert.strictEqual(prixMax([st('a', 0, 0.9), st('b', 0, 0.7), st('c', 0, 1.05)]), 1.05);
  assert.strictEqual(prixMax([]), null);
});

test('prixMoyen : carburant du voyage / litres consommes (cas Tours : 57.95 EUR pour 66 L)', () => {
  const r = optimiserPlan([st('D', 5, 0.90), st('BON', 300, 0.85)], 370, 660, 0.1);
  assert.ok(presque(prixMoyen(r, 0.1, 370), 57.95 / 66));
  assert.strictEqual(prixMoyen({plan: null}, 0.1, 370), null);
});

test('economie nulle quand tous les prix sont egaux', () => {
  const cand = [st('D', 5, 0.9), st('S', 300, 0.9), st('F', 655, 0.9)];
  const r = optimiserPlan(cand, 370, 660, 0.1);
  const eco = economieVsPlusCher(cand, 370, 660, 0.1, r.voyage);
  assert.ok(presque(eco.economie, 0) && presque(eco.prix, 0.9));
});

test('economie positive quand une station moins chere est sur le trajet (cas Tours)', () => {
  // plus cher de [0.90, 0.85, 1.05, 0.90] = 1.05 ; reference : 660 km a 1.05 = 69.30 ;
  // reel 57.95 -> economie 11.35.
  const cand = [st('D', 5, 0.90), st('BON', 300, 0.85), st('CHER', 360, 1.05), st('F', 655, 0.90)];
  const r = optimiserPlan(cand, 370, 660, 0.1);
  const eco = economieVsPlusCher(cand, 370, 660, 0.1, r.voyage);
  assert.ok(presque(eco.economie, 11.35) && presque(eco.reference, 69.3) && eco.prix === 1.05);
});

// ---- g0 : carburant a bord au depart (demande du 24/10/2026) ----

test('a bord au depart : plein en route si moins cher qu\'au depart, et seulement le manque', () => {
  // A 400, g0 200, total 300 : il manque 100 km. D (km 5, 1.00) ou S (km 150, 0.80) :
  // S, juste 100 km = 80 ; a D ce serait 100. Les 200 km a bord comptent au prix du depart.
  const D = st('D', 5, 1.00), S = st('S', 150, 0.80);
  const r = optimiserPlan([D, S], 400, 300, 1, {g0: 200});
  assert.deepStrictEqual(r.plan.map(e => [e.s, e.plein, e.q]), [['S', false, 100]]);
  assert.ok(presque(r.plan[0].arrivee, 50));
  assert.ok(presque(r.voyage, 1.00 * 200 + 80));
  // Station du depart moins chere que la route : on y achete le manque (arrive avec 195).
  const r2 = optimiserPlan([D, st('S', 150, 1.20)], 400, 300, 1, {g0: 200});
  assert.deepStrictEqual(r2.plan.map(e => [e.s, e.q]), [['D', 100]]);
});

test('a bord suffisant : aucun arret ; insuffisant pour la premiere station : infaisable', () => {
  assert.deepStrictEqual(optimiserPlan([st('D', 5, 1)], 400, 150, 1, {g0: 200}).plan, []);
  assert.deepStrictEqual(optimiserPlan([st('S', 150, 1)], 400, 300, 1, {g0: 100}), {plan: null});
});

// ---- opts.reserve : reservoir presque vide, reserve entamee jusqu'a la premiere station (D08) ----

test('D08 : reservoir 20 km, reserve 30, station au km 3 : la reserve est entamee jusqu\'a elle', () => {
  // 20 km a bord pour 30 de reserve : g0 = 20 - 30 = -10 (deja 10 km sous la reserve). S3 (km 3,
  // detour 0,2) est a 3,2 km : on y arrive avec -13,2. De la, juste ce qu'il faut pour l'arrivee :
  // 57 + 0,2 km + les 13,2 km qui manquent a la reserve = 70,4 km a 1,70 (7,7792 EUR). Par S40
  // en plus (50,5 km a 1,70 puis 20,1 km a 1,60 + un arret) ce serait plus cher.
  const cand = [{s: 'S3', km: 3, e: 0.2, p: 1.7}, {s: 'S40', km: 40, e: 0.1, p: 1.6}];
  assert.strictEqual(optimiserPlan(cand, 570, 60, 0.065, {g0: 0, pd: 1.7}).plan, null);     // sans l'option : inchange
  assert.strictEqual(optimiserPlan(cand, 570, 60, 0.065, {g0: -10, pd: 1.7}).plan, null);
  const r = optimiserPlan(cand, 570, 60, 0.065, {g0: -10, pd: 1.7, reserve: 30, utiles: true});
  assert.deepStrictEqual(r.plan.map(e => [e.s, e.plein]), [['S3', false]]);
  assert.ok(presque(r.plan[0].arrivee, -13.2) && presque(r.plan[0].q, 70.4));
  assert.ok(presque(r.reserveEntamee, 3.2));
  assert.ok(presque(r.coutAchats, 1.7 * 0.065 * 70.4) && presque(r.voyage, r.coutAchats));
  assert.ok(r.utiles.has('S3'));
  // La reference « au plus cher » suit la meme regle : elle reste chiffrable.
  const eco = economieVsPlusCher(cand, 570, 60, 0.065, r.voyage, {g0: -10, reserve: 30});
  assert.ok(eco && presque(eco.economie, 0));
  // Station au-dela des 20 km qui restent : infaisable.
  assert.deepStrictEqual(optimiserPlan([st('S', 25, 1)], 570, 60, 0.065, {g0: -10, reserve: 30}), {plan: null});
});

test('D08 : la reserve ne sert que si aucune station n\'est a portee sans elle, et jamais pour l\'arrivee', () => {
  // 10 km utiles + 30 de reserve. P (km 8, 2.00) est a portee sans la reserve : B (km 25, 1.00),
  // qui demanderait la reserve, n'est pas une premiere etape ; on arrive a P avec 2 km, on y
  // achete juste de quoi rejoindre B (17 - 2 = 15 km), puis le reste a B. Meme plan que sans
  // l'option, rien d'entame.
  const cand = [st('P', 8, 2.00), st('B', 25, 1.00)];
  const r = optimiserPlan(cand, 400, 100, 1, {g0: 10, reserve: 30});
  assert.deepStrictEqual(r.plan.map(e => [e.s, e.q]), [['P', 15], ['B', 75]]);
  assert.strictEqual(r.reserveEntamee, undefined);
  assert.deepStrictEqual(r, optimiserPlan(cand, 400, 100, 1, {g0: 10}));
  // Sans P : B devient la premiere station, atteinte 15 km sous la reserve ; 75 + 15 km achetes.
  const r2 = optimiserPlan([st('B', 25, 1.00)], 400, 100, 1, {g0: 10, reserve: 30});
  assert.deepStrictEqual(r2.plan.map(e => [e.s, e.q, e.arrivee]), [['B', 90, -15]]);
  assert.strictEqual(r2.reserveEntamee, 15);
  // Station au-dela de ce qui reste, reserve comprise (10 + 30 < 45) : infaisable.
  assert.deepStrictEqual(optimiserPlan([st('B', 45, 1.00)], 400, 100, 1, {g0: 10, reserve: 30}), {plan: null});
  // L'arrivee ne se rejoint pas sur la reserve : 10 km utiles pour 35 km sans station -> infaisable.
  assert.deepStrictEqual(optimiserPlan([], 400, 35, 1, {g0: 10, reserve: 30}), {plan: null});
  // Le plein a la premiere station refait aussi la reserve : 400 + 15 km achetes a B, puis C.
  const r3 = optimiserPlan([st('B', 25, 1.00), st('C', 400, 3.00)], 400, 500, 1, {g0: 10, reserve: 30});
  assert.deepStrictEqual(r3.plan.map(e => [e.s, e.plein, e.q]), [['B', true, 415], ['C', false, 75]]);
});

test('economie : infaisable ou voyage non chiffrable -> null', () => {
  assert.strictEqual(economieVsPlusCher([], 100, 150, 1, null), null);
  assert.strictEqual(economieVsPlusCher([st('S', 5, 1)], 100, 150, 1, 10), null);   // infaisable au plus cher aussi
});

// ---- Prix fige (26/10/2026) : surcout fictif « risque » par arret ----

test('prix fige : la station a risque est evitee quand une autre fait l\'affaire', () => {
  // A = 100, total 150 : un arret entre km 50 et 100. X (km 60) a 1,00 mais prix fige (risque 15),
  // Y (km 70) a 1,10 sans risque. Sans risque, X gagne ; avec, Y (surcout reel 0,10 x ~50 < 15).
  const X = Object.assign(st('X', 60, 1.0), {risque: 15}), Y = st('Y', 70, 1.1);
  const r = optimiserPlan([st('D', 0, 1.2), X, Y], 100, 150, 1);
  assert.deepStrictEqual(r.plan.map(e => e.s), ['Y']);
  // Seule station possible : on y passe quand meme (le risque n'interdit pas).
  const r2 = optimiserPlan([st('D', 0, 1.2), X], 100, 150, 1);
  assert.deepStrictEqual(r2.plan.map(e => e.s), ['X']);
});

test('pleinsExtremites : une station a prix fige n\'est retenue que s\'il n\'y a qu\'elle', () => {
  const X = Object.assign(st('X', 5, 1.0), {risque: 15}), Y = st('Y', 8, 1.1);
  assert.strictEqual(pleinsExtremites([X, Y], 200).depart.s, 'Y');
  assert.strictEqual(pleinsExtremites([X], 200).depart.s, 'X');
});

// ---- Espagne (28/10/2026) : stations espagnoles de meme forme que les francaises ----
// plan.js ne sait rien du pays : des candidats {s, km, e, p} de meme forme, le moins cher
// atteignable gagne, qu'il soit en France ou en Espagne. Les objets `s` sont ici des stations
// completes (forme de app.js, normalise() / normaliserStationES) pour verifier que rien ne depend
// de leurs champs.
test('plan transfrontalier : 2 francaises + 2 espagnoles, la moins chere gagne quel que soit le pays', () => {
  const {normaliserStationES} = require('./es.js');
  const ECH = require('./fixtures/es-echantillon-girona.json');
  const fr = (id, ville) => ({id, la: 42.7, lo: 2.9, ville, cp: '66000', adresse: 'ROUTE', auto: true, rupture: '', hs: new Set(), d: 0,
    prix: {e85: null, e10: null, sp98: null, sp95: null, gazole: 1.75, gplc: null},
    maj: {e85: null, e10: null, sp98: null, sp95: null, gazole: '2026-10-28T09:00:00+00:00', gplc: null},
    depuis: {}, kotype: {}, off: {prix: {}, maj: {}}, corr: {}});
  const es1 = normaliserStationES(ECH.ListaEESSPrecio[0], ECH.Fecha);   // gazole 1,999
  const es2 = normaliserStationES(ECH.ListaEESSPrecio[2], ECH.Fecha);   // gazole 1,949
  assert.strictEqual(es1.pays, 'ES'); assert.strictEqual(es2.prix.gazole, 1.949);
  // Perpignan -> Barcelone, A 300 km, 500 km, 6 L/100 : il faut un arret entre km 200 et 300.
  // FR2 (km 220, 1.80) contre ES2 (km 250, 1.649 : moins cher) -> l'arret est en Espagne.
  const cand = [
    {s: fr('F1', 'Perpignan'), km: 10,  e: 0, p: 1.75},
    {s: fr('F2', 'Le Boulou'), km: 220, e: 0, p: 1.80},
    {s: es1,                    km: 240, e: 0, p: es1.prix.gazole},   // 1.999
    {s: es2,                    km: 250, e: 0, p: 1.649},             // prix de test : la moins chere
  ].sort((a, b) => a.km - b.km);
  const r = optimiserPlan(cand, 300, 500, 0.06);
  assert.deepStrictEqual(r.plan.map(e => [e.s.id, e.s.pays || 'FR', e.plein]), [['ES-2069', 'ES', false]]);
  assert.ok(presque(r.plan[0].q, 200));
  // Meme trajet, la francaise moins chere : l'arret repasse en France.
  const cand2 = cand.map(c => c.s.id === 'F2' ? Object.assign({}, c, {p: 1.60}) : c);
  const r2 = optimiserPlan(cand2, 300, 500, 0.06);
  assert.deepStrictEqual(r2.plan.map(e => e.s.id), ['F2']);
  // Plein au depart et a l'arrivee : la moins chere de chaque bout, pays indifferent.
  const ext = pleinsExtremites(cand, 500, 15);
  assert.strictEqual(ext.depart.s.id, 'F1');
  assert.strictEqual(ext.arrivee, null);
});

// ---- Comparaison a une recherche exhaustive (petits cas tires au hasard, graine fixee) ----
// plan.js annonce un optimum exact pour sa famille de politiques (a chaque arret : juste ce qu'il
// faut ou le plein ; 0,80 EUR par arret). exhaustifPlan enumere TOUTES les suites d'arrets et
// d'achats de cette famille, sans programmation dynamique, et renvoie le cout minimal (achats +
// arrets), Infinity si rien ne passe. La regle du depart y est reecrite a part : la reserve
// (opts.reserve) ne sert qu'au premier troncon, vers une station, et seulement si aucune station
// n'est a portee sans elle.
function alea(graine){
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ent = (h, a, b) => a + Math.floor(h() * (b - a + 1));
function departDe(A, opts){
  const rsv = Math.max(0, opts.reserve || 0);
  const gBrut = Math.max(-rsv, Math.min(A, opts.g0 != null ? opts.g0 : A));
  return {rsv, gBrut, g0: Math.max(0, gBrut)};
}
function exhaustifPlan(cand, A, total, lkm, opts){
  const {rsv, gBrut, g0} = departDe(A, opts);
  if(total <= g0) return 0;
  const n = cand.length;
  const dist = (j, k) => (k === n ? total : cand[k].km + cand[k].e) - (j < 0 ? 0 : cand[j].km - cand[j].e);
  const aPortee = gBrut >= 0 && cand.some((c, i) => dist(-1, i) <= g0);
  let meilleur = Infinity;
  const aller = (j, g, c) => {
    for(let k = j + 1; k <= n; k++){
      const L = dist(j, k);
      if(L > A) continue;
      for(const q of new Set([L - g, A - g])){
        if(q <= 1e-9) continue;
        const c2 = c + cand[j].p * lkm * q + 0.8;
        if(k === n) meilleur = Math.min(meilleur, c2); else aller(k, g + q - L, c2);
      }
    }
  };
  for(let k = 0; k < n; k++){
    const L = dist(-1, k);
    if(L <= (aPortee ? g0 : gBrut + rsv)) aller(k, gBrut - L, 0);
  }
  return meilleur;
}
// Rejoue le plan rendu : jamais sous la reserve apres le premier troncon, jamais au-dela du plein,
// l'arrivee de chaque etape est celle annoncee, et l'arrivee du trajet est atteinte.
function rejouerPlan(r, cand, A, total, lkm, opts){
  const {rsv, gBrut} = departDe(A, opts);
  let g = gBrut, km = 0, e = 0;
  r.plan.forEach((s, i) => {
    g -= s.km - km + e + s.e;
    assert.ok(g >= (i === 0 ? -rsv : 0) - 1e-9, 'panne avant ' + s.s);
    assert.ok(presque(g, s.arrivee, 1e-6));
    g += s.q; km = s.km; e = s.e;
    assert.ok(s.q > 0 && g <= A + 1e-9, 'achat au-dela du plein a ' + s.s);
  });
  assert.ok(g - (total - km + e) >= -1e-9, 'panne avant l\'arrivee');
  assert.ok(presque(r.coutAchats, r.plan.reduce((t, s) => t + s.p * lkm * s.q, 0), 1e-6));
}
// tirage(h) -> {A, opts} pour des stations deja tirees ; renvoie {cas, faisables, entamees}.
function comparerPlans(graine, cas, tirage){
  const h = alea(graine);
  let faisables = 0, entamees = 0;
  for(let t = 0; t < cas; t++){
    const total = ent(h, 40, 300), cand = [];
    for(let i = ent(h, 0, 6); i > 0; i--) cand.push({s: 'S' + i, km: ent(h, 0, total), e: ent(h, 0, 8) / 2, p: ent(h, 150, 200) / 100});
    cand.sort((x, y) => x.km - y.km);
    const {A, opts} = tirage(h, cand.length ? cand[0].km + cand[0].e : total, total);
    const r = optimiserPlan(cand, A, total, 0.06, opts), ex = exhaustifPlan(cand, A, total, 0.06, opts);
    const ctx = JSON.stringify({cand, A, total, opts});
    if(r.plan === null){ assert.strictEqual(ex, Infinity, 'declare infaisable a tort : ' + ctx); continue; }
    assert.ok(presque(r.coutAchats + 0.8 * r.plan.length, ex, 1e-6), 'plan non optimal : ' + ctx);
    rejouerPlan(r, cand, A, total, 0.06, opts);
    if(r.plan.length) faisables++;
    if(r.reserveEntamee != null) entamees++;
  }
  return {faisables, entamees};
}

test('exhaustif : cas generaux (reservoir plein ou entame, avec ou sans reserve)', () => {
  const {faisables} = comparerPlans(20261111, 1500, h => {
    const A = ent(h, 40, 200);
    return {A, opts: h() < 0.4 ? {} : h() < 0.5 ? {g0: ent(h, 0, A)} : {g0: ent(h, -20, A), reserve: ent(h, 0, 40)}};
  });
  assert.ok(faisables > 300);
});

test('exhaustif : reservoir au depart inferieur a la premiere station', () => {
  const {faisables, entamees} = comparerPlans(20261112, 1500, (h, prem) => {
    const rsv = ent(h, 5, 40), g0 = ent(h, -rsv, Math.max(0, Math.ceil(prem) - 1));
    return {A: ent(h, 60, 200), opts: h() < 0.8 ? {g0, reserve: rsv} : {g0}};
  });
  assert.ok(faisables > 150 && entamees > 150);
});

test('exhaustif : autonomie inferieure au premier troncon', () => {
  const {entamees} = comparerPlans(20261113, 1500, (h, prem) => {
    const A = ent(h, 5, Math.max(6, Math.ceil(prem)));
    return {A, opts: h() < 0.4 ? {} : {g0: ent(h, 0, A), reserve: ent(h, 0, 60)}};
  });
  assert.ok(entamees > 20);
});

test('exhaustif : reserve superieure a l\'autonomie (y compris autonomie utile nulle ou negative)', () => {
  const {entamees} = comparerPlans(20261114, 1500, h => {
    const A = ent(h, -10, 80), rsv = Math.max(A, 0) + ent(h, 1, 60);
    return {A, opts: {g0: ent(h, -rsv, Math.max(A, 0)), reserve: rsv}};
  });
  assert.ok(entamees > 20);
});
