// Tests de src/partage.js : format #veh= historique et son extension electrique, aller-retour,
// retrocompatibilite (un lien ancien reste lu), bornes de securite.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {vehVersParam, paramVersVeh} = require('./partage.js');

const DEFAUT = ['e85'];

test('lien ancien a 5 champs (README : Nom|e85+e10|6.5|50|30) : lu tel quel, autonomie vide, pas d\'energie', () => {
  const v = paramVersVeh('Clio|e85+e10|6.5|50|30', DEFAUT);
  assert.deepStrictEqual(v, {nom: 'Clio', type: 'voiture', carbs: ['e85', 'e10'], conso: '6.5', cuve: '50', reserve: '30', autonomie: ''});
  assert.strictEqual(v.energie, undefined);
});

test('lien ancien a 6 champs (autonomie) et carburants vides -> DEFAUT ; nom encode decode', () => {
  const v = paramVersVeh('Ma%20voiture||6.5|50|30|600', DEFAUT);
  assert.strictEqual(v.nom, 'Ma voiture');
  assert.deepStrictEqual(v.carbs, ['e85']);
  assert.strictEqual(v.autonomie, '600');
});

test('aller-retour thermique : vehVersParam puis paramVersVeh rend la meme fiche (6 champs ecrits)', () => {
  const v = {nom: 'Berline gazole', type: 'voiture', carbs: ['gazole'], conso: '5.1', cuve: '60', reserve: '40', autonomie: '1100'};
  const p = vehVersParam(v);
  assert.strictEqual(p, 'Berline%20gazole|gazole|5.1|60|40|1100');
  assert.strictEqual(p.split('|').length, 6);
  assert.deepStrictEqual(paramVersVeh(p, DEFAUT), v);
  // Le motif historique de la page (6 champs au plus) lit encore ce lien.
  assert.ok(/^([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)(?:\|([^|]*))?$/.test(p));
});

test('aller-retour electrique : « Citadine électrique 50 kWh », 7e champ E…', () => {
  const v = {nom: 'Citadine électrique 50 kWh', type: 'voiture', carbs: [], conso: '', cuve: '', reserve: '', autonomie: '',
             energie: 'elec', batterieKwh: '50', consoKwh100: '17', kwMaxDC: '150', kwMaxAC: '11', prise: 'ccs', reservePct: '15', departPct: '80'};
  const p = vehVersParam(v);
  assert.strictEqual(p, 'Citadine%20%C3%A9lectrique%2050%20kWh|||||' + '|E50,17,150,11,ccs,15,80');
  const lu = paramVersVeh(p, DEFAUT);
  assert.deepStrictEqual(lu, v);
  // Un lien electrique n'herite pas des carburants par defaut quand le 2e champ est vide.
  assert.deepStrictEqual(lu.carbs, []);
});

test('electrique partiel : champs manquants vides, prise inconnue -> ccs, pourcentages > 100 ou negatifs ecartes', () => {
  const v = paramVersVeh('Zoe|||||' + '|E52,,,7.4,usb,150,80', DEFAUT);
  assert.strictEqual(v.energie, 'elec');
  assert.strictEqual(v.batterieKwh, '52');
  assert.strictEqual(v.consoKwh100, '');
  assert.strictEqual(v.kwMaxDC, '');
  assert.strictEqual(v.kwMaxAC, '7.4');
  assert.strictEqual(v.prise, 'ccs');
  assert.strictEqual(v.reservePct, '');       // 150 % : illisible -> vide (la page prendra 15)
  assert.strictEqual(v.departPct, '80');
  // Virgule decimale acceptee a l'ecriture (« 7,4 ») : normalisee en point.
  assert.match(vehVersParam({nom: 'X', energie: 'elec', kwMaxAC: '7,4'}), /E,,,7\.4,ccs,,$/);
});

test('7e champ sans E : ignore (thermique) ; 8e champ et au-dela ignores ; moins de 5 champs ou nom vide -> null', () => {
  const v = paramVersVeh('A|e10|6|50|30|600|bidule|encore', DEFAUT);
  assert.strictEqual(v.energie, undefined);
  assert.strictEqual(v.autonomie, '600');
  assert.strictEqual(paramVersVeh('A|e10|6|50', DEFAUT), null);
  assert.strictEqual(paramVersVeh('|e10|6|50|30', DEFAUT), null);
  assert.strictEqual(paramVersVeh('%20|e10|6|50|30', DEFAUT), null);
  assert.strictEqual(paramVersVeh(null, DEFAUT), null);
});

test('securite : nom borne a 80 caracteres, chaines gardees telles quelles (echappement a la charge de la page)', () => {
  const long = 'x'.repeat(200);
  assert.strictEqual(paramVersVeh(`${long}|e10|6|50|30`, DEFAUT).nom.length, 80);
  assert.strictEqual(vehVersParam({nom: long, carbs: ['e10']}).split('|')[0].length, 80);
  const v = paramVersVeh('%3Cb%3Enom%3C%2Fb%3E|e10|6|50|30', DEFAUT);
  assert.strictEqual(v.nom, '<b>nom</b>');   // decode, pas echappe : la page echappe a l'ingestion
  // Nombres electriques : « 50<script> » n'est pas un nombre -> vide.
  assert.strictEqual(paramVersVeh('A|||||' + '|E50%3Cscript%3E,17', DEFAUT).batterieKwh, '');
});

// ---------- Reglages relus du navigateur : forme sure quoi que contienne le stockage ----------
const {assainirReglages} = require('./partage.js');

// Ce que la page fait au demarrage avec les reglages lus (src/app.js) : garage reconstruit si
// besoin, puis lecture des carburants du vehicule actif. Leve si la forme est mauvaise.
function demarrage(regl){
  if(!Array.isArray(regl.vehicules) || !regl.vehicules.length){
    regl.vehicules = [{nom: 'Véhicule 1', carbs: Array.isArray(regl.carbs) && regl.carbs.length ? regl.carbs : DEFAUT,
                       conso: regl.conso || '', cuve: regl.cuve || ''}];
    regl.vehActif = 0;
  }
  const v = regl.vehicules[regl.vehActif];
  return {nom: v.nom, coche: ['e85', 'gazole'].filter(k => v.carbs.includes(k)), libelles: (v.carbs || []).map(k => k)};
}

test('assainirReglages : les valeurs corrompues du stockage ne font plus lever le demarrage', () => {
  const corrompus = ['5', '{"vehicules":[null]}', '{"vehicules":[{"nom":"X"}]}',
                     '{"vehicules":[{"nom":"X","carbs":"e85"}]}', 'null', '"texte"', '[1,2]', '{"vehicules":{"0":{}}}'];
  for(const txt of corrompus){
    const brut = JSON.parse(txt);
    assert.doesNotThrow(() => demarrage(assainirReglages(brut)), txt);
    const r = assainirReglages(brut);
    assert.ok(r && typeof r === 'object' && !Array.isArray(r), txt);
    for(const v of r.vehicules || []){
      assert.strictEqual(typeof v.nom, 'string', txt);
      assert.ok(Array.isArray(v.carbs), txt);
    }
  }
  // Sans le controle, ces memes valeurs font lever le demarrage (le defaut corrige).
  assert.throws(() => demarrage(JSON.parse('{"vehicules":[null]}')));
  assert.throws(() => demarrage(JSON.parse('{"vehicules":[{"nom":"X"}]}')));
});

test('assainirReglages : valeur par valeur', () => {
  assert.deepStrictEqual(assainirReglages(5), {});
  assert.deepStrictEqual(assainirReglages({vehicules: [null]}), {});
  assert.deepStrictEqual(assainirReglages({vehicules: [{nom: 'X'}]}), {vehicules: [{nom: 'X', carbs: []}], vehActif: 0});
  assert.deepStrictEqual(assainirReglages({vehicules: [{nom: 'X', carbs: 'e85'}]}), {vehicules: [{nom: 'X', carbs: []}], vehActif: 0});
  // Cles de carburant inconnues retirees, nom absent ou non textuel remplace par un nom libre.
  assert.deepStrictEqual(assainirReglages({vehicules: [{nom: 'Véhicule 2', carbs: ['e85', 'kerozene', 7]}, {nom: {a: 1}}, {nom: 12}]}).vehicules,
    [{nom: 'Véhicule 2', carbs: ['e85']}, {nom: 'Véhicule 2 2', carbs: []}, {nom: '12', carbs: []}]);
});

test('assainirReglages : vehActif borne, et il suit sa fiche quand une entree illisible est retiree', () => {
  const deux = [{nom: 'A', carbs: ['e10']}, {nom: 'B', carbs: ['gazole']}];
  for(const actif of [7, -1, 1.5, '1', null, undefined])
    assert.strictEqual(assainirReglages({vehicules: deux, vehActif: actif}).vehActif, 0, String(actif));
  assert.strictEqual(assainirReglages({vehicules: deux, vehActif: 1}).vehActif, 1);
  assert.strictEqual(assainirReglages({vehicules: [null, deux[0], 'x', deux[1]], vehActif: 3}).vehActif, 1);
});

test('assainirReglages : ancien format a plat garde pour la migration ; reglages sains inchanges ; entree non modifiee', () => {
  const plat = {carbs: ['e85', 'sp98'], conso: '7', cuve: '45', theme: 'sombre'};
  assert.deepStrictEqual(assainirReglages(plat), plat);
  assert.deepStrictEqual(demarrage(assainirReglages(plat)).coche, ['e85']);
  assert.deepStrictEqual(assainirReglages({carbs: 'e85', conso: '7'}), {carbs: [], conso: '7'});
  const sain = {vehicules: [{nom: 'Clio', type: 'voiture', carbs: ['e85', 'spmin'], conso: '6.5', cuve: '50'},
                            {nom: 'Citadine', energie: 'elec', carbs: [], batterieKwh: '50'}], vehActif: 1, theme: 'clair', couloir: '5'};
  const copie = JSON.parse(JSON.stringify(sain));
  assert.deepStrictEqual(assainirReglages(sain), copie);
  assert.deepStrictEqual(sain, copie);
  const abime = {vehicules: [null, {nom: 'X', carbs: 'e85'}]};
  assainirReglages(abime);
  assert.deepStrictEqual(abime, {vehicules: [null, {nom: 'X', carbs: 'e85'}]});
});

// ---------- Fragment d'URL : #veh=, #trajet=, #pos= ----------
const {lireFragment, messageLienIllisible} = require('./partage.js');

test('paramVersVeh : « | » encodes en %7C (lien passe par une messagerie), majuscules ou minuscules', () => {
  const attendu = {nom: 'Essai', type: 'voiture', carbs: ['e10'], conso: '6.5', cuve: '45', reserve: '30', autonomie: ''};
  assert.deepStrictEqual(paramVersVeh('Essai%7Ce10%7C6.5%7C45%7C30%7C', DEFAUT), attendu);
  assert.deepStrictEqual(paramVersVeh('Essai%7ce10%7c6.5%7c45%7c30%7c', DEFAUT), attendu);
  // Un « | » dans le nom, ecrit %7C a cote de separateurs litteraux, reste dans le nom.
  const v = {nom: 'A|B', type: 'voiture', carbs: ['e85'], conso: '6', cuve: '50', reserve: '30', autonomie: ''};
  assert.deepStrictEqual(paramVersVeh(vehVersParam(v), DEFAUT), v);
});

test('lireFragment : #trajet= complet, avec fiche ; depart vide = « Ma position » ; options p et r', () => {
  const r = lireFragment('#trajet=Montpellier|B%C3%A9ziers|10|pr&veh=Essai|e10|6.5|45|30|', DEFAUT);
  assert.deepStrictEqual(r.trajet, {dep: 'Montpellier', arr: 'Béziers', couloir: '10', sansPeage: true, ar: true});
  assert.strictEqual(r.veh.nom, 'Essai');
  assert.deepStrictEqual(r.veh.carbs, ['e10']);
  assert.strictEqual(r.pos, null);
  assert.deepStrictEqual(r.erreurs, []);
  assert.deepStrictEqual(lireFragment('trajet=|Orl%C3%A9ans|5|', DEFAUT).trajet, {dep: '', arr: 'Orléans', couloir: '5', sansPeage: false, ar: false});
});

test('lireFragment : lien dont les « | » sont encodes en %7C : trajet et fiche lus', () => {
  const r = lireFragment('#trajet=Montpellier%7CB%C3%A9ziers%7C10%7C&veh=Essai%7Ce10%7C6.5%7C45%7C30%7C', DEFAUT);
  assert.deepStrictEqual(r.trajet, {dep: 'Montpellier', arr: 'Béziers', couloir: '10', sansPeage: false, ar: false});
  assert.deepStrictEqual(r.veh, {nom: 'Essai', type: 'voiture', carbs: ['e10'], conso: '6.5', cuve: '45', reserve: '30', autonomie: ''});
  assert.deepStrictEqual(r.erreurs, []);
});

test('lireFragment : champs manquants — couloir et options facultatifs, arrivee obligatoire', () => {
  assert.deepStrictEqual(lireFragment('#trajet=Paris|Lyon', DEFAUT).trajet, {dep: 'Paris', arr: 'Lyon', couloir: null, sansPeage: false, ar: false});
  assert.strictEqual(lireFragment('#trajet=Paris|Lyon|3|', DEFAUT).trajet.couloir, null);   // couloir inconnu : reglage garde
  for(const h of ['#trajet=Paris', '#trajet=Paris|', '#trajet=Paris|%20|10|', '#trajet=', '#trajet=Paris%7C']){
    const r = lireFragment(h, DEFAUT);
    assert.strictEqual(r.trajet, null, h);
    assert.deepStrictEqual(r.erreurs, ['trajet'], h);
  }
  // Fiche tronquee (moins de 5 champs) ou sans nom : erreur, et le trajet du meme lien reste lu.
  const r = lireFragment('#trajet=Paris|Lyon|10|&veh=Essai|e10|6.5', DEFAUT);
  assert.strictEqual(r.veh, null);
  assert.strictEqual(r.trajet.arr, 'Lyon');
  assert.deepStrictEqual(r.erreurs, ['vehicule']);
  assert.deepStrictEqual(lireFragment('#veh=|e10|6.5|45|30', DEFAUT).erreurs, ['vehicule']);
});

test('lireFragment : #pos= lu dans les bornes du globe, refuse au-dela ou illisible', () => {
  assert.deepStrictEqual(lireFragment('#pos=43.6,3.88', DEFAUT), {pos: {lat: 43.6, lon: 3.88}, veh: null, trajet: null, erreurs: []});
  assert.deepStrictEqual(lireFragment('#pos=-33.9,-151.2', DEFAUT).pos, {lat: -33.9, lon: -151.2});
  assert.deepStrictEqual(lireFragment('#pos=43.6%2C3.88', DEFAUT).pos, {lat: 43.6, lon: 3.88});
  for(const h of ['#pos=91,3', '#pos=43,181', '#pos=-90.5,0', '#pos=abc', '#pos=43.6', '#pos=1.2.3,4', '#pos=43.6;3.88', '#pos=']){
    const r = lireFragment(h, DEFAUT);
    assert.strictEqual(r.pos, null, h);
    assert.deepStrictEqual(r.erreurs, ['position'], h);
  }
});

test('lireFragment : fragment vide ou etranger — ni lecture ni erreur ; encodage casse — pas d\'exception', () => {
  for(const h of ['', '#', '#apropos', '#x=1&y=2', null, undefined])
    assert.deepStrictEqual(lireFragment(h, DEFAUT), {pos: null, veh: null, trajet: null, erreurs: []}, String(h));
  assert.strictEqual(lireFragment('#trajet=Paris|Lyon%E9|10|', DEFAUT).trajet.arr, 'Lyon%E9');
  assert.strictEqual(lireFragment('#toString=1&__proto__=2&pos=1,2', DEFAUT).pos.lat, 1);
});

test('messageLienIllisible : dit ce qui n\'a pas ete importe et quoi faire ; vide sans erreur', () => {
  assert.strictEqual(messageLienIllisible([]), '');
  assert.strictEqual(messageLienIllisible(['trajet']), 'Lien illisible : trajet non importé. Redemandez le lien, ou saisissez le départ et l\'arrivée à la main.');
  assert.match(messageLienIllisible(['vehicule']), /^Lien illisible : véhicule non importé\. Redemandez le lien/);
  assert.match(messageLienIllisible(['position']), /^Lien illisible : position non importée\. Redemandez le lien/);
  assert.match(messageLienIllisible(['vehicule', 'trajet']), /^Lien illisible : véhicule et trajet non importés\. Redemandez le lien/);
});

// ---------- Import d'une fiche recue par lien : jamais d'ecrasement ----------
const {fusionnerImport} = require('./partage.js');

test('fusionnerImport : un homonyme different reste intact, la fiche recue prend un nom libre', () => {
  const garage = [{nom: 'Véhicule 1', type: 'utilitaire', cat: 'fourgon', carbs: ['gazole'], conso: '5', cuve: '', autonomie: '900'}];
  const avant = JSON.parse(JSON.stringify(garage));
  const v = lireFragment('#veh=V%C3%A9hicule%201|e85|9|40|30|', DEFAUT).veh;
  const f = fusionnerImport(garage, v);
  assert.strictEqual(f.cas, 'renommee');
  assert.strictEqual(f.nom, 'Véhicule 1 2');
  assert.strictEqual(f.actif, 1);
  assert.deepStrictEqual(f.vehicules[0], avant[0]);          // l'ancienne fiche n'a pas bouge
  assert.deepStrictEqual(f.vehicules[1], Object.assign({}, v, {nom: 'Véhicule 1 2'}));
  assert.deepStrictEqual(garage, avant);                     // l'entree n'est pas modifiee
  // Le meme lien rouvert : la copie deja importee est activee, pas de « Véhicule 1 3 ».
  const g = fusionnerImport(f.vehicules, v);
  assert.deepStrictEqual([g.cas, g.actif, g.nom, g.vehicules.length], ['identique', 1, 'Véhicule 1 2', 2]);
  // Nom libre : « Clio 2 » pris -> « Clio 3 ».
  const h = fusionnerImport([{nom: 'Clio', carbs: ['e10']}, {nom: 'Clio 2', carbs: ['sp98']}], {nom: 'Clio', type: 'voiture', carbs: ['e85'], conso: '', cuve: '', reserve: '', autonomie: ''});
  assert.deepStrictEqual([h.cas, h.nom, h.actif], ['renommee', 'Clio 3', 2]);
});

test('fusionnerImport : homonyme identique seulement active ; nom nouveau ajoute tel quel', () => {
  const clio = {nom: 'Clio', type: 'voiture', cat: 'citadine', carbs: ['e85', 'e10'], conso: '6.5', cuve: '50', reserve: '30', autonomie: ''};
  const elec = {nom: 'Citadine', type: 'voiture', carbs: [], conso: '', cuve: '', reserve: '', autonomie: '', energie: 'elec',
                batterieKwh: '50', consoKwh100: '17', kwMaxDC: '150', kwMaxAC: '11', prise: 'ccs', reservePct: '15', departPct: '80'};
  const garage = [{nom: 'Autre', carbs: ['gazole']}, clio, elec];
  // Meme contenu, carburants dans un autre ordre : la fiche du garage (avec sa categorie) est gardee.
  const f = fusionnerImport(garage, paramVersVeh('Clio|e10+e85|6.5|50|30|', DEFAUT));
  assert.deepStrictEqual([f.cas, f.actif, f.nom], ['identique', 1, 'Clio']);
  assert.deepStrictEqual(f.vehicules, garage);
  assert.strictEqual(fusionnerImport(garage, paramVersVeh(vehVersParam(elec), DEFAUT)).cas, 'identique');
  // Une seule valeur differe (batterie) : fiche distincte.
  assert.strictEqual(fusionnerImport(garage, Object.assign({}, elec, {batterieKwh: '77'})).nom, 'Citadine 2');
  const n = fusionnerImport(garage, paramVersVeh('Essai|e10|6.5|45|30|', DEFAUT));
  assert.deepStrictEqual([n.cas, n.actif, n.nom, n.vehicules.length], ['ajoutee', 3, 'Essai', 4]);
  assert.deepStrictEqual(n.vehicules.slice(0, 3), garage);
  // Une fiche « Essai 2 » de meme contenu sans « Essai » dans le garage n'est pas un homonyme.
  assert.strictEqual(fusionnerImport([{nom: 'Essai 2', carbs: ['e10'], conso: '6.5', cuve: '45', reserve: '30'}], paramVersVeh('Essai|e10|6.5|45|30|', DEFAUT)).cas, 'ajoutee');
});

// ---------- Ecriture du lien de plan : le trajet affiche, relu par lireFragment ----------
const {trajetVersParam} = require('./partage.js');

test('trajetVersParam : format historique du lien de plan (depart vide = « Ma position », options p et r)', () => {
  assert.strictEqual(trajetVersParam({dep: 'Montpellier', arr: 'Béziers', sansPeage: false, ar: false}, '10'), 'Montpellier|B%C3%A9ziers|10|');
  assert.strictEqual(trajetVersParam({dep: '', arr: 'Orléans', sansPeage: true, ar: true}, '5'), '|Orl%C3%A9ans|5|pr');
  assert.strictEqual(trajetVersParam({dep: 'A|B & C', arr: 'D=E', sansPeage: true, ar: false}, '20'), 'A%7CB%20%26%20C|D%3DE|20|p');
});

test('trajetVersParam puis lireFragment : le lien rend le trajet affiche, pas une saisie ulterieure', () => {
  // Trajet calcule A -> B, garde tel que saisi ; l'utilisateur tape ensuite « C » dans l'arrivee
  // sans relancer : le lien est ecrit depuis le trajet affiche et contient toujours B.
  const affiche = {dep: 'Montpellier', arr: 'Béziers', sansPeage: true, ar: true};
  const lien = '#trajet=' + trajetVersParam(affiche, '10') + '&veh=' + vehVersParam({nom: 'Essai', carbs: ['e10'], conso: '6.5', cuve: '45', reserve: '30'});
  assert.ok(lien.includes('B%C3%A9ziers'));
  const r = lireFragment(lien, DEFAUT);
  assert.deepStrictEqual(r.trajet, {dep: 'Montpellier', arr: 'Béziers', couloir: '10', sansPeage: true, ar: true});
  assert.strictEqual(r.veh.nom, 'Essai');
  assert.deepStrictEqual(r.erreurs, []);
  // Noms avec « | », « & » ou « = » : aller-retour sans perte.
  const t = {dep: 'A|B & C', arr: 'D=E', sansPeage: false, ar: false};
  assert.deepStrictEqual(lireFragment('#trajet=' + trajetVersParam(t, '2'), DEFAUT).trajet, {dep: 'A|B & C', arr: 'D=E', couloir: '2', sansPeage: false, ar: false});
});
