// Tests de src/irve.js : lecture des champs du fichier Etalab (pieges mesures sur le fichier
// du 28/10/2026), horaires, compatibilite, filtres, couloir. La fixture src/fixtures/irve-34.json
// est produite par irve_build.py depuis src/fixtures/irve-echantillon-34.csv : 12 points de charge
// reels du fichier du 28/10/2026 + 1 ligne SYNTHETIQUE (derivee du parking P2 de Mauguio, codes
// postal et INSEE vides, code postal seulement dans l'adresse) qui exerce la resolution du
// departement par l'adresse (voie 3 d'irve_build.py, testee cote Python dans irve_build_test.py).
// Ne pas modifier irve.js pour faire passer ces tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {parseBool, parsePuissance, parseXY, parseHoraires, ouvertA, compatible, filtrerBornes,
       kmsCumules, calerKms, positionSurLigne, bornesSurTrajet} = require('./irve.js');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'irve-34.json'), 'utf-8'));
const presque = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
// Dates locales : jeudi 5 novembre 2026, dimanche 8 novembre 2026.
const JEUDI_10H = new Date(2026, 10, 5, 10, 0), DIMANCHE_10H = new Date(2026, 10, 8, 10, 0);

// ---- Fixture : 13 PDC de l'Herault -> 11 stations ----

test('fixture : 13 PDC, 1 rejete hors France (latitude 3.84), 2 PDC de Nabrigas regroupes -> 11 stations, 12 PDC', () => {
  assert.strictEqual(FIXTURE.length, 11);
  assert.strictEqual(FIXTURE.reduce((t, s) => t + s.pdc, 0), 12);
  // Ligne synthetique sans code postal ni INSEE : departement trouve dans l'adresse, donc dans 34.json.
  const p1 = FIXTURE.find(s => s.id === 'FRBE3P34154002');
  assert.ok(p1 && p1.n === 'AMM - Mauguio - Parking P1' && p1.ac === true);
  assert.ok(!FIXTURE.some(s => s.id === 'FRALLPEVCARSSTCDR'));   // Saint-Clement : coordonnees fausses
  const nab = FIXTURE.find(s => s.id === 'FRSITE00000256');
  assert.strictEqual(nab.pdc, 2);
  assert.strictEqual(nab.kw, 150);     // 150 kW et 22 kW : max et min
  assert.strictEqual(nab.kwmin, 22);
  assert.strictEqual(nab.ac, true);    // le PDC 22 kW a une prise Type 2
  assert.strictEqual(nab.maj, '2025-06-17');
});

test('fixture : coordonnees consolidees si fiables, sinon coordonneesXY ; 6 decimales ; booleens agreges', () => {
  const hotel = FIXTURE.find(s => s.id === 'FR000011062174');   // consolidated_is_lon_lat_correct = False
  assert.ok(presque(hotel.lon, 3.407609) && presque(hotel.lat, 43.419591));
  assert.strictEqual(hotel.gratuit, true);
  assert.strictEqual(hotel.h, 'Mo-Fr 08:00-12:00,Mo-Fr 14:00-18:00,Th 08:00-18:00');
  const buffalo = FIXTURE.find(s => s.id === 'FRSITE00000307');
  assert.deepStrictEqual([buffalo.ccs, buffalo.chademo, buffalo.ac, buffalo.cb, buffalo.gratuit], [true, true, true, true, false]);
  assert.strictEqual(buffalo.acces, 'libre');          // « Accčs libre » (accent casse) lu quand meme
  assert.strictEqual(buffalo.kw, 200);
  const minerve = FIXTURE.find(s => s.id === 'FR55CP34210MNVB0UYS');
  assert.strictEqual(minerve.kw, 22.08);
  assert.strictEqual(minerve.h, '24/7');
  const mauguio = FIXTURE.find(s => s.id === 'FRBE3P34154001');
  assert.strictEqual(mauguio.ac, false);               // EF False, Type 2 False
  assert.strictEqual(mauguio.pmr, true);
  // Toutes les chaines sont bornees et sans chevron (echappement a l'ingestion).
  for(const s of FIXTURE) for(const k of ['n', 'op', 'h']) if(s[k] != null) assert.ok(!/[<>]/.test(s[k]) && s[k].length <= 200, s.id + ' ' + k);
});

// ---- parseBool : True / true / TRUE / 1 / vide / 0 ----

test('parseBool : insensible a la casse, vide -> null (inconnu, jamais faux par defaut)', () => {
  assert.strictEqual(parseBool('TRUE'), true);
  assert.strictEqual(parseBool('True'), true);
  assert.strictEqual(parseBool('1'), true);
  assert.strictEqual(parseBool('vrai'), true);
  assert.strictEqual(parseBool('false'), false);
  assert.strictEqual(parseBool('FALSE'), false);
  assert.strictEqual(parseBool('0'), false);
  assert.strictEqual(parseBool(''), null);
  assert.strictEqual(parseBool('  '), null);
  assert.strictEqual(parseBool(null), null);
  assert.strictEqual(parseBool('peut-etre'), null);
});

// ---- parseXY ----

test('parseXY : « [lon, lat] » avec et sans espace ; autre chose -> null', () => {
  assert.deepStrictEqual(parseXY('[2.36761800,49.87723700]'), {lon: 2.367618, lat: 49.877237});
  assert.deepStrictEqual(parseXY('[2.3673462, 49.8762485]'), {lon: 2.3673462, lat: 49.8762485});
  assert.deepStrictEqual(parseXY(' [ -1.5 , 47 ] '), {lon: -1.5, lat: 47});
  assert.strictEqual(parseXY('2.36,49.87'), null);
  assert.strictEqual(parseXY(''), null);
  assert.strictEqual(parseXY(null), null);
});

// ---- parsePuissance ----

test('parsePuissance : kW decimal, watts > 1000 divises par 1000, vide ou 0 -> null', () => {
  assert.strictEqual(parsePuissance('22.08'), 22.08);
  assert.strictEqual(parsePuissance('22'), 22);
  assert.strictEqual(parsePuissance('22.0'), 22);
  assert.strictEqual(parsePuissance('7,4'), 7.4);
  assert.strictEqual(parsePuissance('22000'), 22);      // watts
  assert.strictEqual(parsePuissance('150000'), 150);
  assert.strictEqual(parsePuissance(''), null);
  assert.strictEqual(parsePuissance('0'), null);
  assert.strictEqual(parsePuissance('abc'), null);
});

// ---- ouvertA ----

test('ouvertA : Th 08:00-18:00 ouvert un jeudi a 10 h, ferme un dimanche', () => {
  assert.strictEqual(ouvertA('Th 08:00-18:00', JEUDI_10H), true);
  assert.strictEqual(ouvertA('Th 08:00-18:00', DIMANCHE_10H), false);
  assert.strictEqual(ouvertA('Th 08:00-18:00', new Date(2026, 10, 5, 18, 0)), false);   // borne de fin exclue
});

test('ouvertA : 24/7 et ses variantes toujours ouvert ; chaine inconnue ou vide -> null', () => {
  assert.strictEqual(ouvertA('24/7', DIMANCHE_10H), true);
  assert.strictEqual(ouvertA('24h/24 7j/7', DIMANCHE_10H), true);
  assert.strictEqual(ouvertA('24/24', DIMANCHE_10H), true);
  assert.strictEqual(ouvertA('sur rendez-vous', DIMANCHE_10H), null);
  assert.strictEqual(ouvertA('', DIMANCHE_10H), null);
  assert.strictEqual(ouvertA(null, DIMANCHE_10H), null);
  assert.strictEqual(ouvertA('Mo-Fr 08:00-99:00', DIMANCHE_10H), null);   // heure impossible : illisible
});

test('ouvertA : regles multiples de la fixture (hotel : Mo-Fr 8-12 et 14-18, Th 8-18)', () => {
  const h = 'Mo-Fr 08:00-12:00,Mo-Fr 14:00-18:00,Th 08:00-18:00';
  assert.strictEqual(ouvertA(h, new Date(2026, 10, 6, 13, 0)), false);   // vendredi 13 h : pause
  assert.strictEqual(ouvertA(h, new Date(2026, 10, 5, 13, 0)), true);    // jeudi 13 h : journee continue
  assert.strictEqual(ouvertA(h, new Date(2026, 10, 7, 9, 0)), false);    // samedi
  assert.strictEqual(ouvertA('Mo-Su 00:00-23:57', new Date(2026, 10, 8, 23, 58)), false);   // Mauguio, 23 h 58
  assert.strictEqual(ouvertA('Mo-Su 00:00-23:57', new Date(2026, 10, 8, 23, 50)), true);
});

test('ouvertA : plage sans jours (reprend les precedents), depassement de minuit, « off », jours boucles', () => {
  assert.strictEqual(ouvertA('Mo-Fr 08:00-12:00,14:00-18:00', new Date(2026, 10, 6, 15, 0)), true);
  assert.strictEqual(ouvertA('Mo-Fr 22:00-06:00', new Date(2026, 10, 7, 3, 0)), true);    // samedi 3 h : nuit de vendredi
  assert.strictEqual(ouvertA('Mo-Fr 22:00-06:00', new Date(2026, 10, 8, 3, 0)), false);   // dimanche 3 h : nuit de samedi
  assert.strictEqual(ouvertA('Mo-Fr,Sa 08:00-12:00', new Date(2026, 10, 7, 9, 0)), true);
  assert.strictEqual(ouvertA('Mo-Fr 08:00-18:00; Sa off', new Date(2026, 10, 7, 9, 0)), false);
  assert.strictEqual(ouvertA('Fr-Mo 08:00-18:00', DIMANCHE_10H), true);   // Fr, Sa, Su, Mo
  assert.deepStrictEqual(parseHoraires('24/7'), []);
  assert.strictEqual(parseHoraires('???'), null);
});

// ---- compatible ----

test('compatible : CCS contre Type 2, puissance minimale, inconnu non promis', () => {
  const ccs = {ccs: true, chademo: false, ac: false, kw: 150};
  const t2 = {ccs: false, chademo: null, ac: true, kw: 22};
  assert.strictEqual(compatible(ccs, {prise: 'ccs'}), true);
  assert.strictEqual(compatible(t2, {prise: 'ccs'}), false);
  assert.strictEqual(compatible(t2, {prise: 't2'}), true);
  assert.strictEqual(compatible(ccs, {prise: 't2'}), false);
  assert.strictEqual(compatible(t2, {prise: 'chademo'}), false);           // null : pas promis
  assert.strictEqual(compatible(ccs, {prise: 'ccs', kwMin: 100}), true);
  assert.strictEqual(compatible(ccs, {prise: 'ccs', kwMin: 200}), false);
  assert.strictEqual(compatible({ccs: true, kw: null}, {prise: 'ccs', kwMin: 50}), false);
  assert.strictEqual(compatible({ccs: true, kw: null}, {prise: 'ccs'}), true);
  assert.strictEqual(compatible(ccs, {prise: 'autre'}), false);
});

// ---- filtrerBornes ----

test('filtrerBornes sur la fixture : CCS >= 100 kW -> Buffalo, Villeneuve, Lespignan', () => {
  const r = filtrerBornes(FIXTURE, {prise: 'ccs', kwMin: 100}).map(s => s.id).sort();
  assert.deepStrictEqual(r, ['FRSITE00000221', 'FRSITE00000236', 'FRSITE00000307']);
  assert.deepStrictEqual(filtrerBornes(FIXTURE, {gratuit: true}).map(s => s.id), ['FR000011062174']);
  assert.strictEqual(filtrerBornes(FIXTURE, {cb: true}).length, 5);
  assert.strictEqual(filtrerBornes(FIXTURE, {}).length, 11);
  // Ouvert un dimanche a 10 h : l'hotel (Mo-Fr) est exclu, les 24/7 et Mauguio restent.
  assert.strictEqual(filtrerBornes(FIXTURE, {ouvertLe: DIMANCHE_10H}).length, 10);
  // Horaires inconnus : gardes (on ne sait pas que c'est ferme).
  assert.strictEqual(filtrerBornes([{h: null}, {h: 'texte libre'}], {ouvertLe: DIMANCHE_10H}).length, 2);
});

// ---- couloir ----

test('kmsCumules : 1° de latitude = 110,57 km ; 1° de longitude a l\'equateur = 111,32 km', () => {
  assert.ok(presque(kmsCumules([[0, 0], [0, 1]])[1], 110.57));
  assert.ok(presque(kmsCumules([[0, 0], [1, 0]])[1], 111.32));
  assert.deepStrictEqual(kmsCumules([[3, 43]]), [0]);
});

test('calerKms : le total du trace devient la distance annoncee par le service, sens par sens', () => {
  // Trace simplifie de 940,85 km pour 965,25 km annonces (releve du 11/11/2026, -2,5 %).
  const kms = [0, 300, 700, 940.85];
  const c = calerKms(kms, [{fin: 3, km: 965.25}]);
  assert.ok(presque(c[3], 965.25) && c[0] === 0);
  assert.ok(presque(c[1], 300 * 965.25 / 940.85) && presque(c[2], 700 * 965.25 / 940.85));
  assert.deepStrictEqual(kms, [0, 300, 700, 940.85]);                 // l'entree n'est pas modifiee
  // Aller-retour : chaque sens a son facteur ; le retour repart du km de fin de l'aller.
  const ar = calerKms([0, 40, 80, 80.2, 130, 160.2], [{fin: 2, km: 84}, {fin: 5, km: 88}]);
  assert.ok(presque(ar[2], 84) && presque(ar[3], 84) && presque(ar[5], 172));
  assert.ok(presque(ar[1], 42) && presque(ar[4], 84 + (130 - 80.2) * 88 / 80));
  for(let i = 1; i < ar.length; i++) assert.ok(ar[i] >= ar[i - 1]);
  // Distance absente ou nulle, trace de longueur nulle : abscisses inchangees.
  assert.deepStrictEqual(calerKms([0, 10, 20], [{fin: 2, km: NaN}]), [0, 10, 20]);
  assert.deepStrictEqual(calerKms([0, 10, 20], [{fin: 2, km: 0}]), [0, 10, 20]);
  assert.deepStrictEqual(calerKms([0, 0], [{fin: 1, km: 5}]), [0, 0]);
  assert.deepStrictEqual(calerKms([0, 10, 20], null), [0, 10, 20]);
});

test('positionSurLigne et bornesSurTrajet : ecart et abscisse sur une ligne nord-sud, tri par km', () => {
  // Ligne de (3, 43) a (3, 44) : 110,57 km vers le nord. Un point a (3, 43.5) est sur la ligne,
  // au km 55,285 ; un point a 0,1° a l'est (lon 3.1, lat 43.5) est a 11,132 x cos(43,5°) km.
  const ligne = [[3, 43], [3, 44]];
  const p = positionSurLigne(ligne, null, 3, 43.5);
  assert.ok(presque(p.e, 0) && presque(p.km, 55.285));
  const q = positionSurLigne(ligne, null, 3.1, 43.5);
  assert.ok(presque(q.e, 11.132 * Math.cos(43.5 * Math.PI / 180), 1e-3));
  const stations = [{id: 'loin', lon: 3.5, lat: 43.5}, {id: 'b', lon: 3, lat: 43.8}, {id: 'a', lon: 3.01, lat: 43.2}, {id: 'x', lon: 'non', lat: 43}];
  const r = bornesSurTrajet(stations, ligne, 5);
  assert.deepStrictEqual(r.map(c => c.s.id), ['a', 'b']);
  assert.ok(r[0].km < r[1].km && r[0].e > 0 && presque(r[1].e, 0));
  assert.deepStrictEqual(bornesSurTrajet(stations, [[3, 43]], 5), []);
});
