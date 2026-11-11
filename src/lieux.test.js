// Tests de src/lieux.js (choix du lieu geocode) sur des reponses REELLES de la Geoplateforme
// relevees le 11/11/2026 (src/fixtures/geocodage-geopf.json, 5 resultats par saisie).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {choisirLieu, nomSeul, motsLieu, libelleTrajet, SCORE_MIN_LIEU} = require('./lieux.js');
const REP = require('./fixtures/geocodage-geopf.json');
const choix = (q, cle = q) => choisirLieu(q, REP[cle].features);

test('« Narbonne » : la commune (Aude), pas la voie homonyme de Joué-lès-Tours classée première', () => {
  assert.equal(REP.Narbonne.features[0].properties.label, 'Narbonne 37300 Joué-lès-Tours');   // l'ancien choix
  const l = choix('Narbonne');
  assert.equal(l.label, 'Narbonne');
  assert.equal(l.type, 'municipality');
  assert.ok(Math.abs(l.lat - 43.18) < 0.1 && Math.abs(l.lon - 3.0) < 0.1, `${l.lat}, ${l.lon}`);
});

test('« Vienne » : la commune (Isère), pas la voie d\'Aixe-sur-Vienne', () => {
  assert.equal(REP.Vienne.features[0].properties.label, 'Vienne 87700 Aixe-sur-Vienne');
  const l = choix('Vienne');
  assert.equal(l.type, 'municipality');
  assert.ok(Math.abs(l.lat - 45.52) < 0.1 && Math.abs(l.lon - 4.88) < 0.1, `${l.lat}, ${l.lon}`);
});

test('« 12 rue de la Paix Paris » : une adresse complète reste une adresse (meilleur score)', () => {
  const l = choix('12 rue de la Paix Paris');
  assert.equal(l.label, '12 Rue de la Paix 75002 Paris');
  assert.equal(l.type, 'housenumber');
});

test('grandes villes : la commune, casse et accents indifférents', () => {
  for(const v of ['Lyon', 'Tours', 'Nice', 'Orange', 'Paris']){
    assert.deepEqual([choix(v).label, choix(v).type], [v, 'municipality']);
    assert.equal(choisirLieu(v.toUpperCase(), REP[v].features).label, v);
  }
});

test('une voie sans chiffre est gardée quand la saisie nomme sa commune', () => {
  const l = choix('rue de la république lyon');
  assert.equal(l.type, 'street');
  assert.match(l.label, /^Rue de la République 6900\d Lyon$/);
});

test('un nom seul qui ne tombe que sur des voies homonymes est refusé (null), jamais deviné', () => {
  assert.equal(choix('Madrid'), null);                  // voie « Madrid » en Charente, 0,94
  assert.equal(choix('Barcelone'), null);               // voies du Var… et la commune de Barcelonne (Drôme)
  assert.equal(choix('Figueres'), null);                // rue de Fort-de-France
  assert.equal(choix('Aéroport de Perpignan'), null);   // « Route de Perpignan » à Pia
  assert.equal(choix('Madrid', 'Madrid|municipality'), null);   // Madriat, 0,48
});

test('« St Etienne » : la commune de Saint-Étienne (5e, 0,55), pas le lieu-dit du Beausset (1er, 0,95)', () => {
  assert.equal(REP['St Etienne'].features[0].properties.label, 'St Etienne 83330 Le Beausset');
  assert.equal(choix('St Etienne').label, 'Saint-Étienne');
  assert.equal(choix('St Etienne', 'St Etienne|municipality').label, 'Saint-Étienne');   // recherche de communes seule
});

test('réponse vide ou absente : null', () => {
  assert.equal(choisirLieu('Portbou', []), null);
  assert.equal(choisirLieu('Portbou', undefined), null);
});

test('nomSeul, motsLieu', () => {
  assert.equal(nomSeul('Narbonne'), true);
  assert.equal(nomSeul('Aixe-sur-Vienne'), true);
  assert.equal(nomSeul('12 rue de la Paix Paris'), false);
  assert.equal(nomSeul('Mairie, Lodève'), false);
  assert.deepEqual(motsLieu('Sainte-Radégonde  d\'Aixe'), ['sainte', 'radegonde', 'd', 'aixe']);
  assert.deepEqual(motsLieu('St Étienne'), ['saint', 'etienne']);
});

test('libelleTrajet : la saisie si c\'est le même lieu, sinon le libellé géocodé', () => {
  assert.equal(libelleTrajet('narbonne', 'Narbonne'), 'narbonne');
  assert.equal(libelleTrajet('St Etienne', 'Saint-Étienne'), 'St Etienne');
  assert.equal(libelleTrajet('12 rue de la paix paris', '12 Rue de la Paix 75002 Paris'), '12 Rue de la Paix 75002 Paris');
  assert.equal(libelleTrajet('Narbonne', 'Narbonne 37300 Joué-lès-Tours'), 'Narbonne 37300 Joué-lès-Tours');
});

test('score faible : refus (null), même pour une adresse — « Figueres, Espagne » rend la rue Espagne d\'Auch à 0,44', () => {
  const f = REP['Figueres, Espagne'].features[0].properties;
  assert.equal(f.label, 'Rue Espagne 32000 Auch');
  assert.ok(f.score < SCORE_MIN_LIEU, String(f.score));
  assert.equal(choix('Figueres, Espagne'), null);
  // Le seuil : 0,65 (« 12 Rue de la Paix » à Cormeilles-en-Parisis) reste accepté.
  assert.equal(choisirLieu('12 rue de la Paix Paris', REP['12 rue de la Paix Paris'].features.slice(1)).label, '12 Rue de la Paix 95240 Cormeilles-en-Parisis');
});
