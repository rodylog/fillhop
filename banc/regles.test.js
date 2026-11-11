// Les regles du banc, sans navigateur : chaque regle rougit sur un plan fabrique qui la viole
// et reste verte sur un plan sain. Garantit que le rejeu signale la BONNE regle.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {REGLES, determinisme} = require('./regles.js');

const DATE = '2026-10-30T10:00:00.000Z';
const regle = cle => REGLES.find(r => r.cle === cle);
const st = (id, km, prix, datePrix, plus) => Object.assign({id, ville: 'Ville ' + id, cp: '00000', km, detourKm: 0.5, prix, datePrix, fige: null,
  carburants: [{ref: 'e85', prix, maj: datePrix}]}, plus || {});
// Plan sain : depart frais, une etape fraiche, arrivee fraiche, cinq largeurs au meme carburant a bord.
function planSain(){
  const etape = st('2', 200, 0.70, '2026-10-29T06:00:00', {q: 150, litres: 11.25, plein: false, cout: 7.875, arrivee: 0});
  return {
    etat: 'arrets', couloir: 10, detourAuto: false,
    vehicule: {carburant: 'e85', conso: 7.5, autonomiePlein: 330, A: 300, reserve: 30, aBord: null, g0: 300},
    etapes: [etape], depart: st('1', 4, 0.72, '2026-10-29T06:00:00'), arrivee: st('3', 340, 0.74, '2026-10-28T06:00:00'),
    achats: 7.875, voyage: 16.2 + 7.875, aBordValeur: 16.2, prixMoyen: 0.71,
    economie: {economie: 2.5, prix: 0.80, reference: 26.575}, minutes: 6.2,
    largeurs: [1, 2, 5, 10, 20].map(w => ({w, faisable: w >= 5, voyage: w >= 5 ? 24.075 : null, achats: w >= 5 ? 7.875 : null, aBordValeur: w >= 5 ? 16.2 : null, arrets: w >= 5 ? 1 : null, minutes: w >= 5 ? 6.2 : null})),
    detours: [{w: 5, voyage: 24.075, minutes: 6.2, arrets: 1, conseille: true}],
    candidats: [], alertes: [], messages: ['Un détour jusqu\'à 5 km de la route est nécessaire ; aller plus loin ne ferait rien gagner.'],
    trajet: {dep: 'A', arr: 'B', km: 350, min: 210, allerRetour: false, sansPeage: false, moteur: 'ign', total: 350},
  };
}

test('plan sain : toutes les règles vertes', () => {
  const plan = planSain();
  REGLES.forEach(r => assert.deepEqual(r.verifier({plan, date: DATE}), [], r.nom));
});

test('stationMuette : une étape au prix de 30 jours rougit, 20 jours passe', () => {
  const plan = planSain();
  plan.etapes[0].datePrix = '2026-09-30T06:00:00';
  const pb = regle('stationMuette').verifier({plan, date: DATE});
  assert.equal(pb.length, 1); assert.match(pb[0], /étape 1 .*\(30 j/);
  plan.etapes[0].datePrix = '2026-10-10T06:00:00';
  assert.deepEqual(regle('stationMuette').verifier({plan, date: DATE}), []);
  plan.depart.datePrix = null;   // date inconnue = muette
  assert.equal(regle('stationMuette').verifier({plan, date: DATE}).length, 1);
});

test('pleinArriveeAlerte : arrivée à 20 jours sans alerte rougit, avec alerte passe, à 10 jours passe', () => {
  const plan = planSain();
  plan.arrivee.datePrix = '2026-10-10T06:00:00';
  assert.equal(regle('pleinArriveeAlerte').verifier({plan, date: DATE}).length, 1);
  plan.alertes = [{ou: 'arrivee', id: '3', texte: 'prix figé'}];
  assert.deepEqual(regle('pleinArriveeAlerte').verifier({plan, date: DATE}), []);
  plan.alertes = [{ou: 'etape', id: '3', texte: 'prix figé'}];   // alerte ailleurs : ne compte pas
  assert.equal(regle('pleinArriveeAlerte').verifier({plan, date: DATE}).length, 1);
  plan.arrivee.datePrix = '2026-10-20T06:00:00';
  assert.deepEqual(regle('pleinArriveeAlerte').verifier({plan, date: DATE}), []);
});

test('carburantABordUnique : une largeur qui valorise le réservoir autrement rougit', () => {
  const plan = planSain();
  plan.largeurs[4].aBordValeur = 15.0;   // 20 km : plein de depart compte a un autre prix
  const pb = regle('carburantABordUnique').verifier({plan, date: DATE});
  assert.equal(pb.length, 1); assert.match(pb[0], /largeur 20 km/);
  plan.largeurs[4].aBordValeur = 16.2; plan.aBordValeur = 17;
  assert.match(regle('carburantABordUnique').verifier({plan, date: DATE})[0], /plan affiché/);
});

test('messageDetour : message affiché alors que 1 km suffit rougit ; message dû mais absent rougit', () => {
  const plan = planSain();
  plan.largeurs[0].faisable = true;   // 1 km suffit
  assert.match(regle('messageDetour').verifier({plan, date: DATE})[0], /passe à 1 km/);
  const p2 = planSain();
  p2.messages = [];                    // un seul choix, 5 km necessaires, rien d'affiche
  assert.match(regle('messageDetour').verifier({plan: p2, date: DATE})[0], /message « détour nécessaire » attendu/);
  p2.detours.push({w: 20, voyage: 23, minutes: 30, arrets: 1, conseille: false});   // deux choix : liste, pas de message
  assert.deepEqual(regle('messageDetour').verifier({plan: p2, date: DATE}), []);
});

test('messageDetour : un choix plus étroit dominé -> « Le plus rapide et le moins cher passe à X km » suffit', () => {
  const plan = planSain();   // largeurs faisables 5, 10, 20 ; le seul choix affiche est a 10 km (5 km domine)
  plan.detours = [{w: 10, voyage: 24.075, minutes: 6.2, arrets: 1, conseille: true}];
  plan.messages = ['Le plus rapide et le moins cher passe à 10 km de la route au plus ; aller plus loin ne ferait rien gagner.'];
  assert.deepEqual(regle('messageDetour').verifier({plan, date: DATE}), []);
  plan.messages = [];        // meme plan, rien d'affiche : le message reste du
  assert.match(regle('messageDetour').verifier({plan, date: DATE})[0], /message « Le plus rapide et le moins cher » attendu/);
  const p2 = planSain();     // seul choix a la plus petite largeur faisable : c'est « détour nécessaire » qui est du
  p2.messages = ['Le plus rapide et le moins cher passe à 5 km de la route au plus ; aller plus loin ne ferait rien gagner.'];
  assert.match(regle('messageDetour').verifier({plan: p2, date: DATE})[0], /message « détour nécessaire » attendu/);
});

test('coutTotal : voyage ≠ à bord + étapes rougit ; achats ≠ somme rougit', () => {
  const plan = planSain();
  plan.voyage += 1;
  assert.match(regle('coutTotal').verifier({plan, date: DATE})[0], /carburant du voyage/);
  const p2 = planSain(); p2.achats += 0.5;
  assert.match(regle('coutTotal').verifier({plan: p2, date: DATE})[0], /achats/);
});

test('economiePositive : économie négative rougit, nulle ou non chiffrée passe', () => {
  const plan = planSain();
  plan.economie.economie = -0.3;
  assert.equal(regle('economiePositive').verifier({plan, date: DATE}).length, 1);
  plan.economie = null;
  assert.deepEqual(regle('economiePositive').verifier({plan, date: DATE}), []);
});

test('total du plan : 941 km comptés pour 965 annoncés -> manquement ; 0,4 % d\'écart ou trajet absent -> rien', () => {
  const plan = planSain();
  plan.trajet.km = 965.25; plan.trajet.total = 940.85;
  const pb = regle('totalPlanDistance').verifier({plan, date: DATE});
  assert.equal(pb.length, 1);
  assert.match(pb[0], /940\.9 km pour un trajet annoncé de 965\.3 km \(écart 2\.5 %/);
  plan.trajet.total = 965.25 * 1.004;
  assert.deepEqual(regle('totalPlanDistance').verifier({plan, date: DATE}), []);
  plan.trajet = null;
  assert.deepEqual(regle('totalPlanDistance').verifier({plan, date: DATE}), []);
});

test('determinisme : deux plans égaux -> rien ; une différence est nommée par son chemin', () => {
  assert.deepEqual(determinisme(planSain(), planSain()), []);
  const b = planSain(); b.etapes[0].litres = 12;
  assert.deepEqual(determinisme(planSain(), b), ['etapes.0.litres : 11.25 ≠ 12']);
});
