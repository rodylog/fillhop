// Tests de src/affichage.js : formats de nombres montres a l'ecran (virgule decimale) et
// textes de l'interface qui doivent rester d'une seule voix (releve du 11/11/2026, D30).
//   node --test src/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('./affichage.js');

const lire = nom => fs.readFileSync(path.join(__dirname, nom), 'utf8');

test('prixFr : trois décimales et une virgule, comme à la pompe', () => {
  assert.equal(A.prixFr(1.906), '1,906');
  assert.equal(A.prixFr(0.929), '0,929');
  assert.equal(A.prixFr(1.99), '1,990');
  assert.equal(A.prixFr(2), '2,000');
  assert.equal(A.prixFr('1.659'), '1,659');
});

test('kmFr : une décimale et une virgule', () => {
  assert.equal(A.kmFr(2.5), '2,5');
  assert.equal(A.kmFr(2.46), '2,5');
  assert.equal(A.kmFr(0), '0,0');
  assert.equal(A.kmFr(12), '12,0');
});

test('eurosFr et nombreFr : jamais de point décimal', () => {
  assert.equal(A.eurosFr(61.5), '61,50');
  assert.equal(A.nombreFr(3.14159, 2), '3,14');
  assert.equal(A.nombreFr(7, 0), '7');
  for(const x of [0.001, 1.2345, 99.999, 1234.5]) assert.doesNotMatch(A.nombreFr(x, 3), /\./);
});

test('listeFr : les carburants en rupture du flux se lisent séparés par une virgule', () => {
  assert.equal(A.listeFr('SP95;GPLc'), 'SP95, GPLc');
  assert.equal(A.listeFr('E85'), 'E85');
  assert.equal(A.listeFr(' Gazole ; SP98 ;'), 'Gazole, SP98');
  assert.equal(A.listeFr(''), '');
  assert.equal(A.listeFr(null), '');
});

test('app.js : aucun prix ni distance affiché par toFixed, seuls les usages machine restent', () => {
  // Restent : la somme arrondie de pick(), le champ type=number de la correction, les emprises des URL.
  const restants = lire('app.js').split('\n').filter(l => /\.toFixed\(/.test(l) && !/^\s*\/\//.test(l));
  restants.forEach(l => assert.match(l, /\+lignes\.reduce|inp\.value = |in_bbox|z\.[sn]\.toFixed\(5\)|surGrille = |z\.[ne]\.toFixed\(2\)|reverse\/\?lon=/, l.trim()));
});

test('un seul nom par objet : « SP le moins cher », « arrêt », « traceur »', () => {
  const page = lire('app.js') + lire('index.html') + lire('ui/assistant.js');
  assert.doesNotMatch(page, /SP le - cher/);
  assert.doesNotMatch(page, /[`'"> ]Étapes? /, 'le plan parle d\'arrêts');
  assert.doesNotMatch(page, /traqueur|tracker/i);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8'), /sans tracker/);
});

test('aide « Plan de pleins » : la phrase du réservoir au départ est entière', () => {
  const aide = lire('index.html').replace(/\s+/g, ' ');
  assert.doesNotMatch(aide, /au prix du départ choisie/);
  assert.match(aide, /compte ce que vous avez déjà à bord au prix du départ \(la quantité saisie, ramenée en km, ne dépasse jamais l'autonomie d'un plein\)\./);
});

// ---- Etiquettes de la carte en vue large (D22) ----
// 400 stations semees sur la France (grille reguliere de 20 x 20, prix croissants).
const FRANCE = Array.from({length: 400}, (x, i) => ({la: 42.5 + (i % 20) * 0.42, lo: -4.5 + Math.floor(i / 20) * 0.63, p: 1.5 + i * 0.001}));

test('etiquettesParCase : au zoom 10 et au-delà, chaque station garde son prix', () => {
  assert.equal(A.ZOOM_COMPACT, 10);
  assert.deepEqual(A.etiquettesParCase(FRANCE, 10), FRANCE.map(() => true));
  assert.deepEqual(A.etiquettesParCase(FRANCE, 13.4), FRANCE.map(() => true));
  assert.deepEqual(A.etiquettesParCase([], 5), []);
});

test('etiquettesParCase : à l\'échelle de la France, une étiquette par case, la moins chère', () => {
  const zoom = 4.6;   // la France dans un telephone de 375 px
  const garde = A.etiquettesParCase(FRANCE, zoom);
  assert.equal(garde.length, 400);
  const n = garde.filter(Boolean).length;
  assert.ok(n >= 10 && n <= 60, `${n} étiquettes pour 400 stations`);
  // Par case : exactement une etiquette, et aucune station sans etiquette n'y est moins chere.
  const parCase = new Map();
  FRANCE.forEach((pt, i) => { const k = A.caseGrille(pt.la, pt.lo, zoom, A.PAS_GRILLE); parCase.set(k, (parCase.get(k) || []).concat(i)); });
  parCase.forEach(rangs => {
    const elus = rangs.filter(i => garde[i]);
    assert.equal(elus.length, 1);
    rangs.forEach(i => assert.ok(FRANCE[i].p >= FRANCE[elus[0]].p));
  });
  // La moins chere de toutes garde toujours son prix.
  assert.equal(garde[0], true);
});

test('etiquettesParCase : parCase, ex æquo et stabilité sous déplacement', () => {
  const memeCase = [{la: 46, lo: 2, p: 1.7}, {la: 46.001, lo: 2.001, p: 1.6}, {la: 46.002, lo: 2.002, p: 1.6}, {la: 46.003, lo: 2.003, p: 1.9}];
  assert.deepEqual(A.etiquettesParCase(memeCase, 5), [false, true, false, false], 'à prix égal, la première de la liste');
  assert.deepEqual(A.etiquettesParCase(memeCase, 5, {parCase: 2}), [false, true, true, false]);
  assert.deepEqual(A.etiquettesParCase(memeCase, 5, {parCase: 9}), [true, true, true, true]);
  // Deux points loin l'un de l'autre : deux cases, deux etiquettes, quel que soit l'ordre.
  const loin = [{la: 43.3, lo: 5.4, p: 1.9}, {la: 50.6, lo: 3.1, p: 1.5}];
  assert.deepEqual(A.etiquettesParCase(loin, 5), [true, true]);
  assert.deepEqual(A.etiquettesParCase(loin.slice().reverse(), 5), [true, true]);
  // La case ne depend que du point et du zoom (grille ancree au monde).
  assert.equal(A.caseGrille(46, 2, 5, 72), A.caseGrille(46, 2, 5, 72));
  assert.notEqual(A.caseGrille(43.3, 5.4, 5, 72), A.caseGrille(50.6, 3.1, 5, 72));
});
