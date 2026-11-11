// D07 (releve du 11/11/2026) : le trace recu est simplifie, donc plus court que la distance
// annoncee par le service d'itineraire ; le plan comptait la longueur du trace (941 km pour 965)
// et entamait la reserve. Ici la fixture Paris → Lyon est rejouee avec une distance annoncee
// superieure de 2,5 % a la longueur du trace : le plan doit compter la distance annoncee.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');
const {REGLES} = require('./regles.js');

describe('distance du plan = distance annoncée par le service (tracé plus court de 2,5 %)', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'paris-lyon'));
  let navigateur = null, ctx = null, plan = null, annonce = null;
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async (url, c, defaut) => {
      if(c.nom !== 'itineraire') return undefined;
      const rep = defaut(), j = JSON.parse(rep.corps);
      j.distance = Math.round(j.distance * 1.025); annonce = j.distance / 1000;
      return S.json(j);
    }});
    ctx = o.ctx;
    plan = await C.jouer(o.page, C.genererPage(), fx.scenario, () => o.journal.enVol);
  });
  after(async () => { if(ctx) await ctx.close(); if(navigateur) await navigateur.close(); });

  it('règle « total du plan = distance du trajet à 0,5 % près »', () => {
    const pb = REGLES.find(r => r.cle === 'totalPlanDistance').verifier({plan, date: fx.meta.date});
    assert.deepEqual(pb, []);
    assert.ok(Math.abs(plan.trajet.total - annonce) < 0.01, `total ${plan.trajet.total} ≠ ${annonce}`);
  });
  it('l\'écran ne montre qu\'un seul nombre de kilomètres (en-tête et arrivée)', () => {
    assert.equal(Math.round(plan.trajet.total), Math.round(plan.trajet.km));
  });
});
