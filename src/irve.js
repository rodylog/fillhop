// Bornes de recharge (IRVE) : lecture des champs du fichier Etalab, horaires, compatibilite
// vehicule / borne, filtres et couloir le long d'un trajet. Module PUR (aucun DOM), exporte
// pour Node comme plan.js ; dans la page il precede app.js.
//
// Source : Base nationale des IRVE (donnees statiques, schema Etalab v2.3.1, Licence
// Ouverte 2.0), transformee par irve_build.py en data/irve/<dep>.json. Ces donnees ne
// portent AUCUN prix au kWh (aucune donnee ouverte francaise n'en publie) : le plan de
// charge (plan.js, optimiserPlanElectrique) optimise le temps, pas l'euro.
//
// Station (une entree de data/irve/<dep>.json) : {id, n, op, lon, lat, pdc, kw, kwmin, ac,
// ccs, chademo, gratuit, cb, acte, h, pmr, acces, maj}. Les booleens valent true, false ou
// null (inconnu : la source est declarative et souvent vide ; jamais « faux par defaut »).
//
// Regle commune a tout le module : ce qu'on ne sait pas lire vaut null (inconnu), jamais
// une valeur par defaut qui ferait ecarter une borne a tort.

// ---- Lecture des champs bruts (memes regles qu'irve_build.py, testees ici) ----

// true/1/vrai -> true ; false/0/faux -> false ; vide ou autre -> null. Insensible a la casse.
function parseBool(txt){
  const t = String(txt == null ? '' : txt).trim().toLowerCase();
  if(t === 'true' || t === '1' || t === 'vrai') return true;
  if(t === 'false' || t === '0' || t === 'faux') return false;
  return null;
}

// Puissance nominale en kW : texte decimal (« 22 », « 22.08 », « 7,4 ») ; certains jeux
// publient en watts (> 1000 -> / 1000) ; vide, 0 ou illisible -> null.
function parsePuissance(txt){
  const t = String(txt == null ? '' : txt).trim().replace(',', '.');
  if(!/^-?\d+(\.\d+)?$/.test(t)) return null;
  let p = parseFloat(t);
  if(!(p > 0)) return null;
  if(p > 1000) p = p / 1000;
  return Math.round(p * 100) / 100;
}

// coordonneesXY « [lon, lat] » (avec ou sans espace) -> {lon, lat} ; sinon null.
function parseXY(txt){
  const m = /^\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*$/.exec(String(txt == null ? '' : txt));
  return m ? {lon: parseFloat(m[1]), lat: parseFloat(m[2])} : null;
}

// ---- Horaires ----
// Syntaxe du fichier : « 24/7 » (tres majoritaire) ou une forme simplifiee d'opening_hours
// OSM : « Mo-Fr 08:00-12:00,Mo-Fr 14:00-18:00,Th 08:00-18:00 » — jours Mo Tu We Th Fr Sa Su,
// plages de jours avec « - », plages horaires HH:MM-HH:MM (une plage peut depasser minuit :
// 22:00-06:00), regles separees par des virgules ou des points-virgules ; une regle sans
// jours reprend ceux de la precedente (« Mo-Fr 08:00-12:00,14:00-18:00 ») ; « off » ferme.
// Tout ce qui n'est pas lisible -> null (inconnu), JAMAIS « ferme ».
const JOURS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];   // indices de Date.getDay()
const JOURS_FR = {di: 0, lu: 1, ma: 2, me: 3, je: 4, ve: 5, sa: 6};

function estToujoursOuvert(h){
  const t = String(h).toLowerCase().replace(/\s+/g, '');
  return t === '24/7' || /^(24h?\/24(et|-|,|;)?(7j?\/7)?|7j?\/7(et|-|,|;)?(24h?\/24)?)$/.test(t);
}

// Jours d'une liste « Mo-Fr,Su » -> tableau de booleens par jour (indice getDay) ; null si illisible.
function parseJours(txt){
  const jours = new Array(7).fill(false);
  for(const part of txt.split(',')){
    const m = /^([a-z]{2})(?:-([a-z]{2}))?$/.exec(part.trim().toLowerCase());
    if(!m) return null;
    const idx = j => JOURS.indexOf(j) >= 0 ? JOURS.indexOf(j) : (JOURS_FR[j] != null ? JOURS_FR[j] : -1);
    const a = idx(m[1]), b = m[2] ? idx(m[2]) : a;
    if(a < 0 || b < 0) return null;
    // Mo-Fr : de 1 a 5 ; Fr-Mo : 5, 6, 0, 1 (on boucle)
    for(let d = a; ; d = (d + 1) % 7){ jours[d] = true; if(d === b) break; }
  }
  return jours;
}

// Plages « 08:00-12:00,14:00-18:00 » -> [[debut, fin]] en minutes ; fin < debut = depasse minuit.
function parsePlages(txt){
  const plages = [];
  for(const part of txt.split(',')){
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(part.trim());
    if(!m) return null;
    const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    if(+m[1] > 24 || +m[2] > 59 || +m[3] > 24 || +m[4] > 59) return null;
    plages.push([a, b]);
  }
  return plages;
}

// Chaine d'horaires -> liste de regles {jours, plages} (plages null = « off »), ou null si
// une partie n'est pas lisible. « 24/7 » -> []. Exportee pour les tests.
function parseHoraires(h){
  if(h == null || String(h).trim() === '') return null;
  if(estToujoursOuvert(h)) return [];
  // Decoupage en segments ; un segment « jours seuls » suivi d'un segment « jours + plages »
  // (« Mo-Fr,Sa 08:00-12:00 ») est fusionne avec lui.
  const brut = String(h).replace(/;/g, ',').split(',').map(s => s.trim()).filter(Boolean);
  const segs = [];
  for(const s of brut){
    const prev = segs[segs.length - 1];
    if(prev && /^[A-Za-z]{2}(-[A-Za-z]{2})?$/.test(prev) && /^[A-Za-z]{2}/.test(s)) segs[segs.length - 1] = prev + ',' + s;
    else segs.push(s);
  }
  const regles = [];
  let joursCourants = null;
  for(const seg of segs){
    const m = /^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?)(?:,[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)?\s*(off|closed|\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)?$/.exec(seg);
    if(!m || (!m[1] && !m[2])) return null;
    if(m[1]){ joursCourants = parseJours(m[1]); if(!joursCourants) return null; }
    if(!joursCourants) return null;   // plage sans jour connu
    if(!m[2]) regles.push({jours: joursCourants, plages: [[0, 24 * 60]]});   // jours seuls : toute la journee (OSM)
    else if(/^(off|closed)$/i.test(m[2])) regles.push({jours: joursCourants, plages: null});
    else { const p = parsePlages(m[2]); if(!p) return null; regles.push({jours: joursCourants, plages: p}); }
  }
  return regles;
}

// Ouvert a `date` (Date, heure locale) ? true / false / null (horaires vides ou illisibles).
// Une regle « off » ferme ses jours quelles que soient les autres regles.
function ouvertA(h, date){
  const regles = parseHoraires(h);
  if(regles === null) return null;
  if(!regles.length) return true;   // 24/7
  const d = date instanceof Date ? date : new Date(date);
  if(isNaN(d.getTime())) return null;
  const jour = d.getDay(), hier = (jour + 6) % 7, min = d.getHours() * 60 + d.getMinutes();
  let ouvert = false;
  for(const r of regles){
    if(r.plages === null){ if(r.jours[jour]) return false; continue; }
    for(const [a, b] of r.plages){
      if(b > a){ if(r.jours[jour] && min >= a && min < b) ouvert = true; }
      else if(b === a){ if(r.jours[jour]) ouvert = true; }   // 00:00-00:00 : toute la journee
      else { // depasse minuit : ce soir apres a, ou la nuit precedente avant b
        if((r.jours[jour] && min >= a) || (r.jours[hier] && min < b)) ouvert = true;
      }
    }
  }
  return ouvert;
}

// ---- Compatibilite vehicule / borne ----
// vehicule.prise : 'ccs' | 'chademo' | 't2' ; vehicule.kwMin : puissance minimale voulue (kW).
// Prise : CCS <-> station.ccs, CHAdeMO <-> station.chademo, Type 2 <-> station.ac (au moins une
// prise Type 2 ou EF). Puissance : station.kw >= kwMin ; une puissance inconnue ne satisfait
// pas un minimum demande (on ne promet pas ce qu'on ne sait pas).
const CHAMP_PRISE = {ccs: 'ccs', chademo: 'chademo', t2: 'ac'};

function compatible(station, vehicule){
  if(!station || !vehicule) return false;
  const champ = CHAMP_PRISE[vehicule.prise];
  if(!champ || station[champ] !== true) return false;
  const kwMin = +vehicule.kwMin || 0;
  if(kwMin > 0 && !(station.kw >= kwMin)) return false;
  return true;
}

// Filtre une liste de stations. criteres : {kwMin, prise, gratuit, cb, ouvertLe}. Un critere
// absent ou null n'exclut rien. gratuit/cb : true exige la valeur vraie (inconnu exclu) ;
// ouvertLe (Date) : exclut seulement les bornes dont on SAIT qu'elles sont fermees a cette
// heure (horaires inconnus : gardees).
function filtrerBornes(stations, criteres = {}){
  const c = criteres || {};
  return (stations || []).filter(s => {
    if(c.prise && s[CHAMP_PRISE[c.prise]] !== true) return false;
    if(c.kwMin > 0 && !(s.kw >= c.kwMin)) return false;
    if(c.gratuit === true && s.gratuit !== true) return false;
    if(c.cb === true && s.cb !== true) return false;
    if(c.ouvertLe != null && ouvertA(s.h, c.ouvertLe) === false) return false;
    return true;
  });
}

// ---- Couloir le long d'un trajet ----
// Meme notion que les stations carburant dans app.js (preparerKms / positionsTrace) :
// approximation plane (1° de longitude = 111,32 km x cos(lat), 1° de latitude = 110,57 km),
// distance point-segment, abscisse cumulee en km. Reimplementee ici parce que la version
// d'app.js est liee aux globales ROUTE / KMS / I_RETOUR de la page ; la phase 2 pourra y
// brancher ces fonctions pures. ligne = [[lon, lat], ...].
const KX_DEG = 111.32, KY_DEG = 110.57;

// Abscisse cumulee (km) de chaque point de la ligne.
function kmsCumules(ligne){
  const kms = [0];
  for(let i = 1; i < ligne.length; i++){
    const [lo1, la1] = ligne[i - 1], [lo2, la2] = ligne[i];
    const kx = KX_DEG * Math.cos(la1 * Math.PI / 180);
    kms.push(kms[i - 1] + Math.hypot((lo2 - lo1) * kx, (la2 - la1) * KY_DEG));
  }
  return kms;
}

// Cale les abscisses cumulees sur la distance annoncee par le service d'itineraire, sens par
// sens : le trace recu est simplifie (~400 points), donc plus court que la route reelle (releve
// du 11/11/2026 : 940,9 km de trace pour 965,3 km annonces) ; sans calage le plan comptait moins
// de kilometres que le trajet et entamait la reserve. sens = [{fin, km}] dans l'ordre du trace :
// `fin` = indice du dernier point du sens (aller, puis retour), `km` = sa distance annoncee.
// Chaque sens est etire d'un facteur km / longueur du trace ; le retour repart exactement du km
// de fin de l'aller. Distance absente, nulle ou trace de longueur nulle : sens laisse tel quel.
function calerKms(kms, sens){
  const res = kms.slice();
  let debut = 0, base = 0;
  for(const {fin, km} of sens || []){
    if(!(fin >= debut && fin < kms.length)) break;
    const longueur = kms[fin] - kms[debut];
    const f = longueur > 0 && km > 0 && Number.isFinite(km) ? km / longueur : 1;
    for(let i = debut; i <= fin; i++) res[i] = base + (kms[i] - kms[debut]) * f;
    base = res[fin]; debut = fin + 1;
  }
  return res;
}

// Position d'un point par rapport a la ligne : {e: ecart (km), km: abscisse du point le plus
// proche}. kms : resultat de kmsCumules(ligne) (recalcule s'il manque). null si ligne vide.
function positionSurLigne(ligne, kms, lon, lat){
  if(!ligne || ligne.length < 2) return null;
  if(!kms) kms = kmsCumules(ligne);
  const kx = KX_DEG * Math.cos(lat * Math.PI / 180), ky = KY_DEG;
  let best = Infinity, km = 0;
  for(let i = 1; i < ligne.length; i++){
    const ax = (ligne[i - 1][0] - lon) * kx, ay = (ligne[i - 1][1] - lat) * ky;
    const bx = (ligne[i][0] - lon) * kx,     by = (ligne[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if(d < best){ best = d; km = kms[i - 1] + t * (kms[i] - kms[i - 1]); }
  }
  return {e: best, km};
}

// Bornes a moins de largeurKm de la ligne, triees par km : [{s: station, km, e}] — le format
// des candidats d'optimiserPlanElectrique (plan.js), comme {s, km, e, p} pour le carburant.
function bornesSurTrajet(stations, ligne, largeurKm){
  if(!ligne || ligne.length < 2) return [];
  const kms = kmsCumules(ligne);
  const res = [];
  for(const s of stations || []){
    if(!(typeof s.lon === 'number' && typeof s.lat === 'number')) continue;
    const p = positionSurLigne(ligne, kms, s.lon, s.lat);
    if(p && p.e <= largeurKm) res.push({s, km: p.km, e: p.e});
  }
  return res.sort((a, b) => a.km - b.km);
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {parseBool, parsePuissance, parseXY, parseHoraires, ouvertA, compatible, filtrerBornes,
                    kmsCumules, calerKms, positionSurLigne, bornesSurTrajet};
