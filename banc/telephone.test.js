// Usage au telephone (releve du 11/11/2026) : la page generee dans un Chromium tactile de 375
// puis 320 px, sans reseau — le flux des prix est emule (lib/flux.js) sur des stations
// synthetiques, le fond de carte est coupe. Un bloc par defaut du releve (D15, D20, D21, D22,
// D25, D30) : chacun echouait avant son correctif.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const C = require('./lib/commun.js');
const {repondreFlux} = require('./lib/flux.js');

const VEH = 'Banc|e10|6|30|30|330';
// Station au format du flux ; `plus` ecrase ou ajoute des champs (rupture…).
function station(id, la, lo, e10, plus){
  const vide = Object.fromEntries(['gazole', 'e10', 'sp95', 'sp98', 'e85', 'gplc'].flatMap(k =>
    [[k + '_prix', null], [k + '_maj', null], [k + '_rupture_debut', null], [k + '_rupture_type', null]]));
  return Object.assign(vide, {id, cp: '75000', ville: 'Ville ' + id, adresse: id + ' rue du Banc',
    latitude: String(Math.round(la * 1e5)), longitude: String(Math.round(lo * 1e5)),
    e10_prix: e10, e10_maj: '2026-11-10T06:12:05', horaires_automate_24_24: 'Oui',
    carburants_rupture_temporaire: null, carburants_rupture_definitive: null}, plus || {});
}
// Douze stations autour de Paris, prix a trois decimales ; la premiere dit deux ruptures.
const PARIS = Array.from({length: 12}, (x, i) => station(75000 + i, 48.80 + 0.01 * (i % 4), 2.30 + 0.013 * (i % 3), 1.659 + 0.011 * i,
  i === 0 ? {carburants_rupture_definitive: 'SP95;GPLc'} : null));

// Page ouverte au telephone : {ctx, page}. `init` = script pose avant ceux de la page.
async function ouvrir(navigateur, {largeur = 375, stations = PARIS, hash = `#pos=48.815,2.313&veh=${VEH}`, init, pret = '#liste .carte'} = {}){
  const ctx = await navigateur.newContext({viewport: {width: largeur, height: 667}, hasTouch: true, isMobile: true,
    locale: 'fr-FR', timezoneId: 'Europe/Paris'});
  if(init) await ctx.addInitScript(init);
  await ctx.route('**/*', route => {
    const url = route.request().url(), c = C.classer(url);
    if(c.genre === 'page') return route.continue();
    if(c.nom !== 'prix') return route.abort('failed');
    const r = repondreFlux(stations, url);
    return route.fulfill({status: r.statut, contentType: r.type, body: r.corps});
  });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(C.genererPage()).href + hash);
  await page.waitForFunction(sel => { const e = document.querySelector(sel); return !!e && !e.hidden; }, pret, {timeout: 20000});
  await page.waitForTimeout(300);
  return {ctx, page};
}

describe('téléphone : usage tactile à 375 et 320 px', () => {
  let navigateur = null;
  before(async () => { navigateur = await C.ouvrirNavigateur(); });
  after(async () => { if(navigateur) await navigateur.close(); });

  it('D30 — liste, carte et fiche : aucun nombre à point décimal, ruptures séparées par une virgule', async () => {
    const {ctx, page} = await ouvrir(navigateur);
    try{
      const vu = await page.evaluate(() => {
        const textes = sel => [...document.querySelectorAll(sel)].map(e => e.textContent + ' ' + (e.getAttribute('aria-label') || ''));
        return {liste: textes('#liste .carte'), carte: textes('.marqueur'), echelle: document.getElementById('echelle').textContent,
                chip: document.getElementById('chipCarb').textContent};
      });
      assert.ok(vu.liste.length >= 10, 'liste : ' + vu.liste.length);
      assert.ok(vu.carte.length >= 10, 'étiquettes de la carte : ' + vu.carte.length);
      const point = /\d\.\d/;
      [...vu.liste, ...vu.carte, vu.echelle].forEach(t => assert.doesNotMatch(t, point));
      assert.match(vu.liste.join(' '), /1,659/);
      assert.match(vu.liste.join(' '), /\d,\d km/);
      assert.match(vu.carte.join(' '), /1,659/);
      await page.evaluate(() => poserCran('plein'));   // la liste est sous le bord du panneau replie
      await page.locator('#liste .carte', {hasText: 'Ville 75000'}).click();
      await page.waitForSelector('#ficheStation:not([hidden])');
      const fiche = await page.locator('#ficheStation').innerText();
      assert.doesNotMatch(fiche, point);
      assert.match(fiche, /1,659 €/);
      assert.match(fiche, /\d,\d km du repère/);
      assert.match(fiche, /rupture : SP95, GPLc/);
    }finally{ await ctx.close(); }
  });

  it('D15 — bouton « retour » : il ferme la feuille ouverte, puis le formulaire, sans quitter ni changer l\'adresse', async () => {
    const {ctx, page} = await ouvrir(navigateur);
    try{
      const etat = () => page.evaluate(() => ({url: location.href, n: history.length, etat: history.state,
        feuilles: [...document.querySelectorAll('.modale:not([hidden])')].map(m => m.id), voile: !document.getElementById('voile').hidden,
        formulaire: document.getElementById('recherche').classList.contains('ouvert'), focus: document.activeElement && document.activeElement.id}));
      const depart = await etat();
      assert.doesNotMatch(depart.url, /#/, 'le lien #pos=…&veh=… est lu puis effacé');
      // Options ouverte : une entree de plus ; « retour » la ferme, la page et l'adresse restent.
      await page.locator('#options').click();
      const ouverte = await etat();
      assert.deepEqual([ouverte.feuilles, ouverte.n, ouverte.url], [['menuOptions'], depart.n + 1, depart.url]);
      await page.goBack();
      const fermee = await etat();
      assert.deepEqual([fermee.feuilles, fermee.voile, fermee.url, fermee.focus], [[], false, depart.url, 'options']);
      // Fermee par Echap ou par la croix : l'entree est rendue, l'historique ne s'allonge pas.
      await page.locator('#aideBtn').click();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => history.state === null);
      await page.locator('#aideBtn').click();
      await page.locator('#aide .fermer').click();
      await page.waitForFunction(() => history.state === null);
      const rendue = await etat();
      assert.deepEqual([rendue.feuilles, rendue.n, rendue.url], [[], depart.n + 1, depart.url]);
      // Une feuille qui en remplace une autre (fiche -> choix de l'application) : un seul retour.
      await page.evaluate(() => poserCran('plein'));
      await page.locator('#liste .carte').first().click();
      await page.locator('#fsAller').click();
      assert.deepEqual((await etat()).feuilles, ['menuNav']);
      await page.goBack();
      assert.deepEqual([(await etat()).feuilles, (await etat()).url], [[], depart.url]);
      // Formulaire du trajet deplie, Options par-dessus : la feuille d'abord, puis le formulaire.
      await page.evaluate(() => poserCran('apercu'));
      await page.locator('#pilule').click();
      assert.equal((await etat()).formulaire, true);
      await page.evaluate(() => ouvrirFeuille('menuOptions'));
      await page.goBack();
      const dessous = await etat();
      assert.deepEqual([dessous.feuilles, dessous.formulaire, dessous.url], [[], true, depart.url]);
      await page.goBack();
      const fin = await etat();
      assert.deepEqual([fin.feuilles, fin.formulaire, fin.url], [[], false, depart.url]);
    }finally{ await ctx.close(); }
  });

  it('D15 — liens #trajet=…&veh=… : le hash est lu et effacé comme avant, un lien illisible garde le sien après « retour »', async () => {
    const lu = await ouvrir(navigateur, {hash: `#trajet=Paris|Lyon|10|&veh=${VEH}`, pret: '#panneau'});
    try{
      const page = lu.page, url = await page.evaluate(() => location.href);
      assert.doesNotMatch(url, /#/);
      assert.deepEqual(await page.evaluate(() => [document.getElementById('depart').value, document.getElementById('arrivee').value, document.getElementById('chipNom').textContent]), ['Paris', 'Lyon', 'Banc']);
      await page.evaluate(() => ouvrirFeuille('menuOptions'));
      await page.goBack();
      assert.deepEqual(await page.evaluate(() => [location.href, document.getElementById('menuOptions').hidden]), [url, true]);
    }finally{ await lu.ctx.close(); }
    const illisible = await ouvrir(navigateur, {hash: '#veh=illisible', pret: '#panneau'});
    try{
      const page = illisible.page, url = await page.evaluate(() => location.href);
      assert.match(url, /#veh=illisible$/);
      assert.notEqual(await page.locator('#lienMsg').textContent(), '');
      const ouverte = await page.evaluate(() => { fermerFeuille(); ouvrirFeuille('aide'); return [location.href, document.getElementById('aide').hidden]; });
      assert.deepEqual(ouverte, [url, false]);
      await page.goBack();
      assert.deepEqual(await page.evaluate(() => [location.href, document.getElementById('aide').hidden]), [url, true]);
    }finally{ await illisible.ctx.close(); }
  });

  it('D21 — ni partage ni presse-papiers : le lien et l\'adresse s\'écrivent dans un champ sélectionné, sans prompt()', async () => {
    const {ctx, page} = await ouvrir(navigateur, {init: () => {
      for(const k of ['share', 'clipboard']) Object.defineProperty(Navigator.prototype, k, {get: () => undefined, configurable: true});
      window.__prompts = 0; window.prompt = () => { window.__prompts++; return null; };
    }});
    try{
      const champ = () => page.evaluate(() => {
        const i = document.querySelector('.modale:not([hidden]) .a-copier input'), r = i && i.getBoundingClientRect();
        return i && {valeur: i.value, lectureSeule: i.readOnly, focus: document.activeElement === i, hauteur: Math.round(r.height),
                     selection: i.value.slice(i.selectionStart, i.selectionEnd), libelle: i.closest('label').textContent.trim(),
                     copier: i.closest('.a-copier').querySelector('button').textContent};
      });
      await page.locator('#chipVeh').click();
      await page.locator('#vehPartager').click();
      await page.waitForTimeout(200);
      const lien = await champ();
      assert.ok(lien, 'aucun champ dans le garage');
      assert.match(lien.valeur, /^file:.*#veh=Banc\|e10\|6\|30\|30\|330$/);
      assert.deepEqual([lien.lectureSeule, lien.focus, lien.selection, lien.libelle, lien.copier], [true, true, lien.valeur, 'Copiez ce lien', 'Copier']);
      assert.ok(lien.hauteur >= 44, `champ de ${lien.hauteur} px`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.a-copier').count(), 0, 'le champ part avec la feuille');
      await page.evaluate(() => poserCran('plein'));
      await page.locator('#liste .carte', {hasText: 'Ville 75003'}).click();
      await page.locator('#fsCopier').click();
      await page.waitForTimeout(200);
      const adresse = await champ();
      assert.ok(adresse, 'aucun champ dans la fiche');
      assert.deepEqual([adresse.valeur, adresse.selection, adresse.libelle], ['75003 rue du Banc, 75000 Ville 75003', adresse.valeur, 'Copiez cette adresse']);
      assert.equal(await page.evaluate(() => window.__prompts), 0, 'prompt() appelé');
    }finally{ await ctx.close(); }
  });

  it('D22 — France entière, 400 stations : une étiquette de prix par case, les autres en pastille, toutes ouvrent leur fiche', async () => {
    const france = Array.from({length: 400}, (x, i) => station(10000 + i, 42.6 + (i % 20) * 0.41, -4.4 + Math.floor(i / 20) * 0.62, 1.5 + i * 0.001));
    const {ctx, page} = await ouvrir(navigateur, {stations: france, hash: `#veh=${VEH}`});
    try{
      const compter = () => page.evaluate(() => {
        const ms = [...document.querySelectorAll('.marqueur[data-id]')];
        return {zoom: map.getZoom(), liste: document.querySelectorAll('#liste .carte').length, marqueurs: ms.length,
                prix: ms.filter(m => !m.querySelector('.pastille')).length, pastilles: ms.filter(m => m.querySelector('.pastille')).length,
                nommes: ms.filter(m => /^Ville \d+ — E10 \d,\d{3} €$/.test(m.getAttribute('aria-label'))).length};
      });
      const large = await compter();
      if(process.env.BANC_BAVARD) console.log('D22', JSON.stringify(large));
      assert.ok(large.zoom < 10, 'zoom ' + large.zoom);
      assert.ok(large.liste >= 100, `${large.liste} stations dans la liste`);
      assert.equal(large.marqueurs, large.liste, 'un marqueur par station affichée');
      assert.equal(large.nommes, large.marqueurs, 'chaque marqueur dit sa station et son prix aux lecteurs d\'écran');
      assert.ok(large.prix >= 5 && large.prix <= 80, `${large.prix} étiquettes de prix pour ${large.marqueurs} stations`);
      assert.equal(large.prix + large.pastilles, large.marqueurs);
      // Une pastille ouvre la fiche de sa station (clic du DOM : les marqueurs se recouvrent).
      const id = await page.evaluate(() => { const m = [...document.querySelectorAll('.marqueur[data-id]')].find(x => x.querySelector('.pastille')); m.click(); return m.dataset.id; });
      await page.waitForSelector('#ficheStation:not([hidden])');
      assert.match(await page.locator('#fsTitre').innerText(), new RegExp('Ville ' + id));
      await page.keyboard.press('Escape');
      // En zoomant (10 et plus), chaque station retrouve son prix.
      await page.evaluate(() => map.jumpTo({center: [2.42, 46.7], zoom: 10.5}));
      await page.waitForFunction(() => document.querySelectorAll('.marqueur[data-id]').length > 0 && document.querySelectorAll('.marqueur[data-id]').length < 50, null, {timeout: 20000});
      await page.waitForTimeout(300);
      const pres = await compter();
      assert.ok(pres.marqueurs >= 1 && pres.pastilles === 0, `zoom ${pres.zoom} : ${pres.pastilles} pastilles sur ${pres.marqueurs}`);
    }finally{ await ctx.close(); }
  });

  for(const largeur of [375, 320]){
    it(`D20 — cibles tactiles ≥ 44 px à ${largeur} px : réservoir au départ (formulaire et question), prix corrigé`, async () => {
      const {ctx, page} = await ouvrir(navigateur, {largeur});
      try{
        const hauteur = sel => page.locator(sel).evaluate(e => Math.round(e.getBoundingClientRect().height));
        assert.equal(await page.evaluate(() => matchMedia('(pointer:coarse)').matches), true, 'contexte tactile');
        await page.locator('#pilule').click();
        await page.waitForSelector('#aBord', {state: 'visible'});
        assert.ok(await hauteur('#aBord') >= 44, `#aBord : ${await hauteur('#aBord')} px`);
        await page.keyboard.press('Escape');
        await page.evaluate(() => ouvrirFeuille('aBordQ'));
        assert.ok(await hauteur('#aBordQkm') >= 44, `#aBordQkm : ${await hauteur('#aBordQkm')} px`);
        // Fermee sans reponse, la question relancerait le trajet : on la dit repondue.
        await page.evaluate(() => { ABORD_REPONDU = true; fermerFeuille(); poserCran('plein'); });
        await page.locator('#liste .carte').first().click();
        await page.locator('#fsCarbs .fs-edit').first().click();
        assert.ok(await hauteur('.fs-corr input') >= 44, `.fs-corr input : ${await hauteur('.fs-corr input')} px`);
      }finally{ await ctx.close(); }
    });

    // 375 px : tout se lit. 320 px : deux lignes de 200 px ne suffisent pas toujours a la date, mais
    // le compteur et ses alertes, ecrits d'abord, sont toujours dans les deux lignes visibles.
    it(`D25 — ligne d'état à ${largeur} px, panneau replié : compteur et alertes d'abord, lisibles, dans l'écran`, async () => {
      const {ctx, page} = await ouvrir(navigateur, {largeur});
      try{
        const m = await page.evaluate(() => {
          const e = document.getElementById('etat'), r = e.getBoundingClientRect();
          // Bas du dernier caractere de l'alerte « … masquées » : visible s'il est dans la boite.
          const t = e.firstChild, fin = t.data.indexOf('masquées') + 'masquées'.length, plage = document.createRange();
          plage.setStart(t, Math.max(0, fin - 1)); plage.setEnd(t, Math.max(1, fin));
          return {cran: document.getElementById('panneau').dataset.cran, texte: e.textContent, bas: r.bottom, ecran: innerHeight,
                  large: e.scrollWidth - e.clientWidth, haut: e.scrollHeight - e.clientHeight,
                  alerte: plage.getBoundingClientRect().bottom - r.bottom,
                  lignes: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight))};
        });
        assert.equal(m.cran, 'apercu');
        assert.ok(m.large <= 1, `texte coupé en largeur : ${m.large} px (« ${m.texte} »)`);
        assert.match(m.texte, /^12 stations · 2 trop chères masquées · prix en direct · /);
        assert.ok(m.alerte <= 1, `l'alerte dépasse la zone visible de ${m.alerte} px`);
        if(largeur >= 375) assert.ok(m.haut <= 1, `texte coupé en hauteur : ${m.haut} px (« ${m.texte} »)`);
        assert.ok(m.lignes <= 2, `${m.lignes} lignes`);
        assert.ok(m.bas <= m.ecran, `bas de l'état à ${m.bas} px pour un écran de ${m.ecran} px`);
      }finally{ await ctx.close(); }
    });
  }
});
