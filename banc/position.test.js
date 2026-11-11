// D16 (releve du 11/11/2026) : la position exacte partait vers le flux des prix (secteur de
// 60 km centre sur le repere, emprise de la carte centree sur l'appareil) et vers le geocodage
// inverse, a pleine precision. Ici un repere memorise puis un second repere, tous deux a cinq
// decimales : aucune requete ne doit les porter ; le flux des prix ne recoit que des carreaux de
// la grille de 0,05°, le geocodage inverse un point a 0,01° ; la liste reste bornee a la vue.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');

const REPERE = [43.61083, 3.87672], SECOND = [43.60941, 3.77537];
const COMMUNE = S.json({type: 'FeatureCollection', features: [{type: 'Feature', geometry: {type: 'Point', coordinates: [3.88, 43.61]}, properties: {city: 'Montpellier'}}]});

describe('la position exacte ne part pas vers le flux des prix ni le géocodage inverse', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'montpellier-aniane'));
  let navigateur = null, ctx = null, journal = null, ecran = null;
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async (url, c) => c.nom === 'ban' ? COMMUNE : undefined,
      init: centre => { localStorage.setItem('fuelpilot:reglages', JSON.stringify({centre})); }, initArg: REPERE});
    ctx = o.ctx; journal = o.journal;
    const calme = async () => { await o.page.waitForFunction(() => /prix en direct/.test(document.getElementById('etat').textContent), null, {timeout: 20000}); await o.page.waitForTimeout(800); };
    await o.page.goto(require('url').pathToFileURL(C.genererPage()).href);
    await calme();
    await o.page.evaluate(([la, lo]) => situer(la, lo, 'Banc', true), SECOND);
    await o.page.waitForTimeout(700);
    await calme();
    ecran = await o.page.evaluate(() => { const v = emprise();
      return {compte: document.getElementById('compte').textContent, cartes: document.querySelectorAll('#liste .carte').length,
              vue: v, charge: DATA.length, dansVue: DATA.filter(s => s.prix.e85 != null && dansEmprise(v, s.la, s.lo)).length}; });
  });
  after(async () => { if(ctx) await ctx.close(); if(navigateur) await navigateur.close(); });

  const nombres = url => (decodeURIComponent(url.split('?')[1] || '').match(/-?\d+\.\d+/g) || []);

  it('aucune requête ne porte un repère à pleine précision', () => {
    assert.ok(journal.requetes.some(S.estSecteur) && journal.requetes.some(S.estPrixEmprise) && journal.requetes.some(u => /\/reverse\//.test(u)), 'secteur, emprise et géocodage inverse attendus');
    const fuites = journal.requetes.filter(u => [REPERE, SECOND].flat().some(x => decodeURIComponent(u).includes(String(x).slice(0, 6))));
    assert.deepEqual(fuites, []);
  });
  it('flux des prix : emprises et centre du secteur sur la grille de 0,05°', () => {
    const horsGrille = journal.requetes.filter(S.estPrix).filter(u => {
      const w = S.where(u), m = w.match(/in_bbox\(geom, ([^)]*)\)/) || w.match(/POINT\(([^)]*)\)/);
      return !m || m[1].split(/[ ,]+/).some(x => !/^-?\d+\.\d[05]$/.test(x));
    });
    assert.deepEqual(horsGrille, []);
  });
  it('géocodage inverse : point à deux décimales', () => {
    journal.requetes.filter(u => /\/reverse\//.test(u)).forEach(u => nombres(u).forEach(x => assert.match(x, /^-?\d+\.\d{2}$/, u)));
  });
  it('la liste ne montre et ne compte que les stations de la zone affichée', () => {
    assert.ok(ecran.dansVue > 0, 'aucune station dans la vue : la scène ne prouve rien');
    assert.ok(ecran.charge > ecran.dansVue, `la scène doit charger une station hors de la vue (emprise sur la grille) : ${JSON.stringify(ecran)}`);
    assert.equal(ecran.cartes, ecran.dansVue);
    assert.match(ecran.compte, new RegExp(`^${ecran.dansVue} stations? dans la zone affichée`));
  });
});
