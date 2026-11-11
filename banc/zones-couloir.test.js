// D23 (releve du 11/11/2026) : en aller-retour, chaque emprise du couloir etait demandee deux
// fois (aller, puis retour par la meme route), et tout partait en serie. Ici Paris ⇄ Lyon est
// compare a Paris → Lyon sur la meme fixture : memes requetes au flux des prix, memes stations.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');
const {retourSynthetique} = require('./lib/aller-retour.js');

describe('zones du couloir : l\'aller-retour ne redemande pas les emprises de l\'aller', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'paris-lyon'));
  let navigateur = null;
  const jeu = {};
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    for(const [nom, allerRetour] of [['simple', false], ['ar', true]]){
      let enVol = 0, maxi = 0;
      const o = await S.ouvrirScene(navigateur, {fixture: fx, repondre: async (url, c, defaut) => {
        if(!S.estPrixEmprise(url)) return retourSynthetique(fx)(url, c, defaut);
        enVol++; maxi = Math.max(maxi, enVol);
        await S.attendre(150);          // assez pour voir les emprises partir ensemble
        enVol--;
        return undefined;
      }});
      try{
        const plan = await C.jouer(o.page, C.genererPage(), Object.assign({}, fx.scenario, {allerRetour}), () => o.journal.enVol);
        jeu[nom] = {plan, maxi, prix: o.journal.requetes.filter(S.estPrixEmprise).map(C.cleUrl).sort(),
                    ruptures: o.journal.requetes.filter(S.estRuptures).length};
      }finally{ await o.ctx.close(); }
    }
  });
  after(async () => { if(navigateur) await navigateur.close(); });

  it('autant de requêtes au flux des prix en aller-retour qu\'en aller simple, les mêmes', () => {
    assert.ok(jeu.simple.prix.length >= 3, 'plusieurs emprises attendues sur Paris → Lyon');
    assert.deepEqual(jeu.ar.prix, jeu.simple.prix);
    assert.equal(jeu.ar.ruptures, jeu.simple.ruptures);
  });
  it('les emprises partent en parallèle, quatre au plus à la fois', () => {
    assert.ok(jeu.simple.maxi >= 2, `requêtes en série (au plus ${jeu.simple.maxi} en vol)`);
    assert.ok(jeu.simple.maxi <= 4 && jeu.ar.maxi <= 4, `plus de quatre emprises en vol (${jeu.simple.maxi}, ${jeu.ar.maxi})`);
  });
  it('mêmes stations candidates ; l\'aller simple donne le plan attendu', () => {
    const ids = p => [...new Set(p.candidats.map(c => c.id))].sort();
    assert.deepEqual(ids(jeu.ar.plan), ids(jeu.simple.plan));
    assert.equal(jeu.ar.plan.trajet.allerRetour, true);
    assert.deepEqual(C.resumePlan(jeu.simple.plan), fx.attendu);
  });
});
