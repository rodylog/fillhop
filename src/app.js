let CENTRE = null;   // resolu apres lecture des reglages : geoloc > memoire > France
const SNAPSHOT = __SNAP__;
const SNAP_DATE = "__SNAPDATE__";

// Tous les carburants du flux officiel : la fiche vehicule doit servir a
// n'importe quel conducteur (diesel, GPL...), pas seulement a un profil donne.
const FUELS = [["e85","E85 (bioéthanol)"],["e10","SP95-E10"],["sp98","SP98"],
               ["sp95","SP95"],["gazole","Gazole (B7)"],["gplc","GPLc"]];
const LBL = Object.fromEntries(FUELS);
const SP = [["e10","E10"],["sp95","SP95"],["sp98","SP98"]];
// Cases a cocher : cumulables. Coche par defaut = E85 (bioethanol).
const CASES = [["e85","E85"],["e10","E10"],["sp95","SP95"],["sp98","SP98"],
               ["spmin","SP le - cher"],["gazole","Gazole"],["gplc","GPLc"]];
const DEFAUT = ["e85"];
// Type de vehicule (icone du chip, table de conso) ; la categorie (v.cat) affine l'estimation.
const TYPES = {voiture: 'Voiture', utilitaire: 'Utilitaire', moto: 'Scooter / moto', campingcar: 'Camping-car'};

// Les reglages survivent au rechargement : sans cela, chaque F5 remettait les
// cases par defaut et faisait perdre la selection en cours.
const CLE = 'fuelpilot:reglages';
function reglagesLus(){
  let brut = null;
  try{
    // Ancienne cle (versions anterieures au 16/09/2026) lue si la nouvelle est vide.
    brut = JSON.parse(localStorage.getItem(CLE) ||
                      localStorage.getItem('carte-carburants:reglages'));
  }catch(e){ /* JSON illisible : reglages vides */ }
  // Un JSON valide mais de mauvaise forme (nombre, fiche nulle, carburants en texte) laissait
  // la page morte au demarrage : la forme est controlee ici (src/partage.js).
  return assainirReglages(brut, CASES.map(c => c[0]));
}
// Premier lancement = aucun reglage memorise (nouvelle ni ancienne cle) : l'assistant
// vehicule s'ouvre, sauf si l'URL porte deja une fiche (#veh=) ou un trajet (#trajet=).
const PREMIER = (() => { try{ return !localStorage.getItem(CLE) && !localStorage.getItem('carte-carburants:reglages'); }catch(e){ return false; } })();
const REGL = reglagesLus();
// Migration : l'ancien format (reglages a plat) devient le vehicule 1 du garage.
if(!Array.isArray(REGL.vehicules) || !REGL.vehicules.length){
  REGL.vehicules = [{nom: 'Véhicule 1',
    carbs: Array.isArray(REGL.carbs) && REGL.carbs.length ? REGL.carbs : DEFAUT,
    conso: REGL.conso || '', cuve: REGL.cuve || ''}];
  REGL.vehActif = 0;
}
if(!(REGL.vehActif >= 0) || REGL.vehActif >= REGL.vehicules.length) REGL.vehActif = 0;

// Ecriture directe, SANS fusion : reservee aux operations de structure du
// garage (suppression, renommage) et aux reglages globaux (theme, fond, appli de
// navigation) qui doivent s'imposer tels quels.
function reglagesBruts(){
  try{ localStorage.setItem(CLE, JSON.stringify(REGL)); }
  catch(e){ /* stockage refuse : on continue sans memoire */ }
}

const $ = id => document.getElementById(id);

function reglagesEcrits(){
  // ETAT LIVE AVANT D'ECRIRE : plusieurs onglets partagent ce stockage ; ecrire
  // notre copie memoire ecraserait leur travail (constate le 09/08 : un onglet
  // reste sur « Vehicule 1 » a efface le profil cree ailleurs). On repart
  // du stockage frais et on n'y reporte QUE notre vehicule actif + les globaux.
  const frais = reglagesLus();
  if(Array.isArray(frais.vehicules) && frais.vehicules.length){
    const mienNom = REGL.vehicules[REGL.vehActif].nom;
    REGL.vehicules = frais.vehicules;
    let i = REGL.vehicules.findIndex(x => x.nom === mienNom);
    if(i < 0){ REGL.vehicules.push({nom: mienNom}); i = REGL.vehicules.length - 1; }
    REGL.vehActif = i;
  }
  const v = REGL.vehicules[REGL.vehActif];
  v.carbs = choix();
  v.type = $('vtype').value;
  v.cat = $('vcat').value || undefined;
  v.conso = $('conso').value;
  v.cuve  = $('cuve').value;
  v.autonomie = $('autonomie').value;
  v.reserve = $('reserve').value;
  // Vehicule electrique (phase 2) : les champs de la fiche electrique, lus tels quels (texte).
  v.energie = $('venergie').value === 'elec' ? 'elec' : 'thermique';
  v.batterieKwh = $('vbatt').value; v.consoKwh100 = $('vconsoKwh').value;
  v.kwMaxDC = $('vkwdc').value; v.kwMaxAC = $('vkwac').value; v.prise = $('vprise').value;
  v.reservePct = $('vreservePct').value; v.departPct = $('vdepartPct').value;
  REGL.sansCher = $('sansCher').checked;
  REGL.couloir  = $('couloir').value;
  REGL.queUtiles = $('queUtiles').checked;
  REGL.sansPeage = $('sansPeage').checked;
  REGL.allerRetour = $('allerRetour').checked;
  reglagesBruts();
  majSelectVeh();   // le garage a pu s'enrichir depuis un autre onglet
  majChip();
}
function majSelectVeh(){
  $('veh').innerHTML = REGL.vehicules.map((v,i) =>
    `<option value="${i}"${i === REGL.vehActif ? ' selected' : ''}>${esc(v.nom)}</option>`).join('');
}
function appliquerVeh(){
  const v = REGL.vehicules[REGL.vehActif];
  document.querySelectorAll('#carbs input').forEach(i => i.checked = v.carbs.includes(i.value));
  $('vtype').value = TYPES[v.type] ? v.type : 'voiture';
  majCats(v.cat);
  $('consoSource').hidden = true;
  $('conso').value = v.conso || '';
  $('cuve').value  = v.cuve || '';
  $('autonomie').value = v.autonomie || '';
  $('reserve').value = v.reserve || '';
  $('vnom').value = v.nom;
  $('venergie').value = v.energie === 'elec' ? 'elec' : 'thermique';
  $('vbatt').value = v.batterieKwh || ''; $('vconsoKwh').value = v.consoKwh100 || '';
  $('vkwdc').value = v.kwMaxDC || ''; $('vkwac').value = v.kwMaxAC || '';
  $('vprise').value = ['ccs', 'chademo', 't2'].includes(v.prise) ? v.prise : 'ccs';
  $('vreservePct').value = v.reservePct || ''; $('vdepartPct').value = v.departPct || '';
  $('consoSourceElec').hidden = true;
  document.querySelectorAll('#ficheElec .chips-kw').forEach(g => g.dispatchEvent(new Event('maj')));
  majEnergie();
  majEstimations();
  majChip();
}
// Fiche du garage : bloc thermique (carburants, L/100, reservoir) ou bloc electrique (batterie,
// kWh/100, kW, prise), selon l'energie choisie.
function majEnergie(){
  const elec = $('venergie').value === 'elec';
  $('ficheElec').hidden = !elec;
  $('ficheThermique').hidden = elec;
}
// Autonomie d'un plein et reservoir se deduisent l'un de l'autre par la conso : chaque
// champ affiche en grise ce qu'il vaudrait d'apres l'autre, ce qui montre tout de suite
// un ecart entre les deux saisies (l'autonomie prime dans le calcul, cf. autonomieUtile).
function majEstimations(){
  const conso = +$('conso').value;
  const cuve = +$('cuve').value;
  const auto = +$('autonomie').value;
  $('autonomie').placeholder = conso > 0 && cuve > 0 ? `≈ ${Math.round(cuve / conso * 100)}` : '600';
  $('cuve').placeholder = conso > 0 && auto > 0 ? `≈ ${Math.round(auto * conso / 100)}` : '50';
}
// Categorie (citadine, SUV, scooter…) selon le type : alimente l'estimation de conso.
// Un type a une seule categorie (utilitaire, camping-car) n'affiche pas le choix.
function majCats(voulue){
  const cats = CATEGORIES_CONSO[$('vtype').value] || [];
  const cour = voulue || $('vcat').value;
  $('vcat').replaceChildren(...cats.map(([k, l]) => new Option(l, k)));
  if(cats.some(c => c[0] === cour)) $('vcat').value = cour;
  $('vcatLbl').hidden = cats.length < 2;
}
// Chip vehicule (en haut a droite) : icone du type, nom, carburants coches.
function majChip(){
  const v = REGL.vehicules[REGL.vehActif];
  $('chipIco').innerHTML = ico(TYPES[v.type] ? v.type : 'voiture');
  $('chipNom').textContent = v.nom;
  const elec = v.energie === 'elec';
  const c = elec ? [`électrique${+v.batterieKwh > 0 ? ` · ${String(v.batterieKwh).replace('.', ',')} kWh` : ''} · ${LIBELLE_PRISE[v.prise] || 'CCS'}`]
                 : (v.carbs || []).map(k => k === 'spmin' ? 'SP le - cher' : (COURT[k] || k));
  $('chipCarb').textContent = c.length ? c.join(' + ') : 'aucun carburant';
  $('chipVeh').setAttribute('aria-label', `Garage — ${v.nom}, ${c.join(' + ') || 'aucun carburant'}`);
  // Formulaire du trajet : « Réservoir au départ » n'a pas de sens pour une batterie (l'etat de
  // charge au depart se regle dans le plan de charge) ; l'option « bornes » n'a d'effet qu'en thermique.
  $('aBordLbl').hidden = elec;
  $('bornesVisibles').disabled = elec;
  $('bornesVisiblesNote').textContent = elec ? 'véhicule électrique : les bornes remplacent les stations, l\'option ne s\'applique qu\'aux véhicules thermiques du garage'
                                             : 'en plus des stations, pour un véhicule thermique (toujours affichées pour un véhicule électrique)';
}
const LIBELLE_PRISE = {ccs: 'CCS', chademo: 'CHAdeMO', t2: 'Type 2'};
const coches = REGL.vehicules[REGL.vehActif].carbs;
$('carbs').innerHTML = CASES.map(([k,l]) =>
  `<label class="case"><input type="checkbox" value="${k}"`+
  `${coches.includes(k)?' checked':''}> ${l}</label>`).join('');

// ---------- Theme : automatique, ou choix memorise ----------
const SCHEMA_SOMBRE = matchMedia('(prefers-color-scheme: dark)');
const sombreEffectif = () => REGL.theme === 'sombre' || (REGL.theme !== 'clair' && SCHEMA_SOMBRE.matches);
function appliquerTheme(){
  document.documentElement.dataset.theme = REGL.theme || 'auto';
  document.querySelectorAll('[data-theme]').forEach(b => {
    if(b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String((REGL.theme || 'auto') === b.dataset.theme));
  });
  if(CARTE) CARTE.sombre(sombreEffectif());
}
document.documentElement.dataset.theme = REGL.theme || 'auto';
SCHEMA_SOMBRE.addEventListener('change', () => appliquerTheme());

// Regle de conception : AUCUNE coordonnee personnelle en dur. Le centre vient de
// la geolocalisation de l'appareil ; a defaut du dernier repere memorise sur CE
// navigateur ; a defaut d'une vue France entiere (appui long / clic droit pour poser le repere).
// Coordonnees valides (lien #pos=, stockage) : sinon MapLibre leve et l'appli reste morte
// jusqu'a la purge du stockage (revue du 24/10/2026). Un centre memorise invalide est oublie.
const coordsValides = (la, lo) => Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;
if(Array.isArray(REGL.centre) && coordsValides(+REGL.centre[0], +REGL.centre[1])) CENTRE = [+REGL.centre[0], +REGL.centre[1]];
else if(REGL.centre != null) delete REGL.centre;
const ZOOM0 = CENTRE ? 13 : 5.5;
// Repere REEL : une position de l'appareil ou un repere pose (situer), ou celui memorise. Le
// centre de la France ne sert qu'a cadrer la carte : jamais de depart « Ma position » (voir
// geocoder), meme s'il a ete memorise par une version anterieure (bouton « effacer »).
const CENTRE_FRANCE = [46.603, 2.334];
let REPERE_REEL = !!CENTRE && !(CENTRE[0] === CENTRE_FRANCE[0] && CENTRE[1] === CENTRE_FRANCE[1]);
if(!CENTRE) CENTRE = CENTRE_FRANCE.slice();

// ---------- Carte (MapLibre GL, fond IGN) ----------
// Sans WebGL : message sur fond neutre, le reste (liste, garage, plan) fonctionne.
// Creation DIFFEREE (audit du 30/10/2026) : le constructeur MapLibre (~30 ms) s'executait avant
// le premier appel au flux des prix, qu'il retardait d'autant ; initialiserCarte() est appelee a
// la frame suivant le lancement du premier chargement (voir en bas), pendant que la requete est
// en vol. L'emprise de ce premier appel est calculee sans la carte (emprise(), Mercator) : memes
// bornes que celles que MapLibre donnera, donc pas de second appel. Tout ce qui touche la carte
// est garde par `if(CARTE)` / `if(map)` : c'est deja le cas pour le chemin sans WebGL.
let CARTE = null, map = null, repere = null;
// Repere (pastille bleue) : les distances partent d'ici.
const elRepere = document.createElement('div');
elRepere.className = 'repere';
elRepere.title = 'Point de repère — les distances partent d\'ici';
// Trace du trajet (couche GeoJSON, remise apres chaque changement de style).
const TRACE_VIDE = {type: 'FeatureCollection', features: []};
let TRACE = TRACE_VIDE;   // dernier trace pose (repris si la carte nait apres le calcul du trajet)
function initialiserCarte(){
  if(CARTE || $('sansWebgl').hidden === false) return;
  CARTE = creerCarte({centre: CENTRE, zoom: ZOOM0, sombre: sombreEffectif(), fond: REGL.fond});
  map = CARTE ? CARTE.map : null;
  if(!CARTE){
    $('map').hidden = true;
    $('sansWebgl').hidden = false;
    return;
  }
  repere = CARTE.marqueur(CENTRE[0], CENTRE[1], elRepere);
  // Aller-retour : le retour est un second trait, decale de quelques pixels pour se lire.
  CARTE.couche('fh-trace', {type: 'geojson', data: TRACE},
    {type: 'line', layout: {'line-cap': 'round', 'line-join': 'round'},
     paint: {'line-color': '#1d4ed8', 'line-width': 5, 'line-opacity': 0.45,
             'line-offset': ['case', ['==', ['get', 'sens'], 'retour'], 6, 0]}});
  brancherCarte();          // evenements (deplacement, appui long, clic droit), definis plus bas
  if(DATA.length || BORNES.length) rendu();   // un rendu a deja eu lieu sans carte : poser ses marqueurs
}

let MARQUEURS = [];   // marqueurs HTML des stations et reperes du plan, refaits a chaque rendu
let DATA = [], sortKey = 'prix', sortAsc = true;
let RUPTURES = [];    // stations en rupture du carburant choisi : en gris, hors classement et hors plan

const dist = (la,lo) => {
  const R=6371, p=Math.PI/180;
  const dLa=(la-CENTRE[0])*p, dLo=(lo-CENTRE[1])*p;
  const a=Math.sin(dLa/2)**2+Math.cos(CENTRE[0]*p)*Math.cos(la*p)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};
// Trois couleurs tranchees, lues d'un coup d'oeil : VERT = le moins cher, BLEU = dans
// la norme, ROUGE = cher (choix du 17/09/2026 ; avant : bleu / marron / rouge).
// La couleur ne dit QUE le prix : les reperes du plan (etapes, depart, arrivee) sont
// en noir, pour qu'un cercle vert ne se lise pas « moins cher ».
// Couleurs lues depuis les jetons app.css (--vert/--bleu/--rouge) : source
// unique de la palette. Repli sur les valeurs en dur si le jeton est absent
// (feuille non chargee, style calcule vide).
const jeton = (nom, repli) =>
  getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || repli;
const VERT = jeton('--vert', '#137a37'), BLEU = jeton('--bleu', '#0b57d0'),
      ROUGE = jeton('--rouge', '#c02626');
function couleur(p, b, mini){
  if(mini != null && p <= mini + 1e-9) return VERT;    // le moins cher, ex aequo compris
  if(b && p > b.p90) return ROUGE;                     // 10 % les plus chers du secteur
  return BLEU;                                         // dans la norme
}
// La couleur ne porte jamais seule l'information (WCAG 1.4.1, audit du 30/10/2026) : la moins
// chere porte une coche, la chere une fleche vers le haut, avec un texte pour les lecteurs
// d'ecran ; la legende reprend les memes signes. marqueHtml() pour les gabarits innerHTML,
// marquerPrix() pour les pastilles construites en DOM (recolorees apres le filtre du plan).
function marqueHtml(c){
  if(c === VERT) return ico('coche', 'marque') + '<span class="visuellement-cache marque-sr">la moins chère, </span>';
  if(c === ROUGE) return ico('haut', 'marque') + '<span class="visuellement-cache marque-sr">chère, </span>';
  return '';
}
function marquerPrix(sp, c){
  sp.style.background = c;
  sp.querySelectorAll('.marque, .marque-sr').forEach(x => x.remove());
  const h = marqueHtml(c);
  if(h){ const t = document.createElement('template'); t.innerHTML = h; sp.prepend(...t.content.childNodes); }
}
// Noms et adresses des stations espagnoles : lang="es" pour la synthese vocale (le reste de la page est en francais).
const langES = (s, t) => s.pays ? `<span lang="es">${t}</span>` : t;

// Referentiel de couleur : les bornes viennent du SECTEUR (60 km autour du
// point de repere), pas de la zone affichee. Sans cela, la moins chere d'un ecran de
// stations cheres s'afficherait en vert — « la moins chere ici » n'est pas
// « une bonne affaire ». Rouge plein = au-dessus du 9e decile.
let REF_ROWS = [];
const jour = s => s ? s.slice(8,10)+'/'+s.slice(5,7) : '—';
function quand(s){
  if(!s) return {txt:'date inconnue', vieux:true};
  const d = new Date(s);
  const j = Math.floor((Date.now() - d.getTime()) / 86400000);
  const txt = d.toLocaleString('fr-FR', {day:'2-digit', month:'2-digit',
                                         hour:'2-digit', minute:'2-digit'})
              .replace(' ', ' à ');
  return {txt: j >= 1 ? `${txt} · il y a ${j} j` : txt, vieux: j >= 4};
}

// Echappement HTML de toute chaine venue de l'exterieur (flux des stations,
// nom de vehicule importe par l'URL) : fait UNE fois a l'ingestion, tout ce qui
// est rendu ensuite (liste, fiches, garage) est sain.
const esc = x => String(x).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Retour au texte brut pour ce qui ne passe pas par innerHTML (presse-papiers, aria-label).
const brut = x => String(x).replace(/&(amp|lt|gt|quot|#39);/g, m =>
  ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[m]));

function normalise(rows){
  return rows.map(r => {
    const la=parseFloat(r.latitude)/100000, lo=parseFloat(r.longitude)/100000;
    if(!isFinite(la)||!isFinite(lo)) return null;
    return {id: esc(r.id != null ? r.id : `${la},${lo}`), la, lo,
            ville:esc(r.ville||''), cp:esc(r.cp||''), adresse:esc(r.adresse||''),
            auto:r.horaires_automate_24_24==='Oui',
            rupture:esc([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                      .filter(Boolean).join(';')),
            hs:new Set([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                       .filter(Boolean).join(';').split(';')
                       .map(x => x.trim().toLowerCase()).filter(Boolean)),
            d:dist(la,lo),
            prix:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_prix']])),
            maj:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_maj']])),
            // Debut et type de rupture : seule la requete des ruptures les demande (chargerRuptures).
            depuis:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_rupture_debut']||null])),
            kotype:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_rupture_type']||null])),
            off:{prix:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_prix']])),
                 maj:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_maj']]))},
            corr:{}};
  }).filter(Boolean).map(appliquerCorr);
}
// « E85 depuis le 04/09/2026 » quand la date est connue, sinon le libelle brut du flux.
const dateFr = s => esc(String(s).slice(8,10)+'/'+String(s).slice(5,7)+'/'+String(s).slice(0,4));
const hhmm = t => new Date(t).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
const ruptureTxt = s => [
  ...FUELS.filter(([k]) => s.corr && s.corr[k] && s.corr[k].vide).map(([k]) => `${COURT[k]} signalé vide par vous à ${hhmm(s.corr[k].t)}`),
  ...FUELS.filter(([k]) => s.depuis[k]).map(([k]) => `${COURT[k]} depuis le ${dateFr(s.depuis[k])}`)
].join(', ') || s.rupture;
const aSignalement = s => !!s.corr && Object.values(s.corr).some(c => c.vide);

// Selection multiple : une station n'est retenue que si elle sert TOUS les
// carburants coches ; le classement se fait sur la somme, mais chaque carburant
// garde sa propre couleur (un bon E85 avec un SP quelconque doit se voir).
const COURT = {e10:'E10', sp98:'SP98', sp95:'SP95', e85:'E85',
               gazole:'Gazole', gplc:'GPLc'};
// Libelles tels qu'ils apparaissent dans carburants_rupture_* du flux officiel.
const RUPT = {e10:'e10', sp98:'sp98', sp95:'sp95', e85:'e85',
              gazole:'gazole', gplc:'gplc'};
// Pays : badge sobre « ES » (liste, fiche, plan) pour les stations espagnoles (src/es.js) ;
// rien pour la France. Texte seulement, pas d'image.
const badgePays = s => s.pays ? `<span class="badge badge-pays" title="Station espagnole — prix du ministère espagnol">${esc(s.pays)}</span> ` : '';
// Corrections faites sur place par l'utilisateur (demande du 26/10/2026 : Lodeve, E85 annonce par
// le flux officiel, pompe vide ; « ajoute cette fonction de modifier le prix ou mettre en
// rupture »). Par station et par carburant : {t, prix?} ou {t, vide: true}. Gardees sur cet
// appareil ; elles tiennent tant que la station n'a rien declare de plus recent, 48 h au plus.
const CLE_CORR = 'fuelpilot:corrections', CORR_MS = 48 * 3600e3;
function corrLues(){
  try{
    const o = JSON.parse(localStorage.getItem(CLE_CORR)) || {}, t = Date.now();
    return Object.fromEntries(Object.entries(o).filter(([, c]) => c && typeof c.t === 'number' && t - c.t < CORR_MS));
  }catch(e){ return {}; }
}
let CORR = corrLues();
function appliquerCorr(s){
  s.corr = {};
  FUELS.forEach(([k]) => {
    s.prix[k] = s.off.prix[k]; s.maj[k] = s.off.maj[k];
    const c = CORR[`${s.id}|${k}`];
    if(!c) return;
    const offi = s.off.maj[k] ? new Date(s.off.maj[k]).getTime() : 0;
    if(offi > c.t) return;              // la station a declare depuis : sa donnee reprend la main
    s.corr[k] = c;
    if(c.prix != null){ s.prix[k] = c.prix; s.maj[k] = new Date(c.t).toISOString(); }
  });
  return s;
}
function corriger(s, ks, quoi){
  CORR = corrLues();
  ks.forEach(k => { const cle = `${s.id}|${k}`; if(quoi) CORR[cle] = Object.assign({t: Date.now()}, quoi); else delete CORR[cle]; });
  try{ localStorage.setItem(CLE_CORR, JSON.stringify(CORR)); }catch(e){ /* stockage refuse */ }
  DATA.forEach(appliquerCorr); RUPTURES.forEach(appliquerCorr); appliquerCorr(s);
  rendu();
  // La fiche peut montrer un objet d'avant un rechargement de la carte : on la rouvre sur le frais.
  if(STATION && STATION.id === s.id && !$('ficheStation').hidden)
    ouvrirStation({s: DATA.find(x => x.id === s.id) || RUPTURES.find(x => x.id === s.id) || s, v: null});
}
const signaleVide = (s, k) => !!(s.corr && s.corr[k] && s.corr[k].vide);
// Prix « fige » : le carburant n'a pas ete redeclare depuis FIGE_J jours alors que la station
// declare ses autres carburants — profil d'une pompe hors service (Millau, 26/10/2026 : E85
// fige depuis septembre, gazole du jour ; 12,6 % des stations E85 au-dela de 14 j, mesure du
// 26/10). Le plan l'evite des qu'une autre station fait l'affaire et le dit s'il doit y passer.
// Station « muette » : aucun prix declare depuis MUETTE_J jours, tous carburants confondus
// (Montrouge, banc du 26/10/2026 : rien depuis le 21/09 ; 5,3 % des stations au-dela de
// 21 j) — peut-etre fermee ou hors service ; meme traitement que le prix fige.
const FIGE_J = 14, MUETTE_J = 21, RISQUE_FIGE = 15;   // € fictifs par arret : evitee sauf necessite
function prixFige(s, ks){
  if(ks.every(k => s.corr[k])) return null;      // corrige sur place : plus de doute
  const dates = FUELS.map(([k]) => s.off.maj[k]).filter(Boolean).sort();
  const max = dates[dates.length - 1];
  if(!max) return null;
  if((Date.now() - new Date(max)) / 864e5 >= MUETTE_J) return {date: max, muette: true};
  for(const k of ks){
    if(s.corr[k]) continue;
    const m = s.off.maj[k];
    if(m && (new Date(max) - new Date(m)) / 864e5 >= FIGE_J) return {date: m, muette: false};
  }
  return null;
}
const kmEntre = (a, b) => { const r = Math.PI / 180, dLa = (b.la - a.la) * r, dLo = (b.lo - a.lo) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)); };
const dispo = (s, k) => s.prix[k] != null && !s.hs.has(RUPT[k]) && !signaleVide(s, k);
const choix = () => [...document.querySelectorAll('#carbs input:checked')].map(i => i.value);

function pick(s, sel){
  const lignes = [];
  for(const k of sel){
    if(k === 'spmin'){
      const c = SP.filter(([kk]) => dispo(s, kk))
                  .map(([kk,n]) => ({ref:kk, tag:n, prix:s.prix[kk], maj:s.maj[kk]}));
      if(!c.length) return null;
      lignes.push(c.reduce((a,b) => b.prix < a.prix ? b : a));
    }else{
      if(!dispo(s, k)) return null;
      lignes.push({ref:k, tag:COURT[k], prix:s.prix[k], maj:s.maj[k]});
    }
  }
  if(!lignes.length) return null;
  return {p: +lignes.reduce((t,l) => t + l.prix, 0).toFixed(3), lignes,
          maj: lignes.map(l => l.maj).filter(Boolean).sort()[0] || null};
}

// Bornes du secteur pour une selection donnee (un seul carburant, ou la somme).
function bornes(sel){
  // Secteur = referentiel francais (60 km du repere) + stations espagnoles chargees a 60 km :
  // le flux francais ignore l'Espagne, sans cela un ecran espagnol n'aurait jamais de rouge.
  const px = REF_ROWS.concat(DATA.filter(s => s.pays === 'ES' && s.d <= 60))
                     .map(s => pick(s, sel)).filter(Boolean)
                     .map(v => v.p).sort((a,b) => a-b);
  if(px.length < 8) return null;
  const Q = f => px[Math.round(f*(px.length-1))];
  return {med: Q(0.50), p90: Q(0.90)};
}

const sansCherLbl = () => $('sansCher').checked
  ? 'les 10 % les plus chères du secteur sont masquées'
  : 'rouge = les 10 % les plus chères du secteur';

// Emprise interrogee. BUG CORRIGE (phase 1) : au chargement, la carte peut n'avoir
// aucune taille (conteneur pas encore mis en page, page ouverte dans un cadre ou un
// panneau masque) ; ses bornes se reduisent alors a une ligne (sud = nord) et le flux
// repond HTTP 400 a cette bbox degeneree — trois fois (chargement initial, moveend,
// retour de la geolocalisation), d'ou « hors ligne » alors que le premier geste, fait
// sur une carte enfin dimensionnee, reussissait. Desormais : une bbox n'est envoyee
// que si elle est finie et non degeneree ; sinon on interroge autour du repere, et la
// carte relance un chargement des qu'elle recoit sa taille (evenement resize).
let empriseProvisoire = false;
// Memo le temps d'une passe synchrone (un rendu appelle emprise() trois ou quatre fois ; chaque
// appel force une mise en page) ; vide a la microtache suivante, donc jamais perime apres un await.
let EMPRISE_MEMO = null;
function emprise(){
  if(EMPRISE_MEMO) return EMPRISE_MEMO;
  const e = empriseCalculee();
  EMPRISE_MEMO = e; queueMicrotask(() => { EMPRISE_MEMO = null; });
  return e;
}
function empriseCalculee(){
  if(map){
    const c = map.getContainer();
    if(c.clientWidth > 0 && c.clientHeight > 0){
      const b = map.getBounds();
      const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
      if([s, n, w, e].every(Number.isFinite) && n - s > 1e-4 && e - w > 1e-4){
        empriseProvisoire = false;
        return {s: Math.max(-85, s), n: Math.min(85, n), w: Math.max(-180, w), e: Math.min(180, e)};
      }
    }
  }else if($('map').clientWidth > 0 && $('map').clientHeight > 0 && $('sansWebgl').hidden){
    // Carte pas encore creee (premier chargement) : bornes Mercator du conteneur deja mis en page,
    // au centre et au zoom initiaux — ce que MapLibre affichera a la frame suivante.
    const w = $('map').clientWidth, h = $('map').clientHeight, monde = 512 * 2 ** ZOOM0, r = Math.PI / 180;
    const x = (CENTRE[1] + 180) / 360 * monde;
    const y = (1 - Math.log(Math.tan(CENTRE[0] * r) + 1 / Math.cos(CENTRE[0] * r)) / Math.PI) / 2 * monde;
    const lon = px => px / monde * 360 - 180, lat = py => Math.atan(Math.sinh(Math.PI * (1 - 2 * py / monde))) / r;
    empriseProvisoire = false;
    return {s: Math.max(-85, lat(y + h / 2)), n: Math.min(85, lat(y - h / 2)), w: Math.max(-180, lon(x - w / 2)), e: Math.min(180, lon(x + w / 2))};
  }
  empriseProvisoire = true;
  if(ZOOM0 < 10) return {s: 41.2, n: 51.3, w: -5.5, e: 9.8};     // France entiere
  const dLat = 0.05, dLon = 0.05 / Math.cos(CENTRE[0] * Math.PI / 180);   // ~5 km
  return {s: CENTRE[0] - dLat, n: CENTRE[0] + dLat, w: CENTRE[1] - dLon, e: CENTRE[1] + dLon};
}
const dansEmprise = (b, la, lo) => la >= b.s && la <= b.n && lo >= b.w && lo <= b.e;

// Point d'acces de test (banc/) : dernier plan calcule par rendu(), en donnees, dans
// window.__viaminus_plan, et le meme objet dans l'evenement viaminus:plan. Inerte pour
// l'utilisateur : rien d'affiche, aucune requete, aucune donnee personnelle.
function publierPlan(p){
  try{ window.__viaminus_plan = p; window.dispatchEvent(new CustomEvent('viaminus:plan', {detail: p})); }
  catch(e){ /* sans effet */ }
}

// ---------- Rendu : marqueurs, liste en cartes, bloc plan ----------
// renduCarburant() : le rendu historique (stations, plan de pleins), INCHANGE par la phase 2 ;
// rendu() (plus bas, bloc « Bornes de recharge ») aiguille vers lui ou vers renduElec().
function renduCarburant(){
  const sel = choix();
  const liste = $('liste');
  MARQUEURS.forEach(m => m.remove()); MARQUEURS = [];
  liste.innerHTML = '';
  $('blocPlan').hidden = true;
  $('titreListe').firstChild.textContent = ROUTE ? 'Sur le trajet' : 'Autour de vous';
  $('secStations').querySelector('.stations-tete').hidden = !ROUTE;
  if(!sel.length){
    majEtat('aucun carburant coché');
    liste.innerHTML = '<li class="vide">Cochez au moins un carburant dans le garage.</li>';
    return;
  }

  // En itineraire, le couloir est deja charge en entier : le zoom se contente de
  // filtrer l'affichage, ce qui est instantane et ne perd aucune station.
  let source = DATA;
  if(ROUTE){
    const large = +$('couloir').value;
    const vue = emprise();
    DATA.forEach(s => { if(s.ecart == null) situerSurTrace(s); });
    source = DATA.filter(s => s.ecart != null && s.ecart <= large && dansEmprise(vue, s.la, s.lo));
  }
  const list = source.map(s => ({s, v: pick(s, sel)})).filter(o => o.v);
  const n = list.length;
  // Stations en rupture du carburant choisi (voir chargerRuptures) : etiquette grise,
  // toucher = fiche avec la date de debut. Dessinees avant les prix, qui restent dessus.
  const servies = new Set(list.map(o => o.s.id)), ks = kosVoulus(sel), seuil = seuilRupture();
  const large = +$('couloir').value, vue = emprise();
  const dansVue = s => !ROUTE || (s.ecart != null && s.ecart <= large && dansEmprise(vue, s.la, s.lo));
  const koVu = new Set();
  const koDe = (s, k) => recente(s, k, seuil) || signaleVide(s, k);
  const enRupture = [...RUPTURES, ...DATA.filter(s => ks.some(k => signaleVide(s, k)))]
    .filter(s => ks.some(k => koDe(s, k)) && !servies.has(s.id) && dansVue(s) && !koVu.has(s.id) && koVu.add(s.id));
  // Vue large (zoom < 10, un trajet entier) : simple pastille grise barree, le texte
  // encombrerait la carte ; il revient en zoomant, et la fiche dit tout au toucher.
  const compact = CARTE && map && map.getZoom() < 10;
  if(CARTE) enRupture.forEach(s => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'marqueur'; el.tabIndex = -1;
    el.setAttribute('aria-label', `${brut(s.ville)} — rupture : ${brut(ruptureTxt(s))}`);
    el.innerHTML = compact
      ? `<div class="lbl lbl-ko pastille" title="${s.ville} — rupture : ${ruptureTxt(s)}">${ico('croix')}</div>`
      : `<div class="lbl lbl-ko">${ks.filter(k => koDe(s, k)).map(k => COURT[k]).join(' · ')} ${ks.some(k => signaleVide(s, k)) ? 'vide (signalé)' : 'en rupture'}</div>`;
    el.addEventListener('click', e => { e.stopPropagation(); ouvrirStation({s, v: null}, el); });
    MARQUEURS.push(CARTE.marqueur(s.la, s.lo, el));
  });
  const nKo = enRupture.length;
  majCompte = t => {
    $('compte').textContent =
      `${n} station${n>1?'s':''} ${ROUTE ? 'sur le trajet, dans la zone affichée' : 'dans la zone affichée'}` + t +
      (nKo ? ` · ${nKo} en rupture (en gris)` : '') +
      (tronque ? ` · ${tronque} de plus non chargée${tronque>1?'s':''} (plafond ${PLAFOND})` : '') +
      (ES_INFO ? ` · ${ES_INFO}` : '');
    $('titreStations').textContent = `Stations du trajet (${n})`;
    majEtat();
  };
  majCompte('');
  if(!n){
    const ko = nKo ? ` ${nKo} station${nKo>1?'s':''} en rupture, en gris sur la carte.` : '';
    liste.innerHTML = ROUTE
      ? `<li class="vide">Aucune station du trajet ne sert cette combinaison dans la zone affichée — dézoomez, acceptez un détour plus grand, ou décochez un carburant.${ko}</li>`
      : `<li class="vide">Aucune station ne sert cette combinaison dans la zone affichée — dézoomez, déplacez la carte, ou décochez un carburant.${ko}</li>`;
    // En itineraire, le plan porte sur TOUT le trajet : il reste affiche meme si la zone
    // affichee ne montre aucune station (zoom sur une ville, detour etroit). Avant le
    // 26/10/2026, la carte du plan disparaissait alors entierement.
    if(!ROUTE) return;
  }

  const px = list.map(o => o.v.p);
  const refTotal = bornes(sel), miniTot = Math.min(...px);
  const refs  = sel.map(k => bornes([k]));
  const minis = sel.map((k,i) => Math.min(...list.map(o => o.v.lignes[i].prix)));
  const multi = sel.length > 1;

  const sansCher = $('sansCher').checked;
  // Une station est « trop chere » des qu'UN des carburants demandes est dans le
  // 9e decile de son propre secteur — pas seulement quand la somme l'est. Sinon
  // le masque laissait passer des pastilles rouges, ce qui se voyait et se lisait mal.
  const chere = o => couleur(o.v.p, refTotal, miniTot) === ROUGE ||
                     o.v.lignes.some((l,j) => couleur(l.prix, refs[j], minis[j]) === ROUGE);
  const retenues = sansCher ? list.filter(o => !chere(o)) : list;
  const ecartees = list.length - retenues.length;

  // Dessin des etiquettes de prix, appele une fois connue la liste REELLEMENT affichee
  // (voir plus bas) : mn = prix minimum par carburant parmi ces seules stations.
  // Les plus cheres dessinees en premier : les etiquettes utiles restent dessus.
  const dessinerMarqueurs = (liste, mn) => { if(!CARTE) return;
    [...liste].sort((a,b) => b.v.p - a.v.p).forEach(o => {
      const {s,v} = o;
      const chips = v.lignes.map((l,j) => { const c = couleur(l.prix, refs[j], mn[j]);
        return `<span style="background:${c}">${marqueHtml(c)}${l.tag} ${l.prix.toFixed(3)}</span>`; }).join('');
      const c0 = couleur(v.lignes[0].prix, refs[0], mn[0]);
      const html = multi
        ? `<div class="lbl lbl2">${chips}</div>`
        : `<div class="lbl" style="background:${c0};`+
          `border-color:#555;color:#fff">${marqueHtml(c0)}${v.lignes[0].prix.toFixed(3)}`+
          (sel[0]==='spmin' ? ` <span style="font-size:.625rem;opacity:.85">${v.lignes[0].tag}</span>` : '')+
          `</div>`;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'marqueur'; el.tabIndex = -1;
      el.setAttribute('aria-label', `${brut(s.ville)} — ${v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)} €`).join(', ')}`);
      el.innerHTML = html; el.dataset.id = s.id;
      el.addEventListener('click', e => { e.stopPropagation(); ouvrirStation(o, el); });
      MARQUEURS.push(CARTE.marqueur(s.la, s.lo, el));
    });
  };

  const gardees = retenues;
  $('thDist').textContent = ROUTE ? 'Écart au trajet' : 'Distance';

  const ordre = (a,b)=>{
    let x,y;
    if(sortKey==='prix'){x=a.v.p;y=b.v.p;}
    else if(sortKey==='dist'){x=ROUTE?a.s.ecart:a.s.d;y=ROUTE?b.s.ecart:b.s.d;}
    else if(sortKey==='maj'){x=a.v.maj||'';y=b.v.maj||'';}
    else {x=(a.s[sortKey]||'').toLowerCase();y=(b.s[sortKey]||'').toLowerCase();}
    return (x>y?1:x<y?-1:0)*(sortAsc?1:-1);
  };
  let tri = [...gardees].sort(ordre);
  majCompte(ecartees ? ` · ${ecartees} trop chère${ecartees>1?'s':''} masquée${ecartees>1?'s':''}` : '');

  // ---- Plan de pleins : carte-heros (phase 2, 23/10/2026) ----
  // Chiffre-heros = carburant du voyage (plein de depart compris) ; sous-ligne = arrets,
  // minutes, economie vs « pleins au prix median » ; ligne de temps verticale (<ol>) ;
  // mini-barres par couloir. Tout est construit en DOM (textContent) : les noms de
  // stations viennent du flux.
  const etapesStation = new Map();   // station -> [n° d'etape, …] (deux en aller-retour possible)
  // Plein au depart / a l'arrivee : station -> libelle. Toujours visibles, meme avec
  // le filtre « arrets du plan » (demande du 17/09/2026 : Orleans > Montpellier,
  // aucune station ni au depart ni a l'arrivee).
  const extremites = new Map();
  // Trajet sans arret necessaire : stations gardees a la place du plan (voir plus bas).
  const moinsCheres = new Set();
  let utilesPlan = null, horsPlan = 0;
  const chipsPrix = [];              // [element, prix, indice carburant] a recolorer sur l'affichage reel
  const elPlan = $('plan');
  if(ROUTE && KMS){
    const conso = +$('conso').value;
    const cuve  = +$('cuve').value;
    const autonomie = +$('autonomie').value;
    // Reserve en KM (choix d'ergonomie) : plus parlant qu'un pourcentage.
    const resv = $('reserve').value.trim() === '' ? 30 : Math.max(0, +$('reserve').value || 0);   // « 0 » vaut 0, pas 30
    const au = autonomieUtile(conso, cuve, autonomie, resv);
    const total = KMS[KMS.length - 1];
    $('blocPlan').hidden = false;
    // En-tete : « Paris → Lyon · 465 km · 4 h 46 » (« Paris ⇄ Lyon · 930 km » en aller-retour).
    if(TRAJET){
      $('planTrajet').textContent = `${TRAJET.dep} ${TRAJET.ar ? '⇄' : '→'} ${TRAJET.arr}`;
      $('planMeta').textContent = `${Math.round(TRAJET.km)} km · ${duree(TRAJET.min)}`;
    }
    const el = (tag, cls, ...enfants) => {
      const e = document.createElement(tag);
      if(cls) e.className = cls;
      for(const c of enfants){ if(c == null || c === false) continue; e.append(c.nodeType ? c : String(c)); }
      return e;
    };
    const svg = nom => { const t = document.createElement('template'); t.innerHTML = ico(nom); return t.content.firstChild; };
    const bouton = (cls, libelle, action, icone) => {
      const b = el('button', cls, icone ? svg(icone) : null, icone ? ' ' : null, libelle);
      b.type = 'button'; b.onclick = action; return b;
    };
    const euros = x => x.toFixed(2).replace('.', ',') + ' €';
    const litre = x => x.toFixed(3).replace('.', ',') + ' €/L';
    const virg = x => String(x).replace('.', ',');
    const ouvrirGarage = champ => { appliquerVeh(); ouvrirFeuille('garage', $('chipVeh')); if(champ) $(champ).focus(); };
    const heros = [];
    let resume = '';
    let sonde = null;   // point d'acces de test (banc/) : le plan en donnees, publie apres le rendu

    if(!(conso > 0) || !au){
      // Etat : conso ou autonomie manquante.
      const manque = [!(conso > 0) && 'la conso', !au && 'l\'autonomie d\'un plein (ou le réservoir)'].filter(Boolean).join(' et ');
      heros.push(el('div', 'heros-etat', el('b', null, 'Véhicule à compléter'), ` — renseignez ${manque} pour savoir où faire le plein et chiffrer le voyage.`,
        el('div', 'actions',
          bouton('btn primaire', 'Compléter le véhicule', () => ouvrirGarage(!(conso > 0) ? 'conso' : 'autonomie'), 'garage'),
          bouton('btn', 'Assistant', () => ASSISTANT.ouvrir(REGL.vehicules[REGL.vehActif]), 'estimer'))));
      resume = 'Plan de pleins : véhicule à compléter.';
      sonde = {etat: 'vehicule-incomplet'};
    }else{
      const A = au.A;
      // A bord au depart (km, facultatif, demande du 24/10/2026) : vide = on part le plein fait ;
      // sinon le plan peut faire le plein en route s'il y est moins cher. Utile = valeur - reserve.
      const reserve = au.plein - A;
      const aBordBrut = $('aBord').value.trim() === '' ? null : Math.max(0, +$('aBord').value || 0);
      const aBordL = $('aBordUnite').value === 'l';   // en litres : converti avec la conso
      const aBord = aBordBrut == null ? null : Math.min(au.plein, aBordL ? (conso > 0 ? aBordBrut / conso * 100 : au.plein) : aBordBrut);
      const g0 = aBord == null ? A : Math.max(0, Math.min(A, aBord - reserve));
      // Reservoir au depart saisi : optimiserPlan recoit aussi la reserve, qu'il n'entame que pour
      // atteindre la premiere station quand aucune n'est a portee sans elle (reservoir presque
      // vide) ; g0 y est compte depuis le seuil de la reserve, negatif si on est deja dessous.
      const optsBord = aBord == null ? {g0} : {g0: aBord - reserve, reserve};
      const larg = +$('couloir').value;
      const lkm = conso / 100;
      const carbPlan = sel[0];               // le plan se calcule sur le 1er carburant coche
      // Candidats le long de la boucle : une occurrence par position (aller, retour).
      const candComplet = [];
      DATA.forEach(x => {
        if(!x.occ || !x.occ.length) return;
        const v = pick(x, sel);
        if(!v) return;
        const fige = prixFige(x, v.lignes.map(l => l.ref));
        x.occ.forEach(o => candComplet.push({s: x, v, km: o.km, e: o.d, p: v.lignes[0].prix, fige, risque: fige ? RISQUE_FIGE : 0}));
      });
      candComplet.sort((a,b) => a.km - b.km);
      // Carburant deja a bord (« Réservoir au départ ») : compte au prix du depart, le MEME pour
      // toutes les largeurs — sinon les choix de detour se comparaient sur des bases differentes
      // (banc du 26/10/2026, Lodeve > Orleans : « 20 km » gagnait sur ce seul artefact).
      const optsDe = cw => {
        const pd = aBord == null ? undefined
          : (prixBout(cw, c => c.km <= 15 && !c.risque) ?? prixBout(cw, c => c.km <= 15) ?? undefined);
        return pd != null ? Object.assign({pd}, optsBord) : optsBord;
      };
      // Pompes signalees vides par d'autres utilisateurs (signalements partages, option « Éviter les
      // pompes signalées vides », 12 h) : retirees des candidates AVANT optimiserPlan — plan.js
      // inchange. Si, sans elles, aucun plan ne passe avec ce detour alors qu'avec elles si, le plan
      // se recalcule avec elles et le dit (evitementLeve) ; infaisable des deux cotes : l'ecran
      // « infaisable » habituel, calcule sans elles.
      const tSig = Date.now();
      const sigVide = c => c.v.lignes.some(l => aEviter(sigEtat(c.s), l.ref, tSig));
      const evitees = eviterVidesActif() ? candComplet.filter(sigVide) : [];
      let candTous = candComplet, evitementLeve = false;
      if(evitees.length){
        const sans = candComplet.filter(c => !sigVide(c));
        const sansPlan = optimiserPlan(sans.filter(c => c.e <= larg), A, total, lkm, optsDe(sans)).plan;
        if(sansPlan === null && optimiserPlan(candComplet.filter(c => c.e <= larg), A, total, lkm, optsDe(candComplet)).plan !== null) evitementLeve = true;
        else candTous = sans;
      }
      const cand = candTous.filter(c => c.e <= larg);
      const optsPlan = optsDe(candTous);
      const r = optimiserPlan(cand, A, total, lkm, Object.assign({utiles: true}, optsPlan));
      const plan = r.plan;
      utilesPlan = r.utiles || null;
      const voyage = coutVoyage(cand, r, total, lkm);
      const eco = economieVsPlusCher(cand, A, total, lkm, voyage, optsBord);        // vs le plus cher du couloir
      const notrePrix = prixMoyen(r, lkm, g0);                                         // €/L reellement paye
      // Temps perdu : ~5 min par arret + le detour parcouru a ~50 km/h.
      const minutes = e => 5 + (2 * e.e) / 50 * 60;
      // Faire un detour ? (demande du 26/10/2026 : plus de selecteur de couloir dans le
      // formulaire ; « quatre possibilités avec l'écart de prix et le temps de détour, si ça
      // vaut le coup ».) Le plan est refait pour 1, 2, 5, 10 et 20 km de la route, sur les
      // memes donnees (chargees a 20 km quoi qu'il arrive). Ne restent que les choix utiles :
      // faisables, et aucun autre a la fois aussi rapide et moins cher (a egalite, le plus
      // proche de la route) ; quatre au plus, du plus rapide au moins cher. Temps compte
      // contre le plus rapide. « Conseillé » : en partant du plus rapide, on accepte chaque
      // detour plus long tant qu'il rapporte au moins VALEUR_HEURE €/h de detour en plus.
      // Le plein de depart se fait a la moins chere a 15 km du depart (cf. optimiserPlan) :
      // s'y rendre est un detour aussi, compte dans le temps des choix — sans lui, « 5 km »
      // (Grabels, hors de la route) paraissait aussi rapide que « Sans détour » et l'effacait
      // (constate le 26/10/2026, Montpellier > Clermont-Ferrand). Rien si « Réservoir au départ ».
      const detourDepart = cw => {
        const pres0 = aBord != null ? [] : cw.filter(c => c.km <= 15);
        const pres = pres0.some(c => !c.risque) ? pres0.filter(c => !c.risque) : pres0;
        if(!pres.length) return 0;
        const pmin = Math.min(...pres.map(c => c.p));
        return (2 * Math.min(...pres.filter(c => c.p <= pmin + 1e-9).map(c => c.e))) / 50 * 60;
      };
      let etroitFaisable = false;     // un choix plus proche de la route existe-t-il (domine) ?
      // Toutes les largeurs calculees sont gardees (largeurs) pour le point d'acces de test ;
      // detours ne retient que les faisables, puis les utiles.
      const largeurs = [1, 2, 5, 10, 20].map(w => {
        const cw = candTous.filter(c => c.e <= w);
        const rw = optimiserPlan(cw, A, total, lkm, optsPlan);
        const v = coutVoyage(cw, rw, total, lkm);
        const ok = rw.plan != null && v != null;
        return {w, ok, v: ok ? v : null, achats: ok ? rw.coutAchats : null, arrets: ok ? rw.plan.length : null,
                min: ok ? rw.plan.reduce((t, e) => t + minutes(e), 0) + detourDepart(cw) : null};
      });
      let detours = largeurs.filter(o => o.ok).map(o => ({w: o.w, v: o.v, min: o.min, arrets: o.arrets}));
      const wFaisables = detours.map(o => o.w);
      detours = detours.filter((o, i) => !detours.some((p, j) => j !== i &&
        p.v <= o.v + 0.05 && p.min <= o.min + 0.5 && (p.v < o.v - 0.05 || p.min < o.min - 0.5 || j < i)));
      detours.sort((a, b) => a.min - b.min || a.v - b.v);
      while(detours.length > 4){    // garder quatre : retirer celui qui fait le moins gagner
        let k = 1;
        for(let i = 2; i < detours.length; i++)
          if(detours[i - 1].v - detours[i].v < detours[k - 1].v - detours[k].v) k = i;
        detours.splice(k, 1);
      }
      etroitFaisable = !!detours.length && wFaisables.some(w => w < detours[0].w);
      let dConseil = detours[0] || null;
      detours.slice(1).forEach(o => {
        if(dConseil.v - o.v >= Math.max(0, o.min - dConseil.min) * VALEUR_HEURE / 60) dConseil = o;
      });
      if(DETOUR_AUTO && dConseil && dConseil.w !== larg){
        $('couloir').value = String(dConseil.w);
        return rendu();             // une seule fois : au tour suivant, larg === dConseil.w
      }
      const tempsTotal = (plan || []).reduce((t, e) => t + minutes(e), 0);
      // Ou faire le plein avant de partir (15 km du depart) ; en aller simple, ou le refaire
      // en arrivant. En aller-retour, le plein du retour est une ETAPE du plan.
      const ext = pleinsExtremites(cand, total);
      const depart = ext.depart, pleinArrivee = ROUTE_AR ? null : ext.arrivee;
      if(depart) extremites.set(depart.s, 'Départ');
      if(pleinArrivee) extremites.set(pleinArrivee.s, extremites.has(pleinArrivee.s) ? 'Départ et arrivée' : 'Arrivée');
      (plan || []).forEach((e,i) => { const l = etapesStation.get(e.s) || []; l.push(i + 1); etapesStation.set(e.s, l); });
      // Trajet court, aucun arret necessaire : le filtre « arrets du plan » ne doit pas
      // vider la carte. On garde alors les moins cheres du couloir DANS LA ZONE AFFICHEE
      // (meme reference que le vert : sinon le texte citait des stations hors ecran) :
      // TOUTES celles au prix le plus bas, ex aequo compris, donc toutes en vert,
      // completees jusqu'a trois stations, departagees par le detour. Constate le
      // 17/09/2026 : Montpellier > Aniane, 35 km, 10 stations dans le couloir, carte et
      // liste vides.
      if(plan && !plan.length && list.length){
        const parPrix = [...list].sort((a,b) => a.v.p - b.v.p || a.s.ecart - b.s.ecart);
        const pMin = parPrix[0].v.p;
        parPrix.forEach((o,i) => { if(o.v.p <= pMin + 1e-9 || i < 3) moinsCheres.add(o.s); });
      }
      // Reperes du plan sur la carte : cercle noir pointille = etape, plein = depart/arrivee.
      const rond = (s, titre, plein) => { if(!CARTE) return;
        const e = document.createElement('div');
        e.className = 'etape-rond' + (plein ? ' plein' : ''); e.title = titre;
        MARQUEURS.push(CARTE.marqueur(s.la, s.lo, e));
      };
      (plan || []).forEach((e,i) => rond(e.s, `Étape ${i+1} — km ${Math.round(e.km)}`, false));
      [[depart, 'Plein au départ'], [pleinArrivee, 'Plein à l\'arrivée']].forEach(([o, t]) => {
        if(o) rond(o.s, `${t} — km ${Math.round(o.km)}`, true);
      });

      // Prix d'une candidate, en palette metier. Reference provisoire = les candidates du
      // couloir ; recolore plus bas sur les stations REELLEMENT affichees (meme vert que la
      // carte et la liste), une fois le filtre « arrets du plan » applique.
      const mnCand = sel.map((k, j) => Math.min(...cand.map(c => c.v.lignes[j].prix)));
      const chipPrix = c => c.v.lignes.map((l, j) => {
        const sp = el('span', 'prix', `${l.tag} ${litre(l.prix)}`);
        marquerPrix(sp, couleur(l.prix, refs[j], mnCand[j]));
        chipsPrix.push([sp, l.prix, j]);
        return sp;
      });
      const origine = au.source === 'autonomie' ? `plein ≈ ${Math.round(au.plein)} km`
                    : `${cuve} L × ${virg(conso)} L/100`;
      const rappel = el('p', 'heros-rappel',
        `≈ ${Math.round(A)} km utiles (${origine}, réserve ${resv} km) · plan sur ${carbPlan === 'spmin' ? 'SP le moins cher' : (COURT[carbPlan] || 'SP')}` +
        (aBord != null ? ` · réservoir au départ ≈ ${Math.round(aBord)} km${aBordL ? ` (${aBordBrut} L)` : ''}, compté au prix du départ` : '') +
        (voyage == null ? '' : aBord != null ? '' : depart ? ' · plein de départ compris' : ' · plein de départ compté au prix de la première étape (aucune station à 15 km)'));
      // Ligne de temps : <ol>, un repere par item (lecteur d'ecran : liste ordonnee).
      const item = (cls, pt, titre, lignes, station) => {
        const li = el('li', cls);
        const p = el('span', 'lt-pt' + (pt.plein ? ' plein' : '') + (pt.pause ? ' pause' : ''), pt.txt || '');
        p.setAttribute('aria-hidden', 'true');
        const txt = el('div', 'lt-txt', el('b', null, titre));
        (lignes || []).filter(Boolean).forEach(l => txt.append(el('span', 'lt-ligne', ...(Array.isArray(l) ? l : [l]))));
        li.append(p, txt);
        if(station){
          const b = bouton('lt-aller', 'Y aller', () => allerA(station, b), 'navigation');
          b.setAttribute('aria-label', `Y aller : ${brut(station.ville)}`);
          li.append(b);
        }
        return li;
      };
      const nomVille = s => brut(s.ville) + (s.pays ? ` (${brut(s.pays)})` : '');
      // Date du prix (des 1 jour ; rouge a 4 jours, comme la fiche), alerte « prix fige », et
      // secours : si la pompe est vide, la station la plus proche atteignable avec ce qui reste
      // (route ~ 1,3 x vol d'oiseau), prix figes evites ; « Pompe vide ? » refait le plan sans elle.
      const datePrix = c => {
        const m = c.v.maj; if(!m) return null;
        const j = (Date.now() - new Date(m)) / 864e5;
        return j >= 1 ? el('span', 'lt-date' + (j >= 4 ? ' vieux' : ''), ` · prix du ${jour(m)}`) : null;
      };
      const alertes = [];   // alertes « prix figé » / « station muette » affichees {ou, id, texte} (point d'acces de test)
      const alerteFige = (c, ou) => {
        if(!c.fige) return null;
        const texte = c.fige.muette
          ? `station muette : aucun prix déclaré depuis le ${jour(c.fige.date)}, peut-être fermée — à vérifier avant d'y aller`
          : `prix figé depuis le ${jour(c.fige.date)} alors que la station déclare ses autres carburants : à vérifier avant d'y aller`;
        alertes.push({ou, id: brut(c.s.id), texte});
        return el('span', 'lt-alerte', svg('alerte'), ' ' + texte);
      };
      // Pompe signalee vide par d'autres utilisateurs sur une etape du plan (evitement leve, option
      // coupee, ou signalement de plus de 12 h) : dit en toutes lettres, jamais par la couleur seule.
      const alerteSig = c => {
        const a = c.v.lignes.map(l => sigDe(c.s, l.ref)).find(x => x && +x.vide >= 1);
        return !a ? null : el('span', 'lt-alerte', svg('alerte'), ` ${libelle(a, tSig)} par d'autres utilisateurs — vérifiez avant d'y aller`);
      };
      // Candidates ecartees du plan et pourquoi (carte-heros) ; evitement leve : avertissement.
      const noteEvitees = () => {
        if(!evitees.length) return null;
        const noms = [...new Set(evitees.map(c => nomVille(c.s)))], n = noms.length;
        const liste = noms.slice(0, 3).join(', ') + (n > 3 ? ` et ${n - 3} autre${n > 4 ? 's' : ''}` : '');
        if(evitementLeve) return el('p', 'heros-note ko', svg('alerte'),
          ` ${n} station${n > 1 ? 's' : ''} signalée${n > 1 ? 's' : ''} vide${n > 1 ? 's' : ''} par d'autres utilisateurs (${liste}) : sans elle${n > 1 ? 's' : ''}, aucun plan ne passe avec ce détour — le plan ${n > 1 ? 'les' : 'la'} garde, vérifiez avant d'y aller.`);
        return el('p', 'heros-note', svg('info'),
          ` ${n} station${n > 1 ? 's' : ''} écartée${n > 1 ? 's' : ''} du plan : pompe signalée vide par d'autres utilisateurs il y a moins de ${SIG_FENETRE_H} h (${liste}) — option « Éviter les pompes signalées vides ».`);
      };
      const repli = (c, portee) => {
        let best = null;
        candTous.forEach(x => {
          if(x.s === c.s || x.km < c.km - 25) return;
          const d = kmEntre(c.s, x.s) * 1.3;
          if(d > portee) return;
          const cle = d + (x.risque ? 50 : 0);
          if(!best || cle < best.cle - 0.3 || (Math.abs(cle - best.cle) <= 0.3 && x.p < best.x.p)) best = {x, d, cle};
        });
        return best;
      };
      const secours = (c, portee) => {
        const b = bouton('lt-vide', 'Pompe vide ?', () => corriger(c.s, c.v.lignes.map(l => l.ref), {vide: true}), 'alerte');
        b.setAttribute('aria-label', `Pompe vide à ${nomVille(c.s)} : refaire le plan sans elle`);
        const r = repli(c, portee);
        if(!r) return [b, ' si c\'est vide : aucune autre station à portée'];
        const adr = brut(r.x.s.adresse).slice(0, 34);
        return [b, ` si c'est vide : ${nomVille(r.x.s)}${adr ? `, ${adr}` : ''} à ≈ ${r.d < 1 ? '1' : Math.round(r.d)} km · `, ...chipPrix(r.x)];
      };
      // Carburant a bord a un km donne, reserve comprise : ce qu'on a au depart puis, apres
      // chaque arret, ce qui y etait en arrivant + ce qui y a ete achete (« juste » ou plein).
      const restante = km => {
        const avant = (plan || []).filter(e => e.km <= km);
        const d = avant.length ? avant[avant.length - 1] : null;
        return Math.round(reserve + (d ? d.arrivee + d.q - d.e - (km - d.km) : g0 - km));
      };
      const ligneTemps = () => {
        const ol = el('ol', 'ligne-temps');
        ol.setAttribute('aria-label', 'Étapes du plan');
        ol.append(item('lt-depart', {plein: true, txt: ''}, aBord != null ? `Départ · réservoir ≈ ${Math.round(aBord)} km${aBordL ? ` (${aBordBrut} L)` : ''}` : 'Départ · plein',
          aBord != null ? [] :
          depart ? [[nomVille(depart.s), ' · km ', String(Math.round(depart.km)), ' · ', ...chipPrix(depart), datePrix(depart)],
                    alerteFige(depart, 'depart'), alerteSig(depart), secours(depart, 30)]
                 : ['aucune station à moins de 15 km du départ avec ce détour — partez le réservoir plein'],
          aBord == null && depart ? depart.s : null));
        const etapes = plan || [];
        const ajouterEtapes = (de, a) => etapes.forEach((e, i) => {
          if(e.km < de || e.km >= a) return;
          ol.append(item('lt-etape', {txt: String(i + 1)}, `Étape ${i + 1} — ${nomVille(e.s)}`,
            [[`km ${Math.round(e.km)} · `, ...chipPrix(e), datePrix(e)],
             `${e.plein ? 'le plein' : 'juste ce qu\'il faut'} : ≈ ${Math.round(e.litres)} L (${euros(e.p * lkm * e.q)}) · à bord en arrivant ≈ ${Math.round(e.arrivee + reserve)} km`,
             `détour ${(2 * e.e).toFixed(1).replace('.', ',')} km (+${euros(2 * e.e * lkm * e.p)}) · ≈ ${Math.round(minutes(e))} min`,
             alerteFige(e, 'etape'), alerteSig(e), secours(e, e.arrivee + reserve)],
            e.s));
        });
        if(ROUTE_AR){
          ajouterEtapes(0, ALLER_KM);
          ol.append(item('lt-arrivee', {pause: true, txt: ''}, `Arrivée — ${TRAJET ? TRAJET.arr : 'arrivée'}`,
            [`km ${Math.round(ALLER_KM)} · autonomie restante ≈ ${restante(ALLER_KM)} km`]));
          ajouterEtapes(ALLER_KM, Infinity);
          ol.append(item('lt-retour', {plein: true, txt: ''}, `Retour — ${TRAJET ? TRAJET.dep : 'départ'}`,
            [`km ${Math.round(total)} · autonomie restante ≈ ${restante(total)} km`]));
        }else{
          ajouterEtapes(0, Infinity);
          ol.append(item('lt-arrivee', {plein: true, txt: ''}, `Arrivée — ${TRAJET ? TRAJET.arr : 'arrivée'}`,
            [`km ${Math.round(total)} · autonomie restante ≈ ${restante(total)} km`]));
          ol.append(item('lt-retour', {pause: true, txt: ''}, 'Retour — plein conseillé à l\'arrivée',
            pleinArrivee ? [[nomVille(pleinArrivee.s), ' · km ', String(Math.round(pleinArrivee.km)), ' · ', ...chipPrix(pleinArrivee), datePrix(pleinArrivee)],
                            alerteFige(pleinArrivee, 'arrivee'), alerteSig(pleinArrivee)]
                         : ['aucune station à moins de 15 km de l\'arrivée avec ce détour'],
            pleinArrivee ? pleinArrivee.s : null));
        }
        return ol;
      };
      // Choix du detour : une ligne par possibilite, du plus rapide au moins cher —
      // ce que l'on gagne, ce que l'on perd en minutes. Toucher une ligne refait le plan
      // (select#couloir, cache, reste la source de verite : lien partage, liste, carte).
      const choixDetour = () => {
        if(!detours.length) return null;
        const dRef = detours[0];
        const dChoisi = detours.filter(o => o.w <= larg).pop() || null;   // aucun : plan courant infaisable
        if(detours.length < 2 && dChoisi)
          return el('p', 'detours-rien', svg('info'), dRef.w <= 2
            ? ' Aucun détour ne ferait gagner d\'argent sur ce trajet.'
            : etroitFaisable
              ? ` Le plus rapide et le moins cher passe à ${dRef.w} km de la route au plus ; aller plus loin ne ferait rien gagner.`
              : ` Un détour jusqu'à ${dRef.w} km de la route est nécessaire ; aller plus loin ne ferait rien gagner.`);
        const bloc = el('div', 'detours', el('p', 'detours-titre',
          plan === null ? 'Possible avec un détour :' : 'Faire un détour pour payer moins ?'));
        const liste = el('div', 'detours-liste');
        liste.setAttribute('role', 'group'); liste.setAttribute('aria-label', 'Détour accepté');
        detours.forEach(o => {
          const titre = o === dRef ? (o.w <= 2 ? 'Sans détour' : 'Le moins de détour')
                                   : `+${Math.max(1, Math.round(o.min - dRef.min))} min de détour`;
          const gain = dRef.v - o.v, conseil = o === dConseil;
          const b = el('button', 'detour-b' + (conseil ? ' conseil' : ''));
          b.type = 'button'; b.setAttribute('aria-pressed', String(o === dChoisi));
          b.append(el('span', 'db-rond'),
                   el('span', 'db-titre', titre, conseil ? el('span', 'db-conseil', 'conseillé') : null),
                   el('span', 'db-prix', euros(o.v)),
                   el('span', 'db-sous', `${o.arrets ? `${o.arrets} arrêt${o.arrets > 1 ? 's' : ''}` : 'aucun arrêt'} · stations à ${o.w} km de la route au plus`),
                   el('span', 'db-eco', o === dRef ? '' : `−${euros(gain)}`));
          b.setAttribute('aria-label', `${titre}${conseil ? ', conseillé' : ''} : ${euros(o.v)}` +
            (o === dRef ? '' : `, soit ${euros(gain)} de moins`));
          b.onclick = () => {
            DETOUR_AUTO = false;      // choix de l'utilisateur : on ne le remplace plus
            if($('couloir').value === String(o.w)) return;
            $('couloir').value = String(o.w);
            $('couloir').dispatchEvent(new Event('change'));
          };
          liste.append(b);
        });
        bloc.append(liste, el('p', 'detours-note',
          `« Conseillé » : chaque minute de détour en plus vous fait gagner au moins ${VALEUR_HEURE} € de l'heure.`));
        return bloc;
      };
      const chiffre = () => {
        if(voyage != null) return el('p', 'heros-chiffre', el('b', null, euros(voyage)), el('span', null, 'carburant du voyage'));
        return el('p', 'heros-chiffre', el('b', null, euros(r.coutAchats || 0)), el('span', null, 'achats en route (plein de départ non chiffré : aucune station à moins de 15 km)'));
      };
      const ligneEco = () => {
        if(!eco) return null;
        // Notre prix moyen au litre, puis l'economie contre le plus cher du couloir (demande du 24/10/2026).
        const notre = notrePrix != null ? `votre prix ${litre(notrePrix)} · ` : '';
        if(Math.abs(eco.economie) < 0.05) return el('b', 'eco nulle', `${notre}prix unique sur le trajet (${litre(eco.prix)})`);
        const signe = eco.economie > 0 ? '−' : '+';
        return el('b', 'eco' + (eco.economie > 0 ? '' : ' nulle'), `${notre}${signe}${euros(Math.abs(eco.economie))} vs pleins au plus cher (${litre(eco.prix)})`);
      };

      // Reservoir presque vide : la reserve est entamee jusqu'a la premiere etape, l'ecran le dit.
      if(r.reserveEntamee != null) heros.push(el('div', 'heros-etat', svg('alerte'), ' ', el('b', null, 'Réserve entamée'),
        ` — il vous reste ${Math.round(aBord)} km : vous entamez la réserve jusqu'à ${nomVille(plan[0].s)} (km ${Math.round(plan[0].km)}) ; vous y arrivez avec ≈ ${Math.round(plan[0].arrivee + reserve)} km.`));
      // Infaisable parce que rien n'est a portee de ce qui reste dans le reservoir, reserve comprise.
      const horsPortee = plan === null && aBord != null && !cand.some(c => c.km + c.e <= aBord);
      if(horsPortee){
        const actions = el('div', 'actions');
        if(detours.length) actions.append(bouton('btn primaire', 'Accepter un détour', () => { DETOUR_AUTO = true; rendu(); }));
        heros.push(el('div', 'heros-etat ko', svg('alerte'), ' ', el('b', null, 'Aucune station à portée'),
          ` — il vous reste ${Math.round(aBord)} km : aucune station à portée, avec les stations à ${larg} km de la route au plus.`, actions));
        heros.push(choixDetour(), rappel, noteEvitees());
        resume = `Plan de pleins : il vous reste ${Math.round(aBord)} km, aucune station à portée avec les stations à ${larg} km de la route au plus.`;
      }else if(plan === null){
        // Etat : infaisable — trois remedes cliquables.
        const actions = el('div', 'actions');
        if(detours.length) actions.append(bouton('btn primaire', 'Accepter un détour', () => { DETOUR_AUTO = true; rendu(); }));
        if(resv > 0){
          const cible = resv > 10 ? 10 : 0;
          actions.append(bouton('btn', `Réduire la réserve (${resv} → ${cible} km)`, () => { $('reserve').value = String(cible); $('reserve').dispatchEvent(new Event('change')); }));
        }
        actions.append(bouton('btn', 'Revoir l\'autonomie', () => ouvrirGarage('autonomie'), 'garage'));
        heros.push(el('div', 'heros-etat ko', svg('alerte'), ' ', el('b', null, detours.length ? 'Trajet impossible sans détour' : 'Trajet infaisable avec cette autonomie'),
          ` — ${Math.round(A)} km utiles pour ${Math.round(total)} km : avec les stations à ${larg} km de la route au plus, aucune suite d'arrêts ne passe.`, actions));
        heros.push(choixDetour(), rappel, noteEvitees());
        resume = `Plan de pleins : trajet infaisable avec ${Math.round(A)} km d'autonomie utile et les stations à ${larg} km de la route au plus.`;
      }else if(!plan.length){
        // Etat : aucun arret necessaire.
        heros.push(el('div', 'heros-etat ok', el('b', null, 'Aucun arrêt nécessaire'),
          ` — ${Math.round(total)} km pour ${Math.round(g0)} km utiles${aBord != null ? ' dans le réservoir au départ : ce que vous avez suffit.' : ' : un plein au départ suffit.'}`));
        heros.push(chiffre());
        heros.push(el('p', 'heros-sous', '0 arrêt · ', ligneEco()));
        heros.push(choixDetour(), rappel, noteEvitees(), ligneTemps());
        const lst = [...list].filter(o => moinsCheres.has(o.s)).sort((a,b) => a.v.p - b.v.p || a.s.ecart - b.s.ecart);
        if(lst.length){
          const ul = el('ul', 'liste-min');
          lst.forEach(o => ul.append(el('li', null, el('b', null, nomVille(o.s)), ` km ${Math.round(o.s.kmr)}, détour ${(2 * o.s.ecart).toFixed(1).replace('.', ',')} km · `, ...chipPrix(o))));
          heros.push(el('p', 'heros-rappel', 'Pour un plein en route, les moins chères du trajet dans la zone affichée :'), ul);
        }
        resume = `Plan de pleins : aucun arrêt nécessaire${voyage != null ? `, carburant du voyage ${euros(voyage)}` : ''}.`;
      }else{
        heros.push(chiffre());
        heros.push(el('p', 'heros-sous', `${plan.length} arrêt${plan.length > 1 ? 's' : ''} · ≈ ${Math.round(tempsTotal)} min · `, ligneEco()));
        heros.push(choixDetour(), rappel, noteEvitees(), ligneTemps());
        resume = `Plan de pleins : ${plan.length} arrêt${plan.length > 1 ? 's' : ''}${voyage != null ? `, carburant du voyage ${euros(voyage)}` : ''}` +
                 (eco && Math.abs(eco.economie) >= 0.05 ? `, ${eco.economie > 0 ? 'économie' : 'surcoût'} de ${euros(Math.abs(eco.economie))} par rapport au plus cher du trajet` : '') + '.';
      }
      // Point d'acces de test (banc/, 30/10/2026) : le plan tel qu'il vient d'etre calcule, en
      // donnees — stations retenues (id, km, litres, prix, date du prix), couts, economie, largeurs
      // comparees, alertes. Lu par window.__viaminus_plan ou l'evenement viaminus:plan (voir
      // publierPlan). Rien pour l'utilisateur : aucun DOM, aucune requete, aucune donnee
      // personnelle (des stations du flux officiel et des noms de villes).
      const sondeStation = (c, plus) => Object.assign({id: brut(c.s.id), ville: brut(c.s.ville), cp: brut(c.s.cp),
        km: c.km, detourKm: c.e, prix: c.p, datePrix: c.v.lignes[0].maj || null, fige: c.fige || null,
        carburants: c.v.lignes.map(l => ({ref: l.ref, prix: l.prix, maj: l.maj || null}))}, plus || {});
      sonde = {
        etat: plan === null ? 'infaisable' : plan.length ? 'arrets' : 'aucun-arret',
        couloir: larg, detourAuto: DETOUR_AUTO,
        vehicule: {carburant: carbPlan, conso, autonomiePlein: au.plein, A, reserve: resv, aBord, g0},
        etapes: (plan || []).map(e => sondeStation(e, {q: e.q, litres: e.litres, plein: e.plein, cout: e.p * lkm * e.q, arrivee: e.arrivee})),
        depart: depart ? sondeStation(depart) : null,
        arrivee: pleinArrivee ? sondeStation(pleinArrivee) : null,
        achats: plan === null ? null : r.coutAchats,
        voyage: plan === null ? null : voyage,
        aBordValeur: plan === null || voyage == null ? null : voyage - r.coutAchats,   // carburant a bord au depart, valorise
        prixMoyen: notrePrix,
        economie: eco,
        minutes: plan === null ? null : tempsTotal,
        largeurs: largeurs.map(o => ({w: o.w, faisable: o.ok, voyage: o.v, achats: o.achats,
                                      aBordValeur: o.ok ? o.v - o.achats : null, arrets: o.arrets, minutes: o.min})),
        detours: detours.map(o => ({w: o.w, voyage: o.v, minutes: o.min, arrets: o.arrets, conseille: o === dConseil})),
        candidats: candTous.map(c => sondeStation(c)),
        alertes,
      };
    }
    elPlan.replaceChildren(...heros.filter(Boolean));
    if(sonde){
      sonde.trajet = TRAJET ? {dep: TRAJET.dep, arr: TRAJET.arr, km: TRAJET.km, min: TRAJET.min, allerRetour: !!TRAJET.ar,
                               sansPeage: !!TRAJET.sansP, moteur: MOTEUR, total: KMS[KMS.length - 1]} : null;
      sonde.messages = [...elPlan.querySelectorAll('.heros-etat, .detours-rien, .lt-alerte')].map(x => x.textContent.trim());
      sonde.resume = resume;
      publierPlan(sonde);
    }
    // Region aria-live : un resume court, mis a jour seulement s'il change (le plan est
    // redessine a chaque deplacement de la carte : pas de repetition au lecteur d'ecran).
    if($('planEtat').textContent !== resume) $('planEtat').textContent = resume;
    // Une station du plan (etape, depart, arrivee) reste visible meme « trop chere » :
    // le plan y passe. La masquer faisait croire a un plan vide (constate le 17/09/2026 :
    // Le Caylar, etape 1 d'Orleans > Montpellier, absente de la liste et de la carte).
    const dansTri = new Set(tri.map(o => o.s));
    const reprises = list.filter(o => (etapesStation.has(o.s) || extremites.has(o.s)) && !dansTri.has(o.s));
    if(reprises.length){ tri.push(...reprises); tri.sort(ordre); }
    if(utilesPlan && $('queUtiles').checked){
      const avant = tri.length;
      tri = tri.filter(({s}) => etapesStation.has(s) || moinsCheres.has(s) || extremites.has(s));
      const off = avant - tri.length;
      horsPlan = off;
      if(off) majCompte(` · ${off} hors plan masquée${off>1?'s':''}`);
    }
  }
  if(!tri.length){
    if(!n) return;   // message deja pose plus haut (aucune station dans la zone affichee)
    // Deux causes possibles, deux messages : le filtre du plan, ou le masque des cheres.
    liste.innerHTML = horsPlan
      ? '<li class="vide">Aucune station du plan dans la zone affichée — dézoomez, ou désactivez « Seulement les arrêts du plan » pour voir toutes les stations du trajet.</li>'
      : '<li class="vide">Toutes les stations de la zone sont dans les 10 % les plus chères du secteur — désactivez « Masquer les trop chères » (options) pour les voir.</li>';
    return;
  }
  // Couleurs calculees sur les stations REELLEMENT affichees, comme le dit la legende
  // (« la moins chere affichee ») : avec le filtre « arrets du plan », une etape seule
  // restait « dans la norme » parce que des stations masquees etaient moins cheres ;
  // ex aequo compris, toutes les moins cheres affichees sont vertes (17/09/2026).
  const minisAff = sel.map((k,i) => Math.min(...tri.map(o => o.v.lignes[i].prix)));
  const miniTotAff = Math.min(...tri.map(o => o.v.p));
  chipsPrix.forEach(([sp, prix, j]) => marquerPrix(sp, couleur(prix, refs[j], minisAff[j])));
  $('echelle').textContent =
    `— vert = la moins chère affichée, ex æquo compris ; ${sansCherLbl()} · ` +
    sel.map((k,i) => `${k==='spmin'?'SP':COURT[k]} ${minisAff[i].toFixed(3)}` +
                     (refs[i] ? ` / ${refs[i].p90.toFixed(3)}` : '')).join(' · ') + ' €';
  dessinerMarqueurs(tri, minisAff);
  tri.forEach((o, i) => {
    const {s, v} = o;
    const chips = v.lignes.map((l,j) => { const c = couleur(l.prix, refs[j], minisAff[j]);
      return `<span class="pill" style="background:${c}">${marqueHtml(c)}${l.tag} ${l.prix.toFixed(3)}</span>`; }).join('');
    const cTot = couleur(v.p, refTotal, miniTotAff);
    const prix = (multi
      ? `<span class="pill" style="background:${cTot}">${marqueHtml(cTot)}${v.p.toFixed(3)} €</span>` : '') + chips;
    const et = etapesStation.get(s), mc = moinsCheres.has(s), ex = extremites.get(s);
    const badges = (ex ? `<span class="badge">${ico('pompe')} ${ex}</span> ` : '') +
      (et ? `<span class="badge">${ico('pompe')} Étape${et.length > 1 ? 's' : ''} ${et.join(' · ')}</span> ` : mc ? `<span class="badge badge-min">Moins chère</span> ` : '') +
      sigBadge(s, v.lignes.map(l => l.ref));
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="carte${et || mc || ex ? ' etape' : ''}" aria-haspopup="dialog">`+
      `<span class="ville">${badges}${badgePays(s)}${langES(s, s.ville)} <span class="cp">${s.cp}</span></span>`+
      `<span class="prix">${prix}</span>`+
      `<span class="adr">${s.enseigne ? `${langES(s, s.enseigne)} · ` : ''}${langES(s, s.adresse)}${s.auto ? ' · 24/24' : s.horario ? ` · ${resumerHorario(s.horario)}` : ''}</span>`+
      `<span class="meta"><span>${(ROUTE ? s.ecart : s.d).toFixed(1)} km${ROUTE ? ' du trajet' : ''}</span>`+
      (ROUTE && s.kmr != null ? `<span>km ${Math.round(s.kmr)}</span>` : '')+
      `<span>relevé ${jour(v.maj)}</span></span></button>`;
    const b = li.firstChild;
    b.dataset.i = i; b.dataset.id = s.id;
    b.addEventListener('click', () => {
      // Geste explicite : la carte peut se recadrer (sans animation si mouvement reduit).
      // Sur mobile, la feuille couvre le bas : la station est centree dans la partie visible.
      if(CARTE) CARTE.aller([s.la, s.lo], Math.max(map.getZoom(), 14), true,
                            MOBILE.matches ? [0, -Math.round(panneau.offsetHeight / 2)] : [0, 0]);
      ouvrirStation(o, b);
    });
    liste.appendChild(li);
  });
  LISTE_COURANTE = tri;
}
let LISTE_COURANTE = [];

// Navigation clavier dans la liste : fleches haut/bas entre les cartes.
$('liste').addEventListener('keydown', e => {
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const cartes = [...$('liste').querySelectorAll('.carte')];
  const i = cartes.indexOf(document.activeElement);
  if(i < 0) return;
  const j = e.key === 'ArrowDown' ? Math.min(cartes.length - 1, i + 1) : Math.max(0, i - 1);
  cartes[j].focus(); e.preventDefault();
});
document.querySelectorAll('.tri button[data-k]').forEach(b => {
  b.onclick = () => {
    const k = b.dataset.k;
    sortAsc = (k === sortKey) ? !sortAsc : true; sortKey = k;
    document.querySelectorAll('.tri button[data-k]').forEach(o => {
      o.setAttribute('aria-pressed', String(o === b));
      o.querySelector('svg')?.remove();
    });
    b.insertAdjacentHTML('beforeend', ' ' + ico(sortAsc ? 'haut' : 'bas'));
    rendu();
  };
});
$('replier').onclick = () => {
  const ouvert = $('replier').getAttribute('aria-expanded') !== 'true';
  $('replier').setAttribute('aria-expanded', String(ouvert));
  $('secStations').classList.toggle('replie', !ouvert);
};
function replierStations(replie){
  $('replier').hidden = !ROUTE;
  $('replier').setAttribute('aria-expanded', String(!replie));
  $('secStations').classList.toggle('replie', replie);
}

// ---------- Fiche station (feuille) ----------
let STATION = null;
function ouvrirStation(o, origine){
  const {s, v} = o;
  STATION = s;
  const utilises = v ? v.lignes.map(l => l.ref) : [];
  $('fsTitre').innerHTML = `${badgePays(s)}${langES(s, s.ville)} <span class="cp" style="font-weight:400;color:var(--muted)">${s.cp}</span>`;
  $('fsAdresse').innerHTML = (s.enseigne ? `<b>${langES(s, s.enseigne)}</b> · ` : '') + (s.adresse ? langES(s, s.adresse) : '<i>adresse non renseignée</i>');
  // Station espagnole : horaires resumes et ouvert / ferme a l'heure qu'il est (src/es.js) ;
  // la date de ses prix est l'horodatage global du fichier du ministere, pas un releve par station.
  const ouvert = s.horario ? ouvertES(s.horario, new Date()) : null;
  const majES = s.pays === 'ES' ? Object.values(s.off.maj).find(Boolean) : null;
  $('fsInfos').innerHTML =
    (s.auto ? `<span>${ico('horloge')} automate 24 h/24</span>`
     : s.horario ? `<span>${ico('horloge')} ${resumerHorario(s.horario)}${ouvert === true ? ' · ouvert en ce moment' : ouvert === false ? ' · <b class="ferme">fermé à cette heure</b>' : ''}</span>` : '') +
    `<span>${ico('epingle')} ${ROUTE && s.ecart != null ? `${s.ecart.toFixed(1)} km du trajet · km ${Math.round(s.kmr)}` : `${s.d.toFixed(1)} km du repère`}</span>` +
    (s.rupture || aSignalement(s) ? `<span class="ko-lbl">${ico('alerte')} rupture : ${ruptureTxt(s)}</span>` : '') +
    (s.pays === 'ES' ? `<span>${ico('info')} Espagne : prix du fichier du ministère${majES ? ` du ${quand(majES).txt}` : ''} (une date pour toutes les stations)</span>` : '');
  // Chaque carburant : « Corriger » ouvre, sous la ligne, le prix vu a la pompe, « Pompe vide »
  // et « Revenir au déclaré » (corrections gardees sur cet appareil, voir corriger()).
  $('fsCarbs').innerHTML = FUELS.filter(([k]) => s.prix[k] != null).map(([k,l]) => {
    const q = quand(s.maj[k]), c = s.corr[k];
    const ko = s.hs.has(RUPT[k]) || signaleVide(s, k);
    const etat = signaleVide(s, k) ? ' <span class="ko-lbl">(signalée vide)</span>'
               : s.hs.has(RUPT[k]) ? ' <span class="ko-lbl">(en rupture)</span>'
               : c && c.prix != null ? ' <span class="corr-lbl">(corrigé)</span>' : '';
    return `<li class="${utilises.includes(k) ? 'hi' : ''}${ko ? ' ko' : ''}"><span>${l}${etat}</span>`+
           `<span class="dt${q.vieux ? ' vieux' : ''}">${c && c.prix != null ? `vu à ${hhmm(c.t)}` : q.txt}</span>`+
           `<b>${s.prix[k].toFixed(3)} €</b>`+
           `<button type="button" class="fs-edit" data-k="${k}" aria-label="Corriger : ${l}">${ico('crayon')}</button>`+
           sigLigne(s, k, l) + `</li>`;
  }).join('') || '<li>Aucun prix déclaré.</li>';
  $('fsCarbs').querySelectorAll('.fs-edit').forEach(b => b.onclick = () => editerCarburant(s, b.dataset.k, b.closest('li')));
  $('fsCarbs').querySelectorAll('.sig-btn').forEach(b => b.onclick = () => signaler(s, b.dataset.k, b.dataset.etat, b));
  $('fsSigNote').hidden = !SIG_ACTIF || !idSignalable(s.id);
  sigMessageRendu();
  ouvrirFeuille('ficheStation', origine);
}
function editerCarburant(s, k, li){
  $('fsCarbs').querySelectorAll('.fs-corr').forEach(x => x.remove());
  const c = s.corr[k];
  const btn = (txt, cls, f) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.onclick = f; return b; };
  const box = document.createElement('li'); box.className = 'fs-corr';
  const lab = document.createElement('label'); lab.textContent = 'Prix vu à la pompe ';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = '0.001'; inp.min = '0.3'; inp.max = '5'; inp.inputMode = 'decimal';
  inp.value = s.prix[k] != null ? s.prix[k].toFixed(3) : '';
  lab.append(inp, ' €/L');
  const actions = document.createElement('div'); actions.className = 'actions';
  actions.append(
    btn('Enregistrer le prix', 'btn primaire', () => {
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if(!(v > 0.3 && v < 5)){ inp.focus(); return; }
      corriger(s, [k], {prix: v});
    }),
    btn(signaleVide(s, k) ? 'Elle en a de nouveau' : 'Pompe vide', 'btn', () => corriger(s, [k], signaleVide(s, k) ? null : {vide: true})));
  if(c && c.prix != null) actions.append(btn('Revenir au prix déclaré', 'btn', () => corriger(s, [k], null)));
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = 'Gardé sur cet appareil, tant que la station ne déclare rien de plus récent (48 h au plus).';
  box.append(lab, actions, note);
  li.after(box);
  inp.focus();
}
$('fsCopier').onclick = async () => {
  if(!STATION) return;
  const txt = brut(`${STATION.adresse}, ${STATION.cp} ${STATION.ville}`);
  try{ await navigator.clipboard.writeText(txt); majEtat('adresse copiée'); }
  catch(e){ prompt('Copiez l\'adresse :', txt); }
};

// « Y aller » : choix de l'application memorise au premier usage. Defaut Android =
// lien geo: (l'appareil propose ses applis) ; iPhone/iPad = Plans ; bureau =
// OpenStreetMap. Liens ouverts par l'utilisateur : la CSP ne les borne pas (ce ne sont
// pas des requetes de la page), aucun hote nouveau n'est contacte par la page elle-meme.
const NAV_APPS = [
  ['geo', 'Application par défaut', 'lien geo: — l\'appareil propose ses applis', s =>
    `geo:${s.la},${s.lo}?q=${s.la},${s.lo}(${encodeURIComponent(brut(s.ville))})`],
  ['magicearth', 'Magic Earth', '', s => `magicearth://?drive_to&lat=${s.la}&lon=${s.lo}`],
  ['osmand', 'OsmAnd', '', s => `osmand.api://navigate?dest_lat=${s.la}&dest_lon=${s.lo}&profile=car&force=true`],
  ['gmaps', 'Google Maps', '', s => `https://www.google.com/maps/dir/?api=1&destination=${s.la},${s.lo}`],
  ['waze', 'Waze', '', s => `https://waze.com/ul?ll=${s.la},${s.lo}&navigate=yes`],
  ['osm', 'OpenStreetMap', 'dans le navigateur', s => `https://www.openstreetmap.org/directions?to=${s.la}%2C${s.lo}`],
  ['apple', 'Plans (Apple)', '', s => `https://maps.apple.com/?daddr=${s.la},${s.lo}`],
];
const UA = navigator.userAgent;
const NAV_DEFAUT = /Android/i.test(UA) ? 'geo' : /iPhone|iPad|iPod/i.test(UA) ? 'apple' : 'osm';
function naviguer(cle, s){
  const app = NAV_APPS.find(a => a[0] === cle) || NAV_APPS.find(a => a[0] === NAV_DEFAUT);
  const url = app[3](s);
  if(/^https?:/.test(url)) window.open(url, '_blank', 'noopener');
  else location.href = url;   // schema d'application (geo:, magicearth:, osmand.api:)
}
// « Y aller » depuis la fiche station ou la ligne de temps du plan : meme feuille de choix.
function allerA(s, origine){
  STATION = s;
  if(NAV_APPS.some(a => a[0] === REGL.navApp)) naviguer(REGL.navApp, s);
  else ouvrirFeuille('menuNav', origine || $('fsAller'));   // premier usage : on demande, puis on memorise
}
$('fsAller').onclick = () => { if(STATION) allerA(STATION, $('fsAller')); };
$('navChoix').innerHTML = NAV_APPS.map(([k, nom, note]) =>
  `<button type="button" class="choix-item" data-app="${k}">${ico(k === 'osm' || k === 'gmaps' || k === 'apple' ? 'carte' : 'navigation')} ${nom}`+
  `<small>${note || (k === NAV_DEFAUT ? 'conseillé sur cet appareil' : '')}</small></button>`).join('');
$('navChoix').querySelectorAll('[data-app]').forEach(b => b.onclick = () => {
  REGL.navApp = b.dataset.app; reglagesBruts(); majNavApp();
  fermerFeuille();
  if(STATION) naviguer(REGL.navApp, STATION);
});
$('navApp').innerHTML = `<option value="">Demander au premier usage</option>` +
  NAV_APPS.map(([k, nom]) => `<option value="${k}">${nom}${k === NAV_DEFAUT ? ' (conseillé ici)' : ''}</option>`).join('');
function majNavApp(){ $('navApp').value = NAV_APPS.some(a => a[0] === REGL.navApp) ? REGL.navApp : ''; }
$('navApp').onchange = () => { REGL.navApp = $('navApp').value || undefined; reglagesBruts(); };
majNavApp();

// ---------- Garage ----------
$('carbs').onchange = () => { reglagesEcrits(); charger(); };
majSelectVeh();
$('veh').onchange = e => {
  REGL.vehActif = +e.target.value;
  appliquerVeh(); reglagesEcrits(); charger();
};
$('chipVeh').onclick = () => { appliquerVeh(); ouvrirFeuille('garage', $('chipVeh')); };
// Le nom se fixe des qu'on quitte le champ (Entree, Tab, clic ailleurs) : avant le
// 24/10/2026 seul OK le gardait, « Ajouter » ou un changement de vehicule juste apres
// la saisie le perdait (demande : « pouvoir nommer le vehicule au cas ou on en ait plusieurs »).
// Nom unique : les fiches se fusionnent par nom (reglagesEcrits), deux vehicules du meme
// nom s'ecraseraient l'un l'autre (revue du 24/10/2026) : « Clio » pris -> « Clio 2 ».
function nomLibre(nom, sauf = -1){
  const pris = x => REGL.vehicules.some((v, k) => k !== sauf && v.nom === x);
  let n = 2, essai = nom;
  while(nom && pris(essai)) essai = `${nom} ${n++}`;
  return essai;
}
function fixerNom(){
  const nom = nomLibre($('vnom').value.trim(), REGL.vehActif);
  if(!nom || nom === REGL.vehicules[REGL.vehActif].nom) return;
  reglagesEcrits();                       // synchronise sous le nom courant
  REGL.vehicules[REGL.vehActif].nom = nom;
  $('vnom').value = nom;
  reglagesBruts();                        // renommage : ecriture directe
  majSelectVeh(); majChip();
}
$('vnom').onchange = fixerNom;
$('vehPlus').onclick = () => {
  fixerNom();
  REGL.vehicules.push({nom: nomLibre('Véhicule ' + (REGL.vehicules.length + 1)), type: 'voiture',
    carbs: DEFAUT.slice(), conso: '', cuve: '', autonomie: '', reserve: ''});
  REGL.vehActif = REGL.vehicules.length - 1;
  appliquerVeh(); majSelectVeh(); reglagesEcrits(); charger();
  $('vnom').focus(); $('vnom').select();
};
$('vehOk').onclick = () => {
  reglagesEcrits();                       // synchronise sous le nom courant
  const nom = nomLibre($('vnom').value.trim(), REGL.vehActif);
  if(nom && nom !== REGL.vehicules[REGL.vehActif].nom){
    REGL.vehicules[REGL.vehActif].nom = nom;
    reglagesBruts();                      // renommage : ecriture directe
  }
  majSelectVeh(); majChip(); fermerFeuille(); charger();
};
// Suppression avec annulation (a la place de confirm()) : la fiche part tout de suite,
// « Supprimé · Annuler » reste 8 s, Annuler la remet a sa place.
let SUPPRIME = null, minuteurSuppr = null;
function messageGarage(texte, action, libelle){
  const m = $('garageMsg');
  m.replaceChildren(texte);
  if(action){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.innerHTML = ico('annuler') + ' ' + libelle; b.onclick = action;
    m.append(b);
  }
  clearTimeout(minuteurSuppr);
  minuteurSuppr = setTimeout(() => { SUPPRIME = null; m.replaceChildren(); }, 8000);
}
$('vehMoins').onclick = () => {
  if(REGL.vehicules.length <= 1) return;
  const i = REGL.vehActif;
  const [v] = REGL.vehicules.splice(i, 1);
  SUPPRIME = {v, i};
  REGL.vehActif = 0;
  reglagesBruts();                        // suppression : ecriture directe
  majSelectVeh(); appliquerVeh(); charger();
  messageGarage(`« ${v.nom} » supprimé · `, () => {
    if(!SUPPRIME) return;
    REGL.vehicules.splice(Math.min(SUPPRIME.i, REGL.vehicules.length), 0, SUPPRIME.v);
    REGL.vehActif = Math.min(SUPPRIME.i, REGL.vehicules.length - 1);
    SUPPRIME = null;
    reglagesBruts(); majSelectVeh(); appliquerVeh(); charger();
    $('garageMsg').replaceChildren();
  }, 'Annuler');
};
$('vtype').onchange = () => { majCats(); reglagesEcrits(); };
$('vcat').onchange = () => { reglagesEcrits(); };
// Energie : bascule de la fiche ; les stations ou les bornes se rechargent (garage mixte : une
// voiture E85 et une electrique basculent selon le vehicule actif).
$('venergie').onchange = () => { majEnergie(); reglagesEcrits(); charger(); };
['vbatt', 'vconsoKwh', 'vkwdc', 'vkwac', 'vprise', 'vreservePct', 'vdepartPct'].forEach(id => $(id).onchange = () => { reglagesEcrits(); rendu(); });
$('vehEstimerElec').onclick = () => {
  const r = estimerConsoElec($('vtype').value, $('vcat').value);
  const src = $('consoSourceElec');
  src.hidden = false;
  if(!r){ src.textContent = 'Pas d\'ordre de grandeur pour ce type — saisissez la conso que votre voiture affiche.'; return; }
  $('vconsoKwh').value = r.conso;
  src.textContent = `≈ ${String(r.conso).replace('.', ',')} kWh/100 — ${r.source}. Modifiable.`;
  reglagesEcrits(); rendu();
};
// Chips de puissance (garage et assistant) : un toucher regle le champ voisin ; « autre » y mene.
document.querySelectorAll('.chips-kw').forEach(g => {
  const inp = $(g.dataset.cible);
  const maj = () => g.querySelectorAll('[data-kw]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kw !== 'autre' && inp.value !== '' && +b.dataset.kw === +inp.value)));
  g.querySelectorAll('[data-kw]').forEach(b => b.onclick = () => {
    if(b.dataset.kw === 'autre'){ inp.focus(); inp.select(); return; }
    inp.value = b.dataset.kw; maj(); inp.dispatchEvent(new Event('change'));
  });
  inp.addEventListener('input', maj);
  g.addEventListener('maj', maj);
  maj();
});
// Estimer la conso d'apres le type, la categorie et le premier carburant coche (src/conso.js).
$('vehEstimer').onclick = () => {
  const carb = choix()[0];
  const r = carb ? estimerConso($('vtype').value, $('vcat').value, carb) : null;
  const src = $('consoSource');
  src.hidden = false;
  if(!r){
    src.textContent = carb ? 'Pas d\'estimation pour cette combinaison — saisissez la conso que vous connaissez (les hybrides n\'ont pas d\'estimation).'
                           : 'Cochez d\'abord un carburant.';
    return;
  }
  $('conso').value = r.conso;
  src.textContent = `≈ ${String(r.conso).replace('.', ',')} L/100 — ${r.source}. Modifiable.`;
  majEstimations(); reglagesEcrits(); rendu();
};
// Partage : lien d'import de la fiche (#veh=…) ou du plan (#trajet=…&veh=…). Partage natif
// (navigator.share) quand il existe, sinon copie dans le presse-papiers et « Lien copié ».
const lienBase = () => location.href.split('#')[0];
// Format du lien : src/partage.js (historique Nom|carburants|conso|cuve|reserve|autonomie, plus un
// 7e champ E… pour un vehicule electrique ; un lien ancien reste lu).
const vehParam = v => vehVersParam(v);
async function partagerLien(url, texte, elMsg){
  if(navigator.share){
    try{ await navigator.share({title: 'ViaMinus', text: texte, url}); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  try{
    await navigator.clipboard.writeText(url);
    majEtat('lien copié');
    if(elMsg){ elMsg.textContent = 'Lien copié'; setTimeout(() => { if(elMsg.textContent === 'Lien copié') elMsg.textContent = ''; }, 4000); }
  }catch(e){ prompt('Copiez le lien :', url); }
}
$('vehPartager').onclick = () => {
  reglagesEcrits();
  const v = REGL.vehicules[REGL.vehActif];
  partagerLien(`${lienBase()}#veh=${vehParam(v)}`, `Fiche véhicule ${v.nom} — ViaMinus`, $('garageMsg'));
};
$('partagerPlan').onclick = () => {
  if(!ROUTE || !TRAJET) return;
  partagerLien(lienTrajet(), `Plan de pleins ${TRAJET.dep} ${TRAJET.ar ? '⇄' : '→'} ${TRAJET.arr} — ViaMinus`);
};

// Import par l'URL — sert aussi a PARTAGER :
//   #veh=Nom|e85+e10|conso|cuve|reserve[|autonomie][|E…]   fiche vehicule (format historique inchange ;
//       7e champ E<batterie>,<kWh/100>,<kW DC>,<kW AC>,<prise>,<reserve %>,<depart %> pour un
//       vehicule electrique — lecture et ecriture dans src/partage.js)
//   #trajet=<depart>|<arrivee>|<couloir>|<options>    plan (depart vide = « Ma position »,
//       JAMAIS une coordonnee ; couloir 1/2/5/10/20 ; options = lettres p (sans peage),
//       r (aller-retour)) ; peut etre suivi de &veh=… : la fiche est traitee AVANT le trajet,
//       pour que le plan se calcule sur ce vehicule.
//   #pos=lat,lon                                        repere sans geolocalisation
// Les valeurs sont decodees puis traitees en TEXTE (.value, textContent), jamais en HTML.
// La lecture est dans src/partage.js (lireFragment, testee) : elle comprend aussi un lien dont
// les « | » ont ete encodes en %7C par une messagerie, et rend les parametres illisibles.
// Le hash est efface (history.replaceState) une fois lu ; un lien illisible, meme en partie,
// est annonce sous l'etat et son hash reste en place. IMPORT_HASH (qui retient l'assistant de
// premier lancement) n'est leve que si une fiche ou un trajet a vraiment ete lu.
let IMPORT_HASH = false, TRAJET_IMPORT = null;
(function(){
  if(!location.hash.slice(1)) return;
  const lien = lireFragment(location.hash, DEFAUT);
  // #pos=lat,lon : pose le repere sans geolocalisation — indispensable en
  // file:// (Firefox reserve la geolocalisation aux contextes securises).
  if(lien.pos) setTimeout(() => situer(lien.pos.lat, lien.pos.lon, 'Point de repère'), 0);
  const v = lien.veh;
  let annonce = '';
  if(v){
    // Jamais d'ecrasement : une fiche du garage qui porte le meme nom (« Véhicule 1 » est le nom
    // par defaut) et differe reste intacte, la fiche recue est rangee sous un nom libre et
    // annoncee ; identique, elle est seulement activee (fusionnerImport, src/partage.js).
    const f = fusionnerImport(REGL.vehicules, v);
    REGL.vehicules = f.vehicules;
    REGL.vehActif = f.actif;
    appliquerVeh(); majSelectVeh(); reglagesEcrits();
    if(f.cas === 'renommee') annonce = `Fiche importée : « ${f.nom} » (votre fiche « ${v.nom} » est conservée).`;
    IMPORT_HASH = true;
  }
  const t = lien.trajet;
  if(t){
    $('depart').value = t.dep || 'Ma position'; // vide = « Ma position » (le repere courant)
    $('arrivee').value = t.arr;
    if(t.couloir){ $('couloir').value = t.couloir; REGL.couloir = t.couloir; }
    $('sansPeage').checked = t.sansPeage;
    $('allerRetour').checked = t.ar;
    // Depart « Ma position » : on attend la reponse de la geolocalisation avant de calculer.
    TRAJET_IMPORT = {attendPosition: !t.dep || /^ma position$/i.test(t.dep)};
    IMPORT_HASH = true;
  }
  const illisible = messageLienIllisible(lien.erreurs);
  if(annonce || illisible){
    // Texte (jamais HTML) ; l'annonce seule est une information, pas une erreur.
    $('lienMsg').textContent = [annonce, illisible].filter(Boolean).join(' ');
    if(!illisible) $('lienMsg').className = 'etat';
    deplier('moitie');   // au telephone, le message serait sous le bord de la feuille repliee
  }
  if(!illisible && (lien.pos || v || t)) history.replaceState(null, '', location.pathname);
})();
$('sansCher').onchange = () => { reglagesEcrits(); rendu(); };

// ---------- Chargement des prix ----------
const SEL = encodeURIComponent("__SELECT__");
const URL_API = "__API__";
const PLAFOND = 400;      // stations chargees au maximum pour une emprise donnee
let tronque = 0, seq = 0, minuteur = null, majCompte = () => {};
// Etat (region aria-live) : fraicheur des prix + compteur ; un message ponctuel
// (adresse copiee, position refusee) prend la place le temps de quelques secondes.
let etatPrix = 'chargement…', etatTempo = null;
// Hors ligne (30/10/2026) : le service worker (pwa/sw.js) sert la derniere reponse en cache quand
// le reseau se tait et la date par l'en-tete x-viaminus-date ; la page la note pour l'etat et le
// bandeau « Hors ligne — prix du … ». Vide a chaque chargement : une reponse en direct efface tout.
let REPLI_DATES = [];
const noterRepli = r => { const d = r && r.headers && r.headers.get('x-viaminus-date'); if(d) REPLI_DATES.push(d); return r; };
const quandRepli = () => {
  const t = REPLI_DATES.map(d => Date.parse(d)).filter(Number.isFinite);
  return t.length ? new Date(Math.min(...t)).toLocaleString('fr-FR', {weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';
};
function majEtat(ponctuel){
  const el = $('etat');
  if(ponctuel){
    el.innerHTML = ponctuel;
    clearTimeout(etatTempo); etatTempo = setTimeout(() => majEtat(), 4000);
    return;
  }
  const c = $('compte').textContent;
  el.innerHTML = etatPrix + (c ? ' · ' + esc(c) : '');
}

// Les stations suivent l'emprise de la carte : chaque deplacement ou dezoom
// relance une requete bornee par la bbox visible. Le compteur `seq` annule les
// reponses d'une emprise devenue obsolete (sinon un lent revient apres un rapide
// et repeint la mauvaise zone).
// Filtre serveur adosse a la vue : sur une grande emprise, le plafond doit etre
// depense sur des stations utiles. En « mes 2 pleins », l'E85 est le carburant
// rare (27 stations sur 60 dans la zone de test) : c'est lui qui borne.
function clauseVue(){
  return choix().map(k => k === 'spmin'
    ? " and (e10_prix is not null or sp95_prix is not null or sp98_prix is not null)"
    : ` and ${k}_prix is not null`).join('');
}

// ---------- Espagne (src/es.js) ----------
// Quand l'emprise (ou les emprises du couloir du trajet) croise une province espagnole, ses
// stations sont chargees PAR PROVINCE (FiltroProvincia/{id}, quelques centaines de ko), au plus
// ES_MAX_PROVINCES a la fois (au-dela : « zoomez »), cache memoire ES_CACHE_MS par province,
// abandon des reponses obsoletes par `seq` comme le flux francais. Elles entrent dans DATA
// avec exactement la forme des francaises (normaliserStationES) : liste, carte, fiche, tri,
// plafond commun et plan de pleins (plan.js, inchange) ne font aucune difference.
// Echec reseau : bandeau discret dans l'etat (« prix espagnols indisponibles »), le reste continue.
const ES_CACHE = new Map();   // id de province -> {t, stations normalisees}
let ES_KO = false;            // dernier chargement espagnol en echec (au moins une province)
let ES_INFO = '';             // compteur : provinces chargees, « zoomez »
const titreES = n => String(n).toLowerCase().replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
async function chargerProvinceES(id){
  const c = ES_CACHE.get(id);
  if(c && Date.now() - c.t < ES_CACHE_MS) return c.stations;
  const r = await fetch(ES_URL + id, {signal: AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  noterRepli(r);
  const j = await r.json();
  if(!j || j.ResultadoConsulta !== 'OK' || !Array.isArray(j.ListaEESSPrecio)) throw new Error('réponse espagnole inattendue');
  // Stations ignorees et comptees : coordonnees manquantes (absentes, a 0, hors de l'Espagne —
  // vu dans le fichier complet du 30/10/2026) et vente reservee (Tipo Venta != P).
  const ignorees = {coords: 0, reservees: 0};
  const stations = j.ListaEESSPrecio.map(o => normaliserStationES(o, j.Fecha, {ignorees})).filter(Boolean);
  ES_CACHE.set(id, {t: Date.now(), stations, ignorees});
  return stations;
}
// « 3 sans position ignorées » sur les provinces chargees (cache compris).
function ignoreesES(ids){
  const n = ids.reduce((t, id) => t + ((ES_CACHE.get(id) || {}).ignorees || {}).coords || 0, 0);
  return n ? ` · ${n} sans position ignorée${n > 1 ? 's' : ''}` : '';
}
// Copie par chargement (le cache reste vierge) : distance au repere du moment, corrections locales.
const copieES = s => appliquerCorr(Object.assign({}, s,
  {prix: Object.assign({}, s.off.prix), maj: Object.assign({}, s.off.maj), corr: {}, d: dist(s.la, s.lo)}));
async function chargerES(zones){
  ES_KO = false; ES_INFO = '';
  const cumul = new Map();   // recouvrement cumule sur toutes les zones (couloir en plusieurs emprises)
  zones.forEach(z => recouvrementsProvinces(ES_PROVINCIAS, z).forEach(r => {
    const c = cumul.get(r.id) || {id: r.id, aire: 0, douteuse: r.douteuse};
    c.aire += r.aire; cumul.set(r.id, c);
  }));
  if(!cumul.size) return [];
  // Emprise trop large (France entiere) : l'Espagne n'est pas chargee, l'ecran le dit.
  if(zones.some(z => z.n - z.s > ES_EMPRISE_MAX)){ ES_INFO = 'Espagne : zoomez pour charger les prix espagnols'; return []; }
  const ids = [...cumul.values()].sort((a, b) => (a.douteuse - b.douteuse) || (b.aire - a.aire)).map(c => c.id);
  const pris = ids.slice(0, ES_MAX_PROVINCES);
  const noms = pris.map(id => esc(titreES(ES_PROVINCIAS[id][0]))).join(', ');
  ES_INFO = ids.length > pris.length
    ? `Espagne : ${pris.length} provinces chargées sur ${ids.length} (${noms}) — zoomez pour les autres`
    : `Espagne : ${noms}`;
  const res = await Promise.allSettled(pris.map(chargerProvinceES));
  ES_KO = res.some(r => r.status === 'rejected');
  ES_INFO += ignoreesES(pris);
  const vus = new Set();
  return res.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(s => zones.some(z => dansEmprise(z, s.la, s.lo)) && !vus.has(s.id) && vus.add(s.id))
    .map(copieES);
}
// Fusion : memes objets, meme tableau. Plafond commun (PLAFOND par zone) : au-dela, les
// espagnoles les plus eloignees du repere sont laissees et comptees dans `tronque`.
function fusionnerES(fr, es, nZones){
  if(!es.length) return fr;
  const ids = new Set(fr.map(s => s.id));
  const place = Math.max(0, PLAFOND * nZones - fr.length);
  const tri = es.filter(s => !ids.has(s.id)).sort((a, b) => a.d - b.d);
  tronque += Math.max(0, tri.length - place);
  return fr.concat(tri.slice(0, place));
}
const etatES = () => ES_KO ? ' · <span class="ko">prix espagnols indisponibles</span>' : '';

// ---------- Signalements partagés « pompe vide » (src/signalements.js, partie 2, 30/10/2026) ----------
// Le flux officiel ne sait pas qu'une pompe est vide ; les personnes sur place, si (Lodeve, 26/10/2026).
// Un service minimal et anonyme (Cloudflare Worker + base D1, branche claude/signalements-worker,
// worker/README.md) recoit « Pompe vide » / « De nouveau dispo » et sert l'agregat par station et
// carburant sur 48 h. Hote configure A LA GENERATION (generate.py --signalements-url, jeton
// __SIGNALEMENTS_URL__) : vide = fonction desactivee, aucune requete, aucun hote dans la CSP, rien
// d'affiche. Anonymat : la page n'envoie QUE l'identifiant de la station, le carburant et l'etat —
// jamais la position, jamais le garage, jamais d'identifiant d'appareil (le service ne pose aucun
// cookie). Echec reseau = silence : les badges s'effacent, le reste ne change pas.
const SIGNALEMENTS_URL = "__SIGNALEMENTS_URL__";
const SIG_ACTIF = /^https:\/\//.test(SIGNALEMENTS_URL);
const SIG_CACHE = new Map();   // id de station -> {t, etat} ; etat = {e85: {vide, ok, dernier}, …} ou null (rien sur 48 h)
let SIG_JOURNAL = sigJournalLu();   // {"<station>|<carburant>": t} : un signalement par 6 h (quota du service)
function sigJournalLu(){
  try{ return purgerJournal(JSON.parse(localStorage.getItem(CLE_SIGNALEMENTS)), Date.now()); }
  catch(e){ return {}; }
}
function sigJournalEcrit(j){
  SIG_JOURNAL = j;
  try{ localStorage.setItem(CLE_SIGNALEMENTS, JSON.stringify(j)); }catch(e){ /* stockage refuse */ }
}
// Agregat connu d'une station, quelle que soit sa fraicheur (un agregat de deux minutes vaut mieux
// que rien ; le cache ne borne que les requetes) ; null sinon.
const sigEtat = s => { const c = SIG_CACHE.get(s.id); return c ? c.etat : null; };
const sigDe = (s, k) => { const e = sigEtat(s); return e && e[k] && typeof e[k] === 'object' ? e[k] : null; };
// Agregats des stations affichees et des candidates du plan (DATA), par lots de 400, cache 60 s.
// `mien` = numero du chargement (seq) : une reponse d'une emprise depassee est rangee au cache mais
// ne redessine rien, comme pour le flux. Echec (reseau, 4xx, 5xx, JSON illisible) : silence, nouvel
// essai au prochain chargement. Jamais appele quand l'URL n'est pas configuree.
async function chargerSignalements(stations, mien){
  if(!SIG_ACTIF) return;
  const t = Date.now();
  const lots = lotsIds(stations.map(s => s.id).filter(id => { const c = SIG_CACHE.get(id); return !c || t - c.t >= SIG_CACHE_MS; }));
  if(!lots.length) return;
  let change = false;
  await Promise.all(lots.map(async lot => {
    try{
      const r = await fetch(`${SIGNALEMENTS_URL}/v1/etat?ids=${lot.join(',')}`, {signal: AbortSignal.timeout(10000)});
      if(!r.ok) return;
      const j = await r.json();
      if(!j || typeof j !== 'object' || Array.isArray(j)) return;
      const t2 = Date.now();
      lot.forEach(id => {
        const e = Object.prototype.hasOwnProperty.call(j, id) && j[id] && typeof j[id] === 'object' ? j[id] : null;
        const avant = SIG_CACHE.get(id);
        if(e || (avant && avant.etat)) change = true;
        SIG_CACHE.set(id, {t: t2, etat: e});
      });
    }catch(e){ /* service muet : rien a afficher, rien ne casse */ }
  }));
  if(change && mien === seq) rendu();
}
// Badge sobre de la liste et des cartes : « E85 signalé vide il y a 2 h (3) » (rouge) ou « E85 de
// nouveau dispo il y a 40 min » (vert) — couleur ET texte, icone Lucide ; un « vide » prime.
function sigBadge(s, refs){
  if(!SIG_ACTIF) return '';
  const t = Date.now();
  const l = refs.map(k => ({k, a: sigDe(s, k)})).filter(o => o.a && libelle(o.a, t));
  if(!l.length) return '';
  const o = l.find(x => +x.a.vide >= 1) || l[0], vide = +o.a.vide >= 1;
  return `<span class="badge badge-sig ${vide ? 'vide' : 'dispo'}">${ico(vide ? 'alerte' : 'coche')} ${COURT[o.k] || esc(o.k)} ${esc(libelle(o.a, t))}</span> `;
}
// Fiche station, sous chaque carburant vendu : l'etat partage, puis « Pompe vide » et « De nouveau
// dispo » (44 px), desactives avec le delai restant quand ce carburant a deja ete signale ici
// depuis moins de 6 h (journal local, meme regle que le quota du service).
function sigLigne(s, k, l){
  if(!SIG_ACTIF || !idSignalable(s.id) || !carburantSignalable(k)) return '';
  const t = Date.now(), a = sigDe(s, k), txt = a ? libelle(a, t) : '', vide = !!a && +a.vide >= 1;
  const reste = delaiRestant(SIG_JOURNAL, s.id, k, t);
  const dis = reste > 0 ? ' disabled' : '';
  return `<span class="sig-ligne">` +
    (txt ? `<span class="sig-lbl ${vide ? 'vide' : 'dispo'}">${ico(vide ? 'alerte' : 'coche')} ${esc(txt)}</span>` : '') +
    `<span class="sig-btns">` +
    `<button type="button" class="sig-btn vide" data-k="${k}" data-etat="vide"${dis} aria-label="Signaler la pompe ${l} vide">${ico('alerte')} Pompe vide</button>` +
    `<button type="button" class="sig-btn ok" data-k="${k}" data-etat="ok"${dis} aria-label="Signaler ${l} de nouveau disponible">${ico('coche')} De nouveau dispo</button></span>` +
    (reste > 0 ? `<span class="sig-attente">déjà signalé depuis cet appareil · de nouveau possible ${libelleDelai(reste)}</span>` : '') +
    `</span>`;
}
// Confirmation ou erreur, montree dans la fiche de CETTE station (elle survit au redessin de la fiche).
let SIG_MSG = null, sigMsgTempo = null;
function sigMessage(s, texte, ko){
  SIG_MSG = {id: s.id, texte, ko};
  clearTimeout(sigMsgTempo);
  if(!ko) sigMsgTempo = setTimeout(() => { SIG_MSG = null; sigMessageRendu(); }, 8000);
  sigMessageRendu();
}
function sigMessageRendu(){
  const el = $('fsSigMsg');
  const m = SIG_MSG && STATION && SIG_MSG.id === STATION.id ? SIG_MSG : null;
  el.hidden = !m;
  el.textContent = m ? m.texte : '';
  el.classList.toggle('ko', !!(m && m.ko));
}
// Envoi d'un signalement : POST {station, carburant, etat} — rien d'autre. 201 : agregat de la
// station range au cache, journal local note, merci discret ; 429 : message humain (quota du
// service) ; autre echec : message. Dans tous les cas la correction LOCALE suit votre observation
// (« vide » : la station est grisee pour vous comme avec « Corriger », « ok » : elle revient) —
// corriger() redessine la carte, la liste et rouvre la fiche.
async function signaler(s, k, etat, bouton){
  if(!SIG_ACTIF || !peutSignaler(SIG_JOURNAL, s.id, k, Date.now())) return;
  $('fsCarbs').querySelectorAll('.sig-btn').forEach(b => { b.disabled = true; });
  sigMessage(s, 'envoi du signalement…', false);
  let r = null;
  try{
    r = await fetch(`${SIGNALEMENTS_URL}/v1/signalement`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({station: s.id, carburant: k, etat}), signal: AbortSignal.timeout(10000)});
  }catch(e){ r = null; }
  const nom = COURT[k] || k;
  if(r && r.status === 201){
    let j = null;
    try{ j = await r.json(); }catch(e){ j = null; }
    if(j && typeof j === 'object' && !Array.isArray(j))
      SIG_CACHE.set(s.id, {t: Date.now(), etat: j[s.id] && typeof j[s.id] === 'object' ? j[s.id] : null});
    sigJournalEcrit(noterSignalement(SIG_JOURNAL, s.id, k, Date.now()));
    sigMessage(s, etat === 'vide' ? `Merci : pompe ${nom} signalée vide, partagée avec les autres utilisateurs pendant 48 h.`
                                  : `Merci : ${nom} signalé de nouveau disponible, partagé avec les autres utilisateurs.`, false);
  }else if(r && r.status === 429){
    sigMessage(s, `Gardé sur cet appareil, mais pas partagé : trop de signalements pour le moment (au plus 5 par heure, et un par station et carburant toutes les 6 h). Réessayez plus tard.`, true);
  }else if(r){
    sigMessage(s, `Gardé sur cet appareil, mais pas partagé : le service a refusé le signalement (erreur ${r.status}).`, true);
  }else{
    sigMessage(s, 'Gardé sur cet appareil, mais pas partagé : service de signalements injoignable. Réessayez plus tard.', true);
  }
  if(etat === 'vide' && !signaleVide(s, k)) corriger(s, [k], {vide: true});
  else if(etat === 'ok' && signaleVide(s, k)) corriger(s, [k], null);
  else{
    rendu();
    if(STATION && STATION.id === s.id && !$('ficheStation').hidden)
      ouvrirStation({s: DATA.find(x => x.id === s.id) || RUPTURES.find(x => x.id === s.id) || s, v: null});
  }
}
// Option du plan : « Éviter les pompes signalées vides (12 h) », activee par defaut, visible
// seulement quand le service est configure (sans lui, rien a eviter).
$('eviterVidesLbl').hidden = !SIG_ACTIF;
if(REGL.eviterVides === false) $('eviterVides').checked = false;
$('eviterVides').onchange = () => { REGL.eviterVides = $('eviterVides').checked; reglagesBruts(); rendu(); };
const eviterVidesActif = () => SIG_ACTIF && $('eviterVides').checked;

// Stations en rupture du carburant choisi. Le flux vide le prix pendant la rupture :
// la station sort de la requete principale et semblait « oubliee ». Constate le
// 26/10/2026 : Le Bosc (A75), E85 en rupture depuis le 04/09, Waze affichait encore
// son prix de mars (0,714). On les redemande a part pour les montrer en gris avec la
// date ; elles restent hors classement, hors couleurs et hors plan.
// Seulement les ruptures TEMPORAIRES de moins de 90 jours : le flux garde des
// « temporaires » ouvertes depuis 2017 (5 230 ruptures E85 au 26/10/2026, dont 4 542
// definitives et 377 temporaires recentes) — au-dela, la station ne vend plus ce
// carburant et la montrer ne ferait que du bruit.
const RUPT_JOURS = 90;
const seuilRupture = () => new Date(Date.now() - RUPT_JOURS*864e5).toISOString().slice(0,10);
const recente = (s, k, seuil) => s.kotype[k] === 'temporaire' && s.depuis[k] >= seuil;
const SEL_KO = encodeURIComponent("__SELECT__" +
  FUELS.map(([k]) => `,${k}_rupture_debut,${k}_rupture_type`).join(''));
const kosVoulus = sel => [...new Set(sel.flatMap(k => k === 'spmin' ? SP.map(([kk]) => kk) : [k]))];
async function chargerRuptures(zones, sel){
  const ks = kosVoulus(sel), seuil = seuilRupture();
  if(!ks.length) return [];
  const clause = ' and (' + ks.map(k =>
    `(${k}_rupture_type='temporaire' and ${k}_rupture_debut >= date'${seuil}')`).join(' or ') + ')';
  const lots = await Promise.all(zones.map(async z => {
    const w = encodeURIComponent(`in_bbox(geom, ${z.s.toFixed(5)}, ${z.w.toFixed(5)}, ` +
                                 `${z.n.toFixed(5)}, ${z.e.toFixed(5)})` + clause);
    const r = await fetch(`${URL_API}?where=${w}&select=${SEL_KO}&limit=100`, {signal: AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    noterRepli(r);
    return (await r.json()).results;
  }));
  const vus = new Set();
  return normalise(lots.flat().filter(r => !vus.has(r.id) && vus.add(r.id)));
}

// Decoupe le trace en emprises courtes. Sur un long trajet, une seule bbox
// englobante couvre un quart de la France : le plafond tombait alors sur des
// stations tirees au hasard par l'API et le couloir revenait presque vide
// (constate sur un trajet de ~600 km, ~3 700 stations dans l'emprise).
function emprisesTrace(margeKm){
  const dLat = margeKm/110.57;
  const cases = [];
  let cur = null;
  for(const [lon, lat] of ROUTE){
    const dLon = margeKm/(111.32*Math.cos(lat*Math.PI/180));
    if(!cur) cur = {s:lat, n:lat, w:lon, e:lon};
    const s2 = Math.min(cur.s,lat), n2 = Math.max(cur.n,lat);
    const w2 = Math.min(cur.w,lon), e2 = Math.max(cur.e,lon);
    if((n2-s2) > 1.2 || (e2-w2) > 1.2){        // ~130 km de cote au maximum
      cases.push({s:cur.s-dLat, n:cur.n+dLat, w:cur.w-dLon, e:cur.e+dLon});
      cur = {s:lat, n:lat, w:lon, e:lon};
    }else{
      cur = {s:s2, n:n2, w:w2, e:e2};
    }
  }
  if(cur){
    const dLon = margeKm/(111.32*Math.cos(cur.n*Math.PI/180));
    cases.push({s:cur.s-dLat, n:cur.n+dLat, w:cur.w-dLon, e:cur.e+dLon});
  }
  return cases;
}

async function charger(){
  const mien = ++seq;
  if(estElec()){
    // Vehicule electrique (phase 2) : aucun prix carburant a charger, les bornes remplacent les
    // stations (chargerBornes, par departement) ; la liste et le plan se redessinent a leur arrivee.
    DATA = []; RUPTURES = []; tronque = 0;
    etatPrix = IRVE_ETAT === 'indisponible' ? '<span class="ko">bornes indisponibles hors ligne</span>' : 'bornes de recharge · Base nationale des IRVE';
    rendu();
    chargerBornes();
    return;
  }
  // Hors itineraire : l'emprise de l'ecran (validee, voir emprise()). En itineraire :
  // une suite d'emprises courtes le long du trace, pour ne rien manquer sur un long trajet.
  const zones = ROUTE ? emprisesTrace(20)   // toujours le couloir maxi : la largeur
                      : [emprise()];
  // choisie filtre localement, et le comparatif par largeur se fait sans recharger.
  const clause = clauseVue();
  // Accessoire et en parallele : une panne ici ne bloque jamais les prix.
  const ko = chargerRuptures(zones, choix()).catch(() => []);
  // Espagne, en parallele et a part : une panne la ne touche ni les prix francais ni le repli.
  REPLI_DATES = [];
  const es = chargerES(zones).catch(() => { ES_KO = true; return []; });
  etatPrix = 'chargement…'; majEtat();
  try{
    let rows = [], reste = 0;
    for(const z of zones){
      const bbox = encodeURIComponent(
        `in_bbox(geom, ${z.s.toFixed(5)}, ${z.w.toFixed(5)}, ` +
        `${z.n.toFixed(5)}, ${z.e.toFixed(5)})` + clause);
      let off = 0, tot = 1;
      while(off < tot && off < PLAFOND){
        const r = await fetch(`${URL_API}?where=${bbox}&select=${SEL}&limit=100&offset=${off}`, {signal: AbortSignal.timeout(20000)});
        if(!r.ok) throw new Error('HTTP '+r.status);
        noterRepli(r);
        const j = await r.json();
        if(mien !== seq) return;
        tot = j.total_count; rows = rows.concat(j.results); off += 100;
      }
      reste += Math.max(0, tot - Math.min(tot, PLAFOND));
    }
    const vus = new Set();
    rows = rows.filter(r => !vus.has(r.id) && vus.add(r.id));   // emprises jointives
    tronque = reste;
    const esStations = await es;
    if(mien !== seq) return;
    DATA = fusionnerES(normalise(rows), esStations, zones.length);
    if(ROUTE) DATA = DATA.filter(situerSurTrace);
    const kos = await ko;
    if(mien !== seq) return;
    RUPTURES = ROUTE ? kos.filter(situerSurTrace) : kos;
    const repli = quandRepli();
    if(repli){   // au moins une reponse vient du cache du service worker : prix d'une date passee
      etatPrix = '<span class="ko">hors ligne</span> — prix du ' + esc(repli) + etatES();
      montrerHorsLigne('Hors ligne — prix du ' + repli);
    }else{
      etatPrix = 'prix en direct · ' + new Date().toLocaleString('fr-FR',
        {weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) + etatES();
      cacherHorsLigne();
    }
  }catch(e){
    if(mien !== seq) return;
    const vis = emprise();
    tronque = 0;
    // Flux francais muet : snapshot de repli ; les prix espagnols, s'ils sont arrives, restent.
    const esStations = await es;
    if(mien !== seq) return;
    DATA = fusionnerES(normalise(SNAPSHOT).filter(s => dansEmprise(vis, s.la, s.lo)), esStations, zones.length);
    RUPTURES = [];
    etatPrix = '<span class="ko">hors ligne</span> — relevé du ' + SNAP_DATE + etatES();
    if(navigator.onLine === false) montrerHorsLigne('Hors ligne — aucun prix récent en mémoire pour cette zone');
  }
  chargerSignalements(DATA, mien);   // agregats « pompe vide » : redessine a leur arrivee (si l'emprise n'a pas change)
  rendu();
  chargerBornes();   // vehicule thermique : seulement si l'option « Afficher les bornes » est cochee
}

// Evenements de la carte : branches par initialiserCarte() (voir brancherCarte, plus bas).
function brancherDeplacements(){
  map.on('moveend', () => {
    if(ROUTE){ rendu(); return; }      // couloir deja charge : simple refiltrage
    clearTimeout(minuteur);
    minuteur = setTimeout(charger, 400);
  });
  // La carte recoit (enfin) une taille : si le dernier chargement s'est fait sur une
  // emprise de secours, on recharge sur la vraie (cf. emprise()).
  map.on('resize', () => { if(empriseProvisoire && !ROUTE){ clearTimeout(minuteur); minuteur = setTimeout(charger, 100); } });
}
$('couloir').onchange = () => { reglagesEcrits(); if(ROUTE) rendu(); };
$('aBord').onchange = () => { if(ROUTE) rendu(); };   // non memorise : propre a chaque depart
// L'unite (km ou litres), elle, est memorisee : on pense toujours dans la meme.
if(REGL.aBordUnite === 'l' || REGL.aBordUnite === 'km') $('aBordUnite').value = REGL.aBordUnite;
$('aBordUnite').onchange = () => { REGL.aBordUnite = $('aBordUnite').value; reglagesBruts(); if(ROUTE) rendu(); };
$('conso').onchange = $('cuve').onchange = $('autonomie').onchange =
$('reserve').onchange = () => { reglagesEcrits(); rendu(); };
['conso', 'cuve', 'autonomie'].forEach(id => $(id).addEventListener('input', majEstimations));
$('queUtiles').onchange = () => { reglagesEcrits(); rendu(); };
$('sansPeage').onchange = $('allerRetour').onchange = () => {
  reglagesEcrits();
  if(ROUTE) $('trajet').requestSubmit();
};

// ---------- Position et repere ----------
// Le centre suit l'appareil : la page reste juste pour qui la recoit, sans rien
// coder en dur de personnel. Le repere de secours ne sert que si la geoloc est
// refusee, indisponible ou trop lente.
let libelleRepere = 'Point de repère';
function situer(lat, lon, libelle, explicite){
  if(!coordsValides(lat, lon)) return;   // cf. coordsValides, en tete
  CENTRE = [lat, lon]; REPERE_REEL = true;
  libelleRepere = libelle;
  REGL.centre = [lat, lon]; reglagesEcrits();
  $('posMemo').hidden = false;
  if(repere){ repere.setLngLat([lon, lat]); elRepere.title = libelle + " — les distances partent d'ici"; }
  // ~5 km autour du point ; moveend -> rechargement. Un trajet affiche n'est pas quitte
  // par une geolocalisation automatique (trajet importe par l'URL, par exemple).
  if(CARTE && (explicite || !ROUTE)) CARTE.aller(CENTRE, 13, explicite);
  else if(!CARTE) charger();
  chargerReferentiel().then(rendu).catch(() => {});   // le secteur suit le nouveau centre
  // Le titre suit la position (nom de commune via la Base Adresse Nationale) :
  // la page peut etre partagee, la commune du snapshot ne doit pas rester figee.
  fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`)
    .then(r => r.json())
    .then(j => {
      const c = j.features?.[0]?.properties?.city;
      if(c){
        $('lieu').textContent = ' · ' + c;
        document.title = 'ViaMinus — ' + c;
      }
    }).catch(() => {});
}
// localiser(auto, apres) : apres(ok) est appele a l'issue (succes ou refus) — l'assistant
// et le trajet importe « depuis ma position » s'en servent.
function localiser(auto, apres){
  if(!navigator.geolocation){
    if(!auto) majEtat('géolocalisation non disponible');
    if(apres) apres(false);
    return;
  }
  majEtat('localisation…');
  $('maposition').classList.add('actif');
  navigator.geolocation.getCurrentPosition(
    pos => { $('maposition').classList.remove('actif');
             situer(pos.coords.latitude, pos.coords.longitude, 'Ma position', !auto);
             if(apres) apres(true); },
    ()  => { $('maposition').classList.remove('actif');
             majEtat(Array.isArray(REGL.centre)
               ? 'position refusée — repère mémorisé utilisé'
               : 'position refusée — appui long sur la carte pour poser le repère');
             // Refus au chargement : le premier chargement est deja en cours, rien a relancer.
             if(!auto && !apres) ouvrirFeuille('menuPosition', $('maposition'));
             if(apres) apres(false); },
    {enableHighAccuracy: false, timeout: 8000, maximumAge: 300000});
}
$('maposition').onclick = () => localiser(false);
$('posMoi').onclick = () => { fermerFeuille(); localiser(false); };
$('posMemo').onclick = () => {
  fermerFeuille();
  if(Array.isArray(REGL.centre)) situer(REGL.centre[0], REGL.centre[1], 'Point de repère', true);
};
$('posMemo').hidden = !Array.isArray(REGL.centre);
$('posAdresse').onsubmit = async e => {
  e.preventDefault();
  const q = $('posQ').value.trim();
  if(!q) return;
  try{
    const g = await geocoder(q);
    fermerFeuille();
    situer(g.lat, g.lon, g.label, true);
  }catch(err){ majEtat(esc(err.message)); }
};
$('optPosition').onclick = () => ouvrirFeuille('menuPosition', $('options'));
// Reticule : viser le repere au centre de la carte.
// reticule(on, apres) : apres() est appele une fois le repere pose (retour a l'assistant).
let APRES_RETICULE = null;
function reticule(on, apres){
  $('reticule').hidden = !on;
  APRES_RETICULE = on ? (apres || null) : null;
  if(on) poserCran('apercu');
}
$('posCarte').onclick = () => { fermerFeuille(); if(CARTE) reticule(true); };
$('reticuleOk').onclick = () => {
  const c = map.getCenter();
  const apres = APRES_RETICULE;
  reticule(false);
  situer(c.lat, c.lng, 'Point de repère', true);
  if(apres) apres();
};
$('reticuleNon').onclick = () => reticule(false);
// Appui long (tactile) ou clic droit (bureau) sur la carte = poser le repere.
// Chrome Android emet aussi contextmenu sur l'appui long : on dedoublonne dans le temps.
let dernierRepere = 0;
function poserRepere(ll){
  if(Date.now() - dernierRepere < 1000) return;
  dernierRepere = Date.now();
  if(navigator.vibrate) navigator.vibrate(15);
  situer(ll.lat, ll.lng, 'Point de repère', true);
}
function brancherCarte(){
  brancherDeplacements();
  map.on('contextmenu', e => { e.preventDefault(); poserRepere(e.lngLat); });
  const cc = map.getCanvasContainer();
  let minuteurAppui = null, p0 = null;
  const annuler = () => { clearTimeout(minuteurAppui); minuteurAppui = null; };
  cc.addEventListener('touchstart', e => {
    if(e.touches.length !== 1) return annuler();
    p0 = [e.touches[0].clientX, e.touches[0].clientY];
    minuteurAppui = setTimeout(() => {
      minuteurAppui = null;
      const r = cc.getBoundingClientRect();
      poserRepere(map.unproject([p0[0] - r.left, p0[1] - r.top]));
    }, 600);
  }, {passive: true});
  cc.addEventListener('touchmove', e => {
    if(minuteurAppui && p0 && Math.hypot(e.touches[0].clientX - p0[0], e.touches[0].clientY - p0[1]) > 10) annuler();
  }, {passive: true});
  cc.addEventListener('touchend', annuler, {passive: true});
  cc.addEventListener('touchcancel', annuler, {passive: true});
  // Un geste sur la carte referme la recherche ouverte (mobile).
  map.on('dragstart', () => rechercheOuverte(false));
  map.on('click', () => rechercheOuverte(false));
}

// ---------- Itineraire ----------
// Geocodage : Base Adresse Nationale. Trace : Geoplateforme IGN (bdtopo-osrm).
// Les deux sont publics, sans cle, et autorisent l'appel depuis un fichier local.
const BAN = 'https://api-adresse.data.gouv.fr/search/';
const ITI = 'https://data.geopf.fr/navigation/itineraire';
// Secours, constates le 24/10/2026 (la Geoplateforme repondait 404 sur TOUTES ses ressources
// d'itineraire, geocodage BAN a 8 s) : geocodage porte par la Geoplateforme (meme format que
// la BAN), trace Valhalla public de FOSSGIS (OpenStreetMap, Allemagne, sans cle, CORS ouvert).
// Chaque appel est borne a DELAI : « calcul… » ne reste jamais affiche sans fin.
const GEOC = 'https://data.geopf.fr/geocodage/search/';
const ITI_SECOURS = 'https://valhalla1.openstreetmap.de/route';
const DELAI = 20000;
let MOTEUR = 'ign';      // moteur du dernier trace reussi : 'ign' ou 'osm' (dit dans l'info trajet)
async function lireJson(u){
  const r = await fetch(u, {signal: AbortSignal.timeout(DELAI)});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
let ROUTE = null;        // [[lon,lat], …] simplifie ; en aller-retour : aller puis retour (boucle)
// Detour : a chaque trajet lance a la main, le plan affiche d'office le detour
// « conseillé » (voir rendu) ; un choix de l'utilisateur, ou un lien partage, le fige.
let DETOUR_AUTO = false;
const VALEUR_HEURE = 10;   // €/h : en dessous, un detour ne « vaut pas le coup » (repere affiche)
let I_RETOUR = null;     // indice du premier point du retour dans ROUTE (null : aller simple)
let ALLER_KM = null;     // km de l'arrivee sur la boucle (null : aller simple)
let ROUTE_AR = false;    // le trajet affiche est un aller-retour
let TRAJET = null;       // {dep, arr, km, min, ar, sansP, saisie} du trajet affiche (en-tete du plan)
let TRAJET_SANS_GESTE = false;   // calcul lance sans geste (import #trajet=) : pas d'animation
const infoT = $('infoTrajet');
// Un depart vide ou « Ma position » vaut le repere courant.
const maPosition = q => !q.trim() || /^ma position$/i.test(q.trim());
// Sans repere reel (localisation refusee ou absente, rien de memorise : premier lancement,
// lien partage ouvert par un tiers), « Ma position » n'est nulle part : on le dit, on ne
// part pas du centre de la France.
const POSITION_INCONNUE = 'Position inconnue : autorisez la localisation, posez un repère ou saisissez l\'adresse de départ.';

// Les 5 premiers resultats du geocodeur (`communes` : communes seulement). Geoplateforme
// d'abord (memes donnees BAN ; mesure le 24/10/2026 : 0,1 s contre 8 a 18 s pour api-adresse,
// en cours de migration vers la Geoplateforme), api-adresse en secours.
async function chercherLieux(q, communes){
  const qs = `?q=${encodeURIComponent(q)}&limit=5${communes ? '&type=municipality' : ''}`;
  let j;
  try{ j = await lireJson(GEOC + qs); }
  catch(e){
    try{ j = await lireJson(BAN + qs); }
    catch(e2){ throw new Error('géocodage indisponible'); }
  }
  return j.features;
}
async function geocoder(q){
  if(maPosition(q)){
    if(!REPERE_REEL) throw new Error(POSITION_INCONNUE);
    return {lon: CENTRE[1], lat: CENTRE[0], label: libelleRepere === 'Ma position' ? 'ma position' : 'le repère'};
  }
  // Le premier resultat n'est pas toujours le bon (« Narbonne » : une voie de Joue-les-Tours
  // avant la commune) : le choix est dans lieux.js (choisirLieu, pur, teste). Un nom que les
  // 5 premiers ne resolvent pas est recherche une seconde fois parmi les communes seules.
  // Espagne : les deux geocodeurs ne connaissent que la France ; les grandes villes et la
  // frontiere viennent de la table embarquee (es.js, villeES), consultee d'abord. Le reste est
  // refuse en clair plutot que route vers une voie homonyme (« Madrid », en Charente).
  let l = villeES(q) || choisirLieu(q, await chercherLieux(q));
  if(!l && nomSeul(q)) l = choisirLieu(q, await chercherLieux(q, true));
  if(!l) throw new Error(`lieu introuvable en France : « ${q.trim()} ». Précisez la commune ou le code postal ; en Espagne, seules les grandes villes et la frontière se saisissent (voir l'aide).`);
  return l;
}

// Distance d'un point au trace, en km (approximation plane : a cette echelle
// l'erreur est negligeable devant la largeur du couloir).
let KMS = null;   // abscisse cumulee (km) de chaque point du trace
function preparerKms(){
  KMS = kmsCumules(ROUTE);   // irve.js : meme approximation plane (111,32 km x cos(lat) / 110,57 km)
  ROUTE_N++;                  // les bornes en cache se resituent sur ce nouveau trace (voir renduElec)
}

// Positions d'une station le long du trace : ecart (km) et abscisse (km depuis le depart),
// pour chaque sens. En aller-retour, une station proche des deux sens apparait DEUX fois
// (km aller, km retour) : le plan la traite comme deux occurrences, numerotees a part.
// Seules les positions a moins de 20 km (couloir maximal) sont gardees.
function positionsTrace(la, lo){
  const kx = 111.32*Math.cos(la*Math.PI/180), ky = 110.57;
  const sens = I_RETOUR != null ? [[1, I_RETOUR], [I_RETOUR + 1, ROUTE.length]] : [[1, ROUTE.length]];
  const res = [];
  for(const [de, a] of sens){
    let best = Infinity, km = 0;
    for(let i = de; i < a; i++){
      const ax=(ROUTE[i-1][0]-lo)*kx, ay=(ROUTE[i-1][1]-la)*ky;
      const bx=(ROUTE[i][0]-lo)*kx,   by=(ROUTE[i][1]-la)*ky;
      const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
      let t = l2 ? -(ax*dx+ay*dy)/l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px=ax+t*dx, py=ay+t*dy, d=Math.hypot(px,py);
      if(d<best){ best=d; km = KMS ? KMS[i-1] + t*(KMS[i]-KMS[i-1]) : 0; }
    }
    if(best <= 20) res.push({d: best, km});
  }
  return res;
}
// Attache a la station ses positions (occ), son ecart minimal et le km correspondant ;
// false si elle est hors du couloir maximal.
function situerSurTrace(s){
  const occ = positionsTrace(s.la, s.lo);
  if(!occ.length){ s.ecart = Infinity; s.kmr = null; s.occ = []; return false; }
  const m = occ.reduce((a, b) => b.d < a.d ? b : a);
  s.ecart = m.d; s.kmr = m.km; s.occ = occ;
  return true;
}

// ---------- Trajets memorises ----------
// Demande du 17/09/2026 : rappeler un trajet frequent en un clic. Cle dediee,
// relue fraiche avant chaque ecriture : plusieurs onglets partagent ce stockage
// (meme precaution que pour le garage). Un depart vide vaut « ma position ».
const CLE_TRAJETS = 'fuelpilot:trajets';
const trajetsLus = () => {
  try{ const t = JSON.parse(localStorage.getItem(CLE_TRAJETS)); return Array.isArray(t) ? t : []; }
  catch(e){ return []; }
};
// Champ `ar` (aller-retour) ajoute le 23/10/2026 : les trajets memorises sans ce champ restent valables.
const trajetCourant = () => ({dep: maPosition($('depart').value) ? '' : $('depart').value.trim(),
                              arr: $('arrivee').value.trim(),
                              sansPeage: $('sansPeage').checked, ar: $('allerRetour').checked});
const memeTrajet = (x, y) => String(x.dep).toLowerCase() === String(y.dep).toLowerCase() &&
  String(x.arr).toLowerCase() === String(y.arr).toLowerCase() && !!x.sansPeage === !!y.sansPeage && !!x.ar === !!y.ar;
const nomTrajet = t => `${t.dep || 'Ma position'} ${t.ar ? '⇄' : '→'} ${t.arr}${t.sansPeage ? ' (sans péage)' : ''}`;
// Trajet AFFICHE, tel qu'il a ete saisi au moment du calcul (TRAJET.saisie) ; null sans trajet.
// Le partage, la memorisation et la pilule le lisent : une frappe dans « Départ » ou
// « Arrivée » sans relancer le calcul ne change pas ce qui est partage ou memorise.
const trajetAffiche = () => ROUTE && TRAJET && TRAJET.saisie && TRAJET.saisie.arr ? TRAJET.saisie : null;
// Lien de partage du plan : trajet tel que saisi (jamais une coordonnee) + fiche vehicule.
function lienTrajet(){
  return `${lienBase()}#trajet=${trajetVersParam(trajetAffiche() || trajetCourant(), $('couloir').value)}` +
         `&veh=${vehParam(REGL.vehicules[REGL.vehActif])}`;
}
function majTrajets(){
  const liste = trajetsLus();
  const sel = $('trajetsMemo');
  // Options construites en DOM (texte, jamais HTML) : les noms viennent de la saisie.
  sel.replaceChildren(new Option('Trajets mémorisés…', ''),
    ...liste.map((t,i) => new Option(nomTrajet(t), String(i))));
  sel.hidden = !liste.length;
  const b = $('memoriser'), c = trajetAffiche();
  const deja = !!(c && liste.some(t => memeTrajet(t, c)));
  b.hidden = !c;
  b.setAttribute('aria-pressed', String(deja));
  b.innerHTML = ico(deja ? 'etoilePleine' : 'etoile') + (deja ? ' Mémorisé' : ' Mémoriser');
  b.title = deja ? 'Retirer ce trajet des trajets mémorisés' : 'Mémoriser ce trajet';
}
$('memoriser').onclick = () => {
  const c = trajetAffiche();
  if(!c) return;
  let liste = trajetsLus();
  const i = liste.findIndex(t => memeTrajet(t, c));
  if(i >= 0) liste.splice(i, 1); else liste = [c, ...liste].slice(0, 20);
  try{ localStorage.setItem(CLE_TRAJETS, JSON.stringify(liste)); }
  catch(e){ /* stockage refuse : rien a memoriser */ }
  majTrajets();
};
$('trajetsMemo').onchange = e => {
  const t = trajetsLus()[+e.target.value];
  e.target.value = '';
  if(!t) return;
  $('depart').value = t.dep || 'Ma position';
  $('arrivee').value = t.arr || '';
  majMoi();
  $('sansPeage').checked = !!t.sansPeage;
  $('allerRetour').checked = !!t.ar;
  $('trajet').requestSubmit();
};
// Une saisie a la main annule l'aller-retour venu d'un lien |r ou d'un trajet memorise (la
// case n'est plus visible : sinon il collait a tous les trajets suivants).
// Nouveau trajet = nouveau depart : « Réservoir au départ » est remis a zero, la question sera reposee.
['depart', 'arrivee'].forEach(id => $(id).addEventListener('input', () => { $('allerRetour').checked = false; $('aBord').value = ''; majTrajets(); }));
$('sansPeage').addEventListener('change', majTrajets);
$('allerRetour').addEventListener('change', majTrajets);
window.addEventListener('storage', e => { if(e.key === CLE_TRAJETS) majTrajets(); });
majTrajets();

// Pilule de recherche (mobile) : un champ ferme, deux a l'ouverture.
function rechercheOuverte(on){
  if($('recherche').classList.contains('ouvert') === on) return;
  $('recherche').classList.toggle('ouvert', on);
  $('pilule').setAttribute('aria-expanded', String(on));
  if(on){
    if(!$('depart').value) $('depart').value = 'Ma position';
    if(MOBILE.matches) poserCran('apercu');   // la feuille laisse la place aux champs
    $('arrivee').focus();
  }
}
$('pilule').onclick = () => rechercheOuverte(!$('recherche').classList.contains('ouvert'));
document.addEventListener('echap', () => { rechercheOuverte(false); reticule(false); });
function majPilule(){
  const c = trajetAffiche();
  $('piluleTxt').textContent = c ? `${c.dep || 'Ma position'} ${c.ar ? '⇄' : '→'} ${c.arr}` : 'Où allez-vous ?';
}

// ---------- Depart « Ma position » et lieux recents (demande du 26/10/2026) ----------
// « Garde en mémoire les entrées de type Où allez-vous, genre Orléans, quitte à l'effacer ;
// départ avec ma position présélectionnée mais modifiable. »
// Depart : « Ma position » ecrit d'office (en bleu), tout selectionne au toucher — taper
// remplace ; laisse vide, il y revient. Lieux : chaque trajet lance a la main retient son
// arrivee (et son depart s'il n'est pas « Ma position »), 8 au plus, le dernier en tete ;
// proposes sous le champ actif (filtres par la saisie), un toucher les reprend — sur
// l'arrivee, le trajet part aussitot —, la croix les efface. Stockes dans ce navigateur
// seulement, rendus en texte (jamais en HTML).
const CLE_LIEUX = 'fuelpilot:lieux';
const lieuxLus = () => {
  try{ const t = JSON.parse(localStorage.getItem(CLE_LIEUX)); return Array.isArray(t) ? t.filter(x => typeof x === 'string') : []; }
  catch(e){ return []; }
};
const lieuxEcrits = l => { try{ localStorage.setItem(CLE_LIEUX, JSON.stringify(l)); }catch(e){ /* stockage refuse */ } };
function retenirLieux(arr, dep){
  let l = lieuxLus();
  for(const q of [dep, arr]){           // l'arrivee finit en tete
    const v = String(q || '').trim();
    if(!v || maPosition(v)) continue;
    l = [v, ...l.filter(x => x.toLowerCase() !== v.toLowerCase())];
  }
  lieuxEcrits(l.slice(0, 8));
}
const majMoi = () => ['depart', 'arrivee'].forEach(id =>
  $(id).classList.toggle('moi', !!$(id).value.trim() && maPosition($(id).value)));
let CHAMP_ACTIF = null;
function majSuggestions(){
  const ul = $('suggestions'), c = CHAMP_ACTIF;
  if(!c){ ul.hidden = true; return; }
  const q = maPosition(c.value) ? '' : c.value.trim().toLowerCase();
  const items = [];
  if(c.id === 'depart' && !maPosition(c.value)) items.push({moi: true});
  lieuxLus().filter(x => x.toLowerCase().includes(q) && x.toLowerCase() !== q)
            .forEach(x => items.push({lieu: x}));
  const garder = e => e.preventDefault();   // le champ garde le focus
  ul.replaceChildren(...items.map(it => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sugg' + (it.moi ? ' moi' : '');
    b.innerHTML = ico(it.moi ? 'viseur' : 'horloge');
    const t = document.createElement('span'); t.textContent = it.moi ? 'Ma position' : it.lieu;
    b.append(t); b.onpointerdown = garder;
    b.onclick = () => {
      c.value = it.moi ? 'Ma position' : it.lieu;
      c.dispatchEvent(new Event('input'));
      CHAMP_ACTIF = null; majSuggestions(); majMoi();
      if(c.id === 'arrivee') $('trajet').requestSubmit(); else $('arrivee').focus();
    };
    li.append(b);
    if(it.lieu){
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'sugg-x'; x.innerHTML = ico('croix');
      x.setAttribute('aria-label', `Effacer « ${it.lieu} » des lieux récents`);
      x.onpointerdown = garder;
      x.onclick = () => { lieuxEcrits(lieuxLus().filter(y => y !== it.lieu)); majSuggestions(); };
      li.append(x);
    }
    return li;
  }));
  ul.hidden = !items.length;
}
// Fleches haut/bas entre les lieux proposes ; Echap ou haut sur le premier = retour au champ.
$('suggestions').addEventListener('keydown', e => {
  const bs = [...$('suggestions').querySelectorAll('.sugg')], i = bs.indexOf(document.activeElement);
  if(e.key === 'ArrowDown' && i >= 0){ e.preventDefault(); (bs[i + 1] || bs[i]).focus(); }
  else if(e.key === 'ArrowUp' && i >= 0){ e.preventDefault(); (i ? bs[i - 1] : CHAMP_ACTIF || $('arrivee')).focus(); }
  else if(e.key === 'Escape'){ e.stopPropagation(); const c = CHAMP_ACTIF || $('arrivee'); c.focus(); CHAMP_ACTIF = null; majSuggestions(); }
});
$('suggestions').addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if(!$('suggestions').contains(a) && a !== $('depart') && a !== $('arrivee')){ CHAMP_ACTIF = null; majSuggestions(); }
}, 150));
['depart', 'arrivee'].forEach(id => {
  const c = $(id);
  c.addEventListener('focus', () => {
    CHAMP_ACTIF = c; majSuggestions();
    if(id === 'depart' && maPosition(c.value)) setTimeout(() => c.select(), 0);
  });
  c.addEventListener('input', () => { if(CHAMP_ACTIF === c) majSuggestions(); majMoi(); });
  // Clavier : fleche bas = premier lieu propose, Echap = fermer la liste.
  c.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown' && !$('suggestions').hidden){ e.preventDefault(); $('suggestions').querySelector('.sugg').focus(); }
    else if(e.key === 'Escape' && !$('suggestions').hidden){ e.stopPropagation(); CHAMP_ACTIF = null; majSuggestions(); }
  });
  c.addEventListener('blur', () => {
    if(id === 'depart' && !c.value.trim()){ c.value = 'Ma position'; majMoi(); }
    // Au clavier, le focus peut passer dans la liste : on la garde ouverte.
    setTimeout(() => { if(!$('suggestions').contains(document.activeElement) && document.activeElement !== $('depart') &&
                          document.activeElement !== $('arrivee')){ CHAMP_ACTIF = null; majSuggestions(); } }, 150);
  });
});
if(!$('depart').value.trim()) $('depart').value = 'Ma position';
majMoi();

// Itineraire IGN entre deux points. « Sans péage » : moteur bdtopo-pgr + interdiction
// des autoroutes (verifie le 09/08 : la contrainte est IGNOREE par bdtopo-osrm, respectee
// par pgr). Approximation assumee : quelques autoroutes gratuites (A75...) sont evitees aussi.
async function itineraireIGN(a, b, sansP){
  const u = `${ITI}?resource=${sansP ? 'bdtopo-pgr' : 'bdtopo-osrm'}&profile=car&optimization=fastest`+
            `&start=${a.lon},${a.lat}&end=${b.lon},${b.lat}&geometryFormat=geojson`+
            (sansP ? `&constraints=${encodeURIComponent('{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}')}` : '');
  const j = await lireJson(u);
  return {pts: j.geometry.coordinates, distance: j.distance, duration: j.duration};
}
// Polyline « Google » a precision 6 (format de Valhalla) → [[lon, lat], …].
function decoderPolyline6(s){
  const pts = []; let i = 0, lat = 0, lon = 0;
  while(i < s.length){
    for(const k of [0, 1]){
      let res = 0, dec = 0, b;
      do{ b = s.charCodeAt(i++) - 63; res |= (b & 0x1f) << dec; dec += 5; }while(b >= 0x20);
      const d = (res & 1) ? ~(res >> 1) : (res >> 1);
      if(k === 0) lat += d; else lon += d;
    }
    pts.push([lon / 1e6, lat / 1e6]);
  }
  return pts;
}
// Itineraire de secours (Valhalla/OSM). « Sans péage » y est une vraie exclusion des
// troncons a peage, pas l'approximation « sans autoroute » de l'IGN.
async function itineraireSecours(a, b, sansP){
  const q = {locations: [{lat: a.lat, lon: a.lon}, {lat: b.lat, lon: b.lon}], costing: 'auto', units: 'kilometers'};
  if(sansP) q.costing_options = {auto: {use_tolls: 0, exclude_tolls: true}};
  const j = await lireJson(`${ITI_SECOURS}?json=${encodeURIComponent(JSON.stringify(q))}`);
  const t = j.trip;
  if(!t || !t.legs || !t.legs.length) throw new Error('tracé de secours vide');
  return {pts: t.legs.flatMap(l => decoderPolyline6(l.shape)),
          distance: t.summary.length * 1000, duration: t.summary.time};
}
// Un itineraire entre deux points (IGN, sinon secours), simplifie a ~400 points.
async function itineraire(a, b, sansP){
  // Un bout en Espagne (villeES, es.js) : l'IGN ne trace qu'en France et rend SANS ERREUR un
  // trajet arrete a la frontiere (mesure le 11/11/2026 : Perpignan → Barcelone, 115 km au
  // lieu de 190) ; on trace alors directement avec OpenStreetMap.
  let brut = null;
  if(a.pays !== 'ES' && b.pays !== 'ES'){
    try{ brut = await itineraireIGN(a, b, sansP); MOTEUR = 'ign'; }catch(e){}
  }
  if(!brut){
    try{ brut = await itineraireSecours(a, b, sansP); MOTEUR = 'osm'; }
    catch(e2){ throw new Error('calcul d\'itinéraire indisponible (IGN et secours)'); }
  }
  const pts = brut.pts;
  const pas = Math.max(1, Math.round(pts.length/400));   // ~400 points suffisent
  const sim = pts.filter((_, i) => i % pas === 0);
  if(sim[sim.length-1] !== pts[pts.length-1]) sim.push(pts[pts.length-1]);
  return {pts: sim, distance: brut.distance, duration: brut.duration};
}
const duree = m => { const min = Math.round(m); return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`; };

// Au lancement d'un trajet, on demande d'office combien de km on peut encore faire (demande du
// 24/10/2026) : Valider remplit « Réservoir au départ », Passer (ou fermer) = plein. Une fois par couple
// depart/arrivee ; jamais pour un trajet importe par lien, ni sans autonomie connue, ni si
// « Réservoir au départ » est deja rempli. Le calcul repart a la reponse.
let ABORD_DEMANDE = null, ABORD_REPONDU = false;
function demanderABord(){
  const cle = `${$('depart').value.trim()}|${$('arrivee').value.trim()}`;
  if(TRAJET_SANS_GESTE || $('aBord').value.trim() !== '' || ABORD_DEMANDE === cle) return false;
  const v = REGL.vehicules[REGL.vehActif];
  if(!v || estElec(v) || !autonomieUtile(+v.conso, +v.cuve, +v.autonomie, 0)) return false;
  ABORD_DEMANDE = cle; ABORD_REPONDU = false;
  $('aBordQkm').value = ''; $('aBordQu').value = $('aBordUnite').value;
  ouvrirFeuille('aBordQ', $('trajet').querySelector('[type=submit]'));
  setTimeout(() => $('aBordQkm').focus(), 50);
  return true;
}
$('aBordForm').onsubmit = e => {
  e.preventDefault(); ABORD_REPONDU = true;
  $('aBord').value = $('aBordQkm').value.trim();
  if($('aBordUnite').value !== $('aBordQu').value){ $('aBordUnite').value = $('aBordQu').value; REGL.aBordUnite = $('aBordQu').value; reglagesBruts(); }
  fermerFeuille(); $('trajet').requestSubmit();
};
$('aBordPasser').onclick = () => { ABORD_REPONDU = true; fermerFeuille(); $('trajet').requestSubmit(); };
document.addEventListener('feuille', e => {   // Echap ou voile valent « Passer »
  if(e.detail.id === 'aBordQ' && !e.detail.ouverte && !ABORD_REPONDU){ ABORD_REPONDU = true; $('trajet').requestSubmit(); }
});
let CALCUL_N = 0;   // deux calculs lances coup sur coup (case puis ⇄) : seul le dernier ecrit
async function calculerTrajet(ev){
  ev.preventDefault();
  if(demanderABord()) return;
  const sansGeste = TRAJET_SANS_GESTE; TRAJET_SANS_GESTE = false;
  const mien = ++CALCUL_N;
  infoT.textContent = 'calcul…';
  try{
    const c = trajetCourant();   // la saisie telle qu'elle part au calcul, avant toute attente
    const [a, b] = await Promise.all([
      geocoder($('depart').value),
      geocoder($('arrivee').value)]);
    const sansP = $('sansPeage').checked, ar = $('allerRetour').checked;
    // Aller-retour : le retour est un second itineraire B -> A (meme moteur, memes
    // contraintes) ; ROUTE = aller puis retour, KMS continue, le total est la boucle.
    const aller = await itineraire(a, b, sansP);
    const retour = ar ? await itineraire(b, a, sansP) : null;
    if(mien !== CALCUL_N) return;   // un calcul plus recent est en cours : celui-ci est perime
    let pts = aller.pts, iRetour = null;
    if(retour){ iRetour = pts.length; pts = pts.concat(retour.pts); }
    ROUTE = pts; I_RETOUR = iRetour; ROUTE_AR = !!retour;
    preparerKms();
    ALLER_KM = iRetour != null ? KMS[iRetour] : null;
    DETOUR_AUTO = !sansGeste;   // lien partage : on garde son detour
    // En-tete du plan : le libelle geocode quand il differe de la saisie (lieux.js).
    TRAJET = {dep: c.dep ? libelleTrajet(c.dep, a.label) : 'Ma position', arr: c.arr ? libelleTrajet(c.arr, b.label) : 'Ma position', ar: !!retour, sansP,
              saisie: {dep: c.dep, arr: c.arr, sansPeage: !!sansP, ar: !!retour},   // lu par le partage et la memorisation
              km: (aller.distance + (retour ? retour.distance : 0)) / 1000,
              min: (aller.duration + (retour ? retour.duration : 0)) / 60};

    if(CARTE){
      const features = [{type: 'Feature', properties: {sens: 'aller'}, geometry: {type: 'LineString', coordinates: aller.pts}}];
      if(retour) features.push({type: 'Feature', properties: {sens: 'retour'}, geometry: {type: 'LineString', coordinates: retour.pts}});
      TRACE = {type: 'FeatureCollection', features};
      CARTE.donnees('fh-trace', TRACE);
      // Cadrage sur le trace : geste explicite (le bouton), donc autorise — sauf trajet
      // importe par l'URL, pose sans animation ; la feuille s'ouvre a moitie sur mobile,
      // le cadrage laisse la place en bas.
      let s = 90, n = -90, w = 180, e = -180;
      ROUTE.forEach(([lo, la]) => { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); });
      const h = map.getContainer().clientHeight;
      const pad = MOBILE.matches
        ? {top: 100, bottom: Math.min(Math.round(h / 2) + 16, Math.max(0, h - 160)), left: 24, right: 24}
        : {top: 60, bottom: 60, left: 60, right: 60};
      CARTE.cadrer({s, n, w, e}, pad, !sansGeste);
    }
    infoT.textContent = `${Math.round(TRAJET.km)} km · ${duree(TRAJET.min)}`+
      `${sansP ? (MOTEUR === 'osm' ? ' · sans péage' : ' · sans autoroute') : ''}${ar ? ' · aller-retour' : ''}`+
      ` · ${a.label} ${ar ? '⇄' : '→'} ${b.label}${MOTEUR === 'osm' ? (a.pays === 'ES' || b.pays === 'ES' ? ' · tracé OpenStreetMap' : ' · tracé OpenStreetMap (IGN muette)') : ''}`;
    $('effacer').hidden = false;
    if(!sansGeste) retenirLieux($('arrivee').value, $('depart').value);
    majTrajets(); majPilule();
    replierStations(true);
    if(MOBILE.matches){ rechercheOuverte(false); deplier('moitie'); }
    charger();
  }catch(e){
    if(mien !== CALCUL_N) return;
    // Hors ligne : adresses et trace demandent le reseau (jamais mis en cache) ; on le dit tel quel.
    infoT.textContent = navigator.onLine === false ? 'Hors ligne : itinéraire indisponible (adresses et tracé demandent le réseau).' : e.message;
    // Position inconnue : le formulaire reste ouvert (pilule du telephone), sur le bout a remplir.
    if(e.message === POSITION_INCONNUE){
      if(MOBILE.matches) rechercheOuverte(true);
      $(maPosition($('depart').value) ? 'depart' : 'arrivee').focus();
    }
    if(sansGeste) charger();   // trajet importe injoignable : les prix autour de soi, au moins
  }
}
$('trajet').onsubmit = calculerTrajet;
// Inverser depart et arrivee = le trajet retour en un clic. Un champ vide vaut
// « ma position » (cf. geocoder), donc l'echange reste juste quand le depart
// est implicite. Trace deja affiche : on relance le calcul, sinon on se
// contente d'echanger les deux champs.
$('inverser').onclick = () => {
  const d = $('depart'), a = $('arrivee');
  [d.value, a.value] = [a.value, d.value];
  if(!d.value.trim()) d.value = 'Ma position';
  majMoi();
  if(ROUTE) $('trajet').requestSubmit();
};
$('effacer').onclick = () => {
  CALCUL_N++;   // un calcul en vol ne doit plus reposer un trace
  ROUTE = null; KMS = null; I_RETOUR = null; ALLER_KM = null; ROUTE_AR = false; TRAJET = null;
  TRACE = TRACE_VIDE;
  if(CARTE) CARTE.donnees('fh-trace', TRACE_VIDE);
  $('effacer').hidden = true;
  majTrajets(); majPilule(); replierStations(false); rendu();
  infoT.textContent = '';
  if(REPERE_REEL) situer(CENTRE[0], CENTRE[1], libelleRepere, true);   // sinon rien a retrouver : le centre de la France n'est pas un repere
};

// ---------- Menus : fonds et apparence, options, aide ----------
function majFonds(){
  document.querySelectorAll('[data-fond]').forEach(b =>
    b.setAttribute('aria-pressed', String((REGL.fond || 'plan') === b.dataset.fond)));
}
document.querySelectorAll('[data-fond]').forEach(b => b.onclick = () => {
  REGL.fond = b.dataset.fond; reglagesBruts(); majFonds();
  if(CARTE) CARTE.fond(REGL.fond);
});
document.querySelectorAll('button[data-theme]').forEach(b => b.onclick = () => {
  REGL.theme = b.dataset.theme === 'auto' ? undefined : b.dataset.theme; reglagesBruts(); appliquerTheme();
});
$('fonds').onclick = () => { majFonds(); ouvrirFeuille('menuFonds', $('fonds')); };
$('options').onclick = () => ouvrirFeuille('menuOptions', $('options'));
$('aideBtn').onclick = () => ouvrirFeuille('aide', $('aideBtn'));
$('optAide').onclick = () => ouvrirFeuille('aide', $('options'));

// ---------- Bornes de recharge et vehicule electrique (phase 2, 30/10/2026) ----------
// L'electricite est traitee « comme un carburant » : pour un vehicule electrique, les bornes
// publiques (Base nationale des IRVE, data/irve/<dep>.json servis A COTE de la page, charges par
// departement d'apres index.json) remplacent les stations, et le plan de charge
// (optimiserPlanElectrique, plan.js) remplace le plan de pleins. Pour un vehicule thermique,
// l'option « Afficher les bornes électriques » les ajoute a la carte sans toucher au plan de
// pleins : renduCarburant() reste tel quel, renduBornes() dessine par-dessus.
const vehActif = () => REGL.vehicules[REGL.vehActif];
const estElec = v => ((v || vehActif()) || {}).energie === 'elec';
// Fiche du garage (texte) -> vehicule au format de plan.js / irve.js (nombres, defauts du brief :
// prise CCS, reserve 15 %, depart 80 %).
function vehElec(v){
  v = v || vehActif();
  const pct = (x, d) => x === '' || x == null || !Number.isFinite(+x) ? d : Math.max(0, Math.min(100, +x));
  return {batterieKwh: +v.batterieKwh || 0, consoKwh100: +v.consoKwh100 || 0, kwMaxDC: +v.kwMaxDC || 0, kwMaxAC: +v.kwMaxAC || 0,
          prise: ['ccs', 'chademo', 't2'].includes(v.prise) ? v.prise : 'ccs',
          reservePct: pct(v.reservePct, 15), departPct: pct(v.departPct, 80)};
}
// Filtres des bornes (puissance minimale, gratuit, carte bancaire, ouvert maintenant), memorises.
const BF = Object.assign({kwMin: 0, gratuit: false, cb: false, ouvert: false}, REGL.bornesFiltres || {});
$('bKwMin').value = ['0', '7', '22', '50', '150'].includes(String(BF.kwMin)) ? String(BF.kwMin) : '0';
$('bGratuit').checked = !!BF.gratuit; $('bCb').checked = !!BF.cb; $('bOuvert').checked = !!BF.ouvert;
['bKwMin', 'bGratuit', 'bCb', 'bOuvert'].forEach(id => $(id).onchange = () => {
  BF.kwMin = +$('bKwMin').value || 0; BF.gratuit = $('bGratuit').checked; BF.cb = $('bCb').checked; BF.ouvert = $('bOuvert').checked;
  REGL.bornesFiltres = BF; reglagesBruts(); rendu();
});
const critBornes = () => ({kwMin: BF.kwMin, gratuit: BF.gratuit || null, cb: BF.cb || null, ouvertLe: BF.ouvert ? new Date() : null});
// Option (vehicule thermique) : bornes en plus des stations ; sans effet en electrique (toujours la).
$('bornesVisibles').checked = !!REGL.bornesVisibles;
$('bornesVisibles').onchange = () => { REGL.bornesVisibles = $('bornesVisibles').checked; reglagesBruts(); charger(); };
const bornesVoulues = () => estElec() || !!REGL.bornesVisibles;

// ---- Chargement par departement ----
// index.json donne la bbox de chaque departement : on charge ceux qui croisent l'emprise (4 au
// plus pour la vue libre, sinon « zoomez ») ; pour un trajet, tous ceux que croise le couloir
// (lots de 4 requetes). Cache en memoire par departement ; un compteur (seqB) abandonne les
// reponses d'une emprise devenue obsolete, comme pour les stations. URL RELATIVES ('self') : en
// file:// ou si index.json est injoignable, message discret « bornes indisponibles hors ligne ».
const URL_IRVE = 'data/irve/';
const MAX_DEPS_VUE = 4, LOT_DEPS = 4, DELAI_IRVE = 20000;
let IRVE_INDEX = null, IRVE_INDEX_P = null, IRVE_ETAT = 'inconnu';   // 'ok' | 'indisponible'
const IRVE_CACHE = new Map();   // dep -> Promise<bornes[]>
let BORNES = [], BORNES_MSG = '', BORNES_DEPS = [], seqB = 0, BORNES_CHARGEMENT = false;
function lireIndexIrve(){
  if(IRVE_INDEX) return Promise.resolve(IRVE_INDEX);
  if(!/^https?:$/.test(location.protocol)){ IRVE_ETAT = 'indisponible'; return Promise.resolve(null); }
  if(!IRVE_INDEX_P) IRVE_INDEX_P = fetch(URL_IRVE + 'index.json', {signal: AbortSignal.timeout(DELAI_IRVE)})
    .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { if(!j || !j.departements || typeof j.departements !== 'object') throw new Error('index illisible'); IRVE_INDEX = j; IRVE_ETAT = 'ok'; return j; })
    .catch(() => { IRVE_ETAT = 'indisponible'; IRVE_INDEX_P = null; return null; });
  return IRVE_INDEX_P;
}
// Une borne du fichier -> objet de la page : coordonnees verifiees, chaines echappees a
// l'ingestion (comme les stations), champs la/lo/ville pour « Y aller » et le couloir.
function normaliserBorne(b, dep){
  if(!b || typeof b !== 'object' || !coordsValides(+b.lat, +b.lon)) return null;
  const bool = x => x === true ? true : x === false ? false : null;
  const num = x => Number.isFinite(+x) && +x > 0 ? +x : null;
  const n = esc(String(b.n || '').slice(0, 160)) || 'Borne de recharge';
  return {id: esc(String(b.id || `${b.lon},${b.lat}`).slice(0, 80)), dep, n, ville: n,
          op: esc(String(b.op || '').slice(0, 80)), la: +b.lat, lo: +b.lon, lat: +b.lat, lon: +b.lon,
          pdc: Math.max(1, Math.round(+b.pdc) || 1), kw: num(b.kw), kwmin: num(b.kwmin),
          ac: bool(b.ac), ccs: bool(b.ccs), chademo: bool(b.chademo), gratuit: bool(b.gratuit), cb: bool(b.cb), acte: bool(b.acte),
          h: b.h == null ? null : esc(String(b.h).slice(0, 200)), pmr: bool(b.pmr),
          acces: b.acces === 'libre' || b.acces === 'reserve' ? b.acces : null,
          maj: /^\d{4}-\d{2}-\d{2}/.test(String(b.maj || '')) ? String(b.maj).slice(0, 10) : null, ecart: null, kmr: null, occ: [], tr: -1};
}
function chargerDep(dep){
  if(!IRVE_CACHE.has(dep)){
    const p = fetch(`${URL_IRVE}${encodeURIComponent(dep)}.json`, {signal: AbortSignal.timeout(DELAI_IRVE)})
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(l => Array.isArray(l) ? l.map(b => normaliserBorne(b, dep)).filter(Boolean) : [])
      .catch(e => { IRVE_CACHE.delete(dep); throw e; });   // on reessaiera au prochain deplacement
    IRVE_CACHE.set(dep, p);
  }
  return IRVE_CACHE.get(dep);
}
async function chargerDeps(deps, mien){
  const res = [];
  for(let i = 0; i < deps.length; i += LOT_DEPS){
    const lot = await Promise.all(deps.slice(i, i + LOT_DEPS).map(d => chargerDep(d).catch(() => [])));
    if(mien !== seqB) return null;
    lot.forEach(l => res.push(...l));
  }
  return res;
}
async function chargerBornes(){
  const mien = ++seqB;
  if(!bornesVoulues()){ BORNES = []; BORNES_MSG = ''; BORNES_CHARGEMENT = false; return; }
  BORNES_CHARGEMENT = true;
  const index = await lireIndexIrve();
  if(mien !== seqB) return;
  BORNES_CHARGEMENT = false;
  if(!index){
    BORNES = []; BORNES_DEPS = []; BORNES_MSG = 'bornes indisponibles hors ligne';
    if(estElec()){ etatPrix = '<span class="ko">bornes indisponibles hors ligne</span>'; }
    rendu(); return;
  }
  if(estElec()) etatPrix = 'bornes de recharge · base IRVE' + (/^\d{4}-\d{2}-\d{2}$/.test(index.genere) ? ` du ${index.genere.slice(8, 10)}/${index.genere.slice(5, 7)}/${index.genere.slice(0, 4)}` : '');
  const zones = ROUTE ? emprisesTrace(20) : [emprise()];
  const deps = [...new Set(zones.flatMap(z => departementsPourEmprise(index, z)))].sort();
  if(!ROUTE && deps.length > MAX_DEPS_VUE){
    BORNES = []; BORNES_DEPS = [];
    BORNES_MSG = `zoomez pour voir les bornes (${deps.length} départements dans la zone affichée, ${MAX_DEPS_VUE} au plus à la fois)`;
    rendu(); return;
  }
  if(!deps.length){ BORNES = []; BORNES_DEPS = []; BORNES_MSG = ''; rendu(); return; }
  BORNES_CHARGEMENT = true;
  const l = await chargerDeps(deps, mien);
  if(l === null || mien !== seqB) return;
  BORNES_CHARGEMENT = false;
  BORNES_DEPS = deps;
  BORNES = ROUTE ? l.filter(situerBorne) : l;
  BORNES_MSG = '';
  rendu();
}
// Position d'une borne sur le trace courant (ecart, km, occurrences aller/retour), recalculee a
// chaque nouveau trace (ROUTE_N) : les objets viennent du cache, partage entre trajets.
let ROUTE_N = 0;
function situerBorne(b){
  if(!ROUTE){ b.ecart = null; b.kmr = null; b.occ = []; return false; }
  if(b.tr !== ROUTE_N){ situerSurTrace(b); b.tr = ROUTE_N; }
  return b.occ.length > 0;
}

// ---- Rendu : aiguillage, bornes, fiche borne ----
// rendu() est appele partout ou l'etait l'ancien rendu : vehicule electrique -> renduElec()
// (bornes + plan de charge) ; thermique -> renduCarburant() tel quel, puis les bornes si demandees.
let PLAN_ICO = 'pompe';
// Le focus survit au re-rendu du panneau (liste refaite a chaque deplacement de la carte, plan
// refait a chaque choix de detour) : l'element actif est retrouve par son data-id (carte de
// station ou de borne), sinon par sa classe et son rang dans le panneau. Sans cela, un
// utilisateur au clavier retombait sur le corps de la page apres chaque redessin (audit du 30/10/2026).
function focusPanneau(){
  const a = document.activeElement;
  if(!a || !$('corps').contains(a) || !a.classList.length) return null;
  const cls = a.classList[0];
  return {cls, id: a.dataset.id || null, i: [...$('corps').querySelectorAll('.' + CSS.escape(cls))].indexOf(a)};
}
function restaurerFocus(f){
  if(!f || $('corps').contains(document.activeElement) && document.activeElement !== document.body) return;
  let el = f.id ? $('corps').querySelector(`.${CSS.escape(f.cls)}[data-id="${CSS.escape(f.id)}"]`) : null;
  if(!el && f.i >= 0) el = $('corps').querySelectorAll('.' + CSS.escape(f.cls))[f.i] || null;
  if(el && el.offsetParent !== null) el.focus({preventScroll: true});
}
function rendu(){
  const f = focusPanneau();
  const elec = estElec();
  if(PLAN_ICO !== (elec ? 'eclair' : 'pompe')){ PLAN_ICO = elec ? 'eclair' : 'pompe'; $('planIco').innerHTML = ico(PLAN_ICO); }
  if(elec) renduElec();
  else{
    $('secStations').hidden = false;
    renduCarburant();
    renduBornes(false, null);
  }
  restaurerFocus(f);
}
// Lien d'evitement : la liste visible (stations, ou bornes pour un vehicule electrique), panneau
// deplie sur mobile, focus sur la premiere carte (sinon sur la liste elle-meme).
$('evitement').addEventListener('click', e => {
  e.preventDefault();
  deplier('plein');
  const l = estElec() ? $('listeBornes') : $('liste');
  (l.querySelector('.carte') || l).focus();
  l.scrollIntoView({block: 'start'});
});
// Construction DOM (textContent, jamais innerHTML sur une chaine externe).
const mk = (tag, cls, ...enfants) => {
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  for(const c of enfants){ if(c == null || c === false) continue; e.append(c.nodeType ? c : String(c)); }
  return e;
};
const mkSvg = nom => { const t = document.createElement('template'); t.innerHTML = ico(nom); return t.content.firstChild; };
const mkBtn = (cls, libelle, action, icone) => {
  const b = mk('button', cls, icone ? mkSvg(icone) : null, icone ? ' ' : null, libelle);
  b.type = 'button'; b.onclick = action; return b;
};
const virgule = x => String(x).replace('.', ',');
const pctTxt = p => `${virgule(Math.round(p * 10) / 10)} %`;

let MARQUEURS_B = [], LISTE_BORNES = [], triB = 'dist';
// Bornes a montrer : filtres de l'utilisateur, prise du vehicule (electrique), couloir et zone affichee.
function bornesAffichables(elec){
  let l = filtrerBornes(BORNES, critBornes());
  if(elec){ const prise = vehElec().prise; l = l.filter(b => branchable(b, prise)); }
  const vue = emprise();
  if(ROUTE){ const large = +$('couloir').value; l = l.filter(b => situerBorne(b) && b.ecart <= large && dansEmprise(vue, b.la, b.lo)); }
  else l = l.filter(b => dansEmprise(vue, b.la, b.lo));
  return l;
}
const kwCourt = kw => kw > 0 ? (kw >= 20 ? String(Math.round(kw)) : virgule(Math.round(kw * 10) / 10)) : '?';
// renduBornes(elec, etapes) : marqueurs (eclair, couleur par puissance), liste en cartes, compteur,
// plafond PLAFOND partage avec les stations ; etapes = Map borne -> [n° d'arret] (plan de charge).
function renduBornes(elec, etapes){
  MARQUEURS_B.forEach(m => m.remove()); MARQUEURS_B = [];
  const sec = $('secBornes'), liste = $('listeBornes');
  const voulues = bornesVoulues();
  sec.hidden = !voulues;
  if(!voulues){ LISTE_BORNES = []; return; }
  const l = bornesAffichables(elec);
  l.forEach(b => { b.d = dist(b.la, b.lo); });
  const nStations = elec ? 0 : LISTE_COURANTE.length;
  const place = Math.max(0, PLAFOND - nStations);
  const ordre = (a, b) => triB === 'kw' ? ((b.kw || 0) - (a.kw || 0)) || (a.d - b.d)
                                        : ((ROUTE ? a.kmr - b.kmr : a.d - b.d) || ((b.kw || 0) - (a.kw || 0)));
  let tri = [...l].sort(ordre);
  // Les arrets du plan restent visibles meme hors de la zone ou des filtres (le plan y passe) ;
  // « Seulement les arrêts du plan » ne garde qu'eux.
  if(etapes && etapes.size){
    const dedans = new Set(tri);
    etapes.forEach((n, b) => { if(!dedans.has(b)){ b.d = dist(b.la, b.lo); tri.push(b); } });
    tri.sort(ordre);
    if($('queUtiles').checked) tri = tri.filter(b => etapes.has(b));
  }
  const tronqB = Math.max(0, tri.length - place);
  const affichees = tri.slice(0, place);
  const n = affichees.length;
  const compte = `${n} borne${n > 1 ? 's' : ''} ${ROUTE ? 'sur le trajet, dans la zone affichée' : 'dans la zone affichée'}` +
    (BORNES_DEPS.length ? ` (${BORNES_DEPS.length > 1 ? 'départements' : 'département'} ${BORNES_DEPS.join(', ')})` : '') +
    (elec ? ' · prises compatibles' : '') +
    (tronqB ? ` · ${tronqB} de plus non affichée${tronqB > 1 ? 's' : ''} (plafond ${PLAFOND} stations et bornes)` : '');
  $('compteBornes').textContent = compte;
  if(elec){ $('compte').textContent = compte; $('titreStations').textContent = ''; majEtat(); }
  $('thDistB').textContent = ROUTE ? 'Km du trajet' : 'Distance';
  const msg = $('bornesMsg');
  const filtres = BF.kwMin > 0 || BF.gratuit || BF.cb || BF.ouvert;
  const texteMsg = BORNES_MSG || (n ? '' : BORNES.length
    ? (ROUTE ? `Aucune borne du trajet${filtres ? ' ne passe les filtres' : ''} dans la zone affichée — dézoomez, acceptez un détour plus grand${filtres ? ', baissez la puissance minimale ou décochez un filtre' : ''}.`
             : `Aucune borne${filtres ? ' ne passe les filtres' : ''} dans la zone affichée — déplacez la carte ou dézoomez${filtres ? ', baissez la puissance minimale ou décochez un filtre' : ''}.`)
    : (IRVE_ETAT === 'indisponible' ? 'bornes indisponibles hors ligne' : BORNES_CHARGEMENT ? 'chargement des bornes…'
       : ROUTE ? 'Aucune borne connue le long de ce trajet dans la Base nationale des IRVE.' : 'Aucune borne connue dans la zone affichée.'));
  msg.hidden = !texteMsg; msg.textContent = texteMsg;
  // Marqueurs : les moins puissantes d'abord, les rapides restent dessus ; vue large : pastille seule.
  const compact = CARTE && map && map.getZoom() < 10;
  if(CARTE) [...affichees].sort((a, b) => (a.kw || 0) - (b.kw || 0)).forEach(b => {
    const cls = classePuissance(b.kw);
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'marqueur marqueur-b'; el.tabIndex = -1; el.dataset.id = b.id;
    el.setAttribute('aria-label', `${brut(b.n)} — ${libellePuissance(b.kw)}`);
    el.innerHTML = `<div class="lbl-b ${cls}${compact ? ' pastille' : ''}">${ico('eclair')}${compact ? '' : kwCourt(b.kw)}</div>`;
    el.addEventListener('click', e => { e.stopPropagation(); ouvrirBorne(b, el); });
    MARQUEURS_B.push(CARTE.marqueur(b.la, b.lo, el));
  });
  // Arrets numerotes du plan de charge, au-dessus des bornes.
  if(CARTE && etapes) etapes.forEach((nums, b) => {
    const e = document.createElement('div');
    e.className = 'etape-num'; e.textContent = nums.join('·'); e.title = `Arrêt ${nums.join(' et ')} — ${brut(b.n)}`;
    MARQUEURS_B.push(CARTE.marqueur(b.la, b.lo, e));
  });
  // Liste en cartes (DOM : les noms et horaires viennent du fichier IRVE).
  liste.replaceChildren(...affichees.map((b, i) => {
    const cls = classePuissance(b.kw), maj = libelleMaj(b.maj, new Date());
    const et = etapes && etapes.get(b);
    const li = mk('li');
    const bt = mk('button', 'carte carte-b' + (et ? ' etape' : ''));
    bt.type = 'button'; bt.setAttribute('aria-haspopup', 'dialog'); bt.dataset.id = b.id; bt.dataset.i = i;
    const ville = mk('span', 'ville');
    if(et){ const badge = mk('span', 'badge', mkSvg('eclair'), ` Arrêt${et.length > 1 ? 's' : ''} ${et.join(' · ')}`); ville.append(badge, ' '); }
    ville.append(brut(b.n));
    const prix = mk('span', 'prix', mk('span', 'kw ' + cls, mkSvg('eclair'), ' ', libellePuissance(b.kw)),
                    b.pdc > 1 ? mk('span', 'cp', `${b.pdc} points`) : null);
    const adr = mk('span', 'adr', [b.op ? brut(b.op) : null, libellePrises(b), libellePaiement(b)].filter(Boolean).join(' · '));
    const meta = mk('span', 'meta', mk('span', null, ROUTE ? `${b.ecart.toFixed(1)} km du trajet` : `${b.d.toFixed(1)} km`),
                    ROUTE && b.kmr != null ? mk('span', null, `km ${Math.round(b.kmr)}`) : null,
                    mk('span', null, libelleHoraires(b.h)), mk('span', maj.ancien ? 'ancien' : null, maj.ancien ? 'donnée ancienne' : maj.txt));
    bt.append(ville, prix, adr, meta);
    bt.addEventListener('click', () => {
      if(CARTE) CARTE.aller([b.la, b.lo], Math.max(map.getZoom(), 14), true, MOBILE.matches ? [0, -Math.round(panneau.offsetHeight / 2)] : [0, 0]);
      ouvrirBorne(b, bt);
    });
    li.append(bt);
    return li;
  }));
  LISTE_BORNES = affichees;
}
document.querySelectorAll('.tri button[data-kb]').forEach(b => {
  b.onclick = () => {
    triB = b.dataset.kb;
    document.querySelectorAll('.tri button[data-kb]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    rendu();
  };
});
$('listeBornes').addEventListener('keydown', e => {
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const cartes = [...$('listeBornes').querySelectorAll('.carte')];
  const i = cartes.indexOf(document.activeElement);
  if(i < 0) return;
  cartes[e.key === 'ArrowDown' ? Math.min(cartes.length - 1, i + 1) : Math.max(0, i - 1)].focus(); e.preventDefault();
});
$('replierBornes').onclick = () => {
  const ouvert = $('replierBornes').getAttribute('aria-expanded') !== 'true';
  $('replierBornes').setAttribute('aria-expanded', String(ouvert));
  $('bornesZone').hidden = !ouvert;
};

// Fiche borne (feuille) : nom, operateur, points de charge, puissances, prises, paiement, horaires,
// acces, PMR, date de mise a jour (« donnée ancienne » au-dela d'un an), « Y aller » (meme feuille
// de choix d'application que les stations).
let BORNE = null;
function ouvrirBorne(b, origine){
  BORNE = b;
  const d = b.d != null ? b.d : dist(b.la, b.lo);
  $('fbTitre').textContent = brut(b.n);
  $('fbOperateur').textContent = b.op ? brut(b.op) : 'opérateur non renseigné';
  $('fbInfos').replaceChildren(
    mk('span', null, mkSvg('epingle'), ' ', ROUTE && b.ecart != null ? `${b.ecart.toFixed(1)} km du trajet · km ${Math.round(b.kmr)}` : `${d.toFixed(1)} km du repère`),
    mk('span', null, mkSvg('eclair'), ' ', `${b.pdc} point${b.pdc > 1 ? 's' : ''} de charge`));
  const ouvert = ouvertA(brut(b.h || ''), new Date());
  const ligne = (icone, ...txt) => mk('li', null, mkSvg(icone), mk('span', null, ...txt));
  $('fbDetails').replaceChildren(
    ligne('eclair', mk('b', null, 'Puissance : '), b.kw > 0 ? `${libellePuissance(b.kw)} au maximum` + (b.kwmin > 0 && b.kwmin < b.kw ? ` (${libellePuissance(b.kwmin)} au minimum)` : '') : 'inconnue'),
    ligne('prise', mk('b', null, 'Prises : '), libellePrises(b)),
    ligne(b.gratuit === true ? 'cadeau' : 'cartebancaire', mk('b', null, 'Paiement : '), libellePaiement(b)),
    ligne('horloge', mk('b', null, 'Horaires : '), brut(libelleHoraires(b.h)),
          ouvert === true ? ' · ouvert maintenant' : ouvert === false ? mk('span', 'ko-lbl', ' · fermé maintenant') : ''),
    ligne('cadenas', mk('b', null, 'Accès : '), b.acces === 'libre' ? 'libre' : b.acces === 'reserve' ? 'réservé (clientèle, badge…)' : 'non renseigné'),
    ligne('pmr', mk('b', null, 'Accessibilité PMR : '), b.pmr === true ? 'oui' : b.pmr === false ? 'non' : 'non renseignée'));
  const maj = libelleMaj(b.maj, new Date());
  $('fbMaj').textContent = maj.txt.charAt(0).toUpperCase() + maj.txt.slice(1) + (maj.ancien ? ' : vérifiez avant d\'y compter.' : '.');
  $('fbMaj').classList.toggle('ancien', maj.ancien);
  ouvrirFeuille('ficheBorne', origine);
}
$('fbAller').onclick = () => { if(BORNE) allerA(BORNE, $('fbAller')); };

// ---- Plan de charge en heros (vehicule electrique + trajet) ----
// Chiffre-heros = temps de charge total ; sous-ligne = arrets et pourcentage a l'arrivee ; ligne
// de temps des arrets numerotes (borne, km, kWh, puissance, minutes, % avant / apres), aussi
// numerotes sur la carte. Etats dessines : faisable sans recharge (autonomie restante), infaisable
// (remedes concrets : puissance minimale, prise Type 2, couloir, reserve), vehicule a completer.
let DEPART_PCT = null;   // etat de charge au depart saisi pour CE trajet (non memorise ; null = celui de la fiche)
['depart', 'arrivee'].forEach(id => $(id).addEventListener('input', () => { DEPART_PCT = null; }));
function renduElec(){
  const v = vehActif(), ve = vehElec(v);
  MARQUEURS.forEach(m => m.remove()); MARQUEURS = [];
  $('liste').innerHTML = ''; LISTE_COURANTE = [];
  $('secStations').hidden = true;
  $('blocPlan').hidden = true;
  $('titreListe').firstChild.textContent = ROUTE ? 'Sur le trajet' : 'Autour de vous';
  $('echelle').textContent = '';
  majCompte = () => {};
  let etapes = null, resume = '';
  if(ROUTE && KMS){
    const total = KMS[KMS.length - 1];
    $('blocPlan').hidden = false;
    if(TRAJET){
      $('planTrajet').textContent = `${TRAJET.dep} ${TRAJET.ar ? '⇄' : '→'} ${TRAJET.arr}`;
      $('planMeta').textContent = `${Math.round(TRAJET.km)} km · ${duree(TRAJET.min)}`;
    }
    const heros = [];
    const ouvrirGarage = champ => { appliquerVeh(); ouvrirFeuille('garage', $('chipVeh')); if(champ) $(champ).focus(); };
    const en = autonomieElectrique(ve);
    const larg = +$('couloir').value;
    if(!en){
      const manque = [!(ve.batterieKwh > 0) && 'la batterie utile', !(ve.consoKwh100 > 0) && 'la consommation en kWh/100 km'].filter(Boolean).join(' et ');
      heros.push(mk('div', 'heros-etat', mk('b', null, 'Véhicule à compléter'), ` — renseignez ${manque} pour savoir où recharger.`,
        mk('div', 'actions',
          mkBtn('btn primaire', 'Compléter le véhicule', () => ouvrirGarage(!(ve.batterieKwh > 0) ? 'vbatt' : 'vconsoKwh'), 'garage'),
          mkBtn('btn', 'Assistant', () => ASSISTANT.ouvrir(vehActif()), 'estimer'))));
      resume = 'Plan de charge : véhicule à compléter.';
    }else{
      const departPct = DEPART_PCT != null ? DEPART_PCT : ve.departPct;
      // Candidats : bornes du couloir passant les filtres, une occurrence par position (aller, retour).
      const cand = [];
      filtrerBornes(BORNES, critBornes()).forEach(b => {
        if(!situerBorne(b)) return;
        b.occ.forEach(o => { if(o.d <= larg) cand.push({s: b, km: o.km, e: o.d}); });
      });
      cand.sort((a, b) => a.km - b.km);
      const r = optimiserPlanElectrique(cand, null, total, null, ve, {departPct});
      const E0 = en.B * departPct / 100, Autile = Math.max(0, E0 - en.R) / en.lkm;
      etapes = new Map();
      r.arrets.forEach((a, i) => { const l = etapes.get(a.station) || []; l.push(i + 1); etapes.set(a.station, l); });
      // Couloir et etat de charge au depart : reglables sous le chiffre (select#couloir reste la
      // source de verite : lien partage, liste, carte).
      const reglages = () => {
        const bloc = mk('div', 'couloir-chips', 'Bornes jusqu\'à ');
        const grp = mk('span', null); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'Largeur du couloir');
        [1, 2, 5, 10, 20].forEach(w => {
          const b = mkBtn('', `${w} km`, () => { if(+$('couloir').value === w) return; $('couloir').value = String(w); $('couloir').dispatchEvent(new Event('change')); });
          b.setAttribute('aria-pressed', String(w === larg)); grp.append(b);
        });
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = '5'; inp.max = '100'; inp.step = '5'; inp.inputMode = 'numeric'; inp.value = String(Math.round(departPct));
        inp.setAttribute('aria-label', 'État de charge au départ, en pour cent');
        inp.onchange = () => { const p = +inp.value; DEPART_PCT = Number.isFinite(p) && p >= 5 && p <= 100 ? p : null; rendu(); };
        bloc.append(grp, ' de la route · départ à ', inp, ' %');
        return bloc;
      };
      const rappel = mk('p', 'heros-rappel',
        `≈ ${Math.round(Autile)} km utiles au départ (batterie ${virgule(ve.batterieKwh)} kWh à ${Math.round(departPct)} %, réserve ${Math.round(ve.reservePct)} % gardée) · ${virgule(ve.consoKwh100)} kWh/100 km` +
        ` · ${ve.kwMaxDC > 0 ? `${virgule(ve.kwMaxDC)} kW en continu` : 'pas de charge rapide'}${ve.kwMaxAC > 0 ? `, ${virgule(ve.kwMaxAC)} kW en alternatif` : ''}` +
        ` · bornes à ${larg} km de la route au plus` + (BF.kwMin ? ` · ≥ ${BF.kwMin} kW` : '') + (BF.gratuit ? ' · gratuites' : '') + (BF.cb ? ' · carte bancaire' : '') + (BF.ouvert ? ' · ouvertes maintenant' : '') +
        ' · temps : 5 min de branchement par arrêt, puissance divisée par deux au-delà de 80 %.');
      const kwb = kw => mk('span', 'kwb ' + classePuissance(kw), libellePuissance(kw));
      const item = (cls, pt, titre, lignes, borne) => {
        const li = mk('li', cls);
        const p = mk('span', 'lt-pt' + (pt.plein ? ' plein' : '') + (pt.pause ? ' pause' : '') + (pt.elec ? ' elec' : ''), pt.txt || '');
        p.setAttribute('aria-hidden', 'true');
        const txt = mk('div', 'lt-txt', mk('b', null, titre));
        (lignes || []).filter(Boolean).forEach(l => txt.append(mk('span', 'lt-ligne', ...(Array.isArray(l) ? l : [l]))));
        li.append(p, txt);
        if(borne){
          const b = mkBtn('lt-aller', 'Y aller', () => allerA(borne, b), 'navigation');
          b.setAttribute('aria-label', `Y aller : ${brut(borne.n)}`);
          li.append(b);
        }
        return li;
      };
      const kmRestants = pct => Math.max(0, en.B * pct / 100 - en.R) / en.lkm;
      const ligneTemps = () => {
        const ol = mk('ol', 'ligne-temps');
        ol.setAttribute('aria-label', 'Arrêts du plan de charge');
        ol.append(item('lt-depart', {plein: true}, `Départ · batterie à ${Math.round(departPct)} %`, [`≈ ${Math.round(Autile)} km utiles`]));
        const ajouter = (de, a) => r.arrets.forEach((e, i) => {
          if(e.kmDepuisDepart < de || e.kmDepuisDepart >= a) return;
          ol.append(item('lt-etape', {txt: String(i + 1), elec: true}, `Arrêt ${i + 1} — ${brut(e.station.n)}`,
            [[`km ${Math.round(e.kmDepuisDepart)} · `, kwb(e.kw), e.detourKm > 0.05 ? ` · détour ${virgule((2 * e.detourKm).toFixed(1))} km` : ''],
             `+${Math.round(e.kwhCharges)} kWh en ≈ ${Math.round(e.minutes)} min · ${pctTxt(e.pctArrivee)} → ${pctTxt(e.pctDepart)}`,
             e.station.op ? `${brut(e.station.op)} · ${libellePaiement(e.station)} · ${brut(libelleHoraires(e.station.h))}` : `${libellePaiement(e.station)} · ${brut(libelleHoraires(e.station.h))}`],
            e.station));
        });
        if(ROUTE_AR){
          ajouter(0, ALLER_KM);
          ol.append(item('lt-arrivee', {pause: true}, `Arrivée — ${TRAJET ? TRAJET.arr : 'arrivée'}`, [`km ${Math.round(ALLER_KM)}`]));
          ajouter(ALLER_KM, Infinity);
          ol.append(item('lt-retour', {plein: true}, `Retour — ${TRAJET ? TRAJET.dep : 'départ'}`, [`km ${Math.round(total)} · ${pctTxt(r.pctArrivee)} à l'arrivée (≈ ${Math.round(kmRestants(r.pctArrivee))} km restants)`]));
        }else{
          ajouter(0, Infinity);
          ol.append(item('lt-arrivee', {plein: true}, `Arrivée — ${TRAJET ? TRAJET.arr : 'arrivée'}`, [`km ${Math.round(total)} · ${pctTxt(r.pctArrivee)} à l'arrivée (≈ ${Math.round(kmRestants(r.pctArrivee))} km restants, réserve comprise)`]));
        }
        return ol;
      };
      if(!r.faisable && BORNES_CHARGEMENT && r.motif === 'aucune borne compatible dans le couloir'){
        heros.push(mk('div', 'heros-etat', mk('b', null, 'Recherche des bornes du trajet…'), ` — ${Math.round(Autile)} km utiles au départ pour ${Math.round(total)} km.`));
        heros.push(reglages(), rappel);
        resume = 'Plan de charge : chargement des bornes.';
      }else if(!r.faisable){
        // Infaisable : dire pourquoi et proposer des remedes cliquables, jamais un ecran vide.
        const actions = mk('div', 'actions');
        if(BF.kwMin > 0) actions.append(mkBtn('btn primaire', `Toute puissance (retirer « ≥ ${BF.kwMin} kW »)`, () => { $('bKwMin').value = '0'; $('bKwMin').dispatchEvent(new Event('change')); }, 'filtre'));
        if(BF.gratuit || BF.cb || BF.ouvert) actions.append(mkBtn('btn', 'Retirer les autres filtres', () => { $('bGratuit').checked = false; $('bCb').checked = false; $('bOuvert').checked = false; $('bGratuit').dispatchEvent(new Event('change')); }, 'filtre'));
        if(!(ve.kwMaxAC > 0)) actions.append(mkBtn('btn' + (BF.kwMin > 0 ? '' : ' primaire'), 'Accepter la charge lente (prise Type 2, 7,4 kW)', () => { v.kwMaxAC = '7.4'; appliquerVeh(); reglagesEcrits(); rendu(); }, 'prise'));
        if(larg < 20){ const suiv = [1, 2, 5, 10, 20].find(w => w > larg); actions.append(mkBtn('btn', `Élargir le couloir (${larg} → ${suiv} km)`, () => { $('couloir').value = String(suiv); $('couloir').dispatchEvent(new Event('change')); }, 'route')); }
        if(ve.reservePct > 5) actions.append(mkBtn('btn', `Réduire la réserve (${Math.round(ve.reservePct)} → 5 %)`, () => { v.reservePct = '5'; appliquerVeh(); reglagesEcrits(); rendu(); }));
        if(departPct < 100) actions.append(mkBtn('btn', 'Partir à 100 %', () => { DEPART_PCT = 100; rendu(); }, 'batterie'));
        actions.append(mkBtn('btn', 'Revoir la batterie', () => ouvrirGarage('vbatt'), 'garage'));
        const motif = r.motif === 'aucune borne compatible dans le couloir'
          ? (BORNES_MSG === 'bornes indisponibles hors ligne' || IRVE_ETAT === 'indisponible' ? 'les bornes sont indisponibles hors ligne : impossible de calculer un plan de charge.'
             : !BORNES.length && !BORNES_DEPS.length ? 'aucune borne connue le long de ce trajet dans la Base nationale des IRVE.'
             : `aucune borne compatible (prise ${LIBELLE_PRISE[ve.prise]}${ve.kwMaxAC > 0 ? ' ou Type 2' : ''}${BF.kwMin ? `, ≥ ${BF.kwMin} kW` : ''}) à ${larg} km de la route au plus.`)
          : `${Math.round(Autile)} km utiles au départ pour ${Math.round(total)} km : avec les bornes compatibles à ${larg} km de la route au plus, aucune suite d'arrêts ne passe sans entamer la réserve.`;
        heros.push(mk('div', 'heros-etat ko', mkSvg('alerte'), ' ', mk('b', null, 'Trajet impossible avec ces bornes'), ` — ${motif}`, actions));
        heros.push(reglages(), rappel);
        resume = `Plan de charge : trajet infaisable — ${motif}`;
      }else if(!r.arrets.length){
        heros.push(mk('div', 'heros-etat ok', mk('b', null, 'Aucune recharge nécessaire'),
          ` — ${Math.round(total)} km pour ≈ ${Math.round(Autile)} km utiles au départ : vous arrivez à ${pctTxt(r.pctArrivee)} (≈ ${Math.round(kmRestants(r.pctArrivee))} km d'autonomie restante, réserve comprise).`));
        heros.push(mk('p', 'heros-chiffre', mk('b', null, '0 min'), mk('span', null, 'de charge en route')));
        heros.push(mk('p', 'heros-sous', `0 arrêt · ${pctTxt(r.pctArrivee)} à l'arrivée · ≈ ${Math.round(r.energieKwh)} kWh consommés`));
        heros.push(reglages(), rappel, ligneTemps());
        resume = `Plan de charge : aucune recharge nécessaire, ${pctTxt(r.pctArrivee)} à l'arrivée.`;
      }else{
        const kwh = r.arrets.reduce((t, a) => t + a.kwhCharges, 0);
        heros.push(mk('p', 'heros-chiffre', mk('b', null, duree(r.minutesCharge)), mk('span', null, 'de charge en route')));
        heros.push(mk('p', 'heros-sous', `${r.arrets.length} arrêt${r.arrets.length > 1 ? 's' : ''} · ${pctTxt(r.pctArrivee)} à l'arrivée · ≈ ${Math.round(kwh)} kWh rechargés`));
        heros.push(reglages(), rappel, ligneTemps());
        resume = `Plan de charge : ${r.arrets.length} arrêt${r.arrets.length > 1 ? 's' : ''}, ${duree(r.minutesCharge)} de charge, ${pctTxt(r.pctArrivee)} à l'arrivée.`;
      }
    }
    $('plan').replaceChildren(...heros.filter(Boolean));
    if($('planEtat').textContent !== resume) $('planEtat').textContent = resume;
  }
  renduBornes(true, etapes);
}

// Cadrage initial deterministe (~10 km autour du repere de depart), sans fitBounds ni
// animation : aucun recadrage sans geste de l'utilisateur.
if(REGL.sansCher === false) $('sansCher').checked = false;
if(REGL.couloir) $('couloir').value = REGL.couloir;
if(REGL.queUtiles === false) $('queUtiles').checked = false;
if(REGL.sansPeage) $('sansPeage').checked = true;
appliquerVeh();
appliquerTheme();
majFonds();

// Le referentiel (60 km) part en parallele du premier chargement : la carte
// s'affiche sans l'attendre, puis se recolore des qu'il arrive.
async function chargerReferentiel(){
  const w = encodeURIComponent(
    `distance(geom, geom'POINT(${CENTRE[1]} ${CENTRE[0]})', 60km)`);   // secteur courant
  let rows=[], off=0, tot=1;
  while(off < tot && off < 600){
    const r = await fetch(`${URL_API}?where=${w}&select=${SEL}&limit=100&offset=${off}`, {signal: AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    tot = j.total_count; rows = rows.concat(j.results); off += 100;
  }
  REF_ROWS = normalise(rows);
}
chargerReferentiel().then(rendu).catch(() => {});
// Trajet importe (#trajet=) : calcule tout de suite si le depart est une adresse, sinon
// une fois la geolocalisation repondue (acceptee ou non : le repere memorise sert alors).
function lancerTrajetImporte(){
  if(!TRAJET_IMPORT) return;
  TRAJET_IMPORT = null;
  TRAJET_SANS_GESTE = true;
  $('trajet').requestSubmit();
}
if(TRAJET_IMPORT && !TRAJET_IMPORT.attendPosition) lancerTrajetImporte();
else charger();     // on affiche tout de suite, sans attendre l'autorisation
// La carte nait a la frame suivante, la premiere requete deja partie (voir initialiserCarte).
requestAnimationFrame(initialiserCarte);
localiser(true, () => lancerTrajetImporte());   // puis on recentre sur l'appareil si l'utilisateur accepte

// ---------- Assistant vehicule (premier lancement, ou bouton du garage) ----------
const ASSISTANT = creerAssistant({
  $, REGL, CASES, TYPES, CATEGORIES_CONSO, estimerConso, estimerConsoElec, autonomieUtile, autonomieElectrique, ico,
  ouvrirFeuille, fermerFeuille, localiser, reticule, geocoder, situer, rechercheOuverte, MOBILE, reglagesBruts,
  apresVehicule(){ appliquerVeh(); majSelectVeh(); charger(); },
});
$('vehAssistant').onclick = () => { reglagesEcrits(); ASSISTANT.ouvrir(REGL.vehicules[REGL.vehActif]); };
if(PREMIER && !IMPORT_HASH && !REGL.assistantVu) setTimeout(() => ASSISTANT.ouvrir(), 0);

// ---------- Nouvelle version disponible ----------
// Home Assistant sert /local/ avec un cache navigateur de 31 jours : sans ce controle,
// une nouvelle version restait invisible jusqu'a un rechargement force (constate le
// 17/09/2026 dans Chrome). La page relit sa propre adresse en contournant le cache ;
// si le marqueur de build differe, un bandeau propose de recharger. La relecture met
// aussi a jour le cache, donc le rechargement recupere bien la nouvelle version.
// Rien en file:// (fetch refuse) ; nouvelle verification au retour sur l'onglet,
// au plus toutes les 10 minutes.
// Avec le service worker (30/10/2026) : une nouvelle version detectee enregistre sw.js?v=<build>
// (nouvelle URL = nouveau worker), qui met la nouvelle page en cache ; le bandeau n'apparait que
// quand ce worker est pret (« installed »), et Recharger lui demande de prendre la main. Jamais
// de rechargement automatique.
const BUILD = document.querySelector('meta[name="fuelpilot-build"]')?.content || '';
let derniereVerif = 0;
// Le marqueur est dans les premiers 2 Ko de la page : on lit le flux jusqu'a lui et on
// l'interrompt, au lieu de telecharger 1,4 Mo et de les analyser au DOMParser (mesure du
// 30/10/2026 : 23 ms de calcul au demarrage, et toute la page re-telechargee a chaque ouverture).
// Premiere verification 3 s apres le demarrage : elle ne concurrence plus le premier rendu.
async function verifierVersion(){
  if(!/^https?:$/.test(location.protocol) || !BUILD) return;
  if(Date.now() - derniereVerif < 600000) return;
  derniereVerif = Date.now();
  try{
    const r = await fetch(location.pathname, {cache: 'no-cache'});
    if(!r.ok || !r.body) return;
    const lecteur = r.body.getReader(), dec = new TextDecoder();
    let txt = '', m = null;
    while(!m && txt.length < 65536){
      const {value, done} = await lecteur.read();
      if(value) txt += dec.decode(value, {stream: true});
      m = txt.match(/<meta name="fuelpilot-build" content="([^"]*)"/);
      if(done) break;
    }
    lecteur.cancel().catch(() => {});
    const enLigne = m && m[1];
    if(enLigne && enLigne !== BUILD){
      if(SW_OK) enregistrerSW(enLigne).then(reg => { if(!reg) montrerNouvelleVersion(); });
      else montrerNouvelleVersion();
    }
  }catch(e){ /* hors ligne : on reessaiera au prochain retour sur l'onglet */ }
}
function montrerNouvelleVersion(){
  if($('majDispo')) return;
  const d = document.createElement('div');
  d.id = 'majDispo'; d.className = 'maj-dispo'; d.setAttribute('role', 'status');
  const t = document.createElement('span');
  t.textContent = 'Nouvelle version de ViaMinus disponible';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn primaire'; b.textContent = 'Recharger';
  b.onclick = () => rechargerNouvelleVersion();
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'btn'; x.textContent = 'Plus tard';
  x.onclick = () => d.remove();
  d.append(t, b, x);
  ($('bandeaux') || document.body).appendChild(d);
}
setTimeout(verifierVersion, 3000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) verifierVersion(); });

// ---------- Appli installable et hors-ligne (service worker, 30/10/2026) ----------
// Uniquement en http(s) avec un navigateur qui sait faire : en file:// rien ne change (le
// fuelpilot.html telecharge marche comme avant, sans installation ni hors-ligne). sw.js est
// servi a cote de la page (pwa/) ; s'il manque ou echoue, la page fonctionne comme avant.
const SW_OK = /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator;
let SW_ATTENTE = null;   // worker installe, en attente : la nouvelle version prete
function surveillerSW(reg){
  const suivre = w => {
    if(!w) return;
    w.addEventListener('statechange', () => {
      if(w.state === 'installed' && navigator.serviceWorker.controller){ SW_ATTENTE = w; montrerNouvelleVersion(); }
    });
  };
  if(reg.waiting && navigator.serviceWorker.controller){ SW_ATTENTE = reg.waiting; montrerNouvelleVersion(); }
  suivre(reg.installing);
  reg.addEventListener('updatefound', () => suivre(reg.installing));
}
async function enregistrerSW(build){
  if(!SW_OK) return null;
  const page = location.pathname.split('/').pop();   // '' | index.html | fuelpilot.html : la coquille a pre-cacher
  const u = 'sw.js?v=' + encodeURIComponent(build || BUILD) + (page && page !== 'index.html' ? '&p=' + encodeURIComponent(page) : '');
  try{
    const reg = await navigator.serviceWorker.register(u);
    surveillerSW(reg);
    return reg;
  }catch(e){ return null; }
}
function rechargerNouvelleVersion(){
  if(!SW_ATTENTE){ location.reload(); return; }
  let fait = false;
  const recharger = () => { if(!fait){ fait = true; location.reload(); } };
  navigator.serviceWorker.addEventListener('controllerchange', recharger);
  SW_ATTENTE.postMessage({type: 'activer'});
  setTimeout(recharger, 3000);   // le worker ne repond pas : on recharge quand meme (reseau d'abord)
}
if(SW_OK) window.addEventListener('load', () => { enregistrerSW(BUILD); });

// Bandeau « Hors ligne — prix du … » (discret, empile avec « nouvelle version ») et mot sur la carte.
function montrerHorsLigne(texte){
  let d = $('horsLigne');
  if(!d){
    d = document.createElement('div');
    d.id = 'horsLigne'; d.className = 'maj-dispo hors-ligne'; d.setAttribute('role', 'status');
    ($('bandeaux') || document.body).appendChild(d);
  }
  const i = document.createElement('span'); i.innerHTML = ico('alerte');   // icone constante, texte en textContent
  d.replaceChildren(i, document.createTextNode(' '), Object.assign(document.createElement('b'), {textContent: texte}));
}
function cacherHorsLigne(){ $('horsLigne')?.remove(); }
function majCarteHorsLigne(){ const el = $('carteHorsLigne'); if(el) el.hidden = navigator.onLine !== false; }
window.addEventListener('offline', majCarteHorsLigne);
window.addEventListener('online', () => { majCarteHorsLigne(); charger(); });
majCarteHorsLigne();
