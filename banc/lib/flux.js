// Emulation MINIMALE du flux instantane des prix (data.economie.gouv.fr, API Explore v2.1)
// pour les fixtures SYNTHETIQUES : une liste de stations au format reel du flux (stations.json)
// repond aux requetes de l'application comme le ferait l'API — clause where (in_bbox,
// distance, « x_prix is not null », ruptures), select, order_by, limit, offset, total_count.
// Les fixtures ENREGISTREES n'en ont pas besoin : leurs reponses sont rejouees telles quelles.
'use strict';

const lat = r => parseFloat(r.latitude) / 100000;
const lon = r => parseFloat(r.longitude) / 100000;

function haversineKm(la1, lo1, la2, lo2){
  const p = Math.PI / 180, dLa = (la2 - la1) * p, dLo = (lo2 - lo1) * p;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// Analyse de la clause where en un predicat sur une ligne. Grammaire reconnue (celle que
// construit app.js) : expr := terme (('and' | 'or') terme)* ; terme := '(' expr ')' |
// in_bbox(geom, s, w, n, e) | distance(geom, geom'POINT(lon lat)', Nkm) | champ is not null |
// champ='valeur' | champ >= date'AAAA-MM-JJ'. « and » lie plus fort que « or ».
function analyserWhere(where){
  const jetons = where.match(/\(|\)|\band\b|\bor\b|in_bbox\([^)]*\)|distance\(geom,\s*geom'[^']*',\s*[\d.]+km\)|\w+\s+is\s+not\s+null|\w+\s*>=\s*date'[^']*'|\w+\s*=\s*'[^']*'/g) || [];
  let i = 0;
  const atome = () => {
    const t = jetons[i++];
    if(t === undefined) throw new Error('clause where incomplète : ' + where);
    if(t === '('){ const e = expr(); if(jetons[i++] !== ')') throw new Error('parenthèse attendue : ' + where); return e; }
    let m;
    if((m = t.match(/^in_bbox\(geom,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)$/))){
      const [s, w, n, e] = m.slice(1).map(Number);
      return r => lat(r) >= s && lat(r) <= n && lon(r) >= w && lon(r) <= e;
    }
    if((m = t.match(/^distance\(geom,\s*geom'POINT\(([-\d.]+) ([-\d.]+)\)',\s*([\d.]+)km\)$/))){
      const lo = +m[1], la = +m[2], km = +m[3];
      return r => haversineKm(la, lo, lat(r), lon(r)) <= km;
    }
    if((m = t.match(/^(\w+)\s+is\s+not\s+null$/))){ const k = m[1]; return r => r[k] != null; }
    if((m = t.match(/^(\w+)\s*>=\s*date'([^']*)'$/))){ const k = m[1], d = m[2]; return r => r[k] != null && String(r[k]).slice(0, 10) >= d; }
    if((m = t.match(/^(\w+)\s*=\s*'([^']*)'$/))){ const k = m[1], v = m[2]; return r => r[k] === v; }
    throw new Error('terme non reconnu dans where : ' + t);
  };
  const conj = () => { let f = atome(); while(jetons[i] === 'and'){ i++; const g = atome(), h = f; f = r => h(r) && g(r); } return f; };
  const expr = () => { let f = conj(); while(jetons[i] === 'or'){ i++; const g = conj(), h = f; f = r => h(r) || g(r); } return f; };
  const f = jetons.length ? expr() : () => true;
  if(i !== jetons.length) throw new Error('clause where non comprise en entier : ' + where);
  return f;
}

// Repond a une URL de l'API records : {statut, type, corps} (corps = JSON texte).
function repondreFlux(stations, url){
  const u = new URL(url);
  if(!/\/records$/.test(u.pathname)) return {statut: 404, type: 'application/json', corps: JSON.stringify({error: 'chemin non émulé : ' + u.pathname})};
  const garde = analyserWhere(u.searchParams.get('where') || '');
  const select = (u.searchParams.get('select') || '').split(',').map(x => x.trim()).filter(Boolean);
  const limit = Math.max(0, +(u.searchParams.get('limit') || 10)), offset = Math.max(0, +(u.searchParams.get('offset') || 0));
  const lignes = stations.filter(garde);
  // order_by=champ[ asc|desc],… comme l'API : valeurs nulles en dernier, ordre du fichier a egalite.
  const ordre = (u.searchParams.get('order_by') || '').split(',').map(x => x.trim().split(/\s+/)).filter(x => x[0])
    .map(([k, sens]) => ({k, s: /^desc$/i.test(sens || '') ? -1 : 1}));
  if(ordre.length) lignes.sort((a, b) => {
    for(const {k, s} of ordre){
      const x = a[k], y = b[k];
      if(x == null || y == null){ if(x == null && y == null) continue; return x == null ? 1 : -1; }
      if(x !== y) return (x < y ? -1 : 1) * s;
    }
    return 0;
  });
  const projeter = r => select.length ? Object.fromEntries(select.map(k => [k, r[k] === undefined ? null : r[k]])) : r;
  return {statut: 200, type: 'application/json; charset=utf-8',
          corps: JSON.stringify({total_count: lignes.length, results: lignes.slice(offset, offset + limit).map(projeter)})};
}

module.exports = {analyserWhere, repondreFlux, haversineKm};
