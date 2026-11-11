// Tests de src/pwa-strategie.js : une regle par type d'URL, purge des caches perimes, limite
// d'entrees, repli de la meme famille, et pwa/sw.js a jour par rapport aux sources.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('./pwa-strategie.js');

const SCOPE = 'https://rodylog.github.io/viaminus/';
const ctx = (cache) => ({scope: SCOPE, cache});
const J = 86400000;

test('coquille : la page (scope, index.html, guide.html, page renommee), manifest, icones -> cache d\'abord, cle normalisee', () => {
  assert.deepStrictEqual(S.decider(SCOPE, ctx()), {type: 'coquille', cle: SCOPE, reseauDabord: false});
  assert.deepStrictEqual(S.decider(SCOPE + 'index.html', ctx('default')), {type: 'coquille', cle: SCOPE, reseauDabord: false});
  assert.deepStrictEqual(S.decider(SCOPE + '?x=1', ctx()), {type: 'coquille', cle: SCOPE, reseauDabord: false});
  assert.deepStrictEqual(S.decider(SCOPE + 'guide.html', ctx()), {type: 'coquille', cle: SCOPE + 'guide.html', reseauDabord: false});
  assert.deepStrictEqual(S.decider('https://maison.example/local/fuelpilot.html', {scope: 'https://maison.example/local/'}),
                         {type: 'coquille', cle: 'https://maison.example/local/fuelpilot.html', reseauDabord: false});
  assert.strictEqual(S.decider(SCOPE + 'manifest.webmanifest', ctx()).type, 'coquille');
  assert.strictEqual(S.decider(SCOPE + 'icone-192.png', ctx()).type, 'coquille');
  assert.strictEqual(S.decider(SCOPE + 'icone-maskable-512.png', ctx()).type, 'coquille');
});

test('coquille : no-cache / reload / no-store (controle de version, rechargement) -> reseau d\'abord', () => {
  for(const mode of ['no-cache', 'reload', 'no-store'])
    assert.deepStrictEqual(S.decider(SCOPE, ctx(mode)), {type: 'coquille', cle: SCOPE, reseauDabord: true});
  assert.strictEqual(S.decider(SCOPE, ctx('force-cache')).reseauDabord, false);
});

test('meme origine : sw.js, sous-dossiers, autres fichiers -> reseau (jamais en cache)', () => {
  assert.deepStrictEqual(S.decider(SCOPE + 'sw.js?v=1', ctx()), {type: 'reseau'});
  assert.deepStrictEqual(S.decider(SCOPE + 'autre/page.html', ctx()), {type: 'reseau'});
  assert.deepStrictEqual(S.decider(SCOPE + 'data/irve/', ctx()), {type: 'reseau'});
  assert.deepStrictEqual(S.decider(SCOPE + 'data/autre.json', ctx()), {type: 'reseau'});
  assert.deepStrictEqual(S.decider(SCOPE + 'script.js', ctx()), {type: 'reseau'});
  assert.deepStrictEqual(S.decider('https://rodylog.github.io/ailleurs/', ctx()), {type: 'reseau'});   // hors scope
});

test('data/irve/*.json -> cache d\'abord avec rafraichissement (irve)', () => {
  assert.deepStrictEqual(S.decider(SCOPE + 'data/irve/index.json', ctx()), {type: 'irve', cle: SCOPE + 'data/irve/index.json'});
  assert.deepStrictEqual(S.decider(SCOPE + 'data/irve/2A.json?t=5', ctx()), {type: 'irve', cle: SCOPE + 'data/irve/2A.json'});
  assert.strictEqual(S.decider(SCOPE + 'data/irve/34.csv', ctx()).type, 'reseau');
});

test('flux des prix -> reseau d\'abord (prix) ; API espagnole -> es', () => {
  const prix = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records?where=in_bbox(geom,1,2,3,4)&select=id&limit=100&offset=0';
  assert.deepStrictEqual(S.decider(prix, ctx()), {type: 'prix', cle: prix});
  const es = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/17';
  assert.deepStrictEqual(S.decider(es, ctx()), {type: 'es', cle: es});
});

test('flux des prix, secteur des couleurs (distance autour du repere) : la cle de cache ne porte aucune coordonnee', () => {
  const api = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records';
  const secteur = (lon, lat, off) => api + '?where=' + encodeURIComponent(`distance(geom, geom'POINT(${lon} ${lat})', 60km)`) + '&select=id,e10_prix&limit=100&offset=' + off;
  const d = S.decider(secteur('3.8767', '43.6108', 0), ctx());
  assert.strictEqual(d.type, 'prix');
  assert.ok(!/3\.87|43\.61/.test(decodeURIComponent(d.cle)), 'coordonnees dans la cle : ' + d.cle);
  assert.match(decodeURIComponent(d.cle).replace(/\+/g, ' '), /distance\(geom, geom'POINT\(secteur\)', 60km\)/);
  // Meme cle ou que soit le repere (le dernier secteur connu sert hors ligne), une cle par page.
  assert.strictEqual(S.decider(secteur('2.35', '48.85', 0), ctx()).cle, d.cle);
  assert.notStrictEqual(S.decider(secteur('3.8767', '43.6108', 100), ctx()).cle, d.cle);
  assert.ok(S.memeFamille(d.cle, secteur('2.35', '48.85', 0)), 'la cle reste de la famille des prix (meme API, meme select)');
  // Une emprise (rectangle de la grille) garde son URL pour cle.
  const emprise = api + '?where=in_bbox(geom,43.55,3.80,43.70,3.95)&select=id&limit=100&offset=0';
  assert.strictEqual(S.decider(emprise, ctx()).cle, emprise);
});

test('tuiles, style, glyphes, itineraires, geocodage, secours OSM -> jamais en cache', () => {
  for(const u of ['https://data.geopf.fr/tms/1.0.0/PLAN.IGN/12/2000/1400.pbf',
                  'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/attenue.json',
                  'https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/Marianne%20Regular/0-255.pbf',
                  'https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=1,2&end=3,4',
                  'https://data.geopf.fr/geocodage/search/?q=tours&limit=1',
                  'https://api-adresse.data.gouv.fr/search/?q=tours&limit=1',
                  'https://tile.openstreetmap.org/12/2000/1400.png',
                  'https://valhalla1.openstreetmap.de/route?json=%7B%7D',
                  'blob:https://rodylog.github.io/abc', 'data:text/plain,x', 'pas une url', ''])
    assert.deepStrictEqual(S.decider(u, ctx()), {type: 'reseau'}, u);
  assert.deepStrictEqual(S.decider(SCOPE, {}), {type: 'reseau'});       // scope inconnu : on n'intercepte rien
});

test('nomCacheCoquille : versionne par l\'empreinte de build, nettoye ; buildDepuisHtml ; urlPage', () => {
  assert.strictEqual(S.nomCacheCoquille('20261030-141500'), 'viaminus-coquille-20261030-141500');
  assert.strictEqual(S.nomCacheCoquille('a b/c<d>'), 'viaminus-coquille-a_b_c_d_');
  assert.strictEqual(S.nomCacheCoquille(''), 'viaminus-coquille-sans-version');
  assert.strictEqual(S.buildDepuisHtml('<head><meta name="fuelpilot-build" content="20261030-1"><title>x</title>'), '20261030-1');
  assert.strictEqual(S.buildDepuisHtml('<meta name="fuelpilot-build" content="">'), null);
  assert.strictEqual(S.buildDepuisHtml('<html></html>'), null);
  assert.strictEqual(S.urlPage(SCOPE, ''), SCOPE);
  assert.strictEqual(S.urlPage(SCOPE, 'index.html'), SCOPE);
  assert.strictEqual(S.urlPage(SCOPE, 'fuelpilot.html'), SCOPE + 'fuelpilot.html');
  assert.strictEqual(S.urlPage(SCOPE, '../x.html'), SCOPE);     // nom suspect : le scope
  assert.strictEqual(S.urlPage(SCOPE, 'a/b.html'), SCOPE);
});

test('cachesAPurger : les viaminus-* qui ne sont pas a garder ; les autres applications jamais', () => {
  const noms = ['viaminus-coquille-ancien', 'viaminus-coquille-courant', 'viaminus-prix', 'viaminus-es', 'viaminus-irve',
                'viaminus-coquille-sans-version', 'autre-appli-v3', 'workbox-precache'];
  assert.deepStrictEqual(S.cachesAPurger(noms, ['viaminus-coquille-courant', S.CACHE_PRIX, S.CACHE_ES, S.CACHE_IRVE]),
                         ['viaminus-coquille-ancien', 'viaminus-coquille-sans-version']);
  assert.deepStrictEqual(S.cachesAPurger([], ['x']), []);
  assert.deepStrictEqual(S.cachesAPurger(noms, []).length, 6);
});

test('entreesAPurger : perimees (7 jours) d\'abord, puis les plus anciennes au-dela de 50 ; la plus recente reste', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const e = [];
  for(let i = 0; i < 60; i++) e.push({url: 'https://data.economie.gouv.fr/r?offset=' + i, date: new Date(now - i * 3600000).toISOString()});
  e.push({url: 'https://data.economie.gouv.fr/vieux', date: new Date(now - 8 * J).toISOString()});
  e.push({url: 'https://data.economie.gouv.fr/sans-date', date: null});   // date illisible = perimee
  const p = S.entreesAPurger(e, S.LIMITES.prix, now);
  assert.ok(p.includes('https://data.economie.gouv.fr/vieux'));
  assert.ok(p.includes('https://data.economie.gouv.fr/sans-date'));
  for(let i = 50; i < 60; i++) assert.ok(p.includes('https://data.economie.gouv.fr/r?offset=' + i), 'offset ' + i);
  for(let i = 0; i < 50; i++) assert.ok(!p.includes('https://data.economie.gouv.fr/r?offset=' + i), 'offset ' + i);
  assert.strictEqual(p.length, 12);
  assert.deepStrictEqual(S.entreesAPurger([{url: 'u', date: new Date(now - 6.9 * J).toISOString()}], S.LIMITES.prix, now), []);
  assert.deepStrictEqual(S.entreesAPurger([{url: 'u', date: new Date(now - 7.1 * J).toISOString()}], S.LIMITES.prix, now), ['u']);
  assert.deepStrictEqual(S.entreesAPurger(null, S.LIMITES.prix, now), []);
  // Dates en millisecondes acceptees aussi.
  assert.deepStrictEqual(S.entreesAPurger([{url: 'a', date: now}, {url: 'b', date: now - 61 * J}], S.LIMITES.irve, now), ['b']);
});

test('choisirRepli : exacte, sinon meme famille (meme select), meme offset de preference, la plus recente ; jamais perimee', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const api = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/d/records';
  const e = [
    {url: api + '?where=in_bbox(geom,43.5,3.8,43.7,4.0)&select=id,prix&limit=100&offset=0', date: new Date(now - 2 * 3600000).toISOString()},
    {url: api + '?where=in_bbox(geom,43.5,3.8,43.7,4.0)&select=id,prix&limit=100&offset=100', date: new Date(now - 2 * 3600000).toISOString()},
    {url: api + '?where=in_bbox(geom,48.8,2.2,48.9,2.4)&select=id,prix&limit=100&offset=0', date: new Date(now - 5 * J).toISOString()},
    {url: api + '?where=in_bbox(geom,43.5,3.8,43.7,4.0)&select=id,rupture&limit=100', date: new Date(now - 3600000).toISOString()},
    {url: api + '?where=in_bbox(geom,45.0,4.0,45.2,4.2)&select=id,prix&limit=100&offset=0', date: new Date(now - 8 * J).toISOString()},
  ];
  const L = S.LIMITES.prix, o = {famille: true, maintenant: now};
  // Exacte.
  assert.strictEqual(S.choisirRepli(e, e[1].url, L, o), e[1].url);
  // Emprise jamais vue (l'utilisateur a bouge) : la plus recente de la meme famille, meme offset.
  assert.strictEqual(S.choisirRepli(e, api + '?where=in_bbox(geom,43.6,3.9,43.8,4.1)&select=id,prix&limit=100&offset=0', L, o), e[0].url);
  assert.strictEqual(S.choisirRepli(e, api + '?where=in_bbox(geom,43.6,3.9,43.8,4.1)&select=id,prix&limit=100&offset=100', L, o), e[1].url);
  // Offset jamais vu : la plus recente de la famille quand meme.
  assert.strictEqual(S.choisirRepli(e, api + '?where=x&select=id,prix&limit=100&offset=300', L, o), e[0].url);
  // Les ruptures ne remplacent jamais les prix (select different), et inversement.
  assert.strictEqual(S.choisirRepli(e, api + '?where=x&select=id,rupture&limit=100', L, o), e[3].url);
  assert.strictEqual(S.choisirRepli(e, api + '?where=x&select=autre&limit=100', L, o), null);
  // Perimee : jamais servie, meme exacte -> la famille prend le relais ; tout perime -> rien.
  assert.strictEqual(S.choisirRepli(e, e[4].url, L, o), e[0].url);
  assert.strictEqual(S.choisirRepli(e, e[4].url, L, {famille: true, maintenant: now + 10 * J}), null);
  // Sans famille (Espagne) : exacte seulement.
  const es = 'https://sedeaplicaciones.minetur.gob.es/x/FiltroProvincia/';
  const f = [{url: es + '17', date: new Date(now).toISOString()}];
  assert.strictEqual(S.choisirRepli(f, es + '17', S.LIMITES.es, {maintenant: now}), es + '17');
  assert.strictEqual(S.choisirRepli(f, es + '08', S.LIMITES.es, {maintenant: now}), null);
  assert.strictEqual(S.choisirRepli([], es + '17', S.LIMITES.es, {maintenant: now}), null);
});

test('memeFamille : meme API et meme select, quelle que soit l\'emprise', () => {
  const a = 'https://h/api?where=1&select=a,b&offset=0', b = 'https://h/api?where=2&select=a,b&offset=100';
  assert.ok(S.memeFamille(a, b));
  assert.ok(!S.memeFamille(a, 'https://h/api?where=1&select=a&offset=0'));
  assert.ok(!S.memeFamille(a, 'https://h/autre?where=1&select=a,b'));
  assert.ok(!S.memeFamille(a, 'n importe quoi'));
});

test('pwa/sw.js est bien l\'assemblage de src/pwa-strategie.js + src/sw.js (generate.py)', () => {
  const src = (n) => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\n+$/, '');
  const attendu = src('pwa-strategie.js') + '\n\n' + src('sw.js') + '\n';
  const sw = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'sw.js'), 'utf8');
  assert.strictEqual(sw, attendu, 'relancer python3 generate.py pour regenerer pwa/sw.js');
  assert.ok(/addEventListener\('fetch'/.test(sw), 'le worker doit ecouter fetch (installabilite)');
});
