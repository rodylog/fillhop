// Scenes des correctifs (releve du 11/11/2026) : une fixture synthetique rejouee avec un
// routeur que le test peut detourner — reponse retardee, en erreur, modifiee — pour provoquer
// ce que le rejeu simple ne montre pas (chargement lent, panne d'une page, trace plus court que
// la distance annoncee). Sans reseau : tout vient de la fixture ou du test.
'use strict';
const C = require('./commun.js');

const attendre = ms => new Promise(r => setTimeout(r, ms));
const json = (corps, statut = 200) => ({statut, type: 'application/json; charset=utf-8', corps: typeof corps === 'string' ? corps : JSON.stringify(corps)});

// Ouvre une page routee. options :
//   fixture   : fixture lue par C.lireFixture (reponses par defaut) ; absente = tout est coupe
//   repondre  : async (url, classe, defaut) -> {statut, type, corps} | null (coupe) | undefined
//               (= reponse de la fixture) ; `defaut()` donne la reponse de la fixture
//   date      : horloge figee (defaut : celle de la fixture)
//   init      : fonction executee dans la page avant ses scripts (stockage, sondes) ; initArg
//   contexte  : options du contexte Playwright (geolocalisation, permissions)
// Rend {ctx, page, journal} ; journal.requetes = URL brutes des API demandees, dans l'ordre ;
// journal.etats = non rempli ici (voir etatsPublies).
async function ouvrirScene(navigateur, {fixture, repondre, date, init, initArg, contexte} = {}){
  const journal = {enVol: 0, requetes: []};
  const routeur = async route => {
    const url = route.request().url(), c = C.classer(url);
    if(c.genre === 'page') return route.continue();
    const es = new URL(url).hostname === 'sedeaplicaciones.minetur.gob.es';
    if(c.genre !== 'api' && !es) return route.abort('failed');
    const classe = es ? {genre: 'api', nom: 'es'} : c;
    journal.enVol++;
    try{
      journal.requetes.push(url);
      const defaut = () => fixture ? fixture.repondre(url) : null;
      let rep = repondre ? await repondre(url, classe, defaut) : undefined;
      if(rep === undefined) rep = defaut();
      if(!rep) return await route.abort('failed');
      return await route.fulfill({status: rep.statut, contentType: rep.type, body: rep.corps});
    }catch(e){ /* page fermee pendant une reponse retardee */ }
    finally{ journal.enVol--; }
  };
  const ctx = await navigateur.newContext(Object.assign({viewport: {width: 1280, height: 900}, locale: 'fr-FR', timezoneId: 'Europe/Paris'}, contexte || {}));
  const page = await ctx.newPage();
  const d = date || (fixture && fixture.meta.date);
  if(d) await page.clock.setFixedTime(new Date(d));
  // Chaque plan publie est note (etat, nombre de candidates, texte de l'etat a cet instant).
  await page.addInitScript(() => {
    window.__banc = {plans: 0, publies: []};
    window.addEventListener('viaminus:plan', e => {
      window.__banc.plans++;
      const p = e.detail || {};
      window.__banc.publies.push({etat: p.etat, candidats: (p.candidats || []).length, ligne: (document.getElementById('etat') || {}).textContent || ''});
    });
  });
  if(init) await page.addInitScript(init, initArg);
  await ctx.route('**/*', routeur);
  return {ctx, page, journal};
}

// Requetes du flux des prix par emprise (in_bbox) dont le select est celui des prix (pas des ruptures).
const where = url => new URL(url).searchParams.get('where') || '';
const estPrix = url => new URL(url).hostname === 'data.economie.gouv.fr';
const estPrixEmprise = url => estPrix(url) && /in_bbox\(/.test(where(url)) && !/_rupture_/.test(where(url));
const estSecteur = url => estPrix(url) && /distance\(/.test(where(url));
const estRuptures = url => estPrix(url) && /_rupture_/.test(where(url));

module.exports = {ouvrirScene, attendre, json, where, estPrix, estPrixEmprise, estSecteur, estRuptures};
