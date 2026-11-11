// D10 (releve du 11/11/2026) : pendant le chargement des stations du couloir, l'ecran affichait
// « Trajet infaisable avec cette autonomie », calcule sur les stations de l'ancienne vue. Ici
// les reponses du flux des prix par emprise sont retardees de 1,5 s (fixture Paris → Lyon) :
// aucun plan ne doit etre publie avant leur arrivee, et l'ecran dit qu'il cherche.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');

describe('chargement du couloir : aucun verdict avant les stations du trajet', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'paris-lyon'));
  let navigateur = null, ctx = null, pendant = null, publies = null, plan = null;
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async url => {
      if(S.estPrixEmprise(url)) await S.attendre(1500);
      return undefined;
    }});
    ctx = o.ctx;
    await o.page.goto(C.urlTrajet(C.genererPage(), fx.scenario));
    // Le trace est pose (en-tete du plan ecrit), les stations pas encore arrivees.
    await o.page.waitForFunction(() => !document.getElementById('blocPlan').hidden, null, {timeout: 20000});
    await o.page.waitForTimeout(600);
    pendant = await o.page.evaluate(() => ({plans: window.__banc.plans, plan: document.getElementById('plan').textContent,
      liste: document.getElementById('liste').textContent, etat: document.getElementById('etat').textContent,
      meta: document.getElementById('planMeta').textContent}));
    plan = (await C.attendrePlan(o.page, {enVol: () => o.journal.enVol})).plan;
    publies = await o.page.evaluate(() => window.__banc.publies);
  });
  after(async () => { if(ctx) await ctx.close(); if(navigateur) await navigateur.close(); });

  it('pendant le chargement : « Recherche des stations du trajet… », sans plan publié', () => {
    assert.equal(pendant.plans, 0, 'plan publié avant l\'arrivée des stations');
    assert.match(pendant.plan, /^Recherche des stations du trajet…$/);
    assert.doesNotMatch(pendant.plan + pendant.liste, /infaisable|impossible|Aucune station/);
    assert.match(pendant.liste, /Recherche des stations du trajet…/);
    assert.match(pendant.etat, /^chargement…$/);
    assert.match(pendant.meta, /^417 km/);
  });
  it('aucune publication d\'état « infaisable » ni sans candidate, puis le plan attendu', () => {
    assert.ok(publies.length > 0);
    assert.deepEqual(publies.filter(p => p.etat === 'infaisable' || !p.candidats), []);
    assert.deepEqual(C.resumePlan(plan), fx.attendu);
  });
});
