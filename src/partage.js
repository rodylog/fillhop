// Fiche vehicule <-> parametre d'URL #veh= (phase 2, 30/10/2026). Module PUR (aucun DOM),
// exporte pour Node et teste dans partage.test.js ; dans la page il precede app.js.
//
// Format historique (inchange, toujours lu et ecrit) :
//   #veh=Nom|e85+e10|conso|cuve|reserve[|autonomie]
// Extension electrique (7e champ, facultatif) :
//   #veh=Nom|carburants|conso|cuve|reserve|autonomie|E<batterie>,<kWh/100>,<kW DC>,<kW AC>,<prise>,<reserve %>,<depart %>
//   ex. #veh=Citadine%20%C3%A9lectrique%2050%20kWh|||||E50,17,150,11,ccs,15,80
// Retrocompatibilite : un lien a 5 ou 6 champs reste lu tel quel (vehicule thermique) ; une page
// anterieure a cette extension ignore un lien a 7 champs (son motif est ancre), elle ne le lit
// pas de travers. Les champs sont decodes puis traites en TEXTE par l'appelant, jamais en HTML ;
// ici on borne les longueurs et on ne garde des nombres que ce qui en est.
const PRISES = ['ccs', 'chademo', 't2'];
const MAX_NOM = 80;

// Nombre positif en texte court (« 6.5 », « 50 »), ou '' si vide ou illisible.
function nombre(txt, max){
  const t = String(txt == null ? '' : txt).trim().replace(',', '.');
  if(t === '' || !/^\d+(\.\d+)?$/.test(t)) return '';
  const n = parseFloat(t);
  if(!(n > 0) || (max != null && n > max)) return '';
  return String(n);
}
function nombreOuVide(txt, max){ return nombre(txt, max); }

// vehVersParam(v) -> chaine apres « #veh= ». Thermique : 6 champs (autonomie en 6e, vide si
// absente, pour que le format reste positionnel). Electrique : les 6 champs puis le bloc E.
function vehVersParam(v){
  const enc = x => encodeURIComponent(x == null ? '' : String(x));
  const champs = [enc(String(v.nom || '').slice(0, MAX_NOM)), (v.carbs || []).join('+'), enc(v.conso || ''),
                  enc(v.cuve || ''), enc(v.reserve || ''), enc(v.autonomie || '')];
  if(v.energie === 'elec'){
    const prise = PRISES.includes(v.prise) ? v.prise : 'ccs';
    champs.push('E' + [nombre(v.batterieKwh), nombre(v.consoKwh100), nombre(v.kwMaxDC), nombre(v.kwMaxAC), prise,
                       v.reservePct == null || v.reservePct === '' ? '' : nombre(v.reservePct, 100),
                       v.departPct == null || v.departPct === '' ? '' : nombre(v.departPct, 100)].join(','));
  }
  return champs.join('|');
}

// Decoupage d'un parametre en champs. Certaines messageries et certains courriels encodent
// « | » en %7C : sans aucun « | » litteral, on decoupe sur %7C (majuscules ou minuscules). Un
// « | » DANS un nom est ecrit %7C par encodeURIComponent a cote de separateurs litteraux : il
// n'est alors pas pris pour un separateur.
function decouper(txt){ return txt.includes('|') ? txt.split('|') : txt.split(/%7C/i); }

// paramVersVeh(txt) -> fiche {nom, type: 'voiture', carbs, conso, cuve, reserve, autonomie
// [, energie: 'elec', batterieKwh, consoKwh100, kwMaxDC, kwMaxAC, prise, reservePct, departPct]}
// ou null si le texte n'est pas une fiche (moins de 5 champs, nom vide). `defautCarbs` :
// carburants si le 2e champ est vide (DEFAUT de la page).
function paramVersVeh(txt, defautCarbs){
  if(typeof txt !== 'string') return null;
  const f = decouper(txt);
  if(f.length < 5) return null;
  const dec = x => { try{ return decodeURIComponent(x); }catch(e){ return x; } };
  const nom = dec(f[0]).slice(0, MAX_NOM);
  if(!nom.trim()) return null;
  const e = f.length > 6 ? f[6] : '';
  const elec = /^E/.test(e);
  // 2e champ vide : DEFAUT pour un thermique (comme avant) ; aucun carburant pour un electrique.
  const carbs = f[1] ? dec(f[1]).split('+').filter(Boolean) : elec ? [] : (defautCarbs || []).slice();
  const v = {nom, type: 'voiture', carbs, conso: dec(f[2]), cuve: dec(f[3]), reserve: dec(f[4]), autonomie: f.length > 5 ? dec(f[5]) : ''};
  if(elec){
    const p = e.slice(1).split(',');
    v.energie = 'elec';
    v.batterieKwh = nombre(p[0]);
    v.consoKwh100 = nombre(p[1]);
    v.kwMaxDC = nombre(p[2]);
    v.kwMaxAC = nombre(p[3]);
    v.prise = PRISES.includes(p[4]) ? p[4] : 'ccs';
    v.reservePct = nombreOuVide(p[5], 100);
    v.departPct = nombreOuVide(p[6], 100);
  }
  return v;
}

// ---------- Reglages relus du navigateur ----------
// assainirReglages(brut[, cles]) -> objet de reglages de forme sure, quoi que contienne le
// stockage (un JSON valide mais de mauvaise forme ne doit pas tuer la page au demarrage) :
// objet sinon {} ; `vehicules` reduit aux objets, chacun avec un `nom` en chaine non vide et
// des `carbs` en tableau de cles connues ; `vehActif` entier dans les bornes (il suit sa fiche
// si des entrees illisibles ont ete retirees avant elle). Sans fiche lisible, `vehicules` est
// retire : l'appelant reconstruit le garage (ancien format a plat). L'entree n'est pas modifiee.
const CARBURANTS = ['e85', 'e10', 'sp95', 'sp98', 'spmin', 'gazole', 'gplc'];
const estObjet = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function nomLibreDans(vehicules, nom){
  let n = 2, essai = nom;
  while(vehicules.some(x => x.nom === essai)) essai = `${nom} ${n++}`;
  return essai;
}
function assainirReglages(brut, cles){
  const connus = cles || CARBURANTS;
  const carbs = c => Array.isArray(c) ? c.filter(k => connus.includes(k)) : [];
  const r = estObjet(brut) ? Object.assign({}, brut) : {};
  if('carbs' in r) r.carbs = carbs(r.carbs);
  const lisibles = Array.isArray(r.vehicules) ? r.vehicules.filter(estObjet) : [];
  if(!lisibles.length){ delete r.vehicules; delete r.vehActif; return r; }
  const actif = Number.isInteger(r.vehActif) ? lisibles.indexOf(r.vehicules[r.vehActif]) : -1;
  r.vehicules = [];
  lisibles.forEach((v, i) => {
    const nom = typeof v.nom === 'string' && v.nom.trim() ? v.nom : typeof v.nom === 'number' ? String(v.nom) : '';
    r.vehicules.push(Object.assign({}, v, {nom: nom || nomLibreDans(r.vehicules, 'Véhicule ' + (i + 1)), carbs: carbs(v.carbs)}));
  });
  r.vehActif = actif >= 0 ? actif : 0;
  return r;
}

// ---------- Import d'une fiche recue par lien ----------
// fusionnerImport(vehicules, v) -> {vehicules, actif, cas, nom} : nouveau garage (l'entree n'est
// pas modifiee), indice de la fiche a activer, nom sous lequel elle est rangee, et le cas :
//   'ajoutee'   aucun vehicule de ce nom : la fiche est ajoutee ;
//   'identique' une fiche de ce nom (ou une copie deja importee, « Nom 2 ») a le meme contenu :
//               rien n'est ajoute, elle est seulement activee ;
//   'renommee'  une fiche de ce nom existe et differe : elle reste INTACTE, la fiche recue est
//               ajoutee sous un nom libre (« Nom 2 ») — jamais d'ecrasement (« Véhicule 1 »
//               est le nom par defaut de tout le monde).
// Deux fiches ont le meme contenu si elles ecrivent le meme lien, a l'ordre des carburants pres.
function fusionnerImport(vehicules, v){
  const contenu = x => vehVersParam(Object.assign({}, x, {nom: '', carbs: (x.carbs || []).slice().sort()}));
  const copie = x => x.nom.startsWith(v.nom + ' ') && /^\d+$/.test(x.nom.slice(v.nom.length + 1));
  const homonyme = vehicules.some(x => x.nom === v.nom);
  const i = vehicules.findIndex(x => (x.nom === v.nom || copie(x)) && contenu(x) === contenu(v));
  if(homonyme && i >= 0) return {vehicules: vehicules.slice(), actif: i, cas: 'identique', nom: vehicules[i].nom};
  const fiche = Object.assign({}, v, {nom: homonyme ? nomLibreDans(vehicules, v.nom) : v.nom});
  return {vehicules: vehicules.concat([fiche]), actif: vehicules.length, cas: homonyme ? 'renommee' : 'ajoutee', nom: fiche.nom};
}

// ---------- Fragment d'URL : #veh=, #trajet=, #pos= ----------
//   #trajet=<depart>|<arrivee>|<couloir>|<options>[&veh=…]   depart vide = « Ma position » ;
//       couloir 1/2/5/10/20 ; options = lettres p (sans peage), r (aller-retour)
//   #pos=lat,lon                                               repere sans geolocalisation
// lireFragment(hash, defautCarbs) -> {pos, veh, trajet, erreurs}
//   pos     {lat, lon} ou null (nombres dans les bornes du globe)
//   veh     fiche (paramVersVeh) ou null
//   trajet  {dep, arr, couloir, sansPeage, ar} ou null ; dep '' = « Ma position », couloir null
//           s'il est absent ou inconnu (le reglage courant est garde)
//   erreurs parmi 'position', 'vehicule', 'trajet' : parametre present mais illisible (champs
//           manquants, arrivee vide, coordonnees hors bornes). L'appelant l'annonce et n'efface
//           pas le fragment. Un fragment etranger a ces trois cles ne rend ni lecture ni erreur.
const COULOIRS = ['1', '2', '5', '10', '20'];
function lireFragment(hash, defautCarbs){
  const r = {pos: null, veh: null, trajet: null, erreurs: []};
  const parts = new Map();
  String(hash == null ? '' : hash).replace(/^#/, '').split('&').forEach(x => {
    const i = x.indexOf('=');
    if(i > 0) parts.set(x.slice(0, i), x.slice(i + 1));
  });
  const dec = x => { try{ return decodeURIComponent(x); }catch(e){ return x; } };
  if(parts.has('pos')){
    const m = dec(parts.get('pos')).match(/^(-?(?:\d+\.?\d*|\.\d+)),(-?(?:\d+\.?\d*|\.\d+))$/);
    if(m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) r.pos = {lat: +m[1], lon: +m[2]};
    else r.erreurs.push('position');
  }
  if(parts.has('veh')){
    r.veh = paramVersVeh(parts.get('veh'), defautCarbs);
    if(!r.veh) r.erreurs.push('vehicule');
  }
  if(parts.has('trajet')){
    const f = decouper(parts.get('trajet'));
    const dep = dec(f[0] || '').trim(), arr = dec(f[1] || '').trim(), o = f[3] || '';
    if(arr) r.trajet = {dep, arr, couloir: COULOIRS.includes(f[2]) ? f[2] : null, sansPeage: o.includes('p'), ar: o.includes('r')};
    else r.erreurs.push('trajet');
  }
  return r;
}
// Message montre quand lireFragment rend des erreurs ('' sinon) : dit ce qui manque et quoi faire.
function messageLienIllisible(erreurs){
  const noms = {trajet: 'trajet', vehicule: 'véhicule', position: 'position'};
  const e = (erreurs || []).filter(k => noms[k]);
  if(!e.length) return '';
  if(e.length === 1)
    return `Lien illisible : ${noms[e[0]]} non importé${e[0] === 'position' ? 'e' : ''}. ` + {
      trajet: 'Redemandez le lien, ou saisissez le départ et l\'arrivée à la main.',
      vehicule: 'Redemandez le lien, ou créez la fiche dans le garage.',
      position: 'Redemandez le lien, ou cherchez le lieu à la main.'}[e[0]];
  const liste = e.map(k => noms[k]);
  return `Lien illisible : ${liste.slice(0, -1).join(', ')} et ${liste[liste.length - 1]} non importés. ` +
         'Redemandez le lien, ou saisissez ces informations à la main.';
}

// ---------- Ecriture du lien de plan ----------
// trajetVersParam(t, couloir) -> chaine apres « #trajet= », pour t = {dep, arr, sansPeage, ar} : le
// trajet AFFICHE (celui du dernier calcul), pas le contenu courant des champs. Relu par lireFragment.
function trajetVersParam(t, couloir){
  return `${encodeURIComponent(t.dep || '')}|${encodeURIComponent(t.arr || '')}|${couloir == null ? '' : couloir}|` +
         `${t.sansPeage ? 'p' : ''}${t.ar ? 'r' : ''}`;
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {vehVersParam, paramVersVeh, PRISES, assainirReglages, trajetVersParam, fusionnerImport,
                    lireFragment, messageLienIllisible};
