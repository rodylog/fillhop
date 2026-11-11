// D12 (releve du 11/11/2026) : au-dela de 400 stations dans une emprise du couloir, l'API
// rendait les 400 premieres dans un ordre arbitraire et le plan « optimal » ignorait les autres.
// Ici 450 stations cheres (hors couloir, mais dans l'emprise) precedent celles de la fixture
// Paris → Lyon dans l'ordre du flux : sans tri, l'etape du plan (Beaune, la moins chere
// atteignable) n'est pas chargee. Attendu : elle est candidate, et la carte du plan dit ce qui manque.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');
const {repondreFlux} = require('./lib/flux.js');

describe('plafond de 400 stations par emprise du couloir', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'paris-lyon'));
  const stations = C.lireJson(path.join(fx.dossier, 'stations.json'));
  const modele = stations.find(s => s.id === 21200001);
  // 450 stations a ~30 km a l'ouest de Beaune : dans la meme emprise, hors du couloir de 20 km.
  const cheres = Array.from({length: 450}, (_, i) => Object.assign({}, modele, {id: 90000000 + i, ville: 'Banc ' + i, adresse: 'synthétique',
    latitude: String(4693000 - (i % 30) * 50), longitude: String(440000 - Math.floor(i / 30) * 50), e10_prix: 2.5 + i / 10000}));
  let navigateur = null, ctx = null, plan = null, ecran = null, journal = null;
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async url => S.estPrix(url) ? repondreFlux(cheres.concat(stations), url) : undefined});
    ctx = o.ctx; journal = o.journal;
    plan = await C.jouer(o.page, C.genererPage(), fx.scenario, () => o.journal.enVol);
    ecran = await o.page.evaluate(() => ({plan: document.getElementById('plan').textContent, etat: document.getElementById('etat').textContent}));
  });
  after(async () => { if(ctx) await ctx.close(); if(navigateur) await navigateur.close(); });

  it('la moins chère du couloir est candidate et reste l\'étape du plan', () => {
    assert.ok(plan.candidats.some(c => c.id === '21200001'), 'Beaune absente des candidates : écartée par le plafond');
    assert.deepEqual(plan.etapes.map(e => e.id), fx.attendu.etapes.map(e => e.id));
    assert.equal(plan.candidats.filter(c => c.id >= '90000000').length, 0, 'les stations chères sont hors couloir');
  });
  it('les emprises du couloir sont demandées par prix croissant du carburant du plan', () => {
    const prix = journal.requetes.filter(S.estPrixEmprise);
    assert.ok(prix.length && prix.every(u => new URL(u).searchParams.get('order_by') === 'e10_prix,id'), 'order_by=e10_prix,id attendu');
  });
  it('la carte du plan et la ligne d\'état disent combien de stations manquent, et lesquelles', () => {
    assert.match(ecran.plan, /5\d stations plus chères autour du trajet n'ont pas été chargées \(plafond de 400 par zone\) : le plan garde les moins chères de chaque zone\./);
    assert.match(ecran.etat, /5\d de plus non chargées \(plafond 400\)/);
  });
});
