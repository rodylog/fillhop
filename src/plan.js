// Optimisation des pleins (probleme de la station-service, DP avant/arriere).
// cand : stations triees par km ({s,v,km,e,p}) ; A : autonomie utile en km.
// Renvoie {plan, coutAchats, utiles} — plan:null si infaisable, plan:[] si
// aucun arret n'est necessaire.
function optimiserPlan(cand, A, total, lkm){
  if(total <= A) return {plan: [], coutAchats: 0, utiles: new Set()};
  const n = cand.length;
  const best = new Array(n).fill(Infinity), pred = new Array(n).fill(-2);
  for(let i = 0; i < n; i++)
    if(cand[i].km + cand[i].e <= A){ best[i] = 0; pred[i] = -1; }
  for(let j = 0; j < n; j++){
    if(best[j] === Infinity) continue;
    for(let i = j + 1; i < n; i++){
      if(cand[i].km - cand[j].km + cand[j].e + cand[i].e > A) continue;
      // +0,80 EUR par arret : le temps perdu a une valeur, sinon le calcul
      // suggere un micro-arret pour economiser trois centimes.
      const c = best[j] + 0.8 + cand[j].p * lkm *
                (cand[i].km - cand[j].km + 2 * cand[i].e);
      if(c < best[i] - 1e-9){ best[i] = c; pred[i] = j; }
    }
  }
  let fin = -1, coutFin = Infinity;
  for(let i = 0; i < n; i++){
    if(best[i] === Infinity) continue;
    if(total - cand[i].km + cand[i].e > A) continue;
    const c = best[i] + cand[i].p * lkm * (total - cand[i].km + cand[i].e);
    if(c < coutFin){ coutFin = c; fin = i; }
  }
  if(fin < 0) return {plan: null};
  const plan = [];
  for(let i = fin; i >= 0; i = pred[i]) plan.unshift(cand[i]);
  // Cout carburant reel des achats (les penalites sont un arbitrage interne).
  let coutAchats = 0;
  for(let i = 0; i < plan.length; i++){
    const suivKm = (i + 1 < plan.length) ? plan[i+1].km : total;
    const suivE  = (i + 1 < plan.length) ? 2 * plan[i+1].e : plan[i].e;
    coutAchats += plan[i].p * lkm * (suivKm - plan[i].km + suivE);
  }
  // Stations utiles = celles par lesquelles passe un plan quasi optimal.
  // Tolerance 0,50 EUR : STRICTEMENT sous la penalite d'arret (0,80), sinon un
  // arret supplementaire gratuit (typiquement pres de l'arrivee) passe la barre
  // alors qu'il n'apporte rien.
  const suite = new Array(n).fill(Infinity);
  for(let i = n - 1; i >= 0; i--){
    if(total - cand[i].km + cand[i].e <= A)
      suite[i] = cand[i].p * lkm * (total - cand[i].km + cand[i].e);
    for(let k = i + 1; k < n; k++){
      if(cand[k].km - cand[i].km + cand[i].e + cand[k].e > A) continue;
      if(suite[k] === Infinity) continue;
      const c = 0.8 + cand[i].p * lkm *
                (cand[k].km - cand[i].km + 2 * cand[k].e) + suite[k];
      if(c < suite[i]) suite[i] = c;
    }
  }
  const utiles = new Set();
  for(let i = 0; i < n; i++)
    if(best[i] + suite[i] <= coutFin + 0.5) utiles.add(cand[i].s);
  plan.forEach(e => utiles.add(e.s));
  return {plan, coutAchats, utiles};
}

// Plein au depart et plein a l'arrivee. Le plan suppose un reservoir plein au
// depart : encore faut-il savoir OU le faire, et ou refaire le plein en arrivant
// (demande Eric, 17/09/2026). Pour chaque bout du trajet : la station la moins
// chere a moins de `rayon` km du debut (resp. de la fin) ; a prix egal, le plus
// petit detour. null si aucune station dans le rayon.
function pleinsExtremites(cand, total, rayon = 15){
  const meilleure = liste => liste.length ? liste.reduce((x, y) =>
    (y.p < x.p - 1e-9 || (Math.abs(y.p - x.p) <= 1e-9 && y.e < x.e)) ? y : x) : null;
  return {depart:  meilleure(cand.filter(c => c.km <= rayon)),
          arrivee: meilleure(cand.filter(c => c.km >= total - rayon))};
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

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports) module.exports = {optimiserPlan, pleinsExtremites, autonomieUtile};
