// Tests unitaires de optimiserPlan (src/plan.js).
// Chaque cas construit ses propres stations avec des prix et des km ronds
// pour que le resultat attendu soit calculable a la main (voir commentaire
// de chaque test). Ne pas modifier plan.js pour faire passer ces tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {optimiserPlan} = require('./plan.js');

// Comparaison avec tolerance : les couts en euros passent par des
// multiplications flottantes (ex: 1.2*2*53 = 127.19999999999999).
function presque(a, b, tol = 1e-9){
  return Math.abs(a - b) < tol;
}

test('aucun arret necessaire quand total <= A', () => {
  // total (80) <= A (100) : retour immediat, quel que soit cand (ici vide).
  const r = optimiserPlan([], 100, 80, 1);
  assert.deepStrictEqual(r, {plan: [], coutAchats: 0, utiles: new Set()});
});

test('infaisable : aucune station atteignable', () => {
  // total (150) > A (100) et cand vide : aucune facon de rejoindre
  // l'arrivee, le plan doit etre null.
  const r = optimiserPlan([], 100, 150, 1);
  assert.deepStrictEqual(r, {plan: null});
});

test('un arret : a ecart egal, la station la moins chere est retenue', () => {
  // Deux stations au meme point du trajet (km=70, e=0), prix differents.
  // Les deux sont atteignables directement (70<=A=100) et permettent de
  // finir le trajet en un seul plein (150-70+0=80<=A=100).
  // Cout via "cher" (1.5 EUR/L)    : 1.5 * 1 * (150-70+0) = 120
  // Cout via "pascher" (1.0 EUR/L) : 1.0 * 1 * (150-70+0) = 80   <- retenu
  const cher = {s: 'cher', v: 'v', km: 70, e: 0, p: 1.5};
  const pascher = {s: 'pascher', v: 'v', km: 70, e: 0, p: 1.0};
  const r = optimiserPlan([cher, pascher], 100, 150, 1);
  assert.strictEqual(r.plan.length, 1);
  assert.strictEqual(r.plan[0].s, 'pascher');
  assert.ok(presque(r.coutAchats, 80));
});

test('la penalite de 0.80 EUR evite un arret qui economiserait moins de 0.80 EUR', () => {
  // Station A (km=60, e=0, p=1.0) suffit a elle seule pour finir le trajet :
  // cout = 1.0 * 1 * (150-60+0) = 90.
  // Station B (km=145, e=0, p=0.9), atteignable seulement via A
  // (145-60+0+0=85<=A=100), un peu moins chere. Cout en passant par B :
  //   segment A->B        : 1.0 * 1 * (145-60+0) = 85
  //   + penalite d'arret  : 0.8
  //   + segment B->arrivee: 0.9 * 1 * (150-145+0) = 4.5
  //   = 90.3 > 90
  // L'economie brute sur le dernier troncon (85-4.5 vs 90 : gain de 0.5 EUR)
  // est inferieure a la penalite (0.8 EUR) : le detour par B est ecarte,
  // seule A est retenue.
  const A = {s: 'A', v: 'v', km: 60, e: 0, p: 1.0};
  const B = {s: 'B', v: 'v', km: 145, e: 0, p: 0.9};
  const r = optimiserPlan([A, B], 100, 150, 1);
  assert.strictEqual(r.plan.length, 1);
  assert.strictEqual(r.plan[0].s, 'A');
  assert.ok(presque(r.coutAchats, 90));
});

test('le detour compte double (2*e) : une station moins chere mais loin du trajet perd', () => {
  // Autonomie A=60. Station A (km=50, e=0, p=1.0) est le seul premier arret
  // possible (seule station atteignable directement : 50<=60).
  // Deux candidates pour le second arret, toutes deux atteignables
  // seulement depuis A :
  //  C1 (km=90, e=5, p=0.80) : prix au litre le plus bas, mais a 5 km du
  //     trajet (grand ecart).
  //  C2 (km=95, e=0, p=0.85) : un peu plus chere, mais pile sur le trajet.
  // Cout du trajet via C1 :
  //   A->C1 : 0.8 + 1.0*(90-50+2*5) = 0.8 + 50 = 50.8
  //   C1->arrivee : 0.80*(140-90+5) = 0.80*55 = 44
  //   total = 94.8
  // Cout du trajet via C2 :
  //   A->C2 : 0.8 + 1.0*(95-50+2*0) = 0.8 + 45 = 45.8
  //   C2->arrivee : 0.85*(140-95+0) = 0.85*45 = 38.25
  //   total = 84.05
  // 84.05 < 94.8 : C2 (plus chere au litre) l'emporte, car le detour de C1
  // est compte deux fois (2*e) dans le cout de la transition vers lui.
  const A = {s: 'A', v: 'v', km: 50, e: 0, p: 1.0};
  const C1 = {s: 'C1', v: 'v', km: 90, e: 5, p: 0.80};
  const C2 = {s: 'C2', v: 'v', km: 95, e: 0, p: 0.85};
  const r = optimiserPlan([A, C1, C2], 60, 140, 1);
  assert.deepStrictEqual(r.plan.map(x => x.s), ['A', 'C2']);
});

test('coutAchats correspond au calcul a la main pour un cas a un arret', () => {
  // Station unique S (km=80, e=3, p=1.2), atteignable directement
  // (80+3=83<=A=100) et suffisante pour finir le trajet
  // (130-80+3=53<=A=100). Avec un seul arret, coutAchats se reduit au cout
  // du dernier troncon : p * lkm * (total - km + e)
  //                     = 1.2 * 2 * (130-80+3) = 1.2 * 2 * 53 = 127.2
  const S = {s: 'S', v: 'v', km: 80, e: 3, p: 1.2};
  const r = optimiserPlan([S], 100, 130, 2);
  assert.deepStrictEqual(r.plan.map(x => x.s), ['S']);
  assert.ok(presque(r.coutAchats, 127.2));
});

test('utiles contient les stations du plan et exclut une station trop chere', () => {
  // Deux stations au meme point (km=70, e=0) : cher2 (2.0 EUR/L) et
  // pascher2 (1.0 EUR/L). pascher2 est retenue dans le plan, avec
  // coutFin = 1.0 * 1 * (150-70+0) = 80.
  // Pour cher2, le meilleur enchainement possible n'est pas d'y acheter tout
  // le carburant (2.0*80=160) mais de repartir aussitot vers pascher2 :
  //   0.8 (penalite) + 2.0*1*(70-70+2*0) + 80 (cout depuis pascher2) = 80.8
  // 80.8 > coutFin(80) + 0.50 = 80.5 : cher2 est donc exclue de utiles.
  const cher2 = {s: 'cher2', v: 'v', km: 70, e: 0, p: 2.0};
  const pascher2 = {s: 'pascher2', v: 'v', km: 70, e: 0, p: 1.0};
  const r = optimiserPlan([cher2, pascher2], 100, 150, 1);
  assert.deepStrictEqual(r.plan.map(x => x.s), ['pascher2']);
  assert.deepStrictEqual(r.utiles, new Set(['pascher2']));
});

test('deux arrets imposes par l\'autonomie, plan en km croissants', () => {
  // A=100, total=250 : aucun arret unique ne suffit (depuis A, le reste du
  // trajet depasserait toujours l'autonomie), deux arrets sont obligatoires.
  // S1 (km=80, e=0, p=1.0)  : atteignable directement (80<=100).
  // S2 (km=170, e=0, p=1.0) : atteignable seulement depuis S1
  //   (170-80+0+0=90<=100) ; depuis S2, le reste (250-170+0=80<=100) passe.
  // Achats reels (hors penalite d'arret, purement internes au calcul) :
  //   S1->S2      : 1.0 * 1 * (170-80+0) = 90
  //   S2->arrivee : 1.0 * 1 * (250-170+0) = 80
  //   total = 170
  const S1 = {s: 'S1', v: 'v', km: 80, e: 0, p: 1.0};
  const S2 = {s: 'S2', v: 'v', km: 170, e: 0, p: 1.0};
  const r = optimiserPlan([S1, S2], 100, 250, 1);
  assert.deepStrictEqual(r.plan.map(x => x.s), ['S1', 'S2']);
  assert.ok(r.plan[0].km < r.plan[1].km);
  assert.ok(presque(r.coutAchats, 170));
});
