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

// Les reglages survivent au rechargement : sans cela, chaque F5 remettait les
// cases par defaut et faisait perdre la selection en cours.
const CLE = 'fuelpilot:reglages';
function reglagesLus(){
  try{
    // Ancienne cle (versions anterieures au 16/09/2026) lue si la nouvelle est vide.
    return JSON.parse(localStorage.getItem(CLE) ||
                      localStorage.getItem('carte-carburants:reglages')) || {};
  }catch(e){ return {}; }
}
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
// garage (suppression, renommage) qui doivent s'imposer telles quelles.
function reglagesBruts(){
  try{ localStorage.setItem(CLE, JSON.stringify(REGL)); }
  catch(e){ /* stockage refuse : on continue sans memoire */ }
}

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
  v.conso = document.getElementById('conso').value;
  v.cuve  = document.getElementById('cuve').value;
  v.reserve = document.getElementById('reserve').value;
  REGL.sansCher = document.getElementById('sansCher').checked;
  REGL.couloir  = document.getElementById('couloir').value;
  REGL.queUtiles = document.getElementById('queUtiles').checked;
  REGL.sansPeage = document.getElementById('sansPeage').checked;
  reglagesBruts();
  majSelectVeh();   // le garage a pu s'enrichir depuis un autre onglet
}
function majSelectVeh(){
  document.getElementById('veh').innerHTML = REGL.vehicules.map((v,i) =>
    `<option value="${i}"${i === REGL.vehActif ? ' selected' : ''}>${esc(v.nom)}</option>`).join('');
}
function appliquerVeh(){
  const v = REGL.vehicules[REGL.vehActif];
  document.querySelectorAll('#carbs input').forEach(i => i.checked = v.carbs.includes(i.value));
  document.getElementById('conso').value = v.conso || '';
  document.getElementById('cuve').value  = v.cuve || '';
  document.getElementById('reserve').value = v.reserve || '';
}
const coches = REGL.vehicules[REGL.vehActif].carbs;
document.getElementById('carbs').innerHTML = CASES.map(([k,l]) =>
  `<label class="case"><input type="checkbox" value="${k}"`+
  `${coches.includes(k)?' checked':''}> ${l}</label>`).join('');

// Regle de conception : AUCUNE coordonnee personnelle en dur. Le centre vient de
// la geolocalisation de l'appareil ; a defaut du dernier repere memorise sur CE
// navigateur ; a defaut d'une vue France entiere (clic droit pour poser le repere).
if(Array.isArray(REGL.centre)) CENTRE = REGL.centre.slice();
const ZOOM0 = CENTRE ? 13 : 6;
if(!CENTRE) CENTRE = [46.603, 2.334];
// Mouvement reduit demande par l'appareil : on coupe les animations de la
// carte (zoom, fondu, deplacement), sans rien changer au fonctionnement.
const CALME = matchMedia('(prefers-reduced-motion: reduce)').matches;
const map = L.map('map',{scrollWheelZoom:true, zoomAnimation:!CALME,
  fadeAnimation:!CALME, markerZoomAnimation:!CALME}).setView(CENTRE, ZOOM0, {animate:!CALME});

// Fond de carte : IGN Geoplateforme. OSM sert une tuile « Access blocked » quand
// la page vient d'un file:// (pas de Referer, exige par sa politique d'usage) —
// constate le 09/08/2026 dans Firefox. L'IGN n'a pas cette contrainte.
const FONDS = {
  "Plan IGN": L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile'+
    '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM'+
    '&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    {maxZoom:19, attribution:'Plan IGN © IGN — Géoplateforme'}),
  "Vue aérienne": L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile'+
    '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM'+
    '&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    {maxZoom:19, attribution:'Orthophotos © IGN — Géoplateforme'}),
};
FONDS["Plan IGN"].addTo(map);
L.control.layers(FONDS, null, {position:'topright'}).addTo(map);

// Icones inline (style Lucide, monochrome, stroke currentColor) : aucun
// fichier externe, aucune police d'icones, rien qui depende du reseau.
const ICO = {
  pompe: '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
         'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
         '<line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/>'+
         '<path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/>'+
         '<path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"/></svg>',
  viseur: '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
          '<line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>'+
          '<line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>'+
          '<circle cx="12" cy="12" r="7"/></svg>',
  alerte: '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
          'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
          '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>'+
          '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

// Bouton "viseur" directement sur la carte : arriver d'un geste sur sa position.
const CtrlLoc = L.Control.extend({
  options: {position: 'topleft'},
  onAdd(){
    const d = L.DomUtil.create('div', 'leaflet-bar');
    const a = L.DomUtil.create('a', '', d);
    a.href = '#'; a.title = 'Ma position'; a.setAttribute('aria-label', 'Ma position');
    a.innerHTML = ICO.viseur;
    a.style.cssText = 'display:flex;align-items:center;justify-content:center';
    L.DomEvent.on(a, 'click', e => { L.DomEvent.stop(e); localiser(false); });
    return d;
  }
});
map.addControl(new CtrlLoc());

// Repli automatique si l'IGN est vraiment indisponible. Avant le 17/09/2026, UNE tuile
// en erreur (reseau mobile, zoom rapide) basculait definitivement sur CARTO, qui exige
// desormais une cle : « API KEY REQUIRED » en travers de toute la carte. Desormais :
// bascule seulement apres 6 erreurs sans aucune tuile IGN chargee, vers OpenStreetMap
// (sans cle), et seulement en http(s) — en file://, OSM sert « Access blocked ».
// OSM reste hors du selecteur : sa politique d'usage exclut un usage courant par une appli.
const OSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom:19, attribution:'© les contributeurs OpenStreetMap'});
let secours = false, erreursIGN = 0, tuilesIGN = 0;
FONDS["Plan IGN"].on('tileload', () => { tuilesIGN++; });
FONDS["Plan IGN"].on('tileerror', () => {
  erreursIGN++;
  if(secours || tuilesIGN > 0 || erreursIGN < 6 || !/^https?:$/.test(location.protocol)) return;
  secours = true;
  map.removeLayer(FONDS["Plan IGN"]);
  OSM.addTo(map);
});
const repere = L.circleMarker(CENTRE,{radius:6,color:'#1d4ed8',weight:2,
  fillColor:'#3b82f6',fillOpacity:.9}).addTo(map)
  .bindTooltip('Point de repère — les distances partent d\'ici (clic droit sur la carte pour le déplacer)');

let layer = L.layerGroup().addTo(map);
let etapeLayer = L.layerGroup().addTo(map);
let DATA = [], sortKey = 'prix', sortAsc = true;

const dist = (la,lo) => {
  const R=6371, p=Math.PI/180;
  const dLa=(la-CENTRE[0])*p, dLo=(lo-CENTRE[1])*p;
  const a=Math.sin(dLa/2)**2+Math.cos(CENTRE[0]*p)*Math.cos(la*p)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};
// Trois couleurs seulement — bleu, noir, rouge. Un degrade continu fabriquait des
// bleu-vert qu'on ne distinguait pas du bleu franc sur le fond IGN (beige, vert,
// orange) ; trois teintes tranchees se lisent d'un coup d'oeil.
// Marron plutot que noir pour le gros du peloton : choix de lisibilite, plus
// lisible sur le Plan IGN que le noir, qui ecrasait la carte.
// Couleurs lues depuis les jetons app.css (--bleu/--marron/--rouge) : source
// unique de la palette. Repli sur les valeurs en dur si le jeton est absent
// (feuille non chargee, style calcule vide).
const jeton = (nom, repli) =>
  getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || repli;
const BLEU = jeton('--bleu', '#0b57d0'), MARRON = jeton('--marron', '#b07d10'),
      ROUGE = jeton('--rouge', '#c02626');
function couleur(p, b, mini){
  if(mini != null && p <= mini + 1e-9) return BLEU;    // le moins cher, ex aequo compris
  if(b && p > b.p90) return ROUGE;                     // 10 % les plus chers du secteur
  return MARRON;
}

// Referentiel de couleur : les bornes viennent du SECTEUR (60 km autour du
// point de repere), pas de la zone affichee. Sans cela, la moins chere d'un ecran de
// stations cheres s'afficherait en bleu — « la moins chere ici » n'est pas
// « une bonne affaire ». Bleu plein = sous le 1er decile, rouge plein = au-dessus
// du 9e decile.
let REF_ROWS = [];
function bornes(vue){
  const px = REF_ROWS.map(s => pick(s, vue)).filter(Boolean)
                     .map(v => v.p).sort((a,b) => a-b);
  if(px.length < 8) return null;
  const Q = f => px[Math.round(f*(px.length-1))];
  return {med: Q(0.50), p90: Q(0.90)};
}
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
// est rendu ensuite (tableau, bulles, liste des vehicules) est sain.
const esc = x => String(x).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function normalise(rows){
  return rows.map(r => {
    const la=parseFloat(r.latitude)/100000, lo=parseFloat(r.longitude)/100000;
    if(!isFinite(la)||!isFinite(lo)) return null;
    return {la, lo, ville:esc(r.ville||''), cp:esc(r.cp||''), adresse:esc(r.adresse||''),
            auto:r.horaires_automate_24_24==='Oui',
            rupture:esc([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                      .filter(Boolean).join(';')),
            hs:new Set([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                       .filter(Boolean).join(';').split(';')
                       .map(x => x.trim().toLowerCase()).filter(Boolean)),
            d:dist(la,lo),
            prix:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_prix']])),
            maj:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_maj']]))};
  }).filter(Boolean);
}

// Selection multiple : une station n'est retenue que si elle sert TOUS les
// carburants coches ; le classement se fait sur la somme, mais chaque carburant
// garde sa propre couleur (un bon E85 avec un SP quelconque doit se voir).
const COURT = {e10:'E10', sp98:'SP98', sp95:'SP95', e85:'E85',
               gazole:'Gazole', gplc:'GPLc'};
// Libelles tels qu'ils apparaissent dans carburants_rupture_* du flux officiel.
const RUPT = {e10:'e10', sp98:'sp98', sp95:'sp95', e85:'e85',
              gazole:'gazole', gplc:'gplc'};
const dispo = (s, k) => s.prix[k] != null && !s.hs.has(RUPT[k]);
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
  const px = REF_ROWS.map(s => pick(s, sel)).filter(Boolean)
                     .map(v => v.p).sort((a,b) => a-b);
  if(px.length < 8) return null;
  const Q = f => px[Math.round(f*(px.length-1))];
  return {med: Q(0.50), p90: Q(0.90)};
}

const gmaps = s => 'https://www.google.com/maps/dir/?api=1&destination='+s.la+','+s.lo;

const sansCherLbl = () => document.getElementById('sansCher').checked
  ? 'les 10 % les plus chers du secteur sont masqués'
  : 'rouge = les 10 % les plus chers du secteur';

function rendu(){
  const sel = choix();
  const tb = document.getElementById('tb');
  layer.clearLayers(); etapeLayer.clearLayers(); tb.innerHTML = '';
  document.getElementById('plan').style.display = 'none';
  if(!sel.length){
    document.getElementById('compte').textContent = 'aucun carburant coché';
    tb.innerHTML = '<tr><td colspan="5">Coche au moins un carburant.</td></tr>';
    return;
  }

  // En itineraire, le couloir est deja charge en entier : le zoom se contente de
  // filtrer l'affichage, ce qui est instantane et ne perd aucune station.
  let source = DATA;
  if(ROUTE){
    const large = +document.getElementById('couloir').value;
    const vue = map.getBounds();
    DATA.forEach(s => { if(s.ecart == null){
      const r = distTrace(s.la, s.lo); s.ecart = r.d; s.kmr = r.km; } });
    source = DATA.filter(s => s.ecart <= large && vue.contains([s.la, s.lo]));
  }
  const list = source.map(s => ({s, v: pick(s, sel)})).filter(o => o.v);
  const n = list.length;
  majCompte = t => document.getElementById('compte').textContent =
    `${n} station${n>1?'s':''} ${ROUTE ? 'sur le trajet, dans la zone affichée' : 'dans la zone affichée'}` + t +
    (tronque ? ` · ${tronque} de plus non chargée${tronque>1?'s':''} (plafond ${PLAFOND})` : '');
  majCompte('');
  if(!n){
    tb.innerHTML = ROUTE
      ? '<tr><td colspan="5">Aucune station du couloir ne sert cette combinaison dans la zone affichée — dézoome, élargis le couloir, ou décoche un carburant.</td></tr>'
      : '<tr><td colspan="5">Aucune station ne sert cette combinaison dans la zone affichée — dézoome, déplace la carte, ou décoche un carburant.</td></tr>';
    return;
  }

  const px = list.map(o => o.v.p);
  const refTotal = bornes(sel), miniTot = Math.min(...px);
  const refs  = sel.map(k => bornes([k]));
  const minis = sel.map((k,i) => Math.min(...list.map(o => o.v.lignes[i].prix)));
  const multi = sel.length > 1;

  document.getElementById('echelle').textContent =
    `— bleu = le moins cher affiché, ex æquo compris ; ${sansCherLbl()} · ` +
    sel.map((k,i) => `${k==='spmin'?'SP':COURT[k]} ${minis[i].toFixed(3)}` +
                     (refs[i] ? ` / ${refs[i].p90.toFixed(3)}` : '')).join(' · ') + ' €';

  const sansCher = document.getElementById('sansCher').checked;
  // Une station est « trop chere » des qu'UN des carburants demandes est dans le
  // 9e decile de son propre secteur — pas seulement quand la somme l'est. Sinon
  // le masque laissait passer des pastilles rouges, ce qui se voyait et se lisait mal.
  const chere = o => couleur(o.v.p, refTotal, miniTot) === ROUGE ||
                     o.v.lignes.some((l,j) => couleur(l.prix, refs[j], minis[j]) === ROUGE);
  const retenues = sansCher ? list.filter(o => !chere(o)) : list;
  const ecartees = list.length - retenues.length;

  // Dessin des pastilles, appele une fois connue la liste REELLEMENT affichee (voir
  // plus bas) : mn = prix minimum par carburant parmi ces seules stations.
  // Les plus cheres dessinees en premier : les etiquettes utiles restent dessus.
  const dessinerMarqueurs = (liste, mn) => [...liste].sort((a,b) => b.v.p - a.v.p).forEach((o,i) => {
    const {s,v} = o;
    const chips = v.lignes.map((l,j) =>
      `<span style="background:${couleur(l.prix, refs[j], mn[j])}">${l.tag} ${l.prix.toFixed(3)}</span>`).join('');
    const html = multi
      ? `<div class="lbl lbl2">${chips}</div>`
      : `<div class="lbl" style="background:${couleur(v.lignes[0].prix, refs[0], mn[0])};`+
        `border-color:#555;color:#fff">${v.lignes[0].prix.toFixed(3)}`+
        (sel[0]==='spmin' ? ` <span style="font-size:10px;opacity:.85">${v.lignes[0].tag}</span>` : '')+
        `</div>`;
    const h = multi ? 8 + 16*v.lignes.length : 20;
    const ic = L.divIcon({className:'', iconSize:[multi?80:62, h],
                          iconAnchor:[multi?40:31, h/2], html});
    const utilises = v.lignes.map(l => l.ref);
    L.marker([s.la,s.lo],{icon:ic, zIndexOffset:i*10, riseOnHover:true, stationRef:s})
      .addTo(layer).bindPopup(
        `<b>${s.ville} (${s.cp})</b><br>${s.adresse}` +
        (s.auto?'<br><i>automate 24 h/24</i>':'') +
        (s.rupture?`<br><span style="color:#c02626">rupture : ${s.rupture}</span>`:'') +
        '<ul class="fuels">' + FUELS.filter(([k]) => s.prix[k]!=null).map(([k,l])=>{
          const q = quand(s.maj[k]);
          const ko = s.hs.has(RUPT[k]);
          return `<li class="${utilises.includes(k)?'hi':''}"><span>${l}`+
                 `${ko?' <span style="color:#c02626">(en rupture)</span>':''}</span>`+
                 `<span class="dt${q.vieux?' vieux':''}">${q.txt}</span>`+
                 `<b style="${ko?'text-decoration:line-through;opacity:.55':''}">`+
                 `${s.prix[k].toFixed(3)} €</b></li>`;
        }).join('') + '</ul>' +
        '<div style="font-size:11.5px;color:#6b7280;margin-top:6px">'+
        'Dates = dernier relevé déclaré par la station.</div>' +
        `<div style="margin-top:8px"><a href="${gmaps(s)}" target="_blank" rel="noopener">Itinéraire ▸</a></div>`);
  });

  const gardees = retenues;
  const th = document.getElementById('thDist');
  const fleche = (th.textContent.match(/ [▲▼]$/) || [''])[0];   // ne pas manger le tri
  th.textContent = (ROUTE ? 'Écart au trajet' : 'Distance') + fleche;

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

  // ---- Plan de pleins : plein au depart, arrets choisis au moins cher ----
  // Autonomie utile = reservoir / conso x 100, moins 10 % de reserve. A chaque
  // etape : parmi les stations atteignables du couloir (masque ignore : mieux
  // vaut une station chere qu'une panne seche), la moins chere ; a prix egal,
  // la plus lointaine. Glouton simple, suffisant a cette echelle.
  const etapeNum = new Map();
  // Plein au depart / a l'arrivee : station -> libelle. Toujours visibles, meme avec
  // le filtre « arrets du plan » (demande Eric, 17/09/2026 : Orleans > Montpellier,
  // aucune station ni au depart ni a l'arrivee).
  const extremites = new Map();
  // Trajet sans arret necessaire : stations gardees a la place du plan (voir plus bas).
  const moinsCheres = new Set();
  let utilesPlan = null, horsPlan = 0;
  const elPlan = document.getElementById('plan');
  if(ROUTE && KMS){
    const conso = +document.getElementById('conso').value;
    const cuve  = +document.getElementById('cuve').value;
    elPlan.style.display = 'block';
    if(!(conso > 0) || !(cuve > 0)){
      elPlan.innerHTML = '<span style="color:var(--muted)">Renseigne conso et réservoir pour savoir où faire le plein.</span>';
    }else{
      // Reserve en KM (choix d'ergonomie) : plus parlant qu'un pourcentage.
      const resv = Math.max(0, +document.getElementById('reserve').value || 30);
      const A = cuve / conso * 100 - resv;
      const total = KMS[KMS.length - 1];
      const larg = +document.getElementById('couloir').value;
      const lkm = conso / 100;
      const carbPlan = sel[0];               // le plan se calcule sur le 1er carburant coche
      const candTous = DATA.filter(x => x.kmr != null)
                       .map(x => ({s: x, v: pick(x, sel)})).filter(o => o.v)
                       .map(o => ({s: o.s, v: o.v, km: o.s.kmr, e: o.s.ecart,
                                   p: o.v.lignes[0].prix}))
                       .sort((a,b) => a.km - b.km);
      const cand = candTous.filter(c => c.e <= larg);
      const r = optimiserPlan(cand, A, total, lkm);
      const plan = r.plan;
      const coutTotal = r.coutAchats || 0;
      utilesPlan = r.utiles || null;

      // Cout du voyage COMPLET : le plein de depart se paie aussi. Il est value
      // au meilleur prix disponible a moins de 15 km du point de depart.
      const coutVoyage = (candW, rw) => {
        if(!rw || rw.plan === null) return null;
        const pd = Math.min(...candW.filter(c => c.km <= 15).map(c => c.p));
        if(!isFinite(pd)) return null;
        const kmDep = rw.plan.length ? rw.plan[0].km + rw.plan[0].e : total;
        return pd * lkm * Math.min(kmDep, total) + rw.coutAchats;
      };
      const voyage = coutVoyage(cand, r);

      // Le cout depend de la largeur du couloir : plus large, plus de stations
      // pas cheres candidates — mais des detours plus longs. Comparatif calcule
      // sur les memes donnees (chargees a 20 km quoi qu'il arrive).
      const comparatif = [1, 2, 5, 10, 20].map(w => {
        const cw = candTous.filter(c => c.e <= w);
        const v = coutVoyage(cw, optimiserPlan(cw, A, total, lkm));
        return `${w === larg ? '<b>' : ''}${w} km : ${v == null ? '—' : v.toFixed(2) + ' €'}${w === larg ? '</b> ◄' : ''}`;
      }).join(' · ');

      // Temps perdu : ~5 min par arret + le detour parcouru a ~50 km/h.
      const minutes = e => 5 + (2 * e.e) / 50 * 60;
      const tempsTotal = (plan || []).reduce((t, e) => t + minutes(e), 0);

      // Ou faire le plein avant de partir, et ou le refaire en arrivant (15 km de chaque bout).
      const {depart, arrivee} = pleinsExtremites(cand, total);
      if(depart) extremites.set(depart.s, 'Départ');
      if(arrivee) extremites.set(arrivee.s, extremites.has(arrivee.s) ? 'Départ et arrivée' : 'Arrivée');

      (plan || []).forEach((e,i) => etapeNum.set(e.s, i + 1));
      // Trajet court, aucun arret necessaire : le filtre « arrets du plan » ne doit pas
      // vider la carte. On garde alors les moins cheres du couloir DANS LA ZONE AFFICHEE
      // (meme reference que le bleu : sinon le texte citait des stations hors ecran) :
      // TOUTES celles au prix le plus bas, ex aequo compris, donc toutes en bleu,
      // completees jusqu'a trois stations, departagees par le detour. Constate le
      // 17/09/2026 : Montpellier > Aniane, 35 km, 10 stations dans le couloir, carte et
      // tableau vides.
      if(plan && !plan.length && list.length){
        const parPrix = [...list].sort((a,b) => a.v.p - b.v.p || a.s.ecart - b.s.ecart);
        const pMin = parPrix[0].v.p;
        parPrix.forEach((o,i) => { if(o.v.p <= pMin + 1e-9 || i < 3) moinsCheres.add(o.s); });
      }
      (plan || []).forEach((e,i) => {
        L.circleMarker([e.s.la, e.s.lo], {radius: 17, color: '#0b57d0', weight: 3,
          fill: false, dashArray: '5 5'}).addTo(etapeLayer)
          .bindTooltip(`Étape ${i+1} — km ${Math.round(e.km)}`);
      });
      [[depart, '#158a3f', 'Plein au départ'], [arrivee, '#111827', 'Plein à l\'arrivée']].forEach(([o, c, t]) => {
        if(o) L.circleMarker([o.s.la, o.s.lo], {radius: 17, color: c, weight: 3, fill: false})
               .addTo(etapeLayer).bindTooltip(`${t} — km ${Math.round(o.km)}`);
      });
      const nomStation = o => `<b>${o.s.ville}</b> ${o.v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)}`).join(' + ')} €`+
                              ` (km ${Math.round(o.km)}, détour ${(2*o.e).toFixed(1)} km)`;
      const ligneDepart = `<span class="badge badge-dep">${ICO.pompe} Départ</span> Plein au départ : ` +
        (depart ? nomStation(depart) : 'aucune station à moins de 15 km du départ dans ce couloir');
      const ligneArrivee = `<span class="badge badge-arr">${ICO.pompe} Arrivée</span> Plein à l'arrivée : ` +
        (arrivee ? nomStation(arrivee) : 'aucune station à moins de 15 km de l\'arrivée dans ce couloir');
      const tete = `${ligneDepart} · autonomie utile ~${Math.round(A)} km`+
                   ` (${cuve} L × ${String(conso).replace('.', ',')} L/100, réserve ${resv} km)`;
      if(plan === null){
        elPlan.innerHTML = `${tete} · <b style="color:#c02626">${ICO.alerte} trajet infaisable avec cette`+
          ` autonomie dans ce couloir</b> — élargis le couloir, réduis la réserve ou vérifie conso et réservoir`;
      }else if(!plan.length){
        const lst = [...list].filter(o => moinsCheres.has(o.s))
                             .sort((a,b) => a.v.p - b.v.p || a.s.ecart - b.s.ecart);
        elPlan.innerHTML = `${tete} · trajet de ${Math.round(total)} km : <b>aucun arrêt nécessaire</b>`+
          (voyage != null ? ` · carburant du voyage ≈ <b>${voyage.toFixed(2)} €</b> (plein au départ)` : '') +
          (lst.length ? `<br>Pour un plein en route, les moins chères du couloir dans la zone affichée : ` +
            lst.map(o => `<b>${o.s.ville}</b> ${o.v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)}`).join(' + ')} €`+
                         ` (km ${Math.round(o.s.kmr)}, détour ${(2*o.s.ecart).toFixed(1)} km)`).join(' · ') : '') +
          `<br>${ligneArrivee}`;
      }else{
        elPlan.innerHTML = tete +
          ` · plan optimal sur ${COURT[carbPlan] || 'SP'}, détours comptés — achats en route ≈ <b>${coutTotal.toFixed(2)} €</b>` +
          (voyage != null ? ` · carburant du voyage ≈ <b>${voyage.toFixed(2)} €</b> (plein de départ compris)` : '') +
          ` · temps d'arrêts ≈ <b>${Math.round(tempsTotal)} min</b>` +
          `<br>` +
          plan.map((e,i) =>
            `<span class="badge">${ICO.pompe} ${i+1}</span> ${e.s.ville} km ${Math.round(e.km)}`+
            ` (détour ${(2*e.e).toFixed(1)} km ≈ ${(2*e.e*lkm*e.p).toFixed(2)} €, ~${Math.round(minutes(e))} min)`+
            ` — ${e.v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)}`).join(' + ')} €`).join(' · ') +
          `<br>${ligneArrivee}` +
          `<br><span style="color:var(--muted)">Voyage selon le couloir — ${comparatif}</span>`;
      }
    }
    // Une station du plan (etape, depart, arrivee) reste visible meme « trop chere » :
    // le plan y passe. La masquer faisait croire a un plan vide (constate le 17/09/2026 :
    // Le Caylar, etape 1 d'Orleans > Montpellier, absente du tableau et de la carte).
    const dansTri = new Set(tri.map(o => o.s));
    const reprises = list.filter(o => (etapeNum.has(o.s) || extremites.has(o.s)) && !dansTri.has(o.s));
    if(reprises.length){ tri.push(...reprises); tri.sort(ordre); }
    if(utilesPlan && document.getElementById('queUtiles').checked){
      const avant = tri.length;
      tri = tri.filter(({s}) => etapeNum.has(s) || moinsCheres.has(s) || extremites.has(s));
      const off = avant - tri.length;
      horsPlan = off;
      if(off) majCompte(` · ${off} hors plan masquée${off>1?'s':''}`);
    }
  }
  if(!tri.length){
    // Deux causes possibles, deux messages : le filtre du plan, ou le masque des cheres.
    tb.innerHTML = horsPlan
      ? '<tr><td colspan="5">Aucune station du plan dans la zone affichée — dézoome, ou décoche « Ne garder que les arrêts du plan » pour voir tout le couloir.</td></tr>'
      : '<tr><td colspan="5">Toutes les stations de la zone sont dans les 10 % les plus chères du secteur — décoche « Masquer les trop chères » pour les voir.</td></tr>';
    return;
  }
  // Couleurs calculees sur les stations REELLEMENT affichees, comme le dit la legende
  // (« le moins cher affiché ») : avec le filtre « arrets du plan », une etape seule
  // restait marron parce que des stations masquees etaient moins cheres ; ex aequo
  // compris, toutes les moins cheres affichees sont bleues (constate le 17/09/2026).
  const minisAff = sel.map((k,i) => Math.min(...tri.map(o => o.v.lignes[i].prix)));
  const miniTotAff = Math.min(...tri.map(o => o.v.p));
  document.getElementById('echelle').textContent =
    `— bleu = le moins cher affiché, ex æquo compris ; ${sansCherLbl()} · ` +
    sel.map((k,i) => `${k==='spmin'?'SP':COURT[k]} ${minisAff[i].toFixed(3)}` +
                     (refs[i] ? ` / ${refs[i].p90.toFixed(3)}` : '')).join(' · ') + ' €';
  dessinerMarqueurs(tri, minisAff);
  tri.forEach(({s,v})=>{
    const chips = v.lignes.map((l,j) =>
      `<span class="pill" style="background:${couleur(l.prix, refs[j], minisAff[j])}">${l.tag} ${l.prix.toFixed(3)}</span>`).join(' ');
    const prix = multi
      ? `<span class="pill" style="background:${couleur(v.p, refTotal, miniTotAff)}">${v.p.toFixed(3)} €</span>`+
        `<div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap">${chips}</div>`
      : chips;
    const et = etapeNum.get(s), mc = moinsCheres.has(s), ex = extremites.get(s);
    const tr=document.createElement('tr');
    if(et || mc || ex) tr.className = 'etape';
    tr.innerHTML = `<td>${prix}</td>`+
      `<td>${(ROUTE ? s.ecart : s.d).toFixed(1)} km`+
      (ROUTE && s.kmr != null ? `<br><span style="color:var(--muted);font-size:12px">km ${Math.round(s.kmr)}</span>` : '')+`</td>`+
      `<td>${ex ? `<span class="badge ${ex === 'Arrivée' ? 'badge-arr' : 'badge-dep'}">${ICO.pompe} ${ex}</span><br>` : ''}`+
      `${et ? `<span class="badge">${ICO.pompe} Étape ${et}</span><br>` : mc ? `<span class="badge">Moins chère</span><br>` : ''}${s.ville}<br><span style="color:var(--muted);font-size:12.5px">${s.cp}</span></td>`+
      `<td>${s.adresse}${s.auto?' <span style="color:var(--muted)">· 24/24</span>':''}</td>`+
      `<td>${jour(v.maj)}</td>`;
    tr.onclick = ()=>{ map.setView([s.la,s.lo],15,{animate:!CALME}); window.open(gmaps(s),'_blank','noopener'); };
    tb.appendChild(tr);
  });
}

window.addEventListener('resize', () => map.invalidateSize(false));
if('scrollRestoration' in history) history.scrollRestoration = 'manual';

document.querySelectorAll('th[data-k]').forEach(th=>{
  th.onclick = ()=>{
    const k=th.dataset.k;
    sortAsc = (k===sortKey) ? !sortAsc : true; sortKey=k;
    document.querySelectorAll('th[data-k]').forEach(o=>
      o.textContent=o.textContent.replace(/ [▲▼]$/,''));
    th.textContent += sortAsc?' ▲':' ▼';
    rendu();
  };
});
document.getElementById('carbs').onchange = () => { reglagesEcrits(); charger(); };
majSelectVeh();
document.getElementById('veh').onchange = e => {
  REGL.vehActif = +e.target.value;
  appliquerVeh(); reglagesEcrits(); ouvrirFiche(); charger();
};
const fiche = document.getElementById('fiche');
function ouvrirFiche(){
  fiche.hidden = false;
  document.getElementById('vnom').value = REGL.vehicules[REGL.vehActif].nom;
}
document.getElementById('vehPlus').onclick = () => {
  REGL.vehicules.push({nom: 'Véhicule ' + (REGL.vehicules.length + 1),
    carbs: DEFAUT.slice(), conso: '', cuve: '', reserve: ''});
  REGL.vehActif = REGL.vehicules.length - 1;
  appliquerVeh(); majSelectVeh(); reglagesEcrits(); ouvrirFiche(); charger();
};
document.getElementById('vehNom').onclick = () => {
  if(fiche.hidden) ouvrirFiche(); else fiche.hidden = true;
};
document.getElementById('vehOk').onclick = () => {
  reglagesEcrits();                       // synchronise sous le nom courant
  const nom = document.getElementById('vnom').value.trim();
  if(nom && nom !== REGL.vehicules[REGL.vehActif].nom){
    REGL.vehicules[REGL.vehActif].nom = nom;
    reglagesBruts();                      // renommage : ecriture directe
  }
  majSelectVeh(); fiche.hidden = true; charger();
};
document.getElementById('vehMoins').onclick = () => {
  if(REGL.vehicules.length <= 1) return;
  if(!confirm(`Supprimer « ${REGL.vehicules[REGL.vehActif].nom} » ?`)) return;
  REGL.vehicules.splice(REGL.vehActif, 1);
  REGL.vehActif = 0;
  reglagesBruts();                        // suppression : ecriture directe
  majSelectVeh(); appliquerVeh(); fiche.hidden = true; charger();
};

// Import d'une fiche vehicule par l'URL — sert aussi a PARTAGER un profil :
//   fuelpilot.html#veh=Nom|e85+e10|conso|cuve|reserve
(function(){
  // #pos=lat,lon : pose le repere sans geolocalisation — indispensable en
  // file:// (Firefox reserve la geolocalisation aux contextes securises).
  const mp = location.hash.match(/^#pos=(-?[0-9.]+),(-?[0-9.]+)$/);
  if(mp){
    setTimeout(() => situer(+mp[1], +mp[2], 'Point de repère'), 0);
    history.replaceState(null, '', location.pathname);
    return;
  }
  const m = location.hash.match(/^#veh=([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)$/);
  if(!m) return;
  const nom = decodeURIComponent(m[1]);
  const v = {nom,
    carbs: m[2] ? decodeURIComponent(m[2]).split('+') : DEFAUT.slice(),
    conso: decodeURIComponent(m[3]), cuve: decodeURIComponent(m[4]),
    reserve: decodeURIComponent(m[5])};
  const i = REGL.vehicules.findIndex(x => x.nom === nom);
  if(i >= 0) REGL.vehicules[i] = v; else REGL.vehicules.push(v);
  REGL.vehActif = i >= 0 ? i : REGL.vehicules.length - 1;
  appliquerVeh(); majSelectVeh(); reglagesEcrits();
  history.replaceState(null, '', location.pathname);
})();
document.getElementById('sansCher').onchange = () => { reglagesEcrits(); rendu(); };

const SEL = encodeURIComponent("__SELECT__");
const URL_API = "__API__";
const PLAFOND = 400;      // stations chargees au maximum pour une emprise donnee
const maj = document.getElementById('maj');
let tronque = 0, seq = 0, minuteur = null, majCompte = () => {};

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
  const large = +document.getElementById('couloir').value;
  // Hors itineraire : l'emprise de l'ecran. En itineraire : une suite d'emprises
  // courtes le long du trace, pour ne rien manquer sur un long trajet.
  const b = map.getBounds();
  const zones = ROUTE ? emprisesTrace(20)   // toujours le couloir maxi : la largeur
                      : [{s:b.getSouth(), n:b.getNorth(), w:b.getWest(), e:b.getEast()}];
  // choisie filtre localement, et le comparatif par largeur se fait sans recharger.
  const clause = clauseVue();
  maj.textContent = 'chargement…';
  try{
    let rows = [], reste = 0;
    for(const z of zones){
      const bbox = encodeURIComponent(
        `in_bbox(geom, ${z.s.toFixed(5)}, ${z.w.toFixed(5)}, ` +
        `${z.n.toFixed(5)}, ${z.e.toFixed(5)})` + clause);
      let off = 0, tot = 1;
      while(off < tot && off < PLAFOND){
        const r = await fetch(`${URL_API}?where=${bbox}&select=${SEL}&limit=100&offset=${off}`);
        if(!r.ok) throw new Error('HTTP '+r.status);
        const j = await r.json();
        if(mien !== seq) return;
        tot = j.total_count; rows = rows.concat(j.results); off += 100;
      }
      reste += Math.max(0, tot - Math.min(tot, PLAFOND));
    }
    const vus = new Set();
    rows = rows.filter(r => !vus.has(r.id) && vus.add(r.id));   // emprises jointives
    tronque = reste;
    DATA = normalise(rows);
    if(ROUTE){
      DATA = DATA.map(s => { const r = distTrace(s.la, s.lo);
                             return Object.assign(s, {ecart: r.d, kmr: r.km}); })
                 .filter(s => s.ecart <= 20);
    }
    maj.innerHTML = 'prix en direct · ' + new Date().toLocaleString('fr-FR',
      {weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }catch(e){
    if(mien !== seq) return;
    const vis = map.getBounds();
    DATA = normalise(SNAPSHOT).filter(s => vis.contains([s.la, s.lo]));
    tronque = 0;
    maj.innerHTML = '<span style="color:#c02626">hors ligne</span> — relevé du '+SNAP_DATE;
  }
  rendu();
}

map.on('moveend zoomend', () => {
  if(ROUTE){ rendu(); return; }      // couloir deja charge : simple refiltrage
  clearTimeout(minuteur);
  minuteur = setTimeout(charger, 400);
});
document.getElementById('couloir').onchange = () => { reglagesEcrits(); if(ROUTE) rendu(); };
document.getElementById('conso').onchange =
document.getElementById('cuve').onchange =
document.getElementById('reserve').onchange = () => { reglagesEcrits(); rendu(); };
document.getElementById('queUtiles').onchange = () => { reglagesEcrits(); rendu(); };
document.getElementById('sansPeage').onchange = () => {
  reglagesEcrits();
  if(ROUTE) document.getElementById('trajet').requestSubmit();
};

// Le centre suit l'appareil : la page reste juste pour qui la recoit, sans rien
// coder en dur de personnel. Le repere de secours ne sert que si la geoloc est
// refusee, indisponible ou trop lente.
function situer(lat, lon, libelle){
  CENTRE = [lat, lon];
  REGL.centre = [lat, lon]; reglagesEcrits();
  repere.setLatLng(CENTRE).setTooltipContent(libelle + " — les distances partent d'ici");
  map.setView(CENTRE, 13, {animate:!CALME});   // ~5 km autour du point ; declenche moveend -> rechargement
  charger();
  chargerReferentiel().then(rendu).catch(() => {});   // le secteur suit le nouveau centre
  // Le titre suit la position (nom de commune via la Base Adresse Nationale) :
  // la page peut etre partagee, la commune du snapshot ne doit pas rester figee.
  fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`)
    .then(r => r.json())
    .then(j => {
      const c = j.features?.[0]?.properties?.city;
      if(c){
        document.getElementById('lieu').textContent = ' — ' + c;
        document.title = 'FillHop — ' + c;
      }
    }).catch(() => {});
}
function localiser(auto){
  if(!navigator.geolocation){
    if(!auto) maj.textContent = 'géolocalisation non disponible';
    return;
  }
  maj.textContent = 'localisation…';
  navigator.geolocation.getCurrentPosition(
    pos => situer(pos.coords.latitude, pos.coords.longitude, 'Ma position'),
    ()  => { maj.textContent = Array.isArray(REGL.centre)
               ? 'position refusée — repère mémorisé utilisé'
               : 'position refusée — clic droit sur la carte pour poser le repère';
             charger(); },
    {enableHighAccuracy: false, timeout: 8000, maximumAge: 300000});
}
// ---------- Itineraire ----------
// Geocodage : Base Adresse Nationale. Trace : Geoplateforme IGN (bdtopo-osrm).
// Les deux sont publics, sans cle, et autorisent l'appel depuis un fichier local.
const BAN = 'https://api-adresse.data.gouv.fr/search/';
const ITI = 'https://data.geopf.fr/navigation/itineraire';
let ROUTE = null;        // [[lon,lat], …] simplifie
let traceLigne = null;
const infoT = document.getElementById('infoTrajet');

async function geocoder(q){
  if(!q.trim()) return {lon: CENTRE[1], lat: CENTRE[0], label: 'ma position'};
  const r = await fetch(`${BAN}?q=${encodeURIComponent(q)}&limit=1`);
  if(!r.ok) throw new Error('géocodage indisponible');
  const j = await r.json();
  if(!j.features.length) throw new Error(`adresse introuvable : « ${q} »`);
  const f = j.features[0];
  return {lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
          label: f.properties.label};
}

// Distance d'un point au trace, en km (approximation plane : a cette echelle
// l'erreur est negligeable devant la largeur du couloir).
let KMS = null;   // abscisse cumulee (km) de chaque point du trace
function preparerKms(){
  KMS = [0];
  for(let i=1; i<ROUTE.length; i++){
    const [lo1,la1] = ROUTE[i-1], [lo2,la2] = ROUTE[i];
    const kx = 111.32*Math.cos(la1*Math.PI/180);
    KMS.push(KMS[i-1] + Math.hypot((lo2-lo1)*kx, (la2-la1)*110.57));
  }
}

// Renvoie l'ecart au trace ET la position le long du trajet (km depuis le depart).
function distTrace(la, lo){
  const kx = 111.32*Math.cos(la*Math.PI/180), ky = 110.57;
  let best = Infinity, km = 0;
  for(let i=1; i<ROUTE.length; i++){
    const ax=(ROUTE[i-1][0]-lo)*kx, ay=(ROUTE[i-1][1]-la)*ky;
    const bx=(ROUTE[i][0]-lo)*kx,   by=(ROUTE[i][1]-la)*ky;
    const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
    let t = l2 ? -(ax*dx+ay*dy)/l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px=ax+t*dx, py=ay+t*dy, d=Math.hypot(px,py);
    if(d<best){ best=d; km = KMS ? KMS[i-1] + t*(KMS[i]-KMS[i-1]) : 0; }
  }
  return {d: best, km};
}

async function calculerTrajet(ev){
  ev.preventDefault();
  infoT.textContent = 'calcul…';
  try{
    const [a, b] = await Promise.all([
      geocoder(document.getElementById('depart').value),
      geocoder(document.getElementById('arrivee').value)]);
    // « Sans péage » : moteur bdtopo-pgr + interdiction des autoroutes (verifie
    // le 09/08 : la contrainte est IGNOREE par bdtopo-osrm, respectee par pgr).
    // Approximation assumee : quelques autoroutes gratuites (A75...) sont
    // evitees aussi.
    const sansP = document.getElementById('sansPeage').checked;
    const u = `${ITI}?resource=${sansP ? 'bdtopo-pgr' : 'bdtopo-osrm'}&profile=car&optimization=fastest`+
              `&start=${a.lon},${a.lat}&end=${b.lon},${b.lat}&geometryFormat=geojson`+
              (sansP ? `&constraints=${encodeURIComponent('{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}')}` : '');
    const r = await fetch(u);
    if(!r.ok) throw new Error('calcul d\'itinéraire indisponible');
    const j = await r.json();
    const pts = j.geometry.coordinates;
    const pas = Math.max(1, Math.round(pts.length/400));   // ~400 points suffisent
    ROUTE = pts.filter((_, i) => i % pas === 0);
    if(ROUTE[ROUTE.length-1] !== pts[pts.length-1]) ROUTE.push(pts[pts.length-1]);
    preparerKms();

    if(traceLigne) map.removeLayer(traceLigne);
    traceLigne = L.polyline(ROUTE.map(c => [c[1], c[0]]),
      {color:'#1d4ed8', weight:5, opacity:.45}).addTo(map);
    map.fitBounds(traceLigne.getBounds().pad(.08), {animate:!CALME});
    infoT.textContent = `${(j.distance/1000).toFixed(0)} km · ${Math.round(j.duration/60)} min`+
      `${sansP ? ' · sans autoroute' : ''} · ${a.label} → ${b.label}`;
    document.getElementById('effacer').hidden = false;
    charger();
  }catch(e){
    infoT.textContent = e.message;
  }
}
document.getElementById('trajet').onsubmit = calculerTrajet;
// Inverser depart et arrivee = le trajet retour en un clic. Un champ vide vaut
// « ma position » (cf. geocoder), donc l'echange reste juste quand le depart
// est implicite. Trace deja affiche : on relance le calcul, sinon on se
// contente d'echanger les deux champs.
document.getElementById('inverser').onclick = () => {
  const d = document.getElementById('depart'), a = document.getElementById('arrivee');
  [d.value, a.value] = [a.value, d.value];
  if(ROUTE) document.getElementById('trajet').requestSubmit();
};
document.getElementById('effacer').onclick = () => {
  ROUTE = null; KMS = null;
  if(traceLigne){ map.removeLayer(traceLigne); traceLigne = null; }
  document.getElementById('effacer').hidden = true;
  infoT.textContent = '';
  situer(CENTRE[0], CENTRE[1], repere.getTooltip().getContent().split(' —')[0]);
};

document.getElementById('maposition').onclick = () => localiser(false);
document.getElementById('repere').onclick = () => {
  if(Array.isArray(REGL.centre)) situer(REGL.centre[0], REGL.centre[1], 'Point de repère');
};
map.on('contextmenu', e => situer(e.latlng.lat, e.latlng.lng, 'Point de repère'));

// Cadrage initial deterministe (~10 km autour du repere de depart). On n'utilise plus
// fitBounds : Leaflet y fige le zoom sur la taille du conteneur au moment de
// l'appel, et une mise en page pas encore stabilisee (hauteur en vh, polices,
// defilement restaure au rechargement) donnait un cadrage de travers dans
// Firefox — constate le 09/08/2026.
if(REGL.sansCher === false) document.getElementById('sansCher').checked = false;
if(REGL.couloir) document.getElementById('couloir').value = REGL.couloir;
if(REGL.queUtiles === false) document.getElementById('queUtiles').checked = false;
if(REGL.sansPeage) document.getElementById('sansPeage').checked = true;
appliquerVeh();

map.invalidateSize(false);
map.setView(CENTRE, ZOOM0, {animate:!CALME});

// Le referentiel (60 km) part en parallele du premier chargement : la carte
// s'affiche sans l'attendre, puis se recolore des qu'il arrive.
async function chargerReferentiel(){
  const w = encodeURIComponent(
    `distance(geom, geom'POINT(${CENTRE[1]} ${CENTRE[0]})', 60km)`);   // secteur courant
  let rows=[], off=0, tot=1;
  while(off < tot && off < 600){
    const r = await fetch(`${URL_API}?where=${w}&select=${SEL}&limit=100&offset=${off}`);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    tot = j.total_count; rows = rows.concat(j.results); off += 100;
  }
  REF_ROWS = normalise(rows);
}
chargerReferentiel().then(rendu).catch(() => {});
charger();          // on affiche tout de suite, sans attendre l'autorisation
localiser(true);    // puis on recentre sur l'appareil si l'utilisateur accepte

// ---------- Nouvelle version disponible ----------
// Home Assistant sert /local/ avec un cache navigateur de 31 jours : sans ce controle,
// une nouvelle version restait invisible jusqu'a un rechargement force (constate le
// 17/09/2026 dans Chrome). La page relit sa propre adresse en contournant le cache ;
// si le marqueur de build differe, un bandeau propose de recharger. La relecture met
// aussi a jour le cache, donc le rechargement recupere bien la nouvelle version.
// Rien en file:// (fetch refuse) ; nouvelle verification au retour sur l'onglet,
// au plus toutes les 10 minutes.
const BUILD = document.querySelector('meta[name="fuelpilot-build"]')?.content || '';
let derniereVerif = 0;
async function verifierVersion(){
  if(!/^https?:$/.test(location.protocol) || !BUILD) return;
  if(Date.now() - derniereVerif < 600000) return;
  derniereVerif = Date.now();
  try{
    const r = await fetch(location.pathname, {cache: 'no-cache'});
    if(!r.ok) return;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const enLigne = doc.querySelector('meta[name="fuelpilot-build"]')?.content;
    if(enLigne && enLigne !== BUILD) montrerNouvelleVersion();
  }catch(e){ /* hors ligne : on reessaiera au prochain retour sur l'onglet */ }
}
function montrerNouvelleVersion(){
  if(document.getElementById('majDispo')) return;
  const d = document.createElement('div');
  d.id = 'majDispo'; d.className = 'maj-dispo'; d.setAttribute('role', 'status');
  const t = document.createElement('span');
  t.textContent = 'Nouvelle version de FillHop disponible';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn'; b.textContent = 'Recharger';
  b.onclick = () => location.reload();
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'btn'; x.textContent = 'Plus tard';
  x.onclick = () => d.remove();
  d.append(t, b, x);
  document.body.appendChild(d);
}
verifierVersion();
document.addEventListener('visibilitychange', () => { if(!document.hidden) verifierVersion(); });
