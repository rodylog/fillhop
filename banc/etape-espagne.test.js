// D26 (releve du 11/11/2026) : dans la ligne de temps du plan, le nom d'une station espagnole
// n'etait pas marque lang="es" (la liste et la fiche le font) : « Arrêt 1 — La Jonquera (ES) »
// etait lu en francais. Scene transfrontaliere entierement synthetique : un trajet de 25 km le
// long de la frontiere (deux communes aux coordonnees fabriquees), aucune station francaise,
// une station espagnole (province de Girona, format du ministere) seule a portee : elle est
// l'etape, le plein de depart et le plein d'arrivee.
//   node --test banc/*.test.js
'use strict';
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const C = require('./lib/commun.js');
const S = require('./lib/scene.js');

const LIEUX = {Maureillas: [2.862, 42.465], Banyuls: [3.165, 42.44]};
const geocodage = q => S.json({type: 'FeatureCollection', features: LIEUX[q] ? [{type: 'Feature', geometry: {type: 'Point', coordinates: LIEUX[q]},
  properties: {label: q, score: 0.96, type: 'municipality', name: q, postcode: '66000', citycode: '66000', city: q}}] : []});
// Itineraire rectiligne en 26 sommets entre start et end ; distance = longueur plane du trace.
function itineraire(url){
  const p = new URL(url).searchParams, [x1, y1] = p.get('start').split(',').map(Number), [x2, y2] = p.get('end').split(',').map(Number);
  const coordinates = Array.from({length: 26}, (_, i) => [x1 + (x2 - x1) * i / 25, y1 + (y2 - y1) * i / 25]);
  const km = Math.hypot((x2 - x1) * 111.32 * Math.cos(y1 * Math.PI / 180), (y2 - y1) * 110.57);
  return S.json({geometry: {type: 'LineString', coordinates}, distance: Math.round(km * 1000), duration: Math.round(km * 72)});
}
const GIRONA = S.json({Fecha: '30/10/2026 08:00:00', Nota: 'synthétique', ResultadoConsulta: 'OK', ListaEESSPrecio: [{
  'C.P.': '17753', 'Dirección': 'CARRETERA GI-602 KM. 4', Horario: 'L-D: 24H', Latitud: '42,435000', Localidad: 'ESPOLLA', 'Longitud (WGS84)': '3,000000',
  Municipio: 'Espolla', Provincia: 'GIRONA', 'Precio Gasoleo A': '1,499', 'Rótulo': 'BANC', 'Tipo Venta': 'P', IDEESS: '990001', IDProvincia: '17'}]});

describe('titres d\'étape en Espagne : le nom de lieu porte lang="es"', () => {
  let navigateur = null, ctx = null, plan = null, dom = null;
  before(async () => {
    navigateur = await C.ouvrirNavigateur();
    const o = await S.ouvrirScene(navigateur, {date: '2026-10-30T10:00:00.000Z', repondre: async (url, c) =>
      c.nom === 'geocodage' ? geocodage(new URL(url).searchParams.get('q'))
      : c.nom === 'itineraire' ? itineraire(url)
      : c.nom === 'es' ? GIRONA
      : c.nom === 'prix' ? S.json({total_count: 0, results: []}) : null});
    ctx = o.ctx;
    plan = await C.jouer(o.page, C.genererPage(), {depart: 'Maureillas', arrivee: 'Banyuls', couloir: 10, veh: 'Banc|gazole|6|30|5|22'}, () => o.journal.enVol);
    dom = await o.page.evaluate(() => {
      const lire = sel => { const e = document.querySelector('#plan ' + sel); return e ? {texte: e.textContent, es: [...e.querySelectorAll('[lang=es]')].map(x => x.textContent)} : null; };
      return {etape: lire('.lt-etape .lt-txt > b'), depart: lire('.lt-depart .lt-ligne'), arrivee: lire('.lt-retour .lt-ligne')};
    });
  });
  after(async () => { if(ctx) await ctx.close(); if(navigateur) await navigateur.close(); });

  it('la station espagnole est l\'étape du plan', () => {
    assert.equal(plan.etat, 'arrets');
    assert.deepEqual(plan.etapes.map(e => e.ville), ['ESPOLLA']);
  });
  it('titre d\'étape : « Arrêt 1 — ESPOLLA (ES) », le nom seul en lang="es"', () => {
    assert.equal(dom.etape.texte, 'Arrêt 1 — ESPOLLA (ES)');
    assert.deepEqual(dom.etape.es, ['ESPOLLA']);
  });
  it('plein de départ et plein d\'arrivée : le nom seul en lang="es"', () => {
    assert.match(dom.depart.texte, /^ESPOLLA \(ES\) · km /);
    assert.deepEqual(dom.depart.es, ['ESPOLLA']);
    assert.match(dom.arrivee.texte, /^ESPOLLA \(ES\) · km /);
    assert.deepEqual(dom.arrivee.es, ['ESPOLLA']);
  });
});
