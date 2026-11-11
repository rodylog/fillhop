// Strategies du service worker de ViaMinus, decidees ici a partir de l'URL seule : module PUR,
// sans acces au reseau ni aux caches, exporte pour Node (tests) et concatene devant src/sw.js
// par generate.py pour former pwa/sw.js (un seul fichier, servi a cote de la page).
//
// Regles (brief du 30/10/2026) :
// - coquille = la page elle-meme (et guide.html, manifest, icones, tout .html direct du scope) :
//   cache d'abord ; cache nomme d'apres l'empreinte de build (meta fuelpilot-build, passee au
//   worker par ?v=), les anciens caches viaminus-coquille-* sont purges a l'activation. Une
//   demande en no-cache / reload (controle de version de la page, rechargement) passe reseau
//   d'abord, cache en repli : le controle de version voit toujours la vraie page en ligne.
// - prix (data.economie.gouv.fr) = reseau d'abord, repli sur la derniere reponse en cache de la
//   meme famille (meme API, meme `select`, meme `offset` si possible), avec sa date ;
//   50 entrees, 7 jours.
// - data/irve/*.json = cache d'abord, rafraichi en arriere-plan (40 fichiers, 60 jours).
// - API espagnole = reseau d'abord, repli cache (exactement la meme province) ; 20 entrees, 7 jours.
// - tuiles, styles, glyphes, itineraires, geocodage, et tout le reste = jamais en cache ('reseau').
// Aucune donnee personnelle n'y passe : ni la position — la page ne demande au flux des prix que
// des emprises elargies a la grille de 0,05° et un secteur centre sur un noeud de cette grille
// (app.js, empriseGrille) ; par precaution la cle de cache d'une requete de secteur
// (« distance(geom, POINT…) ») ne porte aucune coordonnee (clePrix) —, ni le garage
// (localStorage, hors de portee du worker).
'use strict';

const PREFIXE_CACHE = 'viaminus-';
const CACHE_PRIX = 'viaminus-prix';
const CACHE_ES = 'viaminus-es';
const CACHE_IRVE = 'viaminus-irve';
const LIMITES = {
  prix: {max: 50, jours: 7},
  es: {max: 20, jours: 7},
  irve: {max: 40, jours: 60},
};
const HOTE_PRIX = 'data.economie.gouv.fr';
const HOTE_ES = 'sedeaplicaciones.minetur.gob.es';
const ENTETE_DATE = 'x-viaminus-date';   // posee par le worker sur ce qu'il stocke : presente = servi depuis le cache

// Nom du cache de la coquille pour une empreinte de build (meta fuelpilot-build).
function nomCacheCoquille(build){
  const b = String(build || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  return PREFIXE_CACHE + 'coquille-' + (b || 'sans-version');
}

// Empreinte de build lue dans le HTML de la page (meta fuelpilot-build), null si absente.
function buildDepuisHtml(html){
  const m = /<meta\s+name="fuelpilot-build"\s+content="([^"]*)"/.exec(String(html || ''));
  return m && m[1] ? m[1] : null;
}

// URL de la page a pre-cacher a l'installation : le scope (= index.html) sauf si la page porte
// un autre nom direct (fuelpilot.html sur un hebergement perso), passe au worker par ?p=.
function urlPage(scope, p){
  const nom = String(p || '');
  if(nom === '' || nom === 'index.html' || !/^[A-Za-z0-9._-]+\.html$/.test(nom)) return scope;
  return scope + nom;
}

// Cle de cache d'une requete au flux des prix : son URL, sauf pour le secteur des couleurs
// (« distance(geom, geom'POINT(lon lat)', 60km) »), range sous une cle SANS coordonnees — le
// point vient du repere de l'utilisateur, il n'a rien a faire dans le cache. Hors ligne, le
// dernier secteur connu repond donc, ou qu'on soit.
function clePrix(u){
  const w = u.searchParams.get('where');
  if(w == null || !/POINT\s*\(/i.test(w)) return u.href;
  const c = new URL(u.href);
  c.searchParams.set('where', w.replace(/POINT\s*\([^)]*\)/gi, 'POINT(secteur)'));
  return c.href;
}

// Decision pour une requete : {type, cle?, reseauDabord?}.
// type : 'coquille' | 'prix' | 'es' | 'irve' | 'reseau' (= ne pas intercepter).
// ctx : {scope: URL du scope du worker (se termine par /), cache: mode cache de la requete}.
function decider(urlStr, ctx){
  let u, s;
  try{ u = new URL(String(urlStr)); s = new URL(String((ctx && ctx.scope) || '')); }
  catch(e){ return {type: 'reseau'}; }
  if(!/^https?:$/.test(u.protocol)) return {type: 'reseau'};
  const sansRecherche = u.origin + u.pathname;
  if(u.origin === s.origin){
    if(!u.pathname.startsWith(s.pathname)) return {type: 'reseau'};
    const rel = u.pathname.slice(s.pathname.length);
    if(/^data\/irve\/[A-Za-z0-9_-]+\.json$/.test(rel)) return {type: 'irve', cle: sansRecherche};
    if(rel.includes('/') || rel === 'sw.js') return {type: 'reseau'};
    const estPage = rel === '' || /^[A-Za-z0-9._-]+\.html$/.test(rel);
    const estStatique = rel === 'manifest.webmanifest' || /^icone[A-Za-z0-9_-]*\.(png|svg)$/.test(rel);
    if(!estPage && !estStatique) return {type: 'reseau'};
    const cle = rel === 'index.html' ? s.href : sansRecherche;
    const mode = String((ctx && ctx.cache) || '');
    return {type: 'coquille', cle, reseauDabord: /^(no-cache|no-store|reload)$/.test(mode)};
  }
  if(u.hostname === HOTE_PRIX) return {type: 'prix', cle: clePrix(u)};
  if(u.hostname === HOTE_ES) return {type: 'es', cle: u.href};
  return {type: 'reseau'};
}

// Caches a supprimer a l'activation : tous ceux de ViaMinus qui ne sont pas dans `garder`
// (la coquille de CE build + les trois caches de donnees). Les caches d'autres applications
// hebergees sur la meme origine ne sont jamais touches.
function cachesAPurger(noms, garder){
  const g = new Set(garder || []);
  return (noms || []).filter(n => typeof n === 'string' && n.startsWith(PREFIXE_CACHE) && !g.has(n));
}

const dateMs = d => { const t = typeof d === 'number' ? d : Date.parse(d); return Number.isFinite(t) ? t : 0; };
const perimee = (e, limite, maintenant) => maintenant - dateMs(e.date) > limite.jours * 86400000;

// Entrees a retirer d'un cache de donnees : perimees (plus de `jours`), puis les plus anciennes
// au-dela de `max` (la plus recente est toujours gardee). entrees : [{url, date}].
function entreesAPurger(entrees, limite, maintenant){
  const now = maintenant == null ? Date.now() : maintenant;
  const l = (entrees || []).filter(e => e && typeof e.url === 'string');
  const mortes = l.filter(e => perimee(e, limite, now));
  const vivantes = l.filter(e => !perimee(e, limite, now)).sort((a, b) => dateMs(b.date) - dateMs(a.date));
  return mortes.concat(vivantes.slice(limite.max)).map(e => e.url);
}

// Meme famille de requete : meme API (origine + chemin) et meme `select` (prix vs ruptures).
function memeFamille(a, b){
  try{
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname &&
           (x.searchParams.get('select') || '') === (y.searchParams.get('select') || '');
  }catch(e){ return false; }
}

// Reponse de repli quand le reseau se tait : l'entree exacte si elle existe et n'est pas
// perimee ; sinon, si `famille` est vrai (prix), la plus recente de la meme famille, de
// preference au meme offset (la page demande offset 0, puis 100…). null : rien d'utile.
function choisirRepli(entrees, url, limite, options){
  const o = options || {};
  const now = o.maintenant == null ? Date.now() : o.maintenant;
  const vivantes = (entrees || []).filter(e => e && typeof e.url === 'string' && !perimee(e, limite, now));
  const exacte = vivantes.find(e => e.url === url);
  if(exacte) return exacte.url;
  if(!o.famille) return null;
  const offset = u => { try{ return new URL(u).searchParams.get('offset') || '0'; }catch(e){ return '0'; } };
  const fam = vivantes.filter(e => memeFamille(e.url, url)).sort((a, b) => dateMs(b.date) - dateMs(a.date));
  if(!fam.length) return null;
  const memeOffset = fam.find(e => offset(e.url) === offset(url));
  return (memeOffset || fam[0]).url;
}

// Export Node (tests) ; dans le worker, `module` n'existe pas et ces fonctions sont globales.
if(typeof module !== 'undefined' && module.exports)
  module.exports = {PREFIXE_CACHE, CACHE_PRIX, CACHE_ES, CACHE_IRVE, LIMITES, HOTE_PRIX, HOTE_ES, ENTETE_DATE,
                    nomCacheCoquille, buildDepuisHtml, urlPage, clePrix, decider, cachesAPurger, entreesAPurger,
                    memeFamille, choisirRepli};

// Service worker de ViaMinus (corps). pwa/sw.js = src/pwa-strategie.js (regles pures, testees)
// + ce fichier, assembles par generate.py ; servi A COTE de la page (meme dossier), enregistre
// par la page en https seulement : sw.js?v=<empreinte de build>&p=<nom de la page>.
// Toute erreur ici retombe sur le reseau : la page continue de fonctionner comme avant.
const PARAMS = new URL(self.location.href).searchParams;
const BUILD_SW = PARAMS.get('v') || '';
const SCOPE = self.registration.scope;
const PAGE = urlPage(SCOPE, PARAMS.get('p') || '');
const NOM_COQUILLE = nomCacheCoquille(BUILD_SW);   // deterministe : le worker peut etre relance a tout moment
const NOMS = {prix: CACHE_PRIX, es: CACHE_ES, irve: CACHE_IRVE};
// Reseau d'abord, mais pas sans fin : au-dela de DELAI_RESEAU sans reponse (reseau « present mais
// muet »), la derniere reponse en cache est servie si elle existe ; sans cache, on attend le reseau.
const DELAI_RESEAU = 8000;

// Copie d'une reponse datee (l'en-tete dit a la page : « ceci vient du cache, de telle date »).
function dater(r){
  const h = new Headers(r.headers);
  h.set(ENTETE_DATE, new Date().toISOString());
  return new Response(r.body, {status: r.status, statusText: r.statusText, headers: h});
}
async function entrees(c){
  const ks = await c.keys();
  return Promise.all(ks.map(async k => { const m = await c.match(k); return {url: k.url, date: m ? m.headers.get(ENTETE_DATE) : null}; }));
}
// Stocke une reponse 200 sous `cle`, puis applique la limite (entrees, age) du cache.
async function stocker(nom, cle, r, limite){
  if(!r || !r.ok) return;
  const c = await caches.open(nom);
  await c.put(cle, dater(r));
  if(!limite) return;
  for(const u of entreesAPurger(await entrees(c), limite, Date.now())) await c.delete(u);
}
async function repli(nom, cle, limite, famille){
  const c = await caches.open(nom);
  const u = choisirRepli(await entrees(c), cle, limite, {famille});
  return u ? c.match(u) : null;
}

// Installation : la coquille est lue fraiche (cache: reload) et rangee dans le cache de CE build.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const r = await fetch(PAGE, {cache: 'reload'});
    if(!r.ok) throw new Error('coquille HTTP ' + r.status);
    const c = await caches.open(NOM_COQUILLE);
    await c.put(PAGE, dater(r));
  })());
});
// Activation : les coquilles des builds precedents disparaissent, les caches de donnees restent.
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const garder = [NOM_COQUILLE, CACHE_PRIX, CACHE_ES, CACHE_IRVE];
    for(const n of cachesAPurger(await caches.keys(), garder)) await caches.delete(n);
    await self.clients.claim();   // des la premiere visite, les chargements suivants passent par le worker
  })());
});
// La page (bandeau « nouvelle version », bouton Recharger) demande au worker en attente de prendre la main.
self.addEventListener('message', e => { if(e.data && e.data.type === 'activer') self.skipWaiting(); });

async function coquille(d, req){
  const c = await caches.open(NOM_COQUILLE);
  if(d.reseauDabord){
    try{
      const r = await fetch(req);
      if(r.ok){ await c.put(d.cle, dater(r.clone())); return r; }
      return (await c.match(d.cle)) || r;
    }catch(e){
      const m = await c.match(d.cle);
      if(m) return m;
      throw e;
    }
  }
  const m = await c.match(d.cle);
  if(m) return m;
  const r = await fetch(req);
  if(r.ok) await c.put(d.cle, dater(r.clone()));
  return r;
}
async function reseauDabord(d, req, famille){
  const nom = NOMS[d.type], limite = LIMITES[d.type];
  if(self.navigator && navigator.onLine === false){   // hors ligne declare : pas la peine d'essayer
    const m = await repli(nom, d.cle, limite, famille);
    if(m) return m;
  }
  const reseau = fetch(req).then(async r => { if(r.ok) await stocker(nom, d.cle, r.clone(), limite); return r; });
  const r = await Promise.race([reseau, new Promise(res => setTimeout(() => res(null), DELAI_RESEAU))]).catch(() => null);
  if(r && r.ok) return r;
  const m = await repli(nom, d.cle, limite, famille);   // echec, delai depasse ou reponse en erreur
  if(m) return m;
  return reseau;   // rien en cache : la reponse du reseau, bonne ou mauvaise, ou son erreur
}
async function cacheDabord(d, req, e){
  const nom = NOMS[d.type], limite = LIMITES[d.type];
  const c = await caches.open(nom);
  const m = await c.match(d.cle);
  const maj = fetch(req).then(r => { if(r.ok) return stocker(nom, d.cle, r.clone(), limite).then(() => r); return r; });
  if(m){ e.waitUntil(maj.catch(() => {})); return m; }
  return maj;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const d = decider(req.url, {scope: SCOPE, cache: req.cache});
  if(d.type === 'reseau') return;                      // tuiles, itineraires, geocodage… : le navigateur fait comme d'habitude
  const p = d.type === 'coquille' ? coquille(d, req)
          : d.type === 'irve' ? cacheDabord(d, req, e)
          : reseauDabord(d, req, d.type === 'prix');
  e.respondWith(p.catch(() => fetch(req)));            // erreur du worker : comme sans worker
});
