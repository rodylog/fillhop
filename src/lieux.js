// Choix du lieu parmi les reponses du geocodeur (releve du 11/11/2026). Module PUR (aucun DOM,
// aucun reseau), exporte pour Node et teste dans lieux.test.js sur des reponses reelles
// (src/fixtures/geocodage-geopf.json) ; dans la page il precede app.js (generate.py, SCRIPTS).
//
// Pourquoi : le geocodeur (Geoplateforme, memes donnees et meme format que la BAN) classe par
// score de ressemblance du TEXTE, sans preference pour les communes. Mesure le 11/11/2026 :
// « Narbonne » rend d'abord la voie « Narbonne » de Joue-les-Tours (0,962) et la commune
// ensuite (0,954) ; « Vienne » une voie d'Aixe-sur-Vienne ; « Madrid » une voie de Charente
// (0,937) ; « Figueres » une rue de Fort-de-France (0,691). Prendre le premier resultat
// faisait partir le trajet d'un hameau homonyme.
//
// Regle (features = `features` de la reponse, 5 demandes) :
//   - rien en dessous de SCORE_MIN_LIEU ;
//   - saisie avec un chiffre ou une virgule (« 12 rue de la Paix Paris », « 66000 »,
//     « Mairie, Lodeve ») : c'est une adresse, le meilleur score ;
//   - sinon c'est un nom : la commune de meme nom d'abord, puis une commune dont le nom
//     contient tous les mots saisis (« Aixe » -> Aixe-sur-Vienne, « St Etienne » ->
//     Saint-Etienne), puis une voie ou un lieu-dit a condition que la saisie nomme AUSSI sa
//     commune (« rue de la République Lyon ») ;
//   - sinon null : l'appelant refuse (lieu introuvable), il ne devine pas.

const SCORE_MIN_LIEU = 0.5;

// Mots d'un texte : minuscules, sans accents, « st » / « ste » developpes.
function motsLieu(texte){
  return String(texte == null ? '' : texte).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean)
    .map(m => m === 'st' ? 'saint' : m === 'ste' ? 'sainte' : m);
}
// Un nom seul (ville, lieu) : ni chiffre ni virgule.
const nomSeul = q => !/[0-9,]/.test(String(q));

function choisirLieu(q, features){
  const lieu = f => ({lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: f.properties.label,
                      type: f.properties.type, score: f.properties.score});
  const retenus = (features || []).filter(f => f.properties.score >= SCORE_MIN_LIEU)
    .sort((a, b) => b.properties.score - a.properties.score);
  if(!retenus.length) return null;
  if(!nomSeul(q)) return lieu(retenus[0]);
  const saisie = motsLieu(q), cle = saisie.join(' ');
  const communes = retenus.filter(f => f.properties.type === 'municipality');
  const noms = communes.map(f => motsLieu(f.properties.name));
  let i = noms.findIndex(n => n.join(' ') === cle);
  if(i < 0) i = noms.findIndex(n => saisie.every(m => n.includes(m)));
  if(i >= 0) return lieu(communes[i]);
  // Voie ou lieu-dit : un mot de la saisie, hors du nom de la voie, designe sa commune.
  const voie = retenus.find(f => {
    const nom = motsLieu(f.properties.name), ville = motsLieu(f.properties.city);
    return f.properties.type !== 'municipality' && saisie.some(m => m.length > 2 && !nom.includes(m) && ville.includes(m));
  });
  return voie ? lieu(voie) : null;
}

// Nom d'un bout du trajet dans l'en-tete du plan : la saisie quand le geocodeur rend le meme
// lieu (« narbonne » / « Narbonne »), sinon le libelle geocode — on lit ou l'on va vraiment.
function libelleTrajet(saisie, label){
  return !label || motsLieu(saisie).join(' ') === motsLieu(label).join(' ') ? saisie : label;
}

// Export Node (tests) ; sans effet dans la page, ou `module` n'existe pas.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {SCORE_MIN_LIEU, motsLieu, nomSeul, choisirLieu, libelleTrajet};
