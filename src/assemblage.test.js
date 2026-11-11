// Tests de l'assemblage de la page : generate.py concatene les fichiers de SCRIPTS dans UN
// seul <script>. Les autres tests chargent chaque module a part (require) et ne voient donc
// pas ce que la concatenation change : deux fonctions globales du meme nom, la seconde
// remplace la premiere dans toute la page (ouvertA d'es.js contre celle d'irve.js, releve du
// 11/11/2026 : le filtre « Ouvert maintenant » des bornes ne filtrait plus rien).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const lire = nom => fs.readFileSync(path.join(__dirname, nom), 'utf8');
// SCRIPTS tel que generate.py l'ecrit : la liste lue ici est celle de la page, pas une copie.
const SCRIPTS = (() => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'generate.py'), 'utf8');
  const m = py.match(/^SCRIPTS = \[([^\]]*)\]/m);
  assert.ok(m, 'SCRIPTS introuvable dans generate.py');
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
})();
// Modules purs : ceux qui s'exportent pour Node (plan.js … signalements.js), dans l'ordre de la page.
const PURS = SCRIPTS.filter(n => /module\.exports/.test(lire(n)));
// Les modules purs concatenes comme dans la page, dans un contexte neuf ; les expressions
// sont evaluees DANS ce contexte (ses Date sont les siennes, comme dans le navigateur).
function pagePure(){
  const ctx = vm.createContext({__ES_PROVINCIAS__: JSON.parse(lire('es-provincias.json'))});
  vm.runInContext(PURS.map(n => lire(n).replace(/\n+$/, '')).join('\n\n'), ctx, {filename: 'modules-purs.js'});
  return expr => vm.runInContext(expr, ctx);
}
const DIMANCHE_23H = 'new Date(2026, 10, 1, 23, 0)', JEUDI_10H = 'new Date(2026, 9, 29, 10, 0)';

test('SCRIPTS : la liste de generate.py est lue, modules purs en tête', () => {
  assert.ok(SCRIPTS.length >= 8 && SCRIPTS[SCRIPTS.length - 1] === 'app.js', JSON.stringify(SCRIPTS));
  assert.ok(PURS.includes('irve.js') && PURS.includes('es.js') && !PURS.includes('app.js'), JSON.stringify(PURS));
});

test('unicité des fonctions globales de la page : aucune fonction de premier niveau déclarée deux fois', () => {
  const vues = new Map(), doublons = [];
  for(const nom of SCRIPTS){
    for(const m of lire(nom).matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm)){
      if(vues.has(m[1])) doublons.push(`${m[1]} : ${vues.get(m[1])} puis ${nom}`);
      else vues.set(m[1], nom);
    }
  }
  assert.ok(vues.size > 100, `fonctions de premier niveau trouvées : ${vues.size}`);
  assert.deepEqual(doublons, []);
});

test('page assemblée : ouvertA lit les horaires des bornes, ouvertES ceux des stations espagnoles', () => {
  const page = pagePure();
  assert.equal(page(`ouvertA('Mo-Fr 08:00-18:00', ${DIMANCHE_23H})`), false);
  assert.equal(page(`ouvertA('Mo-Fr 08:00-18:00', ${JEUDI_10H})`), true);
  assert.equal(page(`ouvertA('24/7', ${DIMANCHE_23H})`), true);
  assert.equal(page(`ouvertA('', ${JEUDI_10H})`), null);
  assert.equal(page(`ouvertES('L-S: 06:00-22:00; D: 07:00-22:00', ${JEUDI_10H})`), true);
  assert.equal(page(`ouvertES('L-S: 06:00-22:00; D: 07:00-22:00', ${DIMANCHE_23H})`), false);
  assert.equal(page(`ouvertES('L-D: 24H', ${DIMANCHE_23H})`), true);
});

test('page assemblée : filtrerBornes écarte une borne fermée à l\'heure demandée', () => {
  const page = pagePure();
  assert.equal(page(`filtrerBornes([{h: 'Mo-Fr 08:00-18:00', kw: 50}], {ouvertLe: ${DIMANCHE_23H}}).length`), 0);
  assert.equal(page(`filtrerBornes([{h: 'Mo-Fr 08:00-18:00', kw: 50}], {ouvertLe: ${JEUDI_10H}}).length`), 1);
  assert.equal(page(`filtrerBornes([{h: '', kw: 50}, {h: '24/7', kw: 50}], {ouvertLe: ${DIMANCHE_23H}}).length`), 2);   // inconnu : gardé
});

// ---- Demarrage (src/ui/fond.js) : l'essai WebGL qui precede la carte ----
// fond.js charge seul avec un faux document : compte les contextes WebGL crees et relaches.
function fondAvec(getContext){
  const compte = {crees: 0, relaches: 0, cartes: 0};
  const contexte = () => {
    compte.crees++;
    return {getExtension: n => n === 'WEBGL_lose_context' ? {loseContext(){ compte.relaches++; }} : null};
  };
  const ctx = vm.createContext({
    window: {WebGLRenderingContext: function(){}},
    document: {createElement: () => ({getContext: type => getContext(type, contexte)})},
    maplibregl: {Map: function(){ compte.cartes++; throw new Error('carte créée'); }},
    CALME: true,
  });
  vm.runInContext(lire('ui/fond.js'), ctx, {filename: 'ui/fond.js'});
  return {compte, page: expr => vm.runInContext(expr, ctx)};
}

const OPTS_CARTE = '({centre: [48.85, 2.35], zoom: 11, sombre: false, fond: "plan"})';

test('démarrage : un seul contexte WebGL d\'essai, relâché avant que la carte crée le sien', () => {
  const {compte, page} = fondAvec((type, contexte) => contexte());
  assert.equal(page('webglDispo()'), true);
  assert.deepEqual(compte, {crees: 1, relaches: 1, cartes: 0});
  assert.equal(page('webglDispo()'), true);   // second appel : resultat memorise, aucun contexte de plus
  assert.deepEqual(compte, {crees: 1, relaches: 1, cartes: 0});
  const sansWebgl2 = fondAvec((type, contexte) => type === 'webgl' ? contexte() : null);
  assert.equal(sansWebgl2.page('webglDispo()'), true);
  assert.deepEqual(sansWebgl2.compte, {crees: 1, relaches: 1, cartes: 0});
  // Avec WebGL, l'essai n'empeche pas la carte : son constructeur est bien appele ensuite.
  const avec = fondAvec((type, contexte) => contexte());
  assert.throws(() => avec.page(`creerCarte(${OPTS_CARTE})`), /carte créée/);
  assert.deepEqual(avec.compte, {crees: 1, relaches: 1, cartes: 1});
});

test('démarrage sans WebGL : creerCarte rend null sans construire la carte (bloc « Carte indisponible »)', () => {
  const sans = fondAvec(() => null);
  assert.equal(sans.page('webglDispo()'), false);
  assert.equal(sans.page(`creerCarte(${OPTS_CARTE})`), null);
  assert.deepEqual(sans.compte, {crees: 0, relaches: 0, cartes: 0});
  const casse = fondAvec(() => { throw new Error('getContext'); });
  assert.equal(casse.page(`creerCarte(${OPTS_CARTE})`), null);
});
