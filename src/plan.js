// Plan de pleins : ou s'arreter et combien acheter.
//
// Modele (refait le 24/10/2026, demande : « un algorithme intelligent ») : on part le
// reservoir plein (A km utiles, paye au prix de depart pd) ; a chaque arret on achete
// soit JUSTE ce qu'il faut pour atteindre l'arret suivant (ou l'arrivee), soit le PLEIN
// (utile quand l'arret suivant, impose par l'autonomie, est plus cher : on y achete
// moins). On minimise le carburant CONSOMME pendant le voyage + une penalite par arret ;
// ce qui resterait a l'arrivee n'est pas compte (le plan ne propose donc jamais un arret
// « pour faire le plein pas cher en vue du prochain voyage »). Pour cette famille de
// politiques l'optimum est exact (probleme de la station-service, Khuller-Malekian-
// Mestre 2007) : etat = (arret, carburant en arrivant), ou le carburant en arrivant vaut
// 0 (dernier achat « juste ») ou A - trajet depuis le dernier plein.
// L'ancien modele facturait a chaque arret TOUT le reste du trajet au lieu du manque :
// il poussait vers une station tardive et chere (Montpellier -> Tours, 24/10/2026).
//
// cand : stations triees par km ({s, v, km, e, p}) ; A : autonomie utile (km) ;
// total : km du trajet ; lkm : L/km ; opts.pd : €/L du plein de depart (defaut : la moins
// chere a 15 km du depart, sinon la premiere etape) ; opts.utiles : calculer les stations par
// lesquelles passe un plan quasi optimal (passe arriere, plus couteuse) ; opts.reserve : taille
// de la reserve (km), que le premier troncon peut entamer (voir plus bas) — opts.g0 peut alors
// etre negatif (reservoir deja sous la reserve). Un arret coute e km a l'aller et e au retour.
// Renvoie {plan, coutAchats, voyage, reste, utiles} — plan:null si infaisable, plan:[]
// si aucun arret n'est necessaire ; chaque etape = {...cand, q (km achetes), litres,
// plein (true = reservoir rempli), arrivee (km dans le reservoir en arrivant)}.
// voyage = carburant CONSOMME au prix ou il a ete achete, plein de depart compris (null
// si pd inconnu) ; reste = km dans le reservoir a l'arrivee (hors reserve : 0 des qu'il
// y a un arret, A - total sinon) ; reserveEntamee = km pris sur la reserve pour atteindre la
// premiere etape (champ present seulement si on y arrive sous la reserve : son arrivee est
// alors negative).
const ARRET = 0.8;     // EUR par arret : le temps perdu a une valeur, sinon micro-arrets
const TOL_UTILES = 0.5; // EUR : un plan a moins de 0,50 EUR de l'optimum est « utile »
const MAX_CAND = 240;  // au-dela, elagage : 2 moins cheres par tranche (DP en n^3)

function elaguer(cand, total){
  if(cand.length <= MAX_CAND) return cand;
  const tranche = total / (MAX_CAND / 2), bacs = new Map();
  cand.forEach(c => { const k = Math.floor(c.km / tranche); (bacs.get(k) || bacs.set(k, []).get(k)).push(c); });
  const gardes = [];
  bacs.forEach(l => { l.sort((x, y) => x.p - y.p || x.e - y.e); gardes.push(...l.slice(0, 2)); });
  return gardes.sort((x, y) => x.km - y.km);
}

function prixBout(cand, test){
  const px = cand.filter(test).map(c => c.p);
  return px.length ? Math.min(...px) : null;
}

function optimiserPlan(candTous, A, total, lkm, opts = {}){
  const cand = elaguer(candTous, total);
  const n = cand.length, FIN = n;
  // Prix du plein de depart : la moins chere a 15 km du depart ; a defaut, la premiere etape
  // du plan (c'est la qu'on fera le plein), a defaut la moins chere du couloir.
  const pd15 = opts.pd != null ? opts.pd
    : (prixBout(candTous, c => c.km <= 15 && !c.risque) ?? prixBout(candTous, c => c.km <= 15));
  const pdDefaut = plan => pd15 != null ? pd15 : (plan && plan.length ? plan[0].p : prixBout(candTous, () => true));
  // g0 : carburant a bord au depart (km utiles) ; defaut A = on part le plein fait. S'il est
  // plus bas, la station du depart n'est qu'un candidat parmi d'autres : le plan y fait le
  // plein seulement si c'est moins cher qu'en route (demande du 24/10/2026).
  // gBrut : le meme, compte depuis le seuil de la reserve — negatif (jusqu'a -opts.reserve) si le
  // reservoir est deja sous la reserve ; sans opts.reserve, gBrut = g0.
  const rsv = Math.max(0, +opts.reserve || 0);
  const gBrut = Math.max(-rsv, Math.min(A, opts.g0 != null ? opts.g0 : A));
  const g0 = Math.max(0, gBrut);
  if(total <= g0){
    const pd = pdDefaut([]);
    return {plan: [], coutAchats: 0, voyage: pd == null ? null : pd * lkm * total, reste: g0 - total, utiles: new Set()};
  }
  const km = i => i < 0 ? 0 : i >= n ? total : cand[i].km;
  const ex = i => (i < 0 || i >= n) ? 0 : cand[i].e;
  const leg = (j, i) => km(i) - km(j) + ex(j) + ex(i);
  // Reservoir presque vide : si AUCUNE station n'est a portee avec g0 (ou si le reservoir est
  // deja sous la reserve), la reserve (opts.reserve) peut etre entamee pour le seul premier
  // troncon, jusqu'a une station — jamais jusqu'a l'arrivee. On y arrive avec un carburant
  // negatif (sous la reserve) : l'achat « juste » ou « plein » la refait d'abord.
  const aPortee = gBrut >= 0 && cand.some((c, i) => leg(-1, i) <= g0);
  const g0Max = aPortee ? g0 : gBrut + rsv;   // portee du premier troncon vers une station
  const INF = Infinity;
  // Etats : vide[i] (arrive a i le reservoir vide) ; plein[i][s+1] (arrive a i avec
  // A - leg(s, i), dernier plein fait en s ; s = -1 : le depart). Cout = achats + arrets
  // (le plein de depart, constant, n'entre pas dans l'argmin).
  const vide = new Array(n).fill(INF), plein = [];
  const pVide = new Array(n).fill(null), pPlein = [];   // predecesseurs {j, etat} pour remonter
  for(let i = 0; i < n; i++){ plein.push(new Array(i + 1).fill(INF)); pPlein.push(new Array(i + 1).fill(null)); }
  let finCout = INF, finPred = null, finReste = 0;
  // etat courant en j : {g: carburant a l'arrivee, c: cout, cle: 'v' | s+1}
  const etats = j => {
    const l = [];
    if(j < 0) return [{g: gBrut, c: 0, cle: 'd'}];
    if(vide[j] < INF) l.push({g: 0, c: vide[j], cle: 'v'});
    plein[j].forEach((c, s1) => { if(c < INF) l.push({g: (s1 === 0 ? gBrut : A) - leg(s1 - 1, j), c, cle: s1}); });
    return l;
  };
  const transitions = (j, g, c, cle, sur) => {
    // sur(k, cout, mode, q, reste) est appele pour chaque arrivee possible en k (k = FIN : l'arrivee)
    for(let k = j + 1; k <= FIN; k++){
      if(km(k) - km(j) > (j < 0 ? g0Max : A)) break;
      const L = leg(j, k);
      // Le carburant du depart emmene jusqu'en k (une station seulement, si la reserve est entamee).
      if(j < 0){ if(L <= (k === FIN ? g0 : g0Max)) sur(k, c, 'depart', 0, g - L); continue; }
      if(L > A) continue;
      const p = cand[j].p;
      const qJ = L - g;                                        // juste ce qu'il faut
      const risque = cand[j].risque || 0;                    // surcout fictif (prix fige, cf. app.js)
      if(qJ > 1e-9) sur(k, c + p * lkm * qJ + ARRET + risque, 'juste', qJ, 0);
      const qP = A - g;                                        // le plein
      if(qP > 1e-9 && qP > qJ + 1e-9) sur(k, c + p * lkm * qP + ARRET + risque, 'plein', qP, A - L);
    }
  };
  for(let j = -1; j < n; j++){
    for(const {g, c, cle} of etats(j)){
      transitions(j, g, c, cle, (k, cout, mode, q, reste) => {
        if(k === FIN){
          if(mode === 'plein') return;   // le reste a l'arrivee ne vaut rien : « juste » suffit
          if(cout < finCout - 1e-9){ finCout = cout; finPred = {j, cle, mode, q}; finReste = reste; }
        }else if(mode === 'juste'){
          if(cout < vide[k] - 1e-9){ vide[k] = cout; pVide[k] = {j, cle, mode, q}; }
        }else{
          if(cout < plein[k][j + 1] - 1e-9){ plein[k][j + 1] = cout; pPlein[k][j + 1] = {j, cle, mode, q}; }
        }
      });
    }
  }
  if(finCout === INF) return {plan: null};
  // Remontee : du dernier arret au premier.
  const plan = [];
  let cur = finPred, g = finReste, kSuiv = FIN;
  while(cur && cur.j >= 0){
    const j = cur.j;
    const arrivee = cur.cle === 'v' ? 0 : (cur.cle === 0 ? gBrut : A) - leg(cur.cle - 1, j);
    plan.unshift(Object.assign({}, cand[j], {q: cur.q, litres: cur.q * lkm, plein: cur.mode === 'plein', arrivee}));
    cur = cur.cle === 'v' ? pVide[j] : pPlein[j][cur.cle];
    kSuiv = j;
  }
  const coutAchats = plan.reduce((t, e) => t + e.p * lkm * e.q, 0);
  // Carburant consomme : celui du depart (g0 km, compte au prix du depart, consomme en
  // entier des qu'il y a un arret) puis les achats, tous consommes (le dernier est « juste »).
  // Reserve entamee : ce qui lui manque est rachete au premier arret, donc compte a son prix.
  const pd = pdDefaut(plan);
  const voyage = pd == null ? null : pd * lkm * g0 + coutAchats;
  const r = {plan, coutAchats, voyage, reste: finReste};
  if(plan.length && plan[0].arrivee < -1e-9) r.reserveEntamee = plan[0].km + plan[0].e - g0;
  if(!opts.utiles) return r;
  // Passe arriere : cout optimal de chaque etat jusqu'a l'arrivee ; utile = station par
  // laquelle passe un plan a moins de TOL_UTILES de l'optimum (en plus de celles du plan).
  const bVide = new Array(n).fill(INF), bPlein = plein.map(l => l.map(() => INF));
  const arriere = (j, g) => {
    let m = INF;
    transitions(j, g, 0, null, (k, cout, mode) => {
      if(k === FIN && mode === 'plein') return;
      const suite = k === FIN ? 0 : mode === 'juste' ? bVide[k] : bPlein[k][j + 1];
      if(cout + suite < m) m = cout + suite;
    });
    return m;
  };
  for(let j = n - 1; j >= 0; j--){
    bVide[j] = arriere(j, 0);
    for(let s1 = 0; s1 <= j; s1++){ const L = leg(s1 - 1, j), G = s1 === 0 ? gBrut : A; if(L <= (s1 === 0 ? g0Max : A)) bPlein[j][s1] = arriere(j, G - L); }
  }
  const utiles = new Set(plan.map(e => e.s));
  for(let i = 0; i < n; i++){
    let m = vide[i] + bVide[i];
    plein[i].forEach((c, s1) => { if(c + bPlein[i][s1] < m) m = c + bPlein[i][s1]; });
    if(m <= finCout + TOL_UTILES) utiles.add(cand[i].s);
  }
  r.utiles = utiles;
  return r;
}

// Plein au depart et plein a l'arrivee. Le plan suppose un reservoir plein au
// depart : encore faut-il savoir OU le faire, et ou refaire le plein en arrivant
// (demande du 17/09/2026). Pour chaque bout du trajet : la station la moins
// chere a moins de `rayon` km du debut (resp. de la fin) ; a prix egal, le plus
// petit detour. null si aucune station dans le rayon.
function pleinsExtremites(cand, total, rayon = 15){
  const meilleure = liste => liste.length ? liste.reduce((x, y) =>
    (y.p < x.p - 1e-9 || (Math.abs(y.p - x.p) <= 1e-9 && y.e < x.e)) ? y : x) : null;
  // Une station a prix fige (risque) n'est retenue que s'il n'y a qu'elle.
  const sures = l => l.some(c => !c.risque) ? l.filter(c => !c.risque) : l;
  return {depart:  meilleure(sures(cand.filter(c => c.km <= rayon))),
          arrivee: meilleure(sures(cand.filter(c => c.km >= total - rayon)))};
}

// Autonomie utile du plan. Aucune source ouverte ne donne la capacite du reservoir
// (verifie le 17/09/2026) : on demande donc l'AUTONOMIE D'UN PLEIN en km, chiffre que
// le conducteur connait ou lit sur son tableau de bord. Si elle est saisie, elle prime ;
// sinon reservoir / conso x 100. On retire la reserve. null si ni l'une ni l'autre.
function autonomieUtile(conso, cuve, autonomie, reserve){
  const plein = autonomie > 0 ? autonomie : (cuve > 0 && conso > 0 ? cuve / conso * 100 : 0);
  if(!(plein > 0)) return null;
  return {plein, A: plein - Math.max(0, reserve || 0), source: autonomie > 0 ? 'autonomie' : 'reservoir'};
}

// Cout du voyage COMPLET (plein de depart compris) : calcule par optimiserPlan, repris
// ici pour les appelants historiques. null si infaisable ou si le plein de depart n'est
// pas chiffrable (aucune station : pd inconnu).
function coutVoyage(cand, r){
  if(!r || r.plan === null) return null;
  return r.voyage;
}

// Economie du plan par rapport a des pleins AU PLUS CHER du couloir (demande du 24/10/2026 : « le
// prix median est une absurdite ») : la reference est le MEME optimiserPlan sur les MEMES
// candidats, tous les prix remplaces par le plus cher (plein de depart au plus cher aussi) —
// ce qu'on aurait paye en s'arretant au pire endroit ; economie = reference - voyage reel.
// Renvoie {economie, prix (€/L de reference), reference}, ou null si infaisable ou non chiffrable.
function economieVsPlusCher(cand, A, total, lkm, voyage, opts = {}){
  const prix = prixMax(cand);
  if(prix == null || voyage == null) return null;
  const rm = optimiserPlan(cand.map(c => Object.assign({}, c, {p: prix})), A, total, lkm, {pd: prix, g0: opts.g0, reserve: opts.reserve});
  if(rm.plan === null || rm.voyage == null) return null;
  return {economie: rm.voyage - voyage, prix, reference: rm.voyage};
}

// Prix le plus cher des candidats (les stations masquees comme trop cheres n'y sont pas) ;
// null sans candidat.
function prixMax(cand){
  return cand.length ? Math.max(...cand.map(c => c.p)) : null;
}

// Prix moyen au litre reellement paye par le plan : carburant du voyage / litres consommes
// (reservoir de depart + achats) ; null si non chiffrable.
function prixMoyen(r, lkm, g0){
  if(!r || r.plan === null || r.voyage == null) return null;
  const km = (r.plan.length ? g0 : 0) + r.plan.reduce((t, e) => t + e.q, 0);
  const litres = lkm * (r.plan.length ? km : (g0 - (r.reste || 0)));
  return litres > 0 ? r.voyage / litres : null;
}

// ---- Plan de charge electrique (phase 1, 28/10/2026) ----
// L'electricite traitee « comme un carburant » : memes candidats tries par km ({s, km, e}),
// meme discretisation / elagage (MAX_CAND), mais l'objectif est le TEMPS DE CHARGE, pas
// l'euro : la Base nationale des IRVE ne publie aucun prix au kWh (voir irve.js).
//
// Vehicule : {batterieKwh, consoKwh100, kwMaxDC, kwMaxAC, prise: 'ccs' | 'chademo' | 't2',
// reservePct (defaut 15), departPct (defaut 80), arriveePct (defaut = reservePct)}.
// Modele : etat = energie a bord, en kWh ENTIERS (tranche de 1 kWh) ; consommation de chaque
// troncon arrondie au kWh superieur et reserve au kWh superieur (prudent) ; on ne descend
// jamais sous la reserve, et on arrive avec au moins arriveePct. Chaque arret coute
// ARRET_ELEC = 5 min de branchement + energie rechargee / puissance effective, ou puissance
// effective = min(kw de la borne, kwMax du vehicule pour ce courant : continu si la borne
// a la prise DC du vehicule, alternatif sinon) et, au-dela de SEUIL_COURBE = 80 % de la
// batterie, cette puissance est DIVISEE PAR DEUX (courbe de charge simplifiee en deux
// paliers : les vraies courbes decroissent progressivement, ceci donne l'ordre de grandeur
// sans connaitre le modele du vehicule). A chaque arret, on recharge soit JUSTE ce qu'il
// faut pour atteindre l'arret suivant (ou l'arrivee) avec la reserve, soit jusqu'a 80 %,
// soit a 100 % : le cout de charge etant lineaire par morceaux, l'optimum est sur ces
// points. Objectif : minutes de charge totales minimales ; a egalite, moins d'arrets.
// Le detour (e km) coute de l'energie a l'aller et au retour, comme pour le carburant ; son
// temps en route est l'affaire de l'appelant (app.js le compte deja pour les pleins).
const ARRET_ELEC = 5;        // minutes de branchement par arret
const SEUIL_COURBE = 0.8;    // part de la batterie au-dela de laquelle la puissance est divisee par deux

// Puissance effective (kW) de la borne pour ce vehicule ; null si incompatible (prise
// absente, ou puissance inconnue). DC si la borne offre la prise DC du vehicule, sinon AC
// (Type 2 ou EF) : une voiture CCS ou CHAdeMO se recharge aussi en alternatif.
function puissanceEffective(station, veh){
  if(!station || !(station.kw > 0) || !veh) return null;
  const dc = (veh.prise === 'ccs' && station.ccs === true) || (veh.prise === 'chademo' && station.chademo === true);
  if(dc && veh.kwMaxDC > 0) return Math.min(station.kw, veh.kwMaxDC);
  if(station.ac === true && veh.kwMaxAC > 0) return Math.min(station.kw, veh.kwMaxAC);
  return null;
}

// Energies du vehicule : batterie B, reserve R, energie au depart E0, minimum a l'arrivee Ea
// (kWh), kWh/km, autonomie utile au depart A (km) et autonomie d'une batterie pleine (km).
// null si batterie ou conso manquent. A (km) et lkm (kWh/km) donnes remplacent ceux du vehicule.
function autonomieElectrique(veh, A, lkm){
  if(!veh) return null;
  const B = +veh.batterieKwh, conso = +veh.consoKwh100;
  const kwhKm = lkm > 0 ? +lkm : (conso > 0 ? conso / 100 : 0);
  if(!(B > 0) || !(kwhKm > 0)) return null;
  const pct = (v, d) => Math.max(0, Math.min(100, v != null && v !== '' ? +v : d));
  const reservePct = pct(veh.reservePct, 15), departPct = pct(veh.departPct, 80), arriveePct = pct(veh.arriveePct, reservePct);
  const R = B * reservePct / 100;
  const E0 = A != null && A >= 0 ? Math.min(B, R + A * kwhKm) : B * departPct / 100;
  return {B, R, E0, Ea: B * arriveePct / 100, lkm: kwhKm, A: Math.max(0, E0 - R) / kwhKm, plein: Math.max(0, B - R) / kwhKm};
}

// Minutes pour passer de e a T kWh (entiers) a P kW, puissance divisee par deux au-dela de e80.
function tempsCharge(e, T, P, e80){
  const bas = Math.max(0, Math.min(T, e80) - Math.min(e, e80));
  const haut = Math.max(0, Math.max(T, e80) - Math.max(e, e80));
  return 60 * (bas / P + haut / (P / 2));
}

// Elagage : au-dela de MAX_CAND, les 2 plus puissantes (puis les plus proches de la route)
// par tranche de trajet.
function elaguerElec(cand, total){
  if(cand.length <= MAX_CAND) return cand;
  const tranche = total / (MAX_CAND / 2), bacs = new Map();
  cand.forEach(c => { const k = Math.floor(c.km / tranche); (bacs.get(k) || bacs.set(k, []).get(k)).push(c); });
  const gardes = [];
  bacs.forEach(l => { l.sort((x, y) => y.kw - x.kw || x.e - y.e); gardes.push(...l.slice(0, 2)); });
  return gardes.sort((x, y) => x.km - y.km);
}

// bornes : [{s: station (format irve.js), km, e}] le long du trajet ; A : autonomie utile au
// depart en km (null = departPct du vehicule) ; total : km du trajet ; lkm : kWh/km (null =
// consoKwh100 / 100) ; veh : vehicule electrique ; opts.departPct : etat de charge au depart
// (%, remplace celui du vehicule).
// Renvoie {faisable, arrets: [{station, kmDepuisDepart, detourKm, kw, kwhCharges, minutes,
// pctArrivee (en arrivant a la borne), pctDepart (en repartant)}], minutesCharge, pctArrivee
// (a l'arrivee du trajet), energieKwh (consommee sur le trajet, detours compris), motif}.
// motif : 'faisable sans recharge', 'aucune borne compatible dans le couloir', 'bornes trop
// espacees pour l\'autonomie', 'vehicule incomplet'.
function optimiserPlanElectrique(bornes, A, total, lkm, veh, opts = {}){
  const v = opts.departPct != null ? Object.assign({}, veh, {departPct: opts.departPct}) : veh;
  const en = autonomieElectrique(v, A, lkm);
  if(!en) return {faisable: false, arrets: [], minutesCharge: null, pctArrivee: null, energieKwh: null, motif: 'vehicule incomplet'};
  const {B, R, E0, Ea} = en;
  const kwhKm = en.lkm;
  const Bi = Math.floor(B), Ri = Math.ceil(R - 1e-9), E0i = Math.min(Bi, Math.floor(E0 + 1e-9)), Eai = Math.ceil(Ea - 1e-9);
  const e80 = Math.floor(SEUIL_COURBE * B + 1e-9);
  const consTotal = Math.round(kwhKm * total * 1000) / 1000;
  const pctDe = e => Math.round(e / B * 1000) / 10;
  // Faisable sans recharge : l'energie du depart emmene a l'arrivee au-dessus du minimum.
  if(E0 - consTotal >= Ea - 1e-9)
    return {faisable: true, arrets: [], minutesCharge: 0, pctArrivee: pctDe(E0 - consTotal), energieKwh: consTotal, motif: 'faisable sans recharge'};
  // Candidats compatibles, puissance effective calculee une fois, puis elagage.
  const compat = (bornes || []).map(c => ({s: c.s, km: c.km, e: c.e || 0, kw: puissanceEffective(c.s, v)}))
    .filter(c => c.kw > 0 && c.km >= 0 && c.km <= total).sort((x, y) => x.km - y.km);
  const infaisable = motif => ({faisable: false, arrets: [], minutesCharge: null, pctArrivee: null, energieKwh: consTotal, motif});
  if(!compat.length) return infaisable('aucune borne compatible dans le couloir');
  const cand = elaguerElec(compat, total);
  const n = cand.length, FIN = n;
  const km = i => i < 0 ? 0 : i >= n ? total : cand[i].km;
  const ex = i => (i < 0 || i >= n) ? 0 : cand[i].e;
  const cons = (j, k) => Math.ceil(kwhKm * (km(k) - km(j) + ex(j) + ex(k)) - 1e-9);
  // dp[k][e] = meilleur {min, arr, pred} en arrivant a la borne k avec e kWh (entier).
  const INF = Infinity;
  const dp = []; for(let k = 0; k < n; k++){ dp.push(new Array(Bi + 1).fill(null)); }
  let fin = null;
  const mieux = (a, m, r) => !a || m < a.min - 1e-9 || (Math.abs(m - a.min) <= 1e-9 && r < a.arr);
  const poser = (k, e, m, r, pred) => {
    if(k === FIN){ if(mieux(fin, m, r)) fin = {min: m, arr: r, e, pred}; return; }
    if(mieux(dp[k][e], m, r)) dp[k][e] = {min: m, arr: r, pred};
  };
  const depuis = (j, e, m, r) => {
    for(let k = j + 1; k <= FIN; k++){
      const c = cons(j, k), besoin = c + (k === FIN ? Eai : Ri);
      // Arret de la boucle sur la seule distance le long de la route (croissante avec k) : le
      // cout c depend du detour de chaque borne, une borne lointaine ne dit rien des suivantes.
      if(kwhKm * (km(k) - km(j)) > Bi) break;
      if(besoin > Bi) continue;                         // inatteignable meme batterie pleine
      if(j < 0){ if(e >= besoin) poser(k, e - c, m, r, null); continue; }
      const P = cand[j].kw;
      // Cibles : juste ce qu'il faut, 80 %, 100 % (jamais « ne pas charger » : on ne
      // s'arrete pas pour rien).
      for(const T of [Math.max(e, besoin), e80, Bi]){
        if(T < besoin || T <= e || T > Bi) continue;
        poser(k, T - c, m + ARRET_ELEC + tempsCharge(e, T, P, e80), r + 1, {j, e, T});
      }
    }
  };
  depuis(-1, E0i, 0, 0);
  for(let j = 0; j < n; j++) for(let e = 0; e <= Bi; e++) if(dp[j][e]) depuis(j, e, dp[j][e].min, dp[j][e].arr);
  if(!fin) return infaisable('bornes trop espacees pour l\'autonomie');
  // Remontee du dernier arret au premier.
  const arrets = [];
  let p = fin.pred;
  while(p){
    const c = cand[p.j];
    arrets.unshift({station: c.s, kmDepuisDepart: c.km, detourKm: c.e, kw: c.kw, kwhCharges: p.T - p.e,
                    minutes: ARRET_ELEC + tempsCharge(p.e, p.T, c.kw, e80), pctArrivee: pctDe(p.e), pctDepart: pctDe(p.T)});
    p = dp[p.j][p.e].pred;
  }
  return {faisable: true, arrets, minutesCharge: fin.min, pctArrivee: pctDe(fin.e), energieKwh: consTotal, motif: null};
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {optimiserPlan, pleinsExtremites, autonomieUtile, coutVoyage, prixMax, prixMoyen, economieVsPlusCher,
                    optimiserPlanElectrique, autonomieElectrique, puissanceEffective, tempsCharge};
