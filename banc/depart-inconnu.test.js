// Depart « Ma position » sans position connue (releve du 11/11/2026) : stockage vide (aucun
// repere memorise), geolocalisation refusee (Chromium headless sans permission), lien
// #trajet=|Béziers|… . Avant le correctif, le trajet partait du centre de la France (46,603 ;
// 2,334) et un plan chiffre etait publie. Attendu : le message « Position inconnue… », aucun
// itineraire demande, aucun plan publie, le depart pret a etre saisi.
// Sans reseau : le geocodage de l'arrivee est servi d'ici, le flux des prix repond vide, tout
// le reste est coupe.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const C = require('./lib/commun.js');

const BEZIERS = {type: 'FeatureCollection', features: [{type: 'Feature', geometry: {type: 'Point', coordinates: [3.233465, 43.343264]},
  properties: {label: 'Béziers', score: 0.956, type: 'municipality', name: 'Béziers', postcode: '34500', citycode: '34032', city: 'Béziers'}}]};

describe('départ « Ma position » sans géolocalisation ni repère', () => {
  let navigateur = null, ctx = null, etat = null;
  const itineraires = [];
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    const routeur = async route => {
      const url = route.request().url(), c = C.classer(url);
      if(c.genre === 'page') return route.continue();
      if(c.nom === 'geocodage') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(BEZIERS)});
      if(c.nom === 'prix') return route.fulfill({status: 200, contentType: 'application/json', body: '{"total_count":0,"results":[]}'});
      if(c.nom === 'itineraire' || c.nom === 'valhalla') itineraires.push(C.cleUrl(url));
      return route.abort('failed');
    };
    const o = await C.ouvrirPage(navigateur, {routeur});
    ctx = o.ctx;
    await o.page.goto(C.urlTrajet(C.genererPage(), {depart: '', arrivee: 'Béziers', veh: 'Banc|e10|6|30|30|330'}));
    // Le calcul part une fois la geolocalisation refusee ; on attend sa reponse puis le calme.
    await o.page.waitForFunction(() => { const t = document.getElementById('infoTrajet').textContent; return t && t !== 'calcul…'; }, null, {timeout: 20000});
    await o.page.waitForTimeout(500);
    etat = await o.page.evaluate(() => ({
      info: document.getElementById('infoTrajet').textContent,
      plans: window.__banc.plans, plan: window.__viaminus_plan || null,
      planCache: document.getElementById('blocPlan').hidden,
      memoire: Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n'),
      focus: document.activeElement && document.activeElement.id,
    }));
  });
  after(async () => { if(ctx) await ctx.close(); if(navigateur) await navigateur.close(); });

  it('le message dit que la position est inconnue et quoi faire', () => {
    assert.match(etat.info, /^Position inconnue : autorisez la localisation, posez un repère ou saisissez l'adresse de départ/);
  });
  it('aucun itinéraire n\'est demandé depuis le centre de la France', () => {
    assert.deepEqual(itineraires, []);
  });
  it('aucun plan n\'est publié ni affiché', () => {
    assert.equal(etat.plans, 0);
    assert.equal(etat.plan, null);
    assert.equal(etat.planCache, true);
  });
  it('le champ départ attend la saisie, aucun repère n\'est mémorisé', () => {
    assert.equal(etat.focus, 'depart');
    assert.doesNotMatch(etat.memoire, /"centre"/);
  });
});
