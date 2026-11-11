// Tests de optimiserPlanElectrique (src/plan.js) : plan de charge « comme un carburant ».
// Vehicule de reference : « Citadine electrique 50 kWh », 17 kWh/100 km, CCS 150 kW / AC 11 kW,
// depart 80 %, reserve 15 %. Energies en kWh entiers : depart 40, reserve 7,5 -> 8, arrivee 8,
// 80 % = 40. Trajets Paris -> Lyon (300 km) et Montpellier -> Toulouse (250 km), bornes
// factices aux kilometres ronds. Chaque resultat est calcule a la main en commentaire.
// Ne pas modifier plan.js pour faire passer ces tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {optimiserPlanElectrique, autonomieElectrique, puissanceEffective, tempsCharge, optimiserPlan} = require('./plan.js');

const presque = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const CITADINE = {batterieKwh: 50, consoKwh100: 17, kwMaxDC: 150, kwMaxAC: 11, prise: 'ccs'};
// borne : {s: station, km, e} comme bornesSurTrajet (irve.js)
const B = (id, km, kw, prises = {ccs: true}, e = 0) => ({s: Object.assign({id, kw}, prises), km, e});

test('autonomieElectrique : 50 kWh, 17 kWh/100, 80 % -> 40 kWh au depart, reserve 7,5, 191 km utiles', () => {
  const r = autonomieElectrique(CITADINE);
  assert.ok(presque(r.B, 50) && presque(r.R, 7.5) && presque(r.E0, 40) && presque(r.Ea, 7.5) && presque(r.lkm, 0.17));
  assert.ok(presque(r.A, 32.5 / 0.17) && presque(r.plein, 42.5 / 0.17));
  assert.strictEqual(autonomieElectrique({batterieKwh: 50}), null);
  // A (km) et lkm donnes remplacent ceux du vehicule : 100 km utiles a 0,2 kWh/km -> E0 = 7,5 + 20.
  assert.ok(presque(autonomieElectrique(CITADINE, 100, 0.2).E0, 27.5));
});

test('puissanceEffective : DC si la borne a la prise du vehicule, sinon AC ; inconnue -> null', () => {
  assert.strictEqual(puissanceEffective({kw: 300, ccs: true}, CITADINE), 150);     // borne par le vehicule
  assert.strictEqual(puissanceEffective({kw: 50, ccs: true}, CITADINE), 50);       // borne par la borne
  assert.strictEqual(puissanceEffective({kw: 22, ac: true}, CITADINE), 11);        // AC : 11 kW embarques
  assert.strictEqual(puissanceEffective({kw: 150, chademo: true}, CITADINE), null);
  assert.strictEqual(puissanceEffective({kw: null, ccs: true}, CITADINE), null);
  assert.strictEqual(puissanceEffective({kw: 50, chademo: true}, {prise: 'chademo', kwMaxDC: 50}), 50);
});

test('tempsCharge : 50 kW, 20 kWh sous 80 % = 24 min ; au-dela de 80 % la puissance est divisee par deux', () => {
  assert.ok(presque(tempsCharge(14, 34, 50, 40), 24));
  // 31 -> 42 : 9 kWh a 50 kW (10,8 min) + 2 kWh a 25 kW (4,8 min) = 15,6 min.
  assert.ok(presque(tempsCharge(31, 42, 50, 40), 15.6));
  assert.ok(presque(tempsCharge(45, 50, 50, 40), 12));   // 5 kWh entierement a 25 kW
});

test('Paris -> Lyon 300 km : un arret obligatoire, 20 kWh en 29 min a 50 kW, arrivee a 16 %', () => {
  // Depart 40 kWh. Borne au km 150 : 150 x 0,17 = 25,5 -> 26 kWh : on arrive avec 14 (28 %).
  // Reste 150 km = 26 kWh + reserve 8 = 34 a bord en repartant (68 %) : 20 kWh a charger,
  // tout sous 80 % : 20 / 50 x 60 = 24 min + 5 min de branchement = 29 min. Arrivee 8 kWh = 16 %.
  const r = optimiserPlanElectrique([B('S50', 150, 50)], null, 300, null, CITADINE);
  assert.strictEqual(r.faisable, true);
  assert.strictEqual(r.arrets.length, 1);
  const a = r.arrets[0];
  assert.strictEqual(a.station.id, 'S50');
  assert.strictEqual(a.kmDepuisDepart, 150);
  assert.strictEqual(a.kwhCharges, 20);
  assert.ok(presque(a.minutes, 29));
  assert.strictEqual(a.pctArrivee, 28);
  assert.strictEqual(a.pctDepart, 68);
  assert.ok(presque(r.minutesCharge, 29));
  assert.strictEqual(r.pctArrivee, 16);
  assert.ok(presque(r.energieKwh, 51));
  assert.strictEqual(r.motif, null);
});

test('borne 150 kW contre 50 kW : la plus rapide gagne (13 min contre 29)', () => {
  // S150 au km 160 : 160 x 0,17 = 27,2 -> 28 : arrive avec 12. Reste 140 km = 23,8 -> 24 + 8 = 32 :
  // 20 kWh a 150 kW = 8 min + 5 = 13 min.
  const r = optimiserPlanElectrique([B('S50', 150, 50), B('S150', 160, 150)], null, 300, null, CITADINE);
  assert.deepStrictEqual(r.arrets.map(a => a.station.id), ['S150']);
  assert.ok(presque(r.minutesCharge, 13));
  assert.strictEqual(r.arrets[0].kw, 150);
  // La borne de 300 kW est bornee par les 150 kW du vehicule : meme temps que 150.
  const r2 = optimiserPlanElectrique([B('S300', 160, 300)], null, 300, null, CITADINE);
  assert.ok(presque(r2.minutesCharge, 13) && r2.arrets[0].kw === 150);
});

test('borne incompatible ignoree : CHAdeMO seule -> infaisable ; CHAdeMO + CCS -> la CCS', () => {
  const r = optimiserPlanElectrique([B('CHA', 150, 150, {chademo: true})], null, 300, null, CITADINE);
  assert.strictEqual(r.faisable, false);
  assert.strictEqual(r.motif, 'aucune borne compatible dans le couloir');
  assert.deepStrictEqual(r.arrets, []);
  const r2 = optimiserPlanElectrique([B('CHA', 140, 150, {chademo: true}), B('S50', 150, 50)], null, 300, null, CITADINE);
  assert.deepStrictEqual(r2.arrets.map(a => a.station.id), ['S50']);
  // Une borne AC Type 2 (22 kW) est utilisable par une voiture CCS, a 11 kW : 20 kWh = 109 min + 5.
  const r3 = optimiserPlanElectrique([B('AC', 150, 22, {ac: true})], null, 300, null, CITADINE);
  assert.ok(r3.faisable && presque(r3.minutesCharge, 5 + 20 / 11 * 60));
});

test('trajet 100 km : faisable sans recharge, arrivee a 46 %', () => {
  // 100 x 0,17 = 17 kWh ; 40 - 17 = 23 kWh = 46 %.
  const r = optimiserPlanElectrique([B('S50', 50, 50)], null, 100, null, CITADINE);
  assert.deepStrictEqual(r, {faisable: true, arrets: [], minutesCharge: 0, pctArrivee: 46, energieKwh: 17, motif: 'faisable sans recharge'});
});

test('aucune borne : infaisable avec motif ; bornes trop espacees : autre motif', () => {
  const r = optimiserPlanElectrique([], null, 300, null, CITADINE);
  assert.strictEqual(r.faisable, false);
  assert.strictEqual(r.motif, 'aucune borne compatible dans le couloir');
  assert.strictEqual(r.minutesCharge, null);
  // Une seule borne au km 250 : 250 x 0,17 = 42,5 -> 43 kWh > 40 - 8 utiles : inatteignable.
  const r2 = optimiserPlanElectrique([B('LOIN', 250, 150)], null, 300, null, CITADINE);
  assert.strictEqual(r2.faisable, false);
  assert.strictEqual(r2.motif, 'bornes trop espacees pour l\'autonomie');
  // Vehicule incomplet.
  assert.strictEqual(optimiserPlanElectrique([B('S', 150, 50)], null, 300, null, {prise: 'ccs'}).motif, 'vehicule incomplet');
});

test('a egalite de temps, moins d\'arrets : deux bornes de 50 kW, un seul arret retenu', () => {
  const r = optimiserPlanElectrique([B('A', 100, 50), B('C', 150, 50)], null, 300, null, CITADINE);
  assert.strictEqual(r.arrets.length, 1);
  assert.ok(presque(r.minutesCharge, 29));
});

test('Montpellier -> Toulouse 250 km, borne au km 50 : il faut depasser 80 %, courbe a demi-puissance', () => {
  // 50 km = 8,5 -> 9 kWh : arrive avec 31 (62 %). Reste 200 km = 34 + 8 = 42 kWh > 40 (80 %) :
  // 9 kWh a 50 kW (10,8 min) + 2 kWh a 25 kW (4,8 min) + 5 = 20,6 min ; repart a 84 %.
  const r = optimiserPlanElectrique([B('P', 50, 50)], null, 250, null, CITADINE);
  assert.strictEqual(r.arrets[0].kwhCharges, 11);
  assert.ok(presque(r.minutesCharge, 20.6));
  assert.strictEqual(r.arrets[0].pctDepart, 84);
  assert.strictEqual(r.pctArrivee, 16);
});

test('charger plus a une borne rapide pour eviter une borne lente : plein a 80 % puis juste', () => {
  // 500 km. RAPIDE 150 kW au km 150, LENTE 11 kW (AC 22) au km 330. Depart 40 - 26 = 14 a RAPIDE.
  // Jusqu'a LENTE : 180 km = 30,6 -> 31 kWh (+8 = 39 a bord). Sans charger a LENTE il faudrait
  // 31 + 170 km (28,9 -> 29) + 8 = 68 > 50 : LENTE est obligatoire. A RAPIDE on charge a 100 %
  // (36 kWh : 26 a 150 kW = 10,4 min + 10 a 75 kW = 8 min) pour arriver a LENTE avec 19 et n'y
  // prendre que 29 + 8 - 19 = 18 kWh (98,2 min) : 10 + 18,4 + 98,2 = 126,6 min. Charger juste
  // a RAPIDE (25 kWh, 10 min) puis 29 kWh a 11 kW (158,2 min) = 183,2 min : bien pire.
  const r = optimiserPlanElectrique([B('RAPIDE', 150, 150), B('LENTE', 330, 22, {ac: true})], null, 500, null, CITADINE);
  assert.deepStrictEqual(r.arrets.map(a => [a.station.id, a.kwhCharges]), [['RAPIDE', 36], ['LENTE', 18]]);
  assert.ok(presque(r.minutesCharge, 10 + 26 / 150 * 60 + 10 / 75 * 60 + 18 / 11 * 60));
});

test('detour : l\'energie du detour compte a l\'aller et au retour', () => {
  // Borne au km 150 a 10 km de la route (comme pour le carburant : e km pour y entrer, e km
  // pour en ressortir). Aller : 150 + 10 = 160 km = 27,2 -> 28 kWh : arrive avec 12. Retour sur
  // la route puis fin : 10 + 150 = 160 km = 28 + 8 = 36 a bord : 24 kWh a 50 kW = 28,8 min + 5.
  // Sans detour (test Paris -> Lyon) : 20 kWh, 29 min.
  const r = optimiserPlanElectrique([B('D', 150, 50, {ccs: true}, 10)], null, 300, null, CITADINE);
  assert.strictEqual(r.arrets[0].kwhCharges, 24);
  assert.strictEqual(r.arrets[0].detourKm, 10);
  assert.ok(presque(r.minutesCharge, 33.8));
});

test('opts.departPct : parti a 50 %, le trajet de 100 km n\'est plus faisable sans arret', () => {
  // 25 kWh - 17 = 8 >= 8 : faisable de justesse a 50 % ; a 40 % (20 kWh) : 3 < 7,5 -> arret.
  assert.strictEqual(optimiserPlanElectrique([B('S', 50, 50)], null, 100, null, CITADINE, {departPct: 50}).arrets.length, 0);
  const r = optimiserPlanElectrique([B('S', 50, 50)], null, 100, null, CITADINE, {departPct: 40});
  assert.strictEqual(r.arrets.length, 1);
});

test('elagage au-dela de 240 bornes : plan toujours faisable, arrets en km croissants', () => {
  const bornes = [];
  for(let k = 1; k <= 600; k++) bornes.push(B('S' + k, k, 50 + (k % 4) * 25));
  const r = optimiserPlanElectrique(bornes, null, 600, null, CITADINE);
  assert.ok(r.faisable && r.arrets.length >= 2 && r.arrets.length <= 5);
  for(let i = 1; i < r.arrets.length; i++) assert.ok(r.arrets[i].kmDepuisDepart > r.arrets[i - 1].kmDepuisDepart);
  for(const a of r.arrets) assert.ok(a.kw >= 125);   // les plus puissantes gardees
});

test('D09 : une borne a grand detour ne cache ni les bornes suivantes ni l\'arrivee', () => {
  // 40 kWh, 17 kWh/100, reserve 5 % (2 kWh), depart 100 %, 500 km. Bornes aux km 150 et 370 :
  // 150 km = 25,5 -> 26 kWh ; 220 km = 37,4 -> 38 kWh (+2 = 40 : batterie pleine) ; 130 km =
  // 22,1 -> 23 kWh. Faisable, arrets [150, 370]. La borne du km 366 est a 20 km de la route :
  // depuis le km 150, 216 + 20 km = 40,12 -> 41 kWh > 40, elle est hors de portee, mais celle
  // du km 370 (sur la route) ne l'est pas : le plan doit rester le meme.
  const veh = {batterieKwh: 40, consoKwh100: 17, kwMaxDC: 150, kwMaxAC: 11, prise: 'ccs', reservePct: 5, departPct: 100};
  const sans = optimiserPlanElectrique([B('A', 150, 150), B('C', 370, 150)], null, 500, null, veh);
  assert.ok(sans.faisable);
  assert.deepStrictEqual(sans.arrets.map(a => a.kmDepuisDepart), [150, 370]);
  const avec = optimiserPlanElectrique([B('A', 150, 150), B('LOIN', 366, 150, {ccs: true}, 20), B('C', 370, 150)], null, 500, null, veh);
  assert.strictEqual(avec.faisable, true);
  assert.deepStrictEqual(avec.arrets.map(a => a.kmDepuisDepart), [150, 370]);
  assert.ok(presque(avec.minutesCharge, sans.minutesCharge));
  // Au depart aussi : une borne au km 5 a 150 km de la route ne cache pas celle du km 150.
  const dep = optimiserPlanElectrique([B('LOIN', 5, 150, {ccs: true}, 150), B('A', 150, 150), B('C', 370, 150)], null, 500, null, veh);
  assert.deepStrictEqual(dep.arrets.map(a => a.kmDepuisDepart), [150, 370]);
  // Trop espacees le long de la route : toujours infaisable.
  assert.strictEqual(optimiserPlanElectrique([B('A', 150, 150)], null, 500, null, veh).faisable, false);
});

test('le plan carburant est inchange par l\'ajout (cas Montpellier -> Tours)', () => {
  const st = (s, km, p) => ({s, km, e: 0, p});
  const r = optimiserPlan([st('D', 5, 0.90), st('BON', 300, 0.85), st('CHER', 360, 1.05), st('F', 655, 0.90)], 370, 660, 0.1);
  assert.deepStrictEqual(r.plan.map(e => e.s), ['BON']);
  assert.ok(presque(r.voyage, 57.95));
});

// ---- Comparaison a une recherche exhaustive (petits cas tires au hasard, graine fixee) ----
// exhaustifElec enumere toutes les suites d'arrets et, a chaque arret, TOUTES les recharges au
// kWh entier (pas seulement « juste », 80 %, 100 %), sans programmation dynamique : temps de
// charge minimal puis, a egalite, moins d'arrets ; null si rien ne passe. Meme modele que
// plan.js (kWh entiers, consommation et reserve au kWh superieur, 5 min par arret, puissance
// divisee par deux au-dela de 80 %), reecrit a part. Petites batteries (8 a 12,5 kWh) pour que
// l'enumeration reste courte.
function alea(graine){
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ent = (h, a, b) => a + Math.floor(h() * (b - a + 1));
function exhaustifElec(bornes, total, veh){
  const Bt = veh.batterieKwh, kwhKm = veh.consoKwh100 / 100;
  const R = Bt * veh.reservePct / 100, E0 = Bt * veh.departPct / 100;
  const Bi = Math.floor(Bt), Ri = Math.ceil(R - 1e-9), E0i = Math.min(Bi, Math.floor(E0 + 1e-9)), e80 = Math.floor(0.8 * Bt + 1e-9);
  if(E0 - kwhKm * total >= R - 1e-9) return {min: 0, arr: 0};
  const cand = bornes.map(b => ({km: b.km, e: b.e, kw: Math.min(b.s.kw, veh.kwMaxDC)})), n = cand.length;
  const cons = (j, k) => Math.ceil(kwhKm * ((k === n ? total : cand[k].km + cand[k].e) - (j < 0 ? 0 : cand[j].km - cand[j].e)) - 1e-9);
  let meilleur = null;
  const garder = (m, a) => { if(!meilleur || m < meilleur.min - 1e-9 || (Math.abs(m - meilleur.min) <= 1e-9 && a < meilleur.arr)) meilleur = {min: m, arr: a}; };
  const aller = (j, e, m, a) => {
    let t = m + 5;
    for(let T = e + 1; T <= Bi; T++){
      t += 60 / (T - 1 < e80 ? cand[j].kw : cand[j].kw / 2);   // un kWh de plus
      for(let k = j + 1; k <= n; k++){
        const c = cons(j, k);
        if(T - c < Ri) continue;
        if(k === n) garder(t, a + 1); else aller(k, T - c, t, a + 1);
      }
    }
  };
  for(let k = 0; k <= n; k++){
    const c = cons(-1, k);
    if(E0i - c >= Ri){ if(k === n) garder(0, 0); else aller(k, E0i - c, 0, 0); }
  }
  return meilleur;
}
// tirage(h, veh, borne) -> {total, bornes} ; borne(i, km, e) fabrique une borne CCS de puissance
// tiree au hasard. Renvoie le nombre de plans avec au moins un arret.
function comparerCharges(graine, cas, tirage){
  const h = alea(graine);
  let avecArrets = 0;
  for(let t = 0; t < cas; t++){
    const veh = {batterieKwh: ent(h, 8, 12) + (h() < 0.3 ? 0.5 : 0), consoKwh100: ent(h, 12, 24), kwMaxDC: 100, kwMaxAC: 11, prise: 'ccs',
                 reservePct: [0, 5, 15, 30][ent(h, 0, 3)], departPct: ent(h, 4, 10) * 10};
    const borne = (i, km, e) => B('B' + i, km, [7, 22, 50, 150][ent(h, 0, 3)], {ccs: true}, e);
    const {total, bornes} = tirage(h, veh, borne);
    bornes.sort((x, y) => x.km - y.km);
    const r = optimiserPlanElectrique(bornes, null, total, null, veh), ex = exhaustifElec(bornes, total, veh);
    const ctx = JSON.stringify({bornes, total, veh});
    assert.strictEqual(r.faisable, !!ex, (ex ? 'declare infaisable a tort : ' : 'declare faisable a tort : ') + ctx);
    if(!ex) continue;
    assert.ok(presque(r.minutesCharge, ex.min, 1e-6), `temps de charge ${r.minutesCharge} au lieu de ${ex.min} : ${ctx}`);
    assert.strictEqual(r.arrets.length, ex.arr, 'nombre d\'arrets : ' + ctx);
    assert.ok(presque(r.arrets.reduce((s, a) => s + a.minutes, 0), r.minutesCharge, 1e-6));
    for(let i = 1; i < r.arrets.length; i++) assert.ok(r.arrets[i].kmDepuisDepart >= r.arrets[i - 1].kmDepuisDepart);
    if(r.arrets.length) avecArrets++;
  }
  return avecArrets;
}
const bornesAuHasard = (h, borne, total, n, detour) => {
  const l = [];
  for(let i = 0; i < n; i++) l.push(borne(i, ent(h, 0, total), detour()));
  return l;
};

test('exhaustif : detours non monotones (une borne sur deux loin de la route)', () => {
  const n = comparerCharges(20261111, 600, (h, veh, borne) => {
    const total = ent(h, 30, 140);
    return {total, bornes: bornesAuHasard(h, borne, total, ent(h, 1, 4), () => h() < 0.5 ? 0 : ent(h, 0, 30))};
  });
  assert.ok(n > 80);
});

test('exhaustif : reserve a 0 %', () => {
  const n = comparerCharges(20261112, 600, (h, veh, borne) => {
    veh.reservePct = 0;
    const total = ent(h, 30, 140);
    return {total, bornes: bornesAuHasard(h, borne, total, ent(h, 1, 4), () => h() < 0.6 ? 0 : ent(h, 0, 20))};
  });
  assert.ok(n > 80);
});

test('exhaustif : borne au kilometre 0', () => {
  const n = comparerCharges(20261113, 600, (h, veh, borne) => {
    const total = ent(h, 30, 140);
    const bornes = bornesAuHasard(h, borne, total, ent(h, 0, 3), () => h() < 0.6 ? 0 : ent(h, 0, 20));
    bornes.push(borne(9, 0, h() < 0.7 ? 0 : ent(h, 1, 10)));
    return {total, bornes};
  });
  assert.ok(n > 80);
});

test('exhaustif : aller-retour (chaque borne vue a l\'aller et au retour)', () => {
  const n = comparerCharges(20261114, 600, (h, veh, borne) => {
    const aller = ent(h, 20, 90), bornes = [];
    for(let i = 0; i < 2; i++){
      const x = borne(i, ent(h, 0, aller), h() < 0.5 ? 0 : ent(h, 0, 20));
      bornes.push(x, {s: x.s, km: 2 * aller - x.km, e: x.e});
    }
    return {total: 2 * aller, bornes};
  });
  assert.ok(n > 80);
});
