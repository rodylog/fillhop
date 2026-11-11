// Tests de src/es.js (prix espagnols) : formats mesures le 28/10/2026 (virgule decimale,
// vide = non vendu), forme identique a une station francaise (cles de app.js, normalise()),
// horaires « L-S: 06:00-22:00; D: 07:00-22:00 », choix des provinces par emprise.
// Echantillon reel : src/fixtures/es-echantillon-girona.json (FiltroProvincia/17, 3 stations).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {nombreES, fechaISO, normaliserStationES, ouvertES, resumerHorario, provincesPourEmprise, enEspagne,
       recouvrementsProvinces, ES_PROVINCIAS, ES_CLES, ES_ENVELOPPE, ES_VILLES, ES_HOMONYMES_FR, villeES} = require('./es.js');
const ECH = require('./fixtures/es-echantillon-girona.json');

// Station francaise FACTICE construite comme dans app.js (normalise()) : memes cles, dans le
// meme ordre. A tenir a jour si normalise() change — c'est le contrat de forme commune.
const FUELS = ['e85', 'e10', 'sp98', 'sp95', 'gazole', 'gplc'];
function stationFR(r){
  const esc = x => String(x);
  const la = parseFloat(r.latitude) / 100000, lo = parseFloat(r.longitude) / 100000;
  return {id: esc(r.id), la, lo,
          ville: esc(r.ville || ''), cp: esc(r.cp || ''), adresse: esc(r.adresse || ''),
          auto: r.horaires_automate_24_24 === 'Oui',
          rupture: '', hs: new Set(), d: 0,
          prix: Object.fromEntries(FUELS.map(k => [k, r[k + '_prix']])),
          maj: Object.fromEntries(FUELS.map(k => [k, r[k + '_maj']])),
          depuis: Object.fromEntries(FUELS.map(k => [k, r[k + '_rupture_debut'] || null])),
          kotype: Object.fromEntries(FUELS.map(k => [k, r[k + '_rupture_type'] || null])),
          off: {prix: Object.fromEntries(FUELS.map(k => [k, r[k + '_prix']])),
                maj: Object.fromEntries(FUELS.map(k => [k, r[k + '_maj']]))},
          corr: {}};
}
const FR = stationFR({id: '66000001', latitude: '4270000', longitude: '290000', cp: '66000', ville: 'Perpignan',
  adresse: 'AVENUE DE TEST', horaires_automate_24_24: 'Oui', gazole_prix: 1.659, gazole_maj: '2026-10-28T09:00:00+00:00',
  sp95_prix: null, sp95_maj: null, e10_prix: 1.729, e10_maj: '2026-10-28T09:00:00+00:00'});

// ---- nombreES, fechaISO ----

test('nombreES : virgule decimale -> nombre ; vide, null, illisible -> null (jamais 0)', () => {
  assert.strictEqual(nombreES('1,999'), 1.999);
  assert.strictEqual(nombreES('41,917028'), 41.917028);
  assert.strictEqual(nombreES('2,139'), 2.139);
  assert.strictEqual(nombreES(''), null);
  assert.strictEqual(nombreES('   '), null);
  assert.strictEqual(nombreES(null), null);
  assert.strictEqual(nombreES(undefined), null);
  assert.strictEqual(nombreES('abc'), null);
  assert.strictEqual(nombreES('0,0'), 0);   // « % BioEtanol » : 0 reste 0, seul le vide vaut null
});

test('fechaISO : "28/10/2026 11:42:52" -> "2026-10-28T11:42:52" ; illisible -> null', () => {
  assert.strictEqual(fechaISO('28/10/2026 11:42:52'), '2026-10-28T11:42:52');
  assert.strictEqual(fechaISO(''), null);
  assert.strictEqual(fechaISO('2026-10-28'), null);
  assert.strictEqual(fechaISO(undefined), null);
  // Meme forme que les dates francaises pour jour() (app.js) : slice(8,10)/slice(5,7) = 28/10.
  const iso = fechaISO(ECH.Fecha);
  assert.strictEqual(iso.slice(8, 10) + '/' + iso.slice(5, 7), '28/10');
  assert.ok(!isNaN(new Date(iso).getTime()));
});

// ---- normaliserStationES sur l'echantillon reel ----

test('station 1 (REPSOL, Aiguaviva) : prix presents et absents, forme, dates = Fecha', () => {
  const s = normaliserStationES(ECH.ListaEESSPrecio[0], ECH.Fecha);
  assert.strictEqual(s.id, 'ES-2777');
  assert.strictEqual(s.la, 41.917028);
  assert.strictEqual(s.lo, 2.791306);
  assert.strictEqual(s.cp, '17181');
  assert.strictEqual(s.ville, 'AIGUAVIVA');
  assert.strictEqual(s.adresse, 'AUTOVIA A2 KM. 708');
  assert.strictEqual(s.pays, 'ES');
  assert.strictEqual(s.enseigne, 'REPSOL');
  assert.strictEqual(s.horario, 'L-S: 06:00-22:00; D: 07:00-22:00');
  assert.strictEqual(s.auto, false);
  assert.deepStrictEqual(s.prix, {e85: null, e10: null, sp98: 2.109, sp95: 1.839, gazole: 1.999, gplc: null});
  assert.deepStrictEqual(s.maj, {e85: null, e10: null, sp98: '2026-10-28T11:42:52', sp95: '2026-10-28T11:42:52',
                                 gazole: '2026-10-28T11:42:52', gplc: null});
  assert.deepStrictEqual(s.off, {prix: s.prix, maj: s.maj});
  assert.notStrictEqual(s.off.prix, s.prix);   // copies : appliquerCorr (app.js) reecrit prix depuis off
  assert.strictEqual(s.rupture, '');
  assert.ok(s.hs instanceof Set && s.hs.size === 0);
  assert.deepStrictEqual(s.corr, {});
  assert.strictEqual(s.d, 0);
  assert.deepStrictEqual(s.depuis, {e85: null, e10: null, sp98: null, sp95: null, gazole: null, gplc: null});
  assert.deepStrictEqual(s.kotype, s.depuis);
});

test('station 2 (HAM, GNL seulement) : aucun carburant de l\'application, 24H -> auto', () => {
  const s = normaliserStationES(ECH.ListaEESSPrecio[1], ECH.Fecha);
  assert.strictEqual(s.id, 'ES-16224');
  assert.strictEqual(s.enseigne, 'HAM');
  assert.strictEqual(s.auto, true);
  assert.ok(ES_CLES.every(k => s.prix[k] === null && s.maj[k] === null));
});

test('station 3 (REPSOL, Amer) : gazole, SP95, SP98 ; adresse avec virgule intacte', () => {
  const s = normaliserStationES(ECH.ListaEESSPrecio[2], ECH.Fecha);
  assert.strictEqual(s.id, 'ES-2069');
  assert.strictEqual(s.adresse, 'CARRETERA C-63 KM. 48,61');
  assert.strictEqual(s.prix.gazole, 1.949);
  assert.strictEqual(s.prix.sp95, 1.829);
  assert.strictEqual(s.prix.sp98, 1.959);
  assert.strictEqual(s.prix.e10, null);
  assert.strictEqual(s.prix.e85, null);
  assert.strictEqual(s.prix.gplc, null);
});

test('forme identique a une station francaise : memes cles, plus pays, enseigne, horario', () => {
  const clesFR = Object.keys(FR);
  for(const o of ECH.ListaEESSPrecio){
    const s = normaliserStationES(o, ECH.Fecha);
    const clesES = Object.keys(s);
    for(const k of clesFR) assert.ok(clesES.includes(k), `cle francaise manquante : ${k}`);
    assert.deepStrictEqual(clesES.filter(k => !clesFR.includes(k)), ['pays', 'enseigne', 'horario']);
    // Memes sous-cles de prix/maj/off/depuis/kotype que les francaises, dans le meme ordre.
    for(const champ of ['prix', 'maj', 'depuis', 'kotype'])
      assert.deepStrictEqual(Object.keys(s[champ]), Object.keys(FR[champ]), champ);
    assert.deepStrictEqual(Object.keys(s.off.prix), Object.keys(FR.off.prix));
    // Memes types que les francaises.
    assert.strictEqual(typeof s.id, 'string'); assert.strictEqual(typeof s.la, 'number');
    assert.strictEqual(typeof s.auto, 'boolean'); assert.ok(s.hs instanceof Set);
  }
});

test('Tipo Venta != P (reserve) -> null, comptee « reservees »', () => {
  const base = ECH.ListaEESSPrecio[0], ignorees = {};
  assert.strictEqual(normaliserStationES(Object.assign({}, base, {'Tipo Venta': 'R'}), ECH.Fecha, {ignorees}), null);
  assert.strictEqual(normaliserStationES(Object.assign({}, base, {'Tipo Venta': ''}), ECH.Fecha, {ignorees}), null);
  assert.deepStrictEqual(ignorees, {reservees: 2});
  assert.strictEqual(normaliserStationES(null, ECH.Fecha, {ignorees}), null);
  assert.deepStrictEqual(ignorees, {reservees: 2});   // objet absent : rien a compter
});

test('coordonnee a 0 (latitude, longitude ou les deux) = manquante : station ignoree et comptee', () => {
  // Cause des boites degenerees de la table v1 (Barcelona, Madrid, Murcia, Cantabria : stations a 0).
  const base = ECH.ListaEESSPrecio[0], ignorees = {coords: 0};
  for(const c of [{Latitud: '0,000000'}, {'Longitud (WGS84)': '0,000000'}, {Latitud: '0', 'Longitud (WGS84)': '0'}, {Latitud: ''}, {'Longitud (WGS84)': ''}])
    assert.strictEqual(normaliserStationES(Object.assign({}, base, c), ECH.Fecha, {ignorees}), null, JSON.stringify(c));
  assert.strictEqual(ignorees.coords, 5);
  assert.strictEqual(ignorees.reservees, undefined);
  // Sans compteur fourni : null quand meme, sans erreur.
  assert.strictEqual(normaliserStationES(Object.assign({}, base, {Latitud: '0,0'}), ECH.Fecha), null);
});

test('coordonnee hors de l\'enveloppe espagnole (lat 27-44, lon -19-5) = manquante : ignoree et comptee', () => {
  const base = ECH.ListaEESSPrecio[0], ignorees = {};
  // lat/lon inverses (cause de la boite v1 de Pontevedra), Paris, Atlantique, Canaries trop a l'ouest.
  for(const c of [{Latitud: '-8,660000', 'Longitud (WGS84)': '42,040000'}, {Latitud: '48,856600', 'Longitud (WGS84)': '2,352200'},
                  {Latitud: '26,900000'}, {'Longitud (WGS84)': '-19,100000'}, {'Longitud (WGS84)': '5,100000'}, {Latitud: '44,100000'}])
    assert.strictEqual(normaliserStationES(Object.assign({}, base, c), ECH.Fecha, {ignorees}), null, JSON.stringify(c));
  assert.deepStrictEqual(ignorees, {coords: 6});
  // Aux bornes : gardees (Canaries 27,71 / -18,03 ; Ceuta 35,9 / -5,3 ; Girona 42,48 / 3,24).
  for(const c of [{Latitud: '27,710000', 'Longitud (WGS84)': '-18,030000'}, {Latitud: '35,900000', 'Longitud (WGS84)': '-5,300000'},
                  {Latitud: '42,480000', 'Longitud (WGS84)': '3,240000'}])
    assert.ok(normaliserStationES(Object.assign({}, base, c), ECH.Fecha, {ignorees}), JSON.stringify(c));
  assert.deepStrictEqual(ignorees, {coords: 6});
  // Les 3 stations de l'echantillon passent toutes.
  assert.strictEqual(ECH.ListaEESSPrecio.map(o => normaliserStationES(o, ECH.Fecha, {ignorees})).filter(Boolean).length, 3);
  assert.deepStrictEqual(ignorees, {coords: 6});
});

test('echappement a l\'ingestion : une enseigne ou une adresse piegee est rendue inerte', () => {
  const s = normaliserStationES(Object.assign({}, ECH.ListaEESSPrecio[0],
    {'Rótulo': '<script>alert(1)</script>', 'Dirección': 'C/ "Mayor" & <b>1</b>', Localidad: "L'ESCALA", Horario: 'L-D: 24H<img>'}), ECH.Fecha);
  assert.strictEqual(s.enseigne, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(s.adresse, 'C/ &quot;Mayor&quot; &amp; &lt;b&gt;1&lt;/b&gt;');
  assert.strictEqual(s.ville, 'L&#39;ESCALA');
  assert.ok(!s.horario.includes('<'));
});

test('Fecha illisible : la station garde ses prix, dates null', () => {
  const s = normaliserStationES(ECH.ListaEESSPrecio[0], 'n/a');
  assert.strictEqual(s.prix.gazole, 1.999);
  assert.strictEqual(s.maj.gazole, null);
});

// ---- ouvertES sur les trois Horario de l'echantillon ----
const JEUDI_10H = new Date(2026, 9, 29, 10, 0);    // jeudi 29/10/2026 10:00
const DIMANCHE_23H = new Date(2026, 10, 1, 23, 0); // dimanche 01/11/2026 23:00
test('reperes de date : jeudi et dimanche', () => {
  assert.strictEqual(JEUDI_10H.getDay(), 4);
  assert.strictEqual(DIMANCHE_23H.getDay(), 0);
});

test('« L-S: 06:00-22:00; D: 07:00-22:00 » : ouvert jeudi 10h, ferme dimanche 23h', () => {
  const h = ECH.ListaEESSPrecio[0].Horario;
  assert.strictEqual(ouvertES(h, JEUDI_10H), true);
  assert.strictEqual(ouvertES(h, DIMANCHE_23H), false);
  assert.strictEqual(ouvertES(h, new Date(2026, 10, 1, 6, 30)), false);   // dimanche 6h30 : ouvre a 7h
  assert.strictEqual(ouvertES(h, new Date(2026, 10, 1, 7, 0)), true);
  assert.strictEqual(ouvertES(h, new Date(2026, 9, 29, 22, 0)), false);   // 22:00 exclu
});

test('« L-D: 24H » : toujours ouvert', () => {
  const h = ECH.ListaEESSPrecio[1].Horario;
  assert.strictEqual(ouvertES(h, JEUDI_10H), true);
  assert.strictEqual(ouvertES(h, DIMANCHE_23H), true);
});

test('« L-V: 06:00-22:00; S: 07:00-22:00; D: 08:00-14:30 » : jeudi 10h oui, dimanche 23h non', () => {
  const h = ECH.ListaEESSPrecio[2].Horario;
  assert.strictEqual(ouvertES(h, JEUDI_10H), true);
  assert.strictEqual(ouvertES(h, DIMANCHE_23H), false);
  assert.strictEqual(ouvertES(h, new Date(2026, 10, 1, 14, 29)), true);   // dimanche 14:29
  assert.strictEqual(ouvertES(h, new Date(2026, 10, 1, 14, 30)), false);
  assert.strictEqual(ouvertES(h, new Date(2026, 9, 31, 6, 30)), false);   // samedi 6h30 : ouvre a 7h
});

test('horaire vide, inconnu ou date invalide -> null ; a cheval sur minuit ; jours enumeres', () => {
  assert.strictEqual(ouvertES('', JEUDI_10H), null);
  assert.strictEqual(ouvertES(undefined, JEUDI_10H), null);
  assert.strictEqual(ouvertES('horario variable', JEUDI_10H), null);
  assert.strictEqual(ouvertES('L-D: 24H', new Date('x')), null);
  assert.strictEqual(ouvertES('L-D: 22:00-06:00', new Date(2026, 9, 29, 23, 30)), true);
  assert.strictEqual(ouvertES('L-D: 22:00-06:00', new Date(2026, 9, 29, 12, 0)), false);
  assert.strictEqual(ouvertES('S, D: 09:00-13:00', new Date(2026, 10, 1, 10, 0)), true);   // dimanche
  assert.strictEqual(ouvertES('S, D: 09:00-13:00', JEUDI_10H), false);
  assert.strictEqual(ouvertES('V-L: 09:00-13:00', new Date(2026, 10, 1, 10, 0)), true);    // ven..lun (passe par dimanche)
});

test('resumerHorario : lisible en francais, 24 h/24 reconnu, brut si illisible', () => {
  assert.strictEqual(resumerHorario(ECH.ListaEESSPrecio[1].Horario), '24 h/24');
  assert.strictEqual(resumerHorario(ECH.ListaEESSPrecio[0].Horario), 'lun-sam 6h-22h · dim 7h-22h');
  assert.strictEqual(resumerHorario(ECH.ListaEESSPrecio[2].Horario), 'lun-ven 6h-22h · sam 7h-22h · dim 8h-14h30');
  assert.strictEqual(resumerHorario('horario variable'), 'horario variable');
  assert.strictEqual(resumerHorario(''), '');
});

// ---- provincesPourEmprise / enEspagne ----

test('couloir Perpignan -> Girona (20 km autour) : contient 17 (Girona)', () => {
  const bbox = {s: 41.8, n: 42.9, w: 2.6, e: 3.1};
  const ids = provincesPourEmprise(ES_PROVINCIAS, bbox);
  assert.ok(ids.includes('17'), ids.join(','));
  assert.ok(enEspagne(bbox));
  // Girona est le premier choix fiable : son recouvrement est le plus grand parmi les bornes sures.
  assert.strictEqual(ids[0], '17');
});

test('emprise a Lyon : aucune province', () => {
  const bbox = {s: 45.70, n: 45.80, w: 4.78, e: 4.90};
  assert.deepStrictEqual(provincesPourEmprise(ES_PROVINCIAS, bbox), []);
  assert.strictEqual(enEspagne(bbox), false);
});

test('tri par recouvrement decroissant ; garde-fou « douteuse » : aucune dans la table v2', () => {
  // Emprise sur la frontiere Girona / Barcelona : les deux croisent, Girona recouvre plus (0,37 x 0,60
  // contre 0,40 x 0,47) et passe devant ; aucune des deux n'est douteuse (table v2).
  const r = recouvrementsProvinces(ES_PROVINCIAS, {s: 41.6, n: 42.0, w: 2.3, e: 2.9});
  assert.ok(r.some(x => x.id === '17' && !x.douteuse));
  assert.ok(r.some(x => x.id === '08' && !x.douteuse));
  assert.ok(r.findIndex(x => x.id === '17') < r.findIndex(x => x.id === '08'));
  // Une boite etiree jusqu'a l'equateur (table v1 de Barcelona) serait marquee douteuse et classee apres.
  const v1 = Object.assign({}, ES_PROVINCIAS, {'08': ['BARCELONA', 800, 0.0, 42.25, 0.0, 2.76]});
  const r1 = recouvrementsProvinces(v1, {s: 41.6, n: 42.0, w: 2.3, e: 2.9});
  assert.ok(r1.find(x => x.id === '08').douteuse && r1[r1.length - 1].id === '08');
  // Deux provinces sures : la plus recouverte d'abord (Gipuzkoa devant Navarra, pour une emprise sur Saint-Sebastien).
  const ids = provincesPourEmprise(ES_PROVINCIAS, {s: 43.2, n: 43.35, w: -2.1, e: -1.8});
  assert.strictEqual(ids[0], '20');
  assert.ok(ids.indexOf('31') > 0);
});

test('table des provinces : 52 entrees, forme [nom, n, latMin, latMax, lonMin, lonMax]', () => {
  const ids = Object.keys(ES_PROVINCIAS);
  assert.strictEqual(ids.length, 52);
  assert.ok(ids.every(id => /^\d{2}$/.test(id)));
  for(const [nom, n, s, no, w, e] of Object.values(ES_PROVINCIAS)){
    assert.strictEqual(typeof nom, 'string'); assert.ok(n > 0);
    assert.ok(s <= no && w <= e);
  }
  assert.strictEqual(ES_PROVINCIAS['17'][0], 'GIRONA');
});

test('table v2 : aucune boite ne touche 0, toutes dans l\'enveloppe espagnole, aucune douteuse', () => {
  // Table recalculee le 30/10/2026 sur 11 422 stations (1er-99e centile par axe, marge 0,05°) :
  // plus de boite etiree jusqu'a l'equateur par une station a 0 ou aberrante.
  for(const [id, [nom, , s, n, w, e]] of Object.entries(ES_PROVINCIAS)){
    for(const b of [s, n, w, e]) assert.notStrictEqual(b, 0, `${id} ${nom} : borne a 0`);
    assert.ok(s >= ES_ENVELOPPE.s && n <= ES_ENVELOPPE.n && w >= ES_ENVELOPPE.w && e <= ES_ENVELOPPE.e, `${id} ${nom} hors enveloppe`);
    assert.ok((n - s) * (e - w) < 5, `${id} ${nom} : boite de ${((n - s) * (e - w)).toFixed(1)} deg²`);
    assert.ok(n - s > 0.05 && e - w > 0.05, `${id} ${nom} : boite plate`);
  }
  assert.deepStrictEqual(ES_PROVINCIAS['08'].slice(2), [41.17, 42.15, 1.49, 2.77]);
  assert.deepStrictEqual(ES_PROVINCIAS['36'].slice(2), [41.87, 42.82, -8.91, -7.92]);
  // Pontevedra ne croise plus Perpignan, Cantabria plus Biarritz (v1 : requetes inutiles).
  assert.ok(!provincesPourEmprise(ES_PROVINCIAS, {s: 42.65, n: 42.75, w: 2.85, e: 2.95}).includes('36'));
  assert.deepStrictEqual(provincesPourEmprise(ES_PROVINCIAS, {s: 43.43, n: 43.53, w: -1.61, e: -1.51}), []);
});

// ---- Villes d'Espagne saisissables (table embarquee, consultee avant le geocodage) ----
test('villeES : « Barcelone », « Barcelona », « Figueres », « Girona » sont dans la table', () => {
  const b = villeES('Barcelone');
  assert.deepEqual(b, {lon: 2.170, lat: 41.387, label: 'Barcelona (Espagne)', pays: 'ES'});
  assert.deepEqual(villeES('Barcelona'), b);
  assert.deepEqual(villeES('  BARCELONE '), b);
  assert.deepEqual(villeES('Barcelone, Espagne'), b);
  const f = villeES('Figueres');
  assert.equal(f.label, 'Figueres (Espagne)');
  assert.ok(Math.abs(f.lat - 42.27) < 0.02 && Math.abs(f.lon - 2.96) < 0.02);
  const g = villeES('Girona');
  assert.equal(g.label, 'Girona (Espagne)');
  assert.ok(Math.abs(g.lat - 41.98) < 0.02 && Math.abs(g.lon - 2.82) < 0.02);
  assert.deepEqual(villeES('Gérone'), g);
  assert.equal(villeES('San Sebastian').label, 'San Sebastián (Espagne)');
});

test('villeES : hors table, null (le géocodage français décide)', () => {
  for(const q of ['Perpignan', 'Narbonne', 'Barcelonnette', '12 rue de Barcelone, Toulouse', 'Lloret de Mar', 'Espagne', ''])
    assert.equal(villeES(q), null, q);
});

test('villeES : un nom qui est aussi une commune française reste français, sauf suivi du pays', () => {
  for(const q of ['Valence', 'Grenade', 'Cadix', 'Léon', 'Leon', 'Saint-Sébastien']) assert.equal(villeES(q), null, q);
  assert.equal(villeES('Valence, Espagne').label, 'Valencia (Espagne)');
  assert.equal(villeES('Léon Espagne').label, 'León (Espagne)');
  assert.equal(villeES('Saint-Sébastien (Espagne)').label, 'San Sebastián (Espagne)');
  assert.equal(villeES('Valencia').label, 'Valencia (Espagne)');     // le nom espagnol n'est pas ambigu
  assert.ok(ES_HOMONYMES_FR.every(h => villeES(h) === null && villeES(h + ' espagne')));
});

test('ES_VILLES : la capitale des 47 provinces de la péninsule, chaque ville dans la boîte de sa province', () => {
  const hors = ['07', '35', '38', '51', '52'];   // Baléares, Canaries, Ceuta, Melilla : aucune route
  const provinces = new Set(ES_VILLES.map(v => v[0]));
  assert.deepEqual(Object.keys(ES_PROVINCIAS).filter(id => !provinces.has(id)).sort(), hors);
  for(const [id, lat, lon, nom] of ES_VILLES){
    const [, , latMin, latMax, lonMin, lonMax] = ES_PROVINCIAS[id];
    assert.ok(lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax, `${nom} hors de la province ${id}`);
  }
  const noms = ES_VILLES.flatMap(v => v.slice(3));
  assert.equal(new Set(noms.map(n => n.toLowerCase())).size, noms.length, 'nom en double');
});
