// ---------- Affichage : formats de nombres, etiquettes de la carte ----------
// Une seule convention pour tout nombre decimal montre a l'ecran : la virgule, comme on
// l'ecrit en francais (« 1,906 € », « 2,5 km »). Avant le 11/11/2026 la liste, la carte et la
// fiche ecrivaient « 1.906 » et « 2.5 km » quand le plan ecrivait « 1,906 €/L ».
// Jamais pour une valeur relue par la machine (champ type=number, URL, calcul) : la, le point reste.
function nombreFr(x, decimales){ return (+x).toFixed(decimales).replace('.', ','); }
// Prix au litre, au millieme comme a la pompe : 1.9 -> « 1,900 ».
function prixFr(x){ return nombreFr(x, 3); }
// Distance en km, au dixieme : 2.46 -> « 2,5 ».
function kmFr(x){ return nombreFr(x, 1); }
// Montant en euros, au centime : 61.5 -> « 61,50 ».
function eurosFr(x){ return nombreFr(x, 2); }
// Carburants en rupture tels que le flux les donne (« SP95;GPLc ») -> « SP95, GPLc ».
function listeFr(brut){ return String(brut == null ? '' : brut).split(';').map(x => x.trim()).filter(Boolean).join(', '); }

// ---------- Carte : etiquettes de prix en vue large ----------
// A l'echelle de la France la carte recevait jusqu'a 400 etiquettes de prix superposees
// (releve du 11/11/2026). Sous ZOOM_COMPACT (le seuil des ruptures et des bornes), la carte est
// decoupee en cases de PAS_GRILLE px d'ecran et seules les moins cheres de chaque case gardent
// leur prix ; les autres deviennent une pastille de couleur, toujours cliquable (fiche).
const ZOOM_COMPACT = 10, PAS_GRILLE = 72;
// Case ou tombe un point : Mercator en px monde au zoom donne (tuile de 512 px, comme MapLibre).
// Ancree au monde, pas a l'ecran : deplacer la carte ne change pas les cases.
function caseGrille(la, lo, zoom, pas){
  const monde = 512 * Math.pow(2, zoom);
  const s = Math.sin(Math.max(-85, Math.min(85, la)) * Math.PI / 180);
  const x = (lo + 180) / 360 * monde;
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * monde;
  return Math.floor(x / pas) + ':' + Math.floor(y / pas);
}
// points = [{la, lo, p}] (p = prix compare) -> tableau de booleens dans le meme ordre :
// true = etiquette avec son prix, false = pastille. Au zoom `seuil` et au-dela, toutes ; en
// dessous, les `parCase` moins cheres de chaque case (a prix egal, la premiere de la liste).
function etiquettesParCase(points, zoom, options){
  const {pas = PAS_GRILLE, parCase = 1, seuil = ZOOM_COMPACT} = options || {};
  if(!(zoom < seuil)) return points.map(() => true);
  const cases = new Map();
  points.forEach((pt, i) => {
    const k = caseGrille(pt.la, pt.lo, zoom, pas);
    if(!cases.has(k)) cases.set(k, []);
    cases.get(k).push(i);
  });
  const avecPrix = points.map(() => false);
  cases.forEach(rangs => rangs.sort((a, b) => points[a].p - points[b].p || a - b).slice(0, parCase)
    .forEach(i => { avecPrix[i] = true; }));
  return avecPrix;
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {nombreFr, prixFr, kmFr, eurosFr, listeFr, ZOOM_COMPACT, PAS_GRILLE, caseGrille, etiquettesParCase};
