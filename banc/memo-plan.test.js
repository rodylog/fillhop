// D24 (releve du 11/11/2026) : chaque rendu rappelait optimiserPlan sept fois (plan, reference
// d'economie, cinq largeurs), y compris a chaque deplacement de la carte. Ici, le plan de
// Paris → Lyon une fois affiche, optimiserPlan est compte : un deplacement de carte (ou un
// rendu sans donnee nouvelle) ne doit plus l'appeler, le plan publie reste le meme ; changer la
// reserve du vehicule le recalcule.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');
const {determinisme} = require('./regles.js');

describe('plan mémorisé : un rendu sans donnée nouvelle ne recalcule rien', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'paris-lyon'));
  let navigateur = null, ctx = null, avant = null, apres = null, mesure = null;
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    const o = await S.ouvrirScene(navigateur, {fixture: fx});
    ctx = o.ctx;
    avant = await C.jouer(o.page, C.genererPage(), fx.scenario, () => o.journal.enVol);
    mesure = await o.page.evaluate(async () => {
      const origine = window.optimiserPlan; let appels = 0;
      window.optimiserPlan = function(){ appels++; return origine.apply(this, arguments); };
      const publies = () => window.__banc.plans, pause = ms => new Promise(r => setTimeout(r, ms));
      const n0 = publies();
      // Deplacement de la carte quand elle existe (moveend -> rendu), sinon le rendu lui-meme.
      const carte = typeof map !== 'undefined' && map ? 'carte' : 'rendu';
      if(carte === 'carte') map.panBy([40, 0], {animate: false}); else rendu();
      await pause(300);
      const deplacement = {appels, rendus: publies() - n0, carte};
      appels = 0;
      const champ = document.getElementById('reserve');
      champ.value = '20'; champ.dispatchEvent(new Event('change'));
      await pause(300);
      return {deplacement, reserve: {appels}};
    });
    apres = (await C.attendrePlan(o.page, {enVol: () => o.journal.enVol})).plan;
  });
  after(async () => { if(ctx) await ctx.close(); if(navigateur) await navigateur.close(); });

  it('déplacement de la carte : le plan est republié, zéro appel à optimiserPlan', () => {
    assert.ok(mesure.deplacement.rendus >= 1, 'aucun rendu déclenché (' + mesure.deplacement.carte + ')');
    assert.equal(mesure.deplacement.appels, 0);
  });
  it('donnée nouvelle (réserve du véhicule) : le plan est recalculé', () => {
    assert.ok(mesure.reserve.appels >= 1, 'optimiserPlan non rappelé après un changement de réserve');
    assert.equal(apres.vehicule.reserve, 20);
    assert.notEqual(apres.vehicule.A, avant.vehicule.A);
  });
  it('le plan affiché avant le déplacement est celui attendu', () => {
    assert.deepEqual(determinisme(C.resumePlan(avant), fx.attendu), []);
  });
});
