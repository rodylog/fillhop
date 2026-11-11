// Regles metier du banc : chacune lit le plan structure (window.__viaminus_plan, voir
// src/app.js, publierPlan) et renvoie la liste des manquements (vide = regle respectee).
// Elles sont communes a tous les scenarios ; les seuils sont ceux du code et du banc manuel
// du 26/10/2026 (station muette : 21 jours ; plein d'arrivee : 14 jours comme FIGE_J ;
// « Sans détour » dans app.js = largeur <= 2 km).
'use strict';

const MUET_JOURS = 21;        // au-dela, une station retenue est « muette » (banc manuel du 26/10/2026)
const ARRIVEE_JOURS = 14;     // = FIGE_J dans app.js : un plein d'arrivee plus vieux doit etre signale
const SANS_DETOUR_KM = 2;     // app.js : dRef.w <= 2 -> « Sans détour », au-dela -> « détour nécessaire »
const TOL_EUR = 0.005;        // demi-centime : arrondis d'affichage
const TOL_DISTANCE = 0.005;   // 0,5 % : le plan compte les kilometres du trajet annonce (releve du 11/11/2026)

const ageJours = (date, ref) => date ? (new Date(ref) - new Date(date)) / 864e5 : Infinity;
const euros = x => x == null ? 'non chiffré' : `${x.toFixed(2)} €`;
const nomSt = s => `${s.ville || '?'} (station ${s.id}, km ${Math.round(s.km)})`;
const jours = j => j === Infinity ? 'date inconnue' : `${Math.floor(j)} j`;

// Stations retenues par le plan, avec leur role : plein au depart, etapes, plein a l'arrivee.
function retenues(plan){
  const l = [];
  if(plan.depart) l.push({ou: 'départ', s: plan.depart});
  (plan.etapes || []).forEach((e, i) => l.push({ou: `étape ${i + 1}`, s: e}));
  if(plan.arrivee) l.push({ou: 'arrivée', s: plan.arrivee});
  return l;
}
const faisables = plan => (plan.largeurs || []).filter(o => o.faisable);
const messageDetourNecessaire = plan => (plan.messages || []).some(m => /détour/i.test(m) && /nécessaire/i.test(m));
const messagePlusRapide = plan => (plan.messages || []).some(m => /le plus rapide et le moins cher passe à/i.test(m));

const REGLES = [
  {
    cle: 'stationMuette',
    nom: `aucune station retenue dont le prix du carburant choisi date de plus de ${MUET_JOURS} jours`,
    verifier({plan, date}){
      return retenues(plan).map(({ou, s}) => {
        const j = ageJours(s.datePrix, date);
        return j > MUET_JOURS ? `${ou} : ${nomSt(s)} retenue avec un prix ${s.carburants && s.carburants[0] ? s.carburants[0].ref : ''} du ${s.datePrix || '?'} (${jours(j)} à la date de l'enregistrement ${date.slice(0, 10)})` : null;
      }).filter(Boolean);
    },
  },
  {
    cle: 'pleinArriveeAlerte',
    nom: `un plein d'arrivée dont le prix date de plus de ${ARRIVEE_JOURS} jours porte une alerte`,
    verifier({plan, date}){
      const a = plan.arrivee;
      if(!a) return [];
      const j = ageJours(a.datePrix, date);
      if(j <= ARRIVEE_JOURS) return [];
      const alerte = (plan.alertes || []).some(x => x.ou === 'arrivee' && x.id === a.id);
      return alerte ? [] : [`plein d'arrivée ${nomSt(a)} au prix du ${a.datePrix || '?'} (${jours(j)}) sans alerte affichée (alertes : ${JSON.stringify(plan.alertes || [])})`];
    },
  },
  {
    cle: 'carburantABordUnique',
    nom: 'le carburant à bord au départ est valorisé une seule fois, au même prix, quelle que soit la largeur de couloir',
    verifier({plan}){
      const l = faisables(plan).filter(o => o.aBordValeur != null);
      if(l.length < 2) return [];
      const ref = l[0].aBordValeur, pb = [];
      l.forEach(o => { if(Math.abs(o.aBordValeur - ref) > TOL_EUR) pb.push(`largeur ${o.w} km : carburant à bord ${euros(o.aBordValeur)} contre ${euros(ref)} à ${l[0].w} km`); });
      if(plan.aBordValeur != null && Math.abs(plan.aBordValeur - ref) > TOL_EUR) pb.push(`plan affiché (couloir ${plan.couloir} km) : ${euros(plan.aBordValeur)} contre ${euros(ref)}`);
      return pb;
    },
  },
  {
    cle: 'messageDetour',
    nom: `le message « détour nécessaire » n'apparaît que si le détour minimal dépasse ${SANS_DETOUR_KM} km`,
    verifier({plan}){
      const f = faisables(plan);
      if(!f.length) return [];                         // infaisable a toute largeur : autre message
      const wmin = Math.min(...f.map(o => o.w)), present = messageDetourNecessaire(plan);
      if(present && wmin <= SANS_DETOUR_KM) return [`message « détour nécessaire » affiché alors qu'un plan passe à ${wmin} km de la route (messages : ${JSON.stringify(plan.messages)})`];
      // Reciproque, telle que le code l'ecrit : un seul choix de detour affiche, au-dela du seuil -> un message est du.
      // Ce choix a la plus petite largeur faisable : « détour nécessaire ». Plus large (un choix plus etroit
      // existe mais il est domine : app.js, etroitFaisable) : « Le plus rapide et le moins cher passe à X km ».
      if(!present && plan.etat !== 'infaisable' && (plan.detours || []).length === 1 && wmin > SANS_DETOUR_KM){
        const etroitDomine = plan.detours[0].w > wmin;
        if(!(etroitDomine && messagePlusRapide(plan)))
          return [`détour minimal ${wmin} km > ${SANS_DETOUR_KM} km et un seul choix affiché${etroitDomine ? ` à ${plan.detours[0].w} km` : ''} : message « ${etroitDomine ? 'Le plus rapide et le moins cher' : 'détour nécessaire'} » attendu (messages : ${JSON.stringify(plan.messages)})`];
      }
      return [];
    },
  },
  {
    cle: 'coutTotal',
    nom: 'le coût total égale la somme des pleins (carburant à bord au départ + achats aux étapes)',
    verifier({plan}){
      if(plan.etat === 'infaisable') return [];
      const somme = (plan.etapes || []).reduce((t, e) => t + e.cout, 0), pb = [];
      if(plan.achats != null && Math.abs(plan.achats - somme) > TOL_EUR) pb.push(`achats ${euros(plan.achats)} ≠ somme des étapes ${euros(somme)}`);
      if(plan.voyage != null && plan.aBordValeur != null && Math.abs(plan.voyage - (plan.aBordValeur + somme)) > TOL_EUR)
        pb.push(`carburant du voyage ${euros(plan.voyage)} ≠ à bord ${euros(plan.aBordValeur)} + étapes ${euros(somme)}`);
      return pb;
    },
  },
  {
    cle: 'economiePositive',
    nom: "l'économie annoncée est non négative",
    verifier({plan}){
      const e = plan.economie;
      if(!e || e.economie == null) return [];
      return e.economie < -TOL_EUR ? [`économie annoncée ${euros(e.economie)} (référence au plus cher ${euros(e.reference)} < voyage ${euros(plan.voyage)})`] : [];
    },
  },
  {
    cle: 'totalPlanDistance',
    nom: 'le total du plan égale la distance du trajet à 0,5 % près',
    verifier({plan}){
      const t = plan.trajet;
      if(!t || t.km == null || t.total == null) return [];
      const ecart = Math.abs(t.total - t.km) / t.km;
      return ecart > TOL_DISTANCE
        ? [`le plan compte ${t.total.toFixed(1)} km pour un trajet annoncé de ${t.km.toFixed(1)} km (écart ${(ecart * 100).toFixed(1)} % > ${TOL_DISTANCE * 100} %)`] : [];
    },
  },
];

// Deux rejeux de la meme fixture donnent le meme plan (determinisme) : difference en clair, sinon [].
function determinisme(a, b){
  const diff = [];
  const parcourir = (x, y, chemin) => {
    if(diff.length > 10) return;
    if(x === y) return;
    if(typeof x !== typeof y || x == null || y == null || typeof x !== 'object'){ diff.push(`${chemin || '(racine)'} : ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); return; }
    const cles = new Set([...Object.keys(x), ...Object.keys(y)]);
    cles.forEach(k => parcourir(x[k], y[k], chemin ? `${chemin}.${k}` : k));
  };
  parcourir(a, b, '');
  return diff;
}

module.exports = {REGLES, determinisme, retenues, MUET_JOURS, ARRIVEE_JOURS, SANS_DETOUR_KM, TOL_EUR, TOL_DISTANCE};
