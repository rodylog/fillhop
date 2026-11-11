// Espagne : prix des carburants du ministere espagnol (Ministerio para la Transicion
// Ecologica y el Reto Demografico, « Precios de carburantes », Geoportal Gasolineras,
// donnees ouvertes). Module PUR (aucun DOM), CommonJS comme plan.js : testable sous Node,
// inline dans la page a la generation (generate.py, SCRIPTS).
//
// Source par province (celle que la page utilise, quelques centaines de ko ; le fichier
// national pese 12 Mo pour 11 422 stations le 28/10/2026) :
//   https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/
//     EstacionesTerrestres/FiltroProvincia/{IDProvincia}      (deux chiffres, 17 = Girona)
// Reponse : {Fecha: "28/10/2026 11:42:52", ListaEESSPrecio: [...], Nota, ResultadoConsulta: "OK"}.
// Formats MESURES le 28/10/2026 : tous les nombres sont des TEXTES a virgule decimale
// ("1,999", "41,917028") ; prix en €/L ; chaine vide = carburant non vendu (null, jamais 0) ;
// `Tipo Venta` P = vente au public, R = reserve (exclue) ; `Fecha` est l'horodatage GLOBAL
// du fichier, il n'y a pas de date par station : chaque station porte `Fecha` comme date de
// tous ses prix. `Horario` : « L-D: 24H », « L-S: 06:00-22:00; D: 07:00-22:00 » (jours L lundi,
// M mardi, X mercredi, J jeudi, V vendredi, S samedi, D dimanche ; regles separees par « ; »).
//
// But : une station espagnole normalisee a EXACTEMENT la forme d'une station francaise telle
// que app.js la construit (normalise()), plus `pays`, `enseigne` et `horario` — pour que la
// liste, la carte, la fiche et le plan de pleins (plan.js, inchange) les traitent sans rien savoir.

const ES_HOTE = 'https://sedeaplicaciones.minetur.gob.es';
const ES_URL = ES_HOTE + '/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/';
const ES_MAX_PROVINCES = 3;        // requetes par chargement au plus ; au-dela, l'ecran dit de zoomer
const ES_CACHE_MS = 30 * 60e3;     // cache memoire par province (le fichier change toutes les 30 min)
const ES_EMPRISE_MAX = 3;          // degres de latitude : au-dela, trop large pour charger l'Espagne

// Table des 52 provinces : id -> [nom, nb de stations, latMin, latMax, lonMin, lonMax], calculee
// le 28/10/2026 depuis le fichier complet (src/es-provincias.json). Sous Node : lue du fichier ;
// dans la page : inlinee par generate.py a la place du jeton (ci-dessous).
// Table v2 (demande du 30/10/2026) : bornes ROBUSTES calculees sur 11 422 stations (1er-99e centile
// par axe, marge 0,05°). La v1 (min/max bruts) etirait cinq boites jusqu'a l'equateur : stations
// avec latitude ou longitude a 0 (Barcelona, Madrid, Murcia, Cantabria) et valeurs aberrantes
// (Pontevedra). Les memes stations sont ecartees a l'ingestion (normaliserStationES, ES_ENVELOPPE).
const ES_PROVINCIAS = (typeof module !== 'undefined' && module.exports)
  ? require('./es-provincias.json') : __ES_PROVINCIAS__;

// Correspondance avec les carburants de l'application (cles de app.js : FUELS).
// Comptes du 28/10/2026 : GPL 995 stations, E10 28, E85 2 seulement.
const ES_CARBURANTS = {
  gazole: 'Precio Gasoleo A',
  sp95:   'Precio Gasolina 95 E5',
  sp98:   'Precio Gasolina 98 E5',
  e10:    'Precio Gasolina 95 E10',
  e85:    'Precio Gasolina 95 E85',
  gplc:   'Precio Gases licuados del petróleo',
};
const ES_CLES = ['e85', 'e10', 'sp98', 'sp95', 'gazole', 'gplc'];   // meme ordre que FUELS (app.js)
// Enveloppe de l'Espagne, Canaries, Ceuta et Melilla comprises (latitude 27 a 44, longitude
// -19 a 5) : une coordonnee a 0 ou hors de l'enveloppe est traitee comme MANQUANTE (station
// ignoree et comptee) — vu dans le fichier complet du 30/10/2026, elle serait fausse sur la carte.
const ES_ENVELOPPE = {s: 27, n: 44, w: -19, e: 5};
const coordsES = (la, lo) => la != null && lo != null && la !== 0 && lo !== 0 &&
  la >= ES_ENVELOPPE.s && la <= ES_ENVELOPPE.n && lo >= ES_ENVELOPPE.w && lo <= ES_ENVELOPPE.e;

// Echappement HTML a l'ingestion, comme app.js (esc) : tout ce qui vient du flux (noms,
// adresses, enseignes, horaires) est rendu sain ici, une fois.
const echapperES = x => String(x).replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// "1,999" -> 1.999 ; "" / null / illisible -> null (jamais 0 : un prix absent n'est pas gratuit).
function nombreES(texte){
  if(texte == null) return null;
  const t = String(texte).trim();
  if(!t) return null;
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// "28/10/2026 11:42:52" -> "2026-10-28T11:42:52" (heure locale, l'Espagne peninsulaire est sur
// le fuseau de la France ; meme forme que les `<carburant>_maj` du flux francais pour jour(),
// quand() et le tri par releve). null si illisible.
function fechaISO(fecha){
  const m = String(fecha || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

// Station espagnole -> forme d'une station francaise (app.js, normalise()). null si la station
// n'est pas en vente au public (`Tipo Venta` != P) ou si ses coordonnees manquent (absentes, a 0,
// hors de l'enveloppe espagnole) ; dans ce dernier cas opts.ignorees.coords est incremente.
// opts.dist(la, lo) : distance au repere en km (app.js), 0 a defaut (module pur).
// opts.ignorees : compteur {coords, reservees} alimente par l'appelant (facultatif).
function normaliserStationES(o, fecha, opts = {}){
  const compter = k => { if(opts.ignorees) opts.ignorees[k] = (opts.ignorees[k] || 0) + 1; };
  if(!o) return null;
  if(o['Tipo Venta'] !== 'P'){ compter('reservees'); return null; }
  const la = nombreES(o.Latitud), lo = nombreES(o['Longitud (WGS84)']);
  if(!coordsES(la, lo)){ compter('coords'); return null; }
  const maj = fechaISO(fecha);
  const prix = {}, dates = {}, depuis = {}, kotype = {};
  ES_CLES.forEach(k => {
    prix[k] = nombreES(o[ES_CARBURANTS[k]]);
    dates[k] = prix[k] == null ? null : maj;
    depuis[k] = null; kotype[k] = null;
  });
  const horario = String(o.Horario || '').trim();
  return {id: echapperES('ES-' + (o.IDEESS != null && String(o.IDEESS).trim() ? String(o.IDEESS).trim() : `${la},${lo}`)),
          la, lo,
          ville: echapperES(o.Localidad || ''), cp: echapperES(o['C.P.'] || ''), adresse: echapperES(o['Dirección'] || ''),
          auto: /^L-D:\s*24H$/i.test(horario),
          rupture: '',                     // pas de notion de rupture dans le flux espagnol
          hs: new Set(),
          d: typeof opts.dist === 'function' ? opts.dist(la, lo) : 0,
          prix, maj: dates,
          depuis, kotype,
          off: {prix: Object.assign({}, prix), maj: Object.assign({}, dates)},
          corr: {},
          pays: 'ES',
          enseigne: echapperES(o['Rótulo'] || ''),
          horario: echapperES(horario)};
}

// ---- Horaires « L-S: 06:00-22:00; D: 07:00-22:00 » ----
const ES_JOURS = 'LMXJVSD';                                   // lundi .. dimanche
const FR_JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
// -> [{jours: [indices 0..6], plages: [[debut, fin] en minutes]}], ou null si illisible.
function reglesHorario(horario){
  if(typeof horario !== 'string' || !horario.trim()) return null;
  const regles = [];
  for(const part of horario.split(';')){
    const m = part.trim().match(/^([LMXJVSD](?:\s*-\s*[LMXJVSD])?(?:\s*[,y]\s*[LMXJVSD](?:\s*-\s*[LMXJVSD])?)*)\s*:\s*(.+?)\s*$/i);
    if(!m) return null;
    const jours = [];
    for(const tok of m[1].toUpperCase().split(/\s*[,Y]\s*/)){
      const [a, b] = tok.split(/\s*-\s*/);
      const i = ES_JOURS.indexOf(a), j = b ? ES_JOURS.indexOf(b) : i;
      if(i < 0 || j < 0) return null;
      for(let k = i; ; k = (k + 1) % 7){ jours.push(k); if(k === j) break; }
    }
    const plages = [];
    if(/^24\s*H$/i.test(m[2])) plages.push([0, 1440]);
    else for(const p of m[2].split(/\s*(?:,|\by\b|\band\b)\s*/i)){
      const h = p.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if(!h) return null;
      const de = +h[1] * 60 + +h[2], a = +h[3] * 60 + +h[4];
      if(de > 1440 || a > 1440) return null;
      if(a > de) plages.push([de, a]);
      else { plages.push([de, 1440]); plages.push([0, a]); }   // a cheval sur minuit : simplifie au meme jour
    }
    regles.push({jours, plages});
  }
  return regles.length ? regles : null;
}
// true (ouvert), false (ferme a cette date), null (horaire inconnu ou illisible).
function ouvertES(horario, date){
  const regles = reglesHorario(horario);
  if(!regles || !(date instanceof Date) || isNaN(date)) return null;
  const jour = (date.getDay() + 6) % 7, min = date.getHours() * 60 + date.getMinutes();
  for(const r of regles){
    if(!r.jours.includes(jour)) continue;
    if(r.plages.some(([de, a]) => min >= de && min < a)) return true;
  }
  return false;
}
// Resume lisible : « 24 h/24 », « lun-sam 6h-22h · dim 7h-22h » ; l'horaire brut s'il est illisible.
function resumerHorario(horario){
  const regles = reglesHorario(horario);
  if(!regles) return horario ? String(horario) : '';
  if(regles.length === 1 && regles[0].jours.length === 7 && regles[0].plages.some(([de, a]) => de === 0 && a === 1440)) return '24 h/24';
  const hm = m => m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m / 60}h`;
  const joursTxt = j => {
    if(j.length === 7) return 'tous les jours';
    // suite contigue (lun-sam) sinon enumeration (sam, dim)
    const contigu = j.every((x, i) => i === 0 || x === (j[i - 1] + 1) % 7);
    return j.length > 2 && contigu ? `${FR_JOURS[j[0]]}-${FR_JOURS[j[j.length - 1]]}` : j.map(x => FR_JOURS[x]).join(', ');
  };
  return regles.map(r => `${joursTxt(r.jours)} ${r.plages.some(([de, a]) => de === 0 && a === 1440) ? '24 h/24'
    : r.plages.map(([de, a]) => `${hm(de)}-${hm(a === 1440 ? 0 : a)}`).join(' et ')}`).join(' · ');
}

// ---- Provinces croisees par une emprise {s, n, w, e} (app.js, emprise()) ----
// -> [{id, aire (deg² de recouvrement), douteuse}], tries : bornes fiables d'abord, puis
// recouvrement decroissant. `douteuse` (garde-fou, plus aucune dans la table v2) : boite de plus
// de 30 deg² alors qu'une province reelle tient en moins de 5 — signe d'une table mal calculee.
function recouvrementsProvinces(table, bbox){
  const res = [];
  for(const id of Object.keys(table)){
    const p = table[id];
    if(!Array.isArray(p) || p.length < 6) continue;
    const [, , s, n, w, e] = p;
    const dLat = Math.min(n, bbox.n) - Math.max(s, bbox.s);
    const dLon = Math.min(e, bbox.e) - Math.max(w, bbox.w);
    if(!(dLat > 0 && dLon > 0)) continue;
    res.push({id, aire: dLat * dLon, douteuse: (n - s) * (e - w) > 30});
  }
  return res.sort((a, b) => (a.douteuse - b.douteuse) || (b.aire - a.aire) || (a.id < b.id ? -1 : 1));
}
// Identifiants des provinces dont la boite croise l'emprise, par recouvrement decroissant.
function provincesPourEmprise(table, bbox){
  return recouvrementsProvinces(table, bbox).map(r => r.id);
}
// Vrai si au moins une province croise l'emprise.
function enEspagne(bbox, table = ES_PROVINCIAS){
  return recouvrementsProvinces(table, bbox).length > 0;
}

// ---------- Villes d'Espagne saisissables comme depart ou arrivee (releve du 11/11/2026) ----------
// Les geocodeurs de la page (Geoplateforme, api-adresse) ne connaissent que la France :
// « Barcelone » rendait une voie du Var, « Figueres » une rue de Fort-de-France. Sans hote
// nouveau dans la CSP, la page embarque cette table, consultee AVANT le geocodage (villeES) :
// la capitale de chacune des 47 provinces de la peninsule et les villes de la frontiere.
// Iles, Ceuta et Melilla absentes (aucune route depuis la France).
// Ligne : [id de province (ES_PROVINCIAS), latitude, longitude, nom affiche, autres noms…].
// Coordonnees du centre-ville au millieme de degre (~100 m), saisies a la main le 11/11/2026
// (aucun geocodeur de l'Espagne n'est joignable par la page) et controlees deux fois : chaque
// ville est dans la boite de sa province (test), chaque point est a moins de 110 m d'une rue
// du centre selon le service d'itineraire de secours (valhalla1.openstreetmap.de/locate).
const ES_VILLES = [
  ['01', 42.847, -2.673, 'Vitoria-Gasteiz', 'Vitoria', 'Gasteiz'],
  ['02', 38.995, -1.856, 'Albacete'],
  ['03', 38.345, -0.483, 'Alicante', 'Alacant'],
  ['04', 36.840, -2.467, 'Almería'],
  ['05', 40.656, -4.700, 'Ávila'],
  ['06', 38.879, -6.970, 'Badajoz'],
  ['08', 41.387, 2.170, 'Barcelona', 'Barcelone'],
  ['09', 42.341, -3.702, 'Burgos'],
  ['10', 39.475, -6.372, 'Cáceres'],
  ['11', 36.527, -6.289, 'Cádiz', 'Cadix'],
  ['12', 39.986, -0.038, 'Castellón de la Plana', 'Castellón', 'Castelló', 'Castelló de la Plana'],
  ['13', 38.986, -3.927, 'Ciudad Real'],
  ['14', 37.884, -4.779, 'Córdoba', 'Cordoue'],
  ['15', 43.371, -8.396, 'A Coruña', 'La Coruña', 'La Corogne', 'Coruña'],
  ['16', 40.070, -2.137, 'Cuenca'],
  ['17', 41.983, 2.824, 'Girona', 'Gérone', 'Gerona'],
  ['18', 37.177, -3.599, 'Granada', 'Grenade'],
  ['19', 40.633, -3.167, 'Guadalajara'],
  ['20', 43.318, -1.981, 'San Sebastián', 'Donostia', 'Donostia-San Sebastián', 'Saint-Sébastien'],
  ['21', 37.261, -6.945, 'Huelva'],
  ['22', 42.136, -0.409, 'Huesca'],
  ['23', 37.770, -3.790, 'Jaén'],
  ['24', 42.599, -5.572, 'León'],
  ['25', 41.617, 0.622, 'Lleida', 'Lérida'],
  ['26', 42.465, -2.445, 'Logroño'],
  ['27', 43.010, -7.556, 'Lugo'],
  ['28', 40.417, -3.703, 'Madrid'],
  ['29', 36.720, -4.420, 'Málaga'],
  ['30', 37.987, -1.130, 'Murcia', 'Murcie'],
  ['31', 42.817, -1.644, 'Pamplona', 'Pampelune', 'Iruña'],
  ['32', 42.336, -7.864, 'Ourense', 'Orense'],
  ['33', 43.361, -5.849, 'Oviedo'],
  ['34', 42.010, -4.533, 'Palencia'],
  ['36', 42.431, -8.644, 'Pontevedra'],
  ['37', 40.965, -5.664, 'Salamanca', 'Salamanque'],
  ['39', 43.462, -3.810, 'Santander'],
  ['40', 40.948, -4.118, 'Segovia', 'Ségovie'],
  ['41', 37.389, -5.984, 'Sevilla', 'Séville'],
  ['42', 41.764, -2.465, 'Soria'],
  ['43', 41.119, 1.245, 'Tarragona', 'Tarragone'],
  ['44', 40.344, -1.107, 'Teruel'],
  ['45', 39.857, -4.024, 'Toledo', 'Tolède'],
  ['46', 39.470, -0.376, 'Valencia', 'València', 'Valence'],
  ['47', 41.652, -4.724, 'Valladolid'],
  ['48', 43.263, -2.935, 'Bilbao', 'Bilbo'],
  ['49', 41.503, -5.745, 'Zamora'],
  ['50', 41.649, -0.887, 'Zaragoza', 'Saragosse'],
  // Frontiere : Catalogne, val d'Aran, Aragon, Pays basque.
  ['17', 42.267, 2.961, 'Figueres', 'Figueras'],
  ['17', 42.419, 2.875, 'La Jonquera', 'La Junquera', 'La Jonquère'],
  ['17', 42.427, 3.158, 'Portbou', 'Port-Bou'],
  ['17', 42.264, 3.177, 'Roses', 'Rosas'],
  ['17', 42.432, 1.928, 'Puigcerdà'],
  ['25', 42.702, 0.795, 'Vielha'],
  ['22', 42.570, -0.550, 'Jaca'],
  ['20', 43.339, -1.789, 'Irun'],
];
// Noms qui sont AUSSI ceux d'une commune francaise (verifie au geocodeur le 11/11/2026 : Valence
// dans la Drome, Grenade en Haute-Garonne, Cadix dans le Tarn, Leon dans les Landes,
// Saint-Sebastien dans la Creuse…) : seuls, ils restent francais ; ils ne designent la ville
// espagnole que suivis du pays (« León Espagne », « Valence, Espagne »).
const ES_HOMONYMES_FR = ['valence', 'grenade', 'cadix', 'leon', 'saint sebastien'];
const cleVilleES = x => String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
const ES_PAR_NOM = new Map();
ES_VILLES.forEach(v => v.slice(3).forEach(nom => ES_PAR_NOM.set(cleVilleES(nom), v)));

// Ville espagnole de la table pour une saisie (« Barcelone », « barcelona », « Girona, Espagne »),
// sinon null : {lon, lat, label, pays: 'ES'} — `pays` dit a l'appelant de tracer hors IGN.
function villeES(q){
  const cle = cleVilleES(q), sansPays = cle.replace(/ (espagne|espana|spain)$/, '');
  const v = ES_PAR_NOM.get(sansPays);
  if(!v || (sansPays === cle && ES_HOMONYMES_FR.includes(cle))) return null;
  return {lon: v[2], lat: v[1], label: v[3] + ' (Espagne)', pays: 'ES'};
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {nombreES, fechaISO, normaliserStationES, ouvertES, resumerHorario, reglesHorario,
                    recouvrementsProvinces, provincesPourEmprise, enEspagne,
                    ES_PROVINCIAS, ES_CARBURANTS, ES_CLES, ES_URL, ES_HOTE, ES_MAX_PROVINCES, ES_CACHE_MS, ES_EMPRISE_MAX, ES_ENVELOPPE, coordsES,
                    ES_VILLES, ES_HOMONYMES_FR, villeES};
