// D11 (releve du 11/11/2026) : une seule reponse en erreur du flux des prix jetait tout le
// couloir et affichait « hors ligne — relevé du <date de generation> », appareil en ligne et
// snapshot vide. Scenes sur la fixture Paris → Lyon : une page en HTTP 500 une seule fois (le
// second essai passe), une emprise en 500 a chaque essai (les autres sont gardees, « Réessayer »
// la recharge), puis le flux entier en 500 (ni « hors ligne » ni date, pas de verdict).
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');

const ERREUR = S.json({error_code: 'panne', message: 'banc : erreur provoquée'}, 500);
const lireEtat = page => page.evaluate(() => ({etat: document.getElementById('etat').textContent,
  plan: document.getElementById('plan').textContent, liste: document.getElementById('liste').textContent}));

describe('flux des prix en erreur', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'paris-lyon'));
  let navigateur = null;
  before(async () => { navigateur = await C.ouvrirNavigateur(); });
  after(async () => { if(navigateur) await navigateur.close(); });

  // Emprise du milieu du couloir : la deuxieme demandee.
  const deuxieme = () => { const vues = []; return url => { const w = S.where(url); if(!vues.includes(w)) vues.push(w); return vues[1] === w; }; };

  it('une page en erreur une fois : redemandée, plan attendu, aucun message d\'erreur', async () => {
    const milieu = deuxieme(); let essais = 0;
    const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async url => (S.estPrixEmprise(url) && milieu(url) && ++essais === 1) ? ERREUR : undefined});
    try{
      const plan = await C.jouer(o.page, C.genererPage(), fx.scenario, () => o.journal.enVol);
      const e = await lireEtat(o.page);
      assert.equal(essais, 2, 'la page en erreur doit être redemandée une fois');
      assert.deepEqual(C.resumePlan(plan), fx.attendu);
      assert.match(e.etat, /prix en direct · /);
      assert.doesNotMatch(e.etat + e.plan, /hors ligne|sans réponse|Réessayer|indisponibles/);
    }finally{ await o.ctx.close(); }
  });

  it('une emprise en erreur à chaque essai : les autres sont gardées, le plan est produit, l\'écran le dit, « Réessayer » recharge', async () => {
    const milieu = deuxieme(); let panne = true, essais = 0;
    const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async url => (panne && S.estPrixEmprise(url) && milieu(url)) ? (essais++, ERREUR) : undefined});
    try{
      const r = await C.attendrePlan(await o.page.goto(C.urlTrajet(C.genererPage(), fx.scenario)).then(() => o.page), {enVol: () => o.journal.enVol});
      const e = await lireEtat(o.page);
      assert.equal(essais, 2, 'deux essais, pas davantage');
      assert.ok(r.plan.candidats.length > 0, 'les stations des emprises chargées sont candidates');
      assert.match(e.etat, /prix en direct · .+ · 1 zone du trajet sans réponse — Réessayer/);
      assert.doesNotMatch(e.etat, /hors ligne|relevé du/);
      assert.match(e.plan, /1 zone du trajet n'a pas répondu : le plan est calculé sans ses stations/);
      panne = false;
      await o.page.click('#etat [data-reessayer]');
      const r2 = await C.attendrePlan(o.page, {apres: r.n, enVol: () => o.journal.enVol});
      const e2 = await lireEtat(o.page);
      assert.deepEqual(C.resumePlan(r2.plan), fx.attendu);
      assert.doesNotMatch(e2.etat + e2.plan, /sans réponse|n'a pas répondu|Réessayer/);
    }finally{ await o.ctx.close(); }
  });

  it('flux entier en erreur, appareil en ligne, snapshot vide : « prix indisponibles… Réessayer », ni « hors ligne » ni date, pas de verdict', async () => {
    let panne = true;
    const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async url => (panne && S.estPrix(url)) ? ERREUR : undefined});
    try{
      await o.page.goto(C.urlTrajet(C.genererPage(), fx.scenario));
      await o.page.waitForFunction(() => /indisponibles/.test(document.getElementById('etat').textContent), null, {timeout: 20000});
      const e = await lireEtat(o.page);
      assert.match(e.etat, /^prix indisponibles \(le service ne répond pas\) — Réessayer$/);
      assert.match(e.plan, /^Prix indisponibles \(le service ne répond pas\) : le plan n'est pas calculé\. Réessayer$/);
      assert.doesNotMatch(e.etat + e.plan + e.liste, /hors ligne|relevé du|infaisable|impossible/);
      assert.equal(await o.page.evaluate(() => window.__banc.plans), 0, 'aucun plan publié sur une panne');
      panne = false;
      await o.page.click('#plan .heros-etat button');
      const r = await C.attendrePlan(o.page, {enVol: () => o.journal.enVol});
      assert.deepEqual(C.resumePlan(r.plan), fx.attendu);
    }finally{ await o.ctx.close(); }
  });
});
