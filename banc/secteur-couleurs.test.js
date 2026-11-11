// D17 (releve du 11/11/2026) : le secteur des couleurs (60 km autour du repere) etait demande
// deux fois de suite sans garde — repere memorise au demarrage, puis nouveau repere — et la
// reponse la plus lente ecrasait l'autre ; en cas d'echec, plus rien n'etait rouge ni masque
// alors que le compteur disait le contraire ; sans repere, le secteur du centre de la France
// etait demande. Stations de la fixture Paris → Lyon : secteur de Paris puis secteur de Lyon.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');

const PARIS = [48.8566, 2.3522], LYON = [45.764, 4.8357];
const pageNue = () => require('url').pathToFileURL(C.genererPage()).href;
const memoriser = centre => { localStorage.setItem('fuelpilot:reglages', JSON.stringify({centre, carbs: ['e10']})); };
const lire = page => page.evaluate(() => ({ref: REF_ROWS.map(s => String(s.id)).sort(), echelle: document.getElementById('echelle').textContent}));

describe('secteur des couleurs', () => {
  const fx = C.lireFixture(path.join(C.FIXTURES, 'paris-lyon'));
  let navigateur = null;
  before(async () => { navigateur = await C.ouvrirNavigateur(); });
  after(async () => { if(navigateur) await navigateur.close(); });

  it('deux secteurs demandés coup sur coup, le premier plus lent : les couleurs suivent le second', async () => {
    const o = await S.ouvrirScene(navigateur, {fixture: fx, init: memoriser, initArg: PARIS,
      repondre: async url => { if(S.estSecteur(url) && /POINT\(2\.35\d* 48\.85\d*\)/.test(S.where(url))) await S.attendre(1500); return undefined; }});
    try{
      await o.page.goto(pageNue());
      await o.page.waitForFunction(() => /prix en direct/.test(document.getElementById('etat').textContent), null, {timeout: 20000});
      await o.page.evaluate(([la, lo]) => situer(la, lo, 'Banc', true), LYON);   // second repere : son secteur repond tout de suite
      await o.page.waitForTimeout(2500);                                         // le secteur de Paris a repondu entre-temps
      const e = await lire(o.page);
      assert.equal(o.journal.requetes.filter(S.estSecteur).length, 2, 'un secteur par repère');
      assert.ok(e.ref.length > 0 && e.ref.every(id => id.startsWith('69')), `référentiel attendu : les stations du Rhône ; obtenu ${e.ref.join(', ')}`);
    }finally{ await o.ctx.close(); }
  });

  it('secteur en échec : rien n\'est dit masqué ni rouge', async () => {
    const o = await S.ouvrirScene(navigateur, {fixture: fx, init: memoriser, initArg: LYON,
      repondre: async url => S.estSecteur(url) ? S.json({message: 'banc : erreur provoquée'}, 500) : undefined});
    try{
      await o.page.goto(pageNue());
      await o.page.waitForFunction(() => /prix en direct/.test(document.getElementById('etat').textContent), null, {timeout: 20000});
      await o.page.waitForTimeout(600);
      const e = await lire(o.page);
      assert.deepEqual(e.ref, []);
      assert.match(e.echelle, /prix du secteur non chargés : aucune station n'est marquée trop chère/);
      assert.doesNotMatch(e.echelle, /sont masquées|rouge =/);
    }finally{ await o.ctx.close(); }
  });

  it('sans repère (ni mémoire ni géolocalisation) : aucun secteur demandé', async () => {
    const o = await S.ouvrirScene(navigateur, {fixture: fx, init: () => { localStorage.setItem('fuelpilot:reglages', JSON.stringify({carbs: ['e10']})); }});
    try{
      await o.page.goto(pageNue());
      await o.page.waitForFunction(() => /prix en direct/.test(document.getElementById('etat').textContent), null, {timeout: 20000});
      await o.page.waitForTimeout(600);
      assert.deepEqual(o.journal.requetes.filter(S.estSecteur), []);
      assert.ok(o.journal.requetes.some(S.estPrixEmprise), 'les prix de la vue sont demandés');
    }finally{ await o.ctx.close(); }
  });
});
