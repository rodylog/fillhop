#!/usr/bin/env python3
"""Genere une carte HTML autonome des prix carburants en France.

Source : flux instantane officiel du ministere de l'Economie (declaration
obligatoire des stations). CORS ouvert => la page rafraichit les prix toute
seule a chaque ouverture ; le snapshot embarque sert de repli hors ligne.

Deux modes de tete pensés pour un garage mixte (un vehicule a l'E85, un autre
au SP le moins cher) : « mes 2 pleins » et « SP le moins cher ».

Aucune coordonnee personnelle embarquee : la page se centre sur la
geolocalisation de l'appareil, a defaut sur le dernier repere memorise dans le
navigateur, a defaut sur la France entiere (clic droit pour poser le repere).

Usage :
    ./generate.py                    # ecrit ~/Documents/fuelpilot.html
    ./generate.py --open             # genere puis ouvre dans le navigateur
    ./generate.py --lat 48.85 --lon 2.35 --rayon 15   # centre du snapshot de repli
"""
import argparse
import base64
import gzip
import hashlib
import json
import os
import re
import sys
import urllib.request
import webbrowser
from datetime import datetime
from urllib.parse import quote

API = ("https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
       "prix-des-carburants-en-france-flux-instantane-v2/records")
SELECT = ("id,latitude,longitude,cp,ville,adresse,gazole_prix,gazole_maj,"
          "e10_prix,e10_maj,sp95_prix,sp95_maj,sp98_prix,sp98_maj,"
          "e85_prix,e85_maj,gplc_prix,gplc_maj,horaires_automate_24_24,"
          "carburants_rupture_temporaire,carburants_rupture_definitive")
CACHE = os.path.expanduser("~/.cache/fuelpilot")
LEAFLET = {
    "__LEAFLET_CSS__": (
        "leaflet.css",
        "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"),
    "__LEAFLET_JS__": (
        "leaflet.js",
        "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"),
}


def _get(url, raw=False):
    req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip",
                                               "User-Agent": "curl"})
    data = urllib.request.urlopen(req, timeout=60).read()
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return data if raw else json.loads(data)


def snapshot(lat, lon, km):
    where = quote(f"distance(geom, geom'POINT({lon} {lat})', {km}km)")
    rows, off = [], 0
    while True:
        r = _get(f"{API}?where={where}&select={quote(SELECT)}"
                 f"&limit=100&offset={off}")
        rows += r["results"]
        off += 100
        if off >= r["total_count"] or off > 1900:
            break
    return rows


def leaflet_inline(name, sri):
    """Inline plutot que CDN : aucune dependance reseau a l'ouverture, donc
    aucune surface de compromission CDN a verifier a chaque chargement."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(_get(f"https://unpkg.com/leaflet@1.9.4/dist/{name}",
                         raw=True))
    blob = open(path, "rb").read()
    got = "sha384-" + base64.b64encode(hashlib.sha384(blob).digest()).decode()
    if got != sri:
        sys.exit(f"empreinte {name} inattendue :\n  attendu {sri}\n  obtenu {got}")
    return blob.decode("utf-8")


def csp_meta(html):
    """CSP calculee sur le HTML final : script-src par empreinte des deux scripts
    inline (pas de 'unsafe-inline'), connect-src borne aux trois API publiques.
    Une chaine tierce (flux des stations, URL #veh=) qui reussirait malgre
    l'echappement a injecter un <script> ne s'executerait pas, et ne pourrait
    rien exfiltrer ailleurs que vers ces hotes."""
    hashes = ["'sha256-%s'" % base64.b64encode(
                  hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode()
              for m in re.finditer(r"<script>(.*?)</script>", html, re.S)]
    assert len(hashes) == 2, "deux scripts inline attendus"
    return ('<meta http-equiv="Content-Security-Policy" content="'
            "default-src 'none'; script-src " + " ".join(hashes) + "; "
            "style-src 'unsafe-inline'; "
            "img-src 'self' data: https://data.geopf.fr https://*.basemaps.cartocdn.com; "
            "connect-src https://data.economie.gouv.fr https://data.geopf.fr "
            "https://api-adresse.data.gouv.fr; "
            "base-uri 'none'; form-action 'self'\">")


HTML = r"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
__CSP__
<title>FuelPilot</title>
<style>__LEAFLET_CSS__</style>
<script>__LEAFLET_JS__</script>
<style>
  :root{--bg:#f6f7f9;--card:#fff;--ink:#1a1d21;--muted:#6b7280;--line:#e3e6ea}
  @media (prefers-color-scheme:dark){
    :root{--bg:#14171a;--card:#1d2126;--ink:#e9ecef;--muted:#9aa3ad;--line:#2c3238}
  }
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       background:var(--bg);color:var(--ink)}
  header{padding:14px 18px;background:var(--card);border-bottom:1px solid var(--line);
         display:flex;flex-wrap:wrap;gap:14px;align-items:center}
  h1{font-size:17px;margin:0;font-weight:650;white-space:nowrap}
  .ctl{display:flex;gap:6px;align-items:center;font-size:14px}
  #carbs{gap:2px;flex-wrap:wrap}
  .case{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
        border:1px solid var(--line);border-radius:20px;cursor:pointer;
        white-space:nowrap;font-size:13.5px}
  .case:has(input:checked){background:#0b57d0;border-color:#0b57d0;color:#fff}
  select,.btn{padding:5px 8px;border:1px solid var(--line);border-radius:7px;
         background:var(--card);color:var(--ink);font:inherit}
  .btn{cursor:pointer}
  .btn:hover{background:rgba(127,127,127,.12)}
  #maj{color:var(--muted);font-size:13px;margin-left:auto;text-align:right}
  #map{height:min(64vh,620px);width:100%}
  .barre{padding:10px 18px;background:var(--card);border-bottom:1px solid var(--line)}
  .barre form{display:flex;gap:9px;align-items:center;flex-wrap:wrap;font-size:14px}
  .barre input{flex:1 1 220px;min-width:170px;padding:6px 9px;border:1px solid var(--line);
               border-radius:7px;background:var(--bg);color:var(--ink);font:inherit}
  .fl{color:var(--muted);background:none;border:0;padding:2px 5px;font:inherit;
      font-size:17px;line-height:1;border-radius:7px;cursor:pointer;
      transition:transform .18s}
  .fl:hover{color:var(--ink);background:rgba(127,127,127,.12)}
  .fl:active{transform:rotate(180deg)}
  #infoTrajet{color:var(--muted);font-size:13px}
  .fiche{padding:10px 18px;background:var(--card);border-bottom:1px solid var(--line);
         display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  .fiche[hidden]{display:none}   /* display:flex ecrase l'attribut hidden sinon */
  #vehOk{background:#158a3f;border-color:#158a3f;color:#fff;font-weight:600}
  #vehOk:hover{background:#0f6e30}
  #vnom{width:150px;padding:5px 8px;border:1px solid var(--line);border-radius:7px;
        background:var(--bg);color:var(--ink);font:inherit}
  #conso,#cuve,#reserve{width:62px;padding:5px 7px;border:1px solid var(--line);border-radius:7px;
               background:var(--bg);color:var(--ink);font:inherit}
  #plan{font-size:13.5px;margin-top:8px;display:none;line-height:1.7}
  .badge{background:#0b57d0;color:#fff;border-radius:6px;padding:1px 6px;
         font-size:11.5px;font-weight:700;white-space:nowrap}
  tbody tr.etape{background:rgba(11,87,208,.10)}
  .pill{display:inline-block;padding:2px 7px;border-radius:20px;color:#fff;
        font-weight:700;font-size:12.5px;white-space:nowrap}
  .lbl{background:#fff;border:1.5px solid #333;border-radius:20px;padding:1px 6px;
       font:700 12.5px system-ui;color:#111;white-space:nowrap;text-align:center;
       box-shadow:0 1px 4px rgba(0,0,0,.28)}
  .lbl2{border-radius:11px;padding:2px;display:flex;flex-direction:column;gap:2px;
        border-color:#9aa3ad;line-height:1.25}
  .lbl2 span{white-space:nowrap;font-size:11.5px;color:#fff;border-radius:8px;
             padding:1px 5px;text-align:center}
  .wrap{max-width:1100px;margin:0 auto;padding:18px}
  table{width:100%;border-collapse:collapse;background:var(--card);
        border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:8px 11px;text-align:left;border-bottom:1px solid var(--line);font-size:14px}
  th{background:rgba(127,127,127,.09);font-weight:620;cursor:pointer;user-select:none}
  tbody tr:hover{background:rgba(127,127,127,.07);cursor:pointer}
  .legend{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);
          margin:14px 0 8px;flex-wrap:wrap}
  .sw{width:22px;height:12px;border-radius:3px;display:inline-block}
  .note{color:var(--muted);font-size:13px;margin-top:12px;line-height:1.6}
  a{color:inherit}
  .leaflet-popup-content{font:14px/1.5 system-ui;margin:11px 13px}
  .fuels{margin:7px 0 0;padding:0;list-style:none}
  .fuels li{display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;
            align-items:baseline;border-top:1px dotted #bbb;padding:3px 0}
  .fuels li.hi b{color:#0b57d0}
  .fuels li.hi{font-weight:600}
  .fuels .dt{font-size:11.5px;color:#6b7280;font-variant-numeric:tabular-nums}
  .fuels .dt.vieux{color:#c02626}
</style>
</head>
<body>
<header>
  <h1>⛽ FuelPilot<span id="lieu"></span></h1>
  <label class="ctl">🚗 <select id="veh"></select></label>
  <button class="ctl btn" id="vehPlus" type="button" title="Ajouter un véhicule">＋</button>
  <button class="ctl btn" id="vehNom" type="button" title="Ouvrir la fiche du véhicule">✎</button>
  <label class="case" id="filtreCher"><input type="checkbox" id="sansCher" checked> Masquer les trop chères</label>
  <button class="ctl btn" id="maposition" type="button">◎ Ma position</button>
  <button class="ctl btn" id="repere" type="button">⌂ Point de repère</button>
  <div id="maj">chargement…</div>
</header>

<div id="fiche" class="fiche" hidden>
  <label class="ctl">Nom <input id="vnom" placeholder="Ma voiture"></label>
  <span class="ctl" id="carbs"></span>
  <label class="ctl">Conso
    <input id="conso" type="number" step="0.1" min="3" max="25" placeholder="6,5"> L/100</label>
  <label class="ctl">Réservoir
    <input id="cuve" type="number" step="1" min="10" max="150" placeholder="50"> L</label>
  <label class="ctl">Réserve
    <input id="reserve" type="number" step="5" min="0" max="200" placeholder="30"> km</label>
  <button class="btn" id="vehOk" type="button">✔ Enregistrer</button>
  <button class="btn" id="vehMoins" type="button" title="Supprimer ce véhicule">🗑</button>
</div>

<div class="barre">
  <form id="trajet">
    <input id="depart" placeholder="Départ — vide = ma position" autocomplete="off">
    <button class="fl" id="inverser" type="button"
            title="Inverser départ et arrivée (trajet retour)"
            aria-label="Inverser départ et arrivée">⇄</button>
    <input id="arrivee" placeholder="Arrivée — adresse, ville…" autocomplete="off">
    <label class="ctl">Couloir
      <select id="couloir">
        <option value="1">1 km</option>
        <option value="2">2 km</option>
        <option value="5">5 km</option>
        <option value="10" selected>10 km</option>
        <option value="20">20 km</option>
      </select>
    </label>
    <label class="case"><input type="checkbox" id="queUtiles" checked> Ne garder que les arrêts du plan</label>
    <label class="case"><input type="checkbox" id="sansPeage"> Sans péage</label>
    <button class="btn" type="submit">Stations sur le trajet</button>
    <button class="btn" id="effacer" type="button" hidden>✕ Effacer</button>
    <span id="infoTrajet"></span>
  </form>
  <div id="plan"></div>
</div>

<div id="map"></div>

<div class="wrap">
  <div class="legend">
    <span class="sw" style="background:#0b57d0"></span> le moins cher
    <span class="sw" style="background:#b07d10"></span> dans la norme
    <span class="sw" style="background:#c02626"></span> cher
    <span id="echelle"></span>
    <span style="margin-left:auto" id="compte"></span>
  </div>
  <table>
    <thead><tr>
      <th data-k="prix">Prix ▲</th><th data-k="dist" id="thDist">Distance</th>
      <th data-k="ville">Commune</th><th data-k="adresse">Adresse</th>
      <th data-k="maj">Relevé</th>
    </tr></thead>
    <tbody id="tb"></tbody>
  </table>
  <p class="note">
    Source : <a href="https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/"
    target="_blank" rel="noopener">flux instantané officiel du ministère de l'Économie</a>
    — mêmes données que
    <a href="https://www.prix-carburants.gouv.fr" target="_blank" rel="noopener">prix-carburants.gouv.fr</a>,
    rechargées à chaque ouverture de cette page.
    <b>Les stations suivent la carte</b> : chaque déplacement ou dézoom recharge
    celles de la zone visible (400 au maximum ; au-delà, le compteur le signale).
    Les distances partent du <b>point de repère</b> (pastille bleue) : votre position
    si vous autorisez la géolocalisation, sinon le dernier repère mémorisé sur cet
    appareil — <b>clic droit sur la carte</b> pour le poser où vous voulez.
    « SP le moins cher » retient, station par station, le meilleur du E10 / SP95 / SP98.
    <b>Itinéraire</b> : saisissez une arrivée pour ne garder que les stations situées
    dans le couloir choisi autour du trajet (10 km par défaut ; tracé IGN, adresses
    géocodées sur la Base Adresse Nationale) ; zoomer sur un tronçon affine la liste
    à ce tronçon, le couloir bornant lui le détour acceptable.
    La flèche <b>⇄</b> entre les deux champs échange départ et arrivée : le trajet
    <b>retour</b> en un clic, recalculé aussitôt si un tracé est affiché.
    Avec la conso et le réservoir renseignés, la page propose <b>où faire le plein</b> :
    plein au départ, arrêts choisis au moins cher dans le couloir, réserve de 10 %.
    Les stations <b>en rupture</b> du carburant demandé sont écartées : le flux conserve
    leur dernier prix, mais le carburant n'y est pas disponible.
    « Masquer les trop chères » retire de la carte <i>et</i> du tableau les stations
    au-dessus du 9<sup>e</sup> décile du secteur — un seuil en percentile plutôt qu'en
    centimes, pour qu'il ne vieillisse pas quand les prix dérivent. Décochable.
    « Mes 2 pleins » ne garde que les stations servant à la fois l'E85 et un SP,
    classées sur la somme des deux prix ; chaque carburant y est <b>coloré sur sa
    propre échelle</b>, si bien qu'une ligne bleue au-dessus d'une ligne orange
    signale un bon E85 avec un SP quelconque. Clic sur une ligne ou un repère : itinéraire.
  </p>
</div>

<script>
let CENTRE = null;   // resolu apres lecture des reglages : geoloc > memoire > France
const SNAPSHOT = __SNAP__;
const SNAP_DATE = "__SNAPDATE__";

// Tous les carburants du flux officiel : la fiche vehicule doit servir a
// n'importe quel conducteur (diesel, GPL...), pas seulement a un profil donne.
const FUELS = [["e85","E85 (bioéthanol)"],["e10","SP95-E10"],["sp98","SP98"],
               ["sp95","SP95"],["gazole","Gazole (B7)"],["gplc","GPLc"]];
const LBL = Object.fromEntries(FUELS);
const SP = [["e10","E10"],["sp95","SP95"],["sp98","SP98"]];
// Cases a cocher : cumulables. Coche par defaut = E85 (bioethanol).
const CASES = [["e85","E85"],["e10","E10"],["sp95","SP95"],["sp98","SP98"],
               ["spmin","SP le - cher"],["gazole","Gazole"],["gplc","GPLc"]];
const DEFAUT = ["e85"];

// Les reglages survivent au rechargement : sans cela, chaque F5 remettait les
// cases par defaut et faisait perdre la selection en cours.
const CLE = 'fuelpilot:reglages';
function reglagesLus(){
  try{
    // Ancienne cle (versions anterieures au 16/09/2026) lue si la nouvelle est vide.
    return JSON.parse(localStorage.getItem(CLE) ||
                      localStorage.getItem('carte-carburants:reglages')) || {};
  }catch(e){ return {}; }
}
const REGL = reglagesLus();
// Migration : l'ancien format (reglages a plat) devient le vehicule 1 du garage.
if(!Array.isArray(REGL.vehicules) || !REGL.vehicules.length){
  REGL.vehicules = [{nom: 'Véhicule 1',
    carbs: Array.isArray(REGL.carbs) && REGL.carbs.length ? REGL.carbs : DEFAUT,
    conso: REGL.conso || '', cuve: REGL.cuve || ''}];
  REGL.vehActif = 0;
}
if(!(REGL.vehActif >= 0) || REGL.vehActif >= REGL.vehicules.length) REGL.vehActif = 0;

// Ecriture directe, SANS fusion : reservee aux operations de structure du
// garage (suppression, renommage) qui doivent s'imposer telles quelles.
function reglagesBruts(){
  try{ localStorage.setItem(CLE, JSON.stringify(REGL)); }
  catch(e){ /* stockage refuse : on continue sans memoire */ }
}

function reglagesEcrits(){
  // ETAT LIVE AVANT D'ECRIRE : plusieurs onglets partagent ce stockage ; ecrire
  // notre copie memoire ecraserait leur travail (constate le 09/08 : un onglet
  // reste sur « Vehicule 1 » a efface le profil cree ailleurs). On repart
  // du stockage frais et on n'y reporte QUE notre vehicule actif + les globaux.
  const frais = reglagesLus();
  if(Array.isArray(frais.vehicules) && frais.vehicules.length){
    const mienNom = REGL.vehicules[REGL.vehActif].nom;
    REGL.vehicules = frais.vehicules;
    let i = REGL.vehicules.findIndex(x => x.nom === mienNom);
    if(i < 0){ REGL.vehicules.push({nom: mienNom}); i = REGL.vehicules.length - 1; }
    REGL.vehActif = i;
  }
  const v = REGL.vehicules[REGL.vehActif];
  v.carbs = choix();
  v.conso = document.getElementById('conso').value;
  v.cuve  = document.getElementById('cuve').value;
  v.reserve = document.getElementById('reserve').value;
  REGL.sansCher = document.getElementById('sansCher').checked;
  REGL.couloir  = document.getElementById('couloir').value;
  REGL.queUtiles = document.getElementById('queUtiles').checked;
  REGL.sansPeage = document.getElementById('sansPeage').checked;
  reglagesBruts();
  majSelectVeh();   // le garage a pu s'enrichir depuis un autre onglet
}
function majSelectVeh(){
  document.getElementById('veh').innerHTML = REGL.vehicules.map((v,i) =>
    `<option value="${i}"${i === REGL.vehActif ? ' selected' : ''}>${esc(v.nom)}</option>`).join('');
}
function appliquerVeh(){
  const v = REGL.vehicules[REGL.vehActif];
  document.querySelectorAll('#carbs input').forEach(i => i.checked = v.carbs.includes(i.value));
  document.getElementById('conso').value = v.conso || '';
  document.getElementById('cuve').value  = v.cuve || '';
  document.getElementById('reserve').value = v.reserve || '';
}
const coches = REGL.vehicules[REGL.vehActif].carbs;
document.getElementById('carbs').innerHTML = CASES.map(([k,l]) =>
  `<label class="case"><input type="checkbox" value="${k}"`+
  `${coches.includes(k)?' checked':''}> ${l}</label>`).join('');

// Regle de conception : AUCUNE coordonnee personnelle en dur. Le centre vient de
// la geolocalisation de l'appareil ; a defaut du dernier repere memorise sur CE
// navigateur ; a defaut d'une vue France entiere (clic droit pour poser le repere).
if(Array.isArray(REGL.centre)) CENTRE = REGL.centre.slice();
const ZOOM0 = CENTRE ? 13 : 6;
if(!CENTRE) CENTRE = [46.603, 2.334];
const map = L.map('map',{scrollWheelZoom:true}).setView(CENTRE, ZOOM0);

// Fond de carte : IGN Geoplateforme. OSM sert une tuile « Access blocked » quand
// la page vient d'un file:// (pas de Referer, exige par sa politique d'usage) —
// constate le 09/08/2026 dans Firefox. L'IGN n'a pas cette contrainte.
const FONDS = {
  "Plan IGN": L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile'+
    '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM'+
    '&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    {maxZoom:19, attribution:'Plan IGN © IGN — Géoplateforme'}),
  "Carto (clair)": L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    {maxZoom:19, attribution:'© OpenStreetMap, © CARTO'}),
  "Vue aérienne": L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile'+
    '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM'+
    '&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    {maxZoom:19, attribution:'Orthophotos © IGN — Géoplateforme'}),
};
FONDS["Plan IGN"].addTo(map);
L.control.layers(FONDS, null, {position:'topright'}).addTo(map);

// Bouton ◎ directement sur la carte : arriver d'un geste sur sa position.
const CtrlLoc = L.Control.extend({
  options: {position: 'topleft'},
  onAdd(){
    const d = L.DomUtil.create('div', 'leaflet-bar');
    const a = L.DomUtil.create('a', '', d);
    a.href = '#'; a.title = 'Ma position';
    a.innerHTML = '◎';
    a.style.cssText = 'font-size:17px;line-height:26px;text-align:center';
    L.DomEvent.on(a, 'click', e => { L.DomEvent.stop(e); localiser(false); });
    return d;
  }
});
map.addControl(new CtrlLoc());

// Repli automatique si l'IGN devient indisponible.
let secours = false;
FONDS["Plan IGN"].on('tileerror', () => {
  if(secours) return;
  secours = true;
  map.removeLayer(FONDS["Plan IGN"]);
  FONDS["Carto (clair)"].addTo(map);
});
const repere = L.circleMarker(CENTRE,{radius:6,color:'#1d4ed8',weight:2,
  fillColor:'#3b82f6',fillOpacity:.9}).addTo(map)
  .bindTooltip('Point de repère — les distances partent d\'ici (clic droit sur la carte pour le déplacer)');

let layer = L.layerGroup().addTo(map);
let etapeLayer = L.layerGroup().addTo(map);
let DATA = [], sortKey = 'prix', sortAsc = true;

const dist = (la,lo) => {
  const R=6371, p=Math.PI/180;
  const dLa=(la-CENTRE[0])*p, dLo=(lo-CENTRE[1])*p;
  const a=Math.sin(dLa/2)**2+Math.cos(CENTRE[0]*p)*Math.cos(la*p)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
};
// Trois couleurs seulement — bleu, noir, rouge. Un degrade continu fabriquait des
// bleu-vert qu'on ne distinguait pas du bleu franc sur le fond IGN (beige, vert,
// orange) ; trois teintes tranchees se lisent d'un coup d'oeil.
// Marron plutot que noir pour le gros du peloton : choix de lisibilite, plus
// lisible sur le Plan IGN que le noir, qui ecrasait la carte.
const BLEU='#0b57d0', MARRON='#b07d10', ROUGE='#c02626';
function couleur(p, b, mini){
  if(mini != null && p <= mini + 1e-9) return BLEU;    // le moins cher, ex aequo compris
  if(b && p > b.p90) return ROUGE;                     // 10 % les plus chers du secteur
  return MARRON;
}

// Referentiel de couleur : les bornes viennent du SECTEUR (60 km autour du
// point de repere), pas de la zone affichee. Sans cela, la moins chere d'un ecran de
// stations cheres s'afficherait en bleu — « la moins chere ici » n'est pas
// « une bonne affaire ». Bleu plein = sous le 1er decile, rouge plein = au-dessus
// du 9e decile.
let REF_ROWS = [];
function bornes(vue){
  const px = REF_ROWS.map(s => pick(s, vue)).filter(Boolean)
                     .map(v => v.p).sort((a,b) => a-b);
  if(px.length < 8) return null;
  const Q = f => px[Math.round(f*(px.length-1))];
  return {med: Q(0.50), p90: Q(0.90)};
}
const jour = s => s ? s.slice(8,10)+'/'+s.slice(5,7) : '—';
function quand(s){
  if(!s) return {txt:'date inconnue', vieux:true};
  const d = new Date(s);
  const j = Math.floor((Date.now() - d.getTime()) / 86400000);
  const txt = d.toLocaleString('fr-FR', {day:'2-digit', month:'2-digit',
                                         hour:'2-digit', minute:'2-digit'})
              .replace(' ', ' à ');
  return {txt: j >= 1 ? `${txt} · il y a ${j} j` : txt, vieux: j >= 4};
}

// Echappement HTML de toute chaine venue de l'exterieur (flux des stations,
// nom de vehicule importe par l'URL) : fait UNE fois a l'ingestion, tout ce qui
// est rendu ensuite (tableau, bulles, liste des vehicules) est sain.
const esc = x => String(x).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function normalise(rows){
  return rows.map(r => {
    const la=parseFloat(r.latitude)/100000, lo=parseFloat(r.longitude)/100000;
    if(!isFinite(la)||!isFinite(lo)) return null;
    return {la, lo, ville:esc(r.ville||''), cp:esc(r.cp||''), adresse:esc(r.adresse||''),
            auto:r.horaires_automate_24_24==='Oui',
            rupture:esc([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                      .filter(Boolean).join(';')),
            hs:new Set([r.carburants_rupture_temporaire, r.carburants_rupture_definitive]
                       .filter(Boolean).join(';').split(';')
                       .map(x => x.trim().toLowerCase()).filter(Boolean)),
            d:dist(la,lo),
            prix:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_prix']])),
            maj:Object.fromEntries(FUELS.map(([k])=>[k,r[k+'_maj']]))};
  }).filter(Boolean);
}

// Selection multiple : une station n'est retenue que si elle sert TOUS les
// carburants coches ; le classement se fait sur la somme, mais chaque carburant
// garde sa propre couleur (un bon E85 avec un SP quelconque doit se voir).
const COURT = {e10:'E10', sp98:'SP98', sp95:'SP95', e85:'E85',
               gazole:'Gazole', gplc:'GPLc'};
// Libelles tels qu'ils apparaissent dans carburants_rupture_* du flux officiel.
const RUPT = {e10:'e10', sp98:'sp98', sp95:'sp95', e85:'e85',
              gazole:'gazole', gplc:'gplc'};
const dispo = (s, k) => s.prix[k] != null && !s.hs.has(RUPT[k]);
const choix = () => [...document.querySelectorAll('#carbs input:checked')].map(i => i.value);

function pick(s, sel){
  const lignes = [];
  for(const k of sel){
    if(k === 'spmin'){
      const c = SP.filter(([kk]) => dispo(s, kk))
                  .map(([kk,n]) => ({ref:kk, tag:n, prix:s.prix[kk], maj:s.maj[kk]}));
      if(!c.length) return null;
      lignes.push(c.reduce((a,b) => b.prix < a.prix ? b : a));
    }else{
      if(!dispo(s, k)) return null;
      lignes.push({ref:k, tag:COURT[k], prix:s.prix[k], maj:s.maj[k]});
    }
  }
  if(!lignes.length) return null;
  return {p: +lignes.reduce((t,l) => t + l.prix, 0).toFixed(3), lignes,
          maj: lignes.map(l => l.maj).filter(Boolean).sort()[0] || null};
}

// Bornes du secteur pour une selection donnee (un seul carburant, ou la somme).
function bornes(sel){
  const px = REF_ROWS.map(s => pick(s, sel)).filter(Boolean)
                     .map(v => v.p).sort((a,b) => a-b);
  if(px.length < 8) return null;
  const Q = f => px[Math.round(f*(px.length-1))];
  return {med: Q(0.50), p90: Q(0.90)};
}

const gmaps = s => 'https://www.google.com/maps/dir/?api=1&destination='+s.la+','+s.lo;

const sansCherLbl = () => document.getElementById('sansCher').checked
  ? 'les 10 % les plus chers du secteur sont masqués'
  : 'rouge = les 10 % les plus chers du secteur';

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

function rendu(){
  const sel = choix();
  const tb = document.getElementById('tb');
  layer.clearLayers(); etapeLayer.clearLayers(); tb.innerHTML = '';
  document.getElementById('plan').style.display = 'none';
  if(!sel.length){
    document.getElementById('compte').textContent = 'aucun carburant coché';
    tb.innerHTML = '<tr><td colspan="5">Coche au moins un carburant.</td></tr>';
    return;
  }

  // En itineraire, le couloir est deja charge en entier : le zoom se contente de
  // filtrer l'affichage, ce qui est instantane et ne perd aucune station.
  let source = DATA;
  if(ROUTE){
    const large = +document.getElementById('couloir').value;
    const vue = map.getBounds();
    DATA.forEach(s => { if(s.ecart == null){
      const r = distTrace(s.la, s.lo); s.ecart = r.d; s.kmr = r.km; } });
    source = DATA.filter(s => s.ecart <= large && vue.contains([s.la, s.lo]));
  }
  const list = source.map(s => ({s, v: pick(s, sel)})).filter(o => o.v);
  const n = list.length;
  majCompte = t => document.getElementById('compte').textContent =
    `${n} station${n>1?'s':''} ${ROUTE ? 'sur le trajet, dans la zone affichée' : 'dans la zone affichée'}` + t +
    (tronque ? ` · ${tronque} de plus non chargée${tronque>1?'s':''} (plafond ${PLAFOND})` : '');
  majCompte('');
  if(!n){
    tb.innerHTML = ROUTE
      ? '<tr><td colspan="5">Aucune station du couloir ne sert cette combinaison dans la zone affichée — dézoome, élargis le couloir, ou décoche un carburant.</td></tr>'
      : '<tr><td colspan="5">Aucune station ne sert cette combinaison dans la zone affichée — dézoome, déplace la carte, ou décoche un carburant.</td></tr>';
    return;
  }

  const px = list.map(o => o.v.p);
  const refTotal = bornes(sel), miniTot = Math.min(...px);
  const refs  = sel.map(k => bornes([k]));
  const minis = sel.map((k,i) => Math.min(...list.map(o => o.v.lignes[i].prix)));
  const multi = sel.length > 1;

  document.getElementById('echelle').textContent =
    `— bleu = le moins cher affiché, ex æquo compris ; ${sansCherLbl()} · ` +
    sel.map((k,i) => `${k==='spmin'?'SP':COURT[k]} ${minis[i].toFixed(3)}` +
                     (refs[i] ? ` / ${refs[i].p90.toFixed(3)}` : '')).join(' · ') + ' €';

  const sansCher = document.getElementById('sansCher').checked;
  // Une station est « trop chere » des qu'UN des carburants demandes est dans le
  // 9e decile de son propre secteur — pas seulement quand la somme l'est. Sinon
  // le masque laissait passer des pastilles rouges, ce qui se voyait et se lisait mal.
  const chere = o => couleur(o.v.p, refTotal, miniTot) === ROUGE ||
                     o.v.lignes.some((l,j) => couleur(l.prix, refs[j], minis[j]) === ROUGE);
  const retenues = sansCher ? list.filter(o => !chere(o)) : list;
  const ecartees = list.length - retenues.length;

  // Les plus cheres dessinees en premier : les etiquettes utiles restent dessus.
  [...retenues].sort((a,b) => b.v.p - a.v.p).forEach((o,i) => {
    const {s,v} = o;
    const chips = v.lignes.map((l,j) =>
      `<span style="background:${couleur(l.prix, refs[j], minis[j])}">${l.tag} ${l.prix.toFixed(3)}</span>`).join('');
    const html = multi
      ? `<div class="lbl lbl2">${chips}</div>`
      : `<div class="lbl" style="background:${couleur(v.lignes[0].prix, refs[0], minis[0])};`+
        `border-color:#555;color:#fff">${v.lignes[0].prix.toFixed(3)}`+
        (sel[0]==='spmin' ? ` <span style="font-size:10px;opacity:.85">${v.lignes[0].tag}</span>` : '')+
        `</div>`;
    const h = multi ? 8 + 16*v.lignes.length : 20;
    const ic = L.divIcon({className:'', iconSize:[multi?80:62, h],
                          iconAnchor:[multi?40:31, h/2], html});
    const utilises = v.lignes.map(l => l.ref);
    L.marker([s.la,s.lo],{icon:ic, zIndexOffset:i*10, riseOnHover:true, stationRef:s})
      .addTo(layer).bindPopup(
        `<b>${s.ville} (${s.cp})</b><br>${s.adresse}` +
        (s.auto?'<br><i>automate 24 h/24</i>':'') +
        (s.rupture?`<br><span style="color:#c02626">rupture : ${s.rupture}</span>`:'') +
        '<ul class="fuels">' + FUELS.filter(([k]) => s.prix[k]!=null).map(([k,l])=>{
          const q = quand(s.maj[k]);
          const ko = s.hs.has(RUPT[k]);
          return `<li class="${utilises.includes(k)?'hi':''}"><span>${l}`+
                 `${ko?' <span style="color:#c02626">(en rupture)</span>':''}</span>`+
                 `<span class="dt${q.vieux?' vieux':''}">${q.txt}</span>`+
                 `<b style="${ko?'text-decoration:line-through;opacity:.55':''}">`+
                 `${s.prix[k].toFixed(3)} €</b></li>`;
        }).join('') + '</ul>' +
        '<div style="font-size:11.5px;color:#6b7280;margin-top:6px">'+
        'Dates = dernier relevé déclaré par la station.</div>' +
        `<div style="margin-top:8px"><a href="${gmaps(s)}" target="_blank" rel="noopener">Itinéraire ▸</a></div>`);
  });

  const gardees = retenues;
  const th = document.getElementById('thDist');
  const fleche = (th.textContent.match(/ [▲▼]$/) || [''])[0];   // ne pas manger le tri
  th.textContent = (ROUTE ? 'Écart au trajet' : 'Distance') + fleche;

  let tri = [...gardees].sort((a,b)=>{
    let x,y;
    if(sortKey==='prix'){x=a.v.p;y=b.v.p;}
    else if(sortKey==='dist'){x=ROUTE?a.s.ecart:a.s.d;y=ROUTE?b.s.ecart:b.s.d;}
    else if(sortKey==='maj'){x=a.v.maj||'';y=b.v.maj||'';}
    else {x=(a.s[sortKey]||'').toLowerCase();y=(b.s[sortKey]||'').toLowerCase();}
    return (x>y?1:x<y?-1:0)*(sortAsc?1:-1);
  });
  majCompte(ecartees ? ` · ${ecartees} trop chère${ecartees>1?'s':''} masquée${ecartees>1?'s':''}` : '');

  // ---- Plan de pleins : plein au depart, arrets choisis au moins cher ----
  // Autonomie utile = reservoir / conso x 100, moins 10 % de reserve. A chaque
  // etape : parmi les stations atteignables du couloir (masque ignore : mieux
  // vaut une station chere qu'une panne seche), la moins chere ; a prix egal,
  // la plus lointaine. Glouton simple, suffisant a cette echelle.
  const etapeNum = new Map();
  let utilesPlan = null;
  const elPlan = document.getElementById('plan');
  if(ROUTE && KMS){
    const conso = +document.getElementById('conso').value;
    const cuve  = +document.getElementById('cuve').value;
    elPlan.style.display = 'block';
    if(!(conso > 0) || !(cuve > 0)){
      elPlan.innerHTML = '<span style="color:var(--muted)">Renseigne conso et réservoir pour savoir où faire le plein.</span>';
    }else{
      // Reserve en KM (choix d'ergonomie) : plus parlant qu'un pourcentage.
      const resv = Math.max(0, +document.getElementById('reserve').value || 30);
      const A = cuve / conso * 100 - resv;
      const total = KMS[KMS.length - 1];
      const larg = +document.getElementById('couloir').value;
      const lkm = conso / 100;
      const carbPlan = sel[0];               // le plan se calcule sur le 1er carburant coche
      const candTous = DATA.filter(x => x.kmr != null)
                       .map(x => ({s: x, v: pick(x, sel)})).filter(o => o.v)
                       .map(o => ({s: o.s, v: o.v, km: o.s.kmr, e: o.s.ecart,
                                   p: o.v.lignes[0].prix}))
                       .sort((a,b) => a.km - b.km);
      const cand = candTous.filter(c => c.e <= larg);
      const r = optimiserPlan(cand, A, total, lkm);
      const plan = r.plan;
      const coutTotal = r.coutAchats || 0;
      utilesPlan = r.utiles || null;

      // Cout du voyage COMPLET : le plein de depart se paie aussi. Il est value
      // au meilleur prix disponible a moins de 15 km du point de depart.
      const coutVoyage = (candW, rw) => {
        if(!rw || rw.plan === null) return null;
        const pd = Math.min(...candW.filter(c => c.km <= 15).map(c => c.p));
        if(!isFinite(pd)) return null;
        const kmDep = rw.plan.length ? rw.plan[0].km + rw.plan[0].e : total;
        return pd * lkm * Math.min(kmDep, total) + rw.coutAchats;
      };
      const voyage = coutVoyage(cand, r);

      // Le cout depend de la largeur du couloir : plus large, plus de stations
      // pas cheres candidates — mais des detours plus longs. Comparatif calcule
      // sur les memes donnees (chargees a 20 km quoi qu'il arrive).
      const comparatif = [1, 2, 5, 10, 20].map(w => {
        const cw = candTous.filter(c => c.e <= w);
        const v = coutVoyage(cw, optimiserPlan(cw, A, total, lkm));
        return `${w === larg ? '<b>' : ''}${w} km : ${v == null ? '—' : v.toFixed(2) + ' €'}${w === larg ? '</b> ◄' : ''}`;
      }).join(' · ');

      // Temps perdu : ~5 min par arret + le detour parcouru a ~50 km/h.
      const minutes = e => 5 + (2 * e.e) / 50 * 60;
      const tempsTotal = (plan || []).reduce((t, e) => t + minutes(e), 0);

      // Pour repartir : la moins chere a moins de 15 km de l'arrivee.
      const finTrajet = cand.filter(c => c.km >= total - 15);
      const retour = finTrajet.length ? finTrajet.reduce((x,y) => y.p < x.p ? y : x) : null;

      (plan || []).forEach((e,i) => etapeNum.set(e.s, i + 1));
      (plan || []).forEach((e,i) => {
        L.circleMarker([e.s.la, e.s.lo], {radius: 17, color: '#0b57d0', weight: 3,
          fill: false, dashArray: '5 5'}).addTo(etapeLayer)
          .bindTooltip(`⛽ Étape ${i+1} — km ${Math.round(e.km)}`);
      });
      const tete = `Plein au départ · autonomie utile ~${Math.round(A)} km`+
                   ` (${cuve} L × ${String(conso).replace('.', ',')} L/100, réserve ${resv} km)`;
      if(plan === null){
        elPlan.innerHTML = `${tete} · <b style="color:#c02626">⚠ trajet infaisable avec cette`+
          ` autonomie dans ce couloir</b> — élargis le couloir, réduis la réserve ou vérifie conso et réservoir`;
      }else if(!plan.length){
        elPlan.innerHTML = `${tete} · trajet de ${Math.round(total)} km : <b>aucun arrêt nécessaire</b>`+
          (voyage != null ? ` · carburant du voyage ≈ <b>${voyage.toFixed(2)} €</b> (plein au départ)` : '');
      }else{
        elPlan.innerHTML = tete +
          ` · plan optimal sur ${COURT[carbPlan] || 'SP'}, détours comptés — achats en route ≈ <b>${coutTotal.toFixed(2)} €</b>` +
          (voyage != null ? ` · carburant du voyage ≈ <b>${voyage.toFixed(2)} €</b> (plein de départ compris)` : '') +
          ` · temps d'arrêts ≈ <b>${Math.round(tempsTotal)} min</b>` +
          `<br>` +
          plan.map((e,i) =>
            `<span class="badge">⛽ ${i+1}</span> ${e.s.ville} km ${Math.round(e.km)}`+
            ` (détour ${(2*e.e).toFixed(1)} km ≈ ${(2*e.e*lkm*e.p).toFixed(2)} €, ~${Math.round(minutes(e))} min)`+
            ` — ${e.v.lignes.map(l => `${l.tag} ${l.prix.toFixed(3)}`).join(' + ')} €`).join(' · ') +
          `<br><span style="color:var(--muted)">Voyage selon le couloir — ${comparatif}` +
          (retour ? ` · Plein du retour : ${retour.s.ville} ${retour.p.toFixed(3)} € (km ${Math.round(retour.km)})` : '') +
          `</span>`;
      }
    }
    if(utilesPlan && document.getElementById('queUtiles').checked){
      const aVirer = [];
      layer.eachLayer(m => { const st = m.options.stationRef;
        if(st && !etapeNum.has(st)) aVirer.push(m); });
      aVirer.forEach(m => layer.removeLayer(m));
      const avant = tri.length;
      tri = tri.filter(({s}) => etapeNum.has(s));
      const off = avant - tri.length;
      if(off) majCompte(` · ${off} hors plan masquée${off>1?'s':''}`);
    }
  }
  if(!tri.length){
    tb.innerHTML='<tr><td colspan="5">Toutes les stations de la zone sont dans les 10 % les plus chères du secteur — décoche « Masquer les trop chères » pour les voir.</td></tr>';
    return;
  }
  tri.forEach(({s,v})=>{
    const chips = v.lignes.map((l,j) =>
      `<span class="pill" style="background:${couleur(l.prix, refs[j], minis[j])}">${l.tag} ${l.prix.toFixed(3)}</span>`).join(' ');
    const prix = multi
      ? `<span class="pill" style="background:${couleur(v.p, refTotal, miniTot)}">${v.p.toFixed(3)} €</span>`+
        `<div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap">${chips}</div>`
      : chips;
    const et = etapeNum.get(s);
    const tr=document.createElement('tr');
    if(et) tr.className = 'etape';
    tr.innerHTML = `<td>${prix}</td>`+
      `<td>${(ROUTE ? s.ecart : s.d).toFixed(1)} km`+
      (ROUTE && s.kmr != null ? `<br><span style="color:var(--muted);font-size:12px">km ${Math.round(s.kmr)}</span>` : '')+`</td>`+
      `<td>${et ? `<span class="badge">⛽ Étape ${et}</span><br>` : ''}${s.ville}<br><span style="color:var(--muted);font-size:12.5px">${s.cp}</span></td>`+
      `<td>${s.adresse}${s.auto?' <span style="color:var(--muted)">· 24/24</span>':''}</td>`+
      `<td>${jour(v.maj)}</td>`;
    tr.onclick = ()=>{ map.setView([s.la,s.lo],15); window.open(gmaps(s),'_blank','noopener'); };
    tb.appendChild(tr);
  });
}

window.addEventListener('resize', () => map.invalidateSize(false));
if('scrollRestoration' in history) history.scrollRestoration = 'manual';

document.querySelectorAll('th[data-k]').forEach(th=>{
  th.onclick = ()=>{
    const k=th.dataset.k;
    sortAsc = (k===sortKey) ? !sortAsc : true; sortKey=k;
    document.querySelectorAll('th[data-k]').forEach(o=>
      o.textContent=o.textContent.replace(/ [▲▼]$/,''));
    th.textContent += sortAsc?' ▲':' ▼';
    rendu();
  };
});
document.getElementById('carbs').onchange = () => { reglagesEcrits(); charger(); };
majSelectVeh();
document.getElementById('veh').onchange = e => {
  REGL.vehActif = +e.target.value;
  appliquerVeh(); reglagesEcrits(); ouvrirFiche(); charger();
};
const fiche = document.getElementById('fiche');
function ouvrirFiche(){
  fiche.hidden = false;
  document.getElementById('vnom').value = REGL.vehicules[REGL.vehActif].nom;
}
document.getElementById('vehPlus').onclick = () => {
  REGL.vehicules.push({nom: 'Véhicule ' + (REGL.vehicules.length + 1),
    carbs: DEFAUT.slice(), conso: '', cuve: '', reserve: ''});
  REGL.vehActif = REGL.vehicules.length - 1;
  appliquerVeh(); majSelectVeh(); reglagesEcrits(); ouvrirFiche(); charger();
};
document.getElementById('vehNom').onclick = () => {
  if(fiche.hidden) ouvrirFiche(); else fiche.hidden = true;
};
document.getElementById('vehOk').onclick = () => {
  reglagesEcrits();                       // synchronise sous le nom courant
  const nom = document.getElementById('vnom').value.trim();
  if(nom && nom !== REGL.vehicules[REGL.vehActif].nom){
    REGL.vehicules[REGL.vehActif].nom = nom;
    reglagesBruts();                      // renommage : ecriture directe
  }
  majSelectVeh(); fiche.hidden = true; charger();
};
document.getElementById('vehMoins').onclick = () => {
  if(REGL.vehicules.length <= 1) return;
  if(!confirm(`Supprimer « ${REGL.vehicules[REGL.vehActif].nom} » ?`)) return;
  REGL.vehicules.splice(REGL.vehActif, 1);
  REGL.vehActif = 0;
  reglagesBruts();                        // suppression : ecriture directe
  majSelectVeh(); appliquerVeh(); fiche.hidden = true; charger();
};

// Import d'une fiche vehicule par l'URL — sert aussi a PARTAGER un profil :
//   fuelpilot.html#veh=Nom|e85+e10|conso|cuve|reserve
(function(){
  // #pos=lat,lon : pose le repere sans geolocalisation — indispensable en
  // file:// (Firefox reserve la geolocalisation aux contextes securises).
  const mp = location.hash.match(/^#pos=(-?[0-9.]+),(-?[0-9.]+)$/);
  if(mp){
    setTimeout(() => situer(+mp[1], +mp[2], 'Point de repère'), 0);
    history.replaceState(null, '', location.pathname);
    return;
  }
  const m = location.hash.match(/^#veh=([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)$/);
  if(!m) return;
  const nom = decodeURIComponent(m[1]);
  const v = {nom,
    carbs: m[2] ? decodeURIComponent(m[2]).split('+') : DEFAUT.slice(),
    conso: decodeURIComponent(m[3]), cuve: decodeURIComponent(m[4]),
    reserve: decodeURIComponent(m[5])};
  const i = REGL.vehicules.findIndex(x => x.nom === nom);
  if(i >= 0) REGL.vehicules[i] = v; else REGL.vehicules.push(v);
  REGL.vehActif = i >= 0 ? i : REGL.vehicules.length - 1;
  appliquerVeh(); majSelectVeh(); reglagesEcrits();
  history.replaceState(null, '', location.pathname);
})();
document.getElementById('sansCher').onchange = () => { reglagesEcrits(); rendu(); };

const SEL = encodeURIComponent("__SELECT__");
const URL_API = "__API__";
const PLAFOND = 400;      // stations chargees au maximum pour une emprise donnee
const maj = document.getElementById('maj');
let tronque = 0, seq = 0, minuteur = null, majCompte = () => {};

// Les stations suivent l'emprise de la carte : chaque deplacement ou dezoom
// relance une requete bornee par la bbox visible. Le compteur `seq` annule les
// reponses d'une emprise devenue obsolete (sinon un lent revient apres un rapide
// et repeint la mauvaise zone).
// Filtre serveur adosse a la vue : sur une grande emprise, le plafond doit etre
// depense sur des stations utiles. En « mes 2 pleins », l'E85 est le carburant
// rare (27 stations sur 60 dans la zone de test) : c'est lui qui borne.
function clauseVue(){
  return choix().map(k => k === 'spmin'
    ? " and (e10_prix is not null or sp95_prix is not null or sp98_prix is not null)"
    : ` and ${k}_prix is not null`).join('');
}

// Decoupe le trace en emprises courtes. Sur un long trajet, une seule bbox
// englobante couvre un quart de la France : le plafond tombait alors sur des
// stations tirees au hasard par l'API et le couloir revenait presque vide
// (constate sur un trajet de ~600 km, ~3 700 stations dans l'emprise).
function emprisesTrace(margeKm){
  const dLat = margeKm/110.57;
  const cases = [];
  let cur = null;
  for(const [lon, lat] of ROUTE){
    const dLon = margeKm/(111.32*Math.cos(lat*Math.PI/180));
    if(!cur) cur = {s:lat, n:lat, w:lon, e:lon};
    const s2 = Math.min(cur.s,lat), n2 = Math.max(cur.n,lat);
    const w2 = Math.min(cur.w,lon), e2 = Math.max(cur.e,lon);
    if((n2-s2) > 1.2 || (e2-w2) > 1.2){        // ~130 km de cote au maximum
      cases.push({s:cur.s-dLat, n:cur.n+dLat, w:cur.w-dLon, e:cur.e+dLon});
      cur = {s:lat, n:lat, w:lon, e:lon};
    }else{
      cur = {s:s2, n:n2, w:w2, e:e2};
    }
  }
  if(cur){
    const dLon = margeKm/(111.32*Math.cos(cur.n*Math.PI/180));
    cases.push({s:cur.s-dLat, n:cur.n+dLat, w:cur.w-dLon, e:cur.e+dLon});
  }
  return cases;
}

async function charger(){
  const mien = ++seq;
  const large = +document.getElementById('couloir').value;
  // Hors itineraire : l'emprise de l'ecran. En itineraire : une suite d'emprises
  // courtes le long du trace, pour ne rien manquer sur un long trajet.
  const b = map.getBounds();
  const zones = ROUTE ? emprisesTrace(20)   // toujours le couloir maxi : la largeur
                      : [{s:b.getSouth(), n:b.getNorth(), w:b.getWest(), e:b.getEast()}];
  // choisie filtre localement, et le comparatif par largeur se fait sans recharger.
  const clause = clauseVue();
  maj.textContent = 'chargement…';
  try{
    let rows = [], reste = 0;
    for(const z of zones){
      const bbox = encodeURIComponent(
        `in_bbox(geom, ${z.s.toFixed(5)}, ${z.w.toFixed(5)}, ` +
        `${z.n.toFixed(5)}, ${z.e.toFixed(5)})` + clause);
      let off = 0, tot = 1;
      while(off < tot && off < PLAFOND){
        const r = await fetch(`${URL_API}?where=${bbox}&select=${SEL}&limit=100&offset=${off}`);
        if(!r.ok) throw new Error('HTTP '+r.status);
        const j = await r.json();
        if(mien !== seq) return;
        tot = j.total_count; rows = rows.concat(j.results); off += 100;
      }
      reste += Math.max(0, tot - Math.min(tot, PLAFOND));
    }
    const vus = new Set();
    rows = rows.filter(r => !vus.has(r.id) && vus.add(r.id));   // emprises jointives
    tronque = reste;
    DATA = normalise(rows);
    if(ROUTE){
      DATA = DATA.map(s => { const r = distTrace(s.la, s.lo);
                             return Object.assign(s, {ecart: r.d, kmr: r.km}); })
                 .filter(s => s.ecart <= 20);
    }
    maj.innerHTML = 'prix en direct · ' + new Date().toLocaleString('fr-FR',
      {weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }catch(e){
    if(mien !== seq) return;
    const vis = map.getBounds();
    DATA = normalise(SNAPSHOT).filter(s => vis.contains([s.la, s.lo]));
    tronque = 0;
    maj.innerHTML = '<span style="color:#c02626">hors ligne</span> — relevé du '+SNAP_DATE;
  }
  rendu();
}

map.on('moveend zoomend', () => {
  if(ROUTE){ rendu(); return; }      // couloir deja charge : simple refiltrage
  clearTimeout(minuteur);
  minuteur = setTimeout(charger, 400);
});
document.getElementById('couloir').onchange = () => { reglagesEcrits(); if(ROUTE) rendu(); };
document.getElementById('conso').onchange =
document.getElementById('cuve').onchange =
document.getElementById('reserve').onchange = () => { reglagesEcrits(); rendu(); };
document.getElementById('queUtiles').onchange = () => { reglagesEcrits(); rendu(); };
document.getElementById('sansPeage').onchange = () => {
  reglagesEcrits();
  if(ROUTE) document.getElementById('trajet').requestSubmit();
};

// Le centre suit l'appareil : la page reste juste pour qui la recoit, sans rien
// coder en dur de personnel. Le repere de secours ne sert que si la geoloc est
// refusee, indisponible ou trop lente.
function situer(lat, lon, libelle){
  CENTRE = [lat, lon];
  REGL.centre = [lat, lon]; reglagesEcrits();
  repere.setLatLng(CENTRE).setTooltipContent(libelle + " — les distances partent d'ici");
  map.setView(CENTRE, 13);       // ~5 km autour du point ; declenche moveend -> rechargement
  charger();
  chargerReferentiel().then(rendu).catch(() => {});   // le secteur suit le nouveau centre
  // Le titre suit la position (nom de commune via la Base Adresse Nationale) :
  // la page peut etre partagee, la commune du snapshot ne doit pas rester figee.
  fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`)
    .then(r => r.json())
    .then(j => {
      const c = j.features?.[0]?.properties?.city;
      if(c){
        document.getElementById('lieu').textContent = ' — ' + c;
        document.title = 'FuelPilot — ' + c;
      }
    }).catch(() => {});
}
function localiser(auto){
  if(!navigator.geolocation){
    if(!auto) maj.textContent = 'géolocalisation non disponible';
    return;
  }
  maj.textContent = 'localisation…';
  navigator.geolocation.getCurrentPosition(
    pos => situer(pos.coords.latitude, pos.coords.longitude, 'Ma position'),
    ()  => { maj.textContent = Array.isArray(REGL.centre)
               ? 'position refusée — repère mémorisé utilisé'
               : 'position refusée — clic droit sur la carte pour poser le repère';
             charger(); },
    {enableHighAccuracy: false, timeout: 8000, maximumAge: 300000});
}
// ---------- Itineraire ----------
// Geocodage : Base Adresse Nationale. Trace : Geoplateforme IGN (bdtopo-osrm).
// Les deux sont publics, sans cle, et autorisent l'appel depuis un fichier local.
const BAN = 'https://api-adresse.data.gouv.fr/search/';
const ITI = 'https://data.geopf.fr/navigation/itineraire';
let ROUTE = null;        // [[lon,lat], …] simplifie
let traceLigne = null;
const infoT = document.getElementById('infoTrajet');

async function geocoder(q){
  if(!q.trim()) return {lon: CENTRE[1], lat: CENTRE[0], label: 'ma position'};
  const r = await fetch(`${BAN}?q=${encodeURIComponent(q)}&limit=1`);
  if(!r.ok) throw new Error('géocodage indisponible');
  const j = await r.json();
  if(!j.features.length) throw new Error(`adresse introuvable : « ${q} »`);
  const f = j.features[0];
  return {lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
          label: f.properties.label};
}

// Distance d'un point au trace, en km (approximation plane : a cette echelle
// l'erreur est negligeable devant la largeur du couloir).
let KMS = null;   // abscisse cumulee (km) de chaque point du trace
function preparerKms(){
  KMS = [0];
  for(let i=1; i<ROUTE.length; i++){
    const [lo1,la1] = ROUTE[i-1], [lo2,la2] = ROUTE[i];
    const kx = 111.32*Math.cos(la1*Math.PI/180);
    KMS.push(KMS[i-1] + Math.hypot((lo2-lo1)*kx, (la2-la1)*110.57));
  }
}

// Renvoie l'ecart au trace ET la position le long du trajet (km depuis le depart).
function distTrace(la, lo){
  const kx = 111.32*Math.cos(la*Math.PI/180), ky = 110.57;
  let best = Infinity, km = 0;
  for(let i=1; i<ROUTE.length; i++){
    const ax=(ROUTE[i-1][0]-lo)*kx, ay=(ROUTE[i-1][1]-la)*ky;
    const bx=(ROUTE[i][0]-lo)*kx,   by=(ROUTE[i][1]-la)*ky;
    const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
    let t = l2 ? -(ax*dx+ay*dy)/l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px=ax+t*dx, py=ay+t*dy, d=Math.hypot(px,py);
    if(d<best){ best=d; km = KMS ? KMS[i-1] + t*(KMS[i]-KMS[i-1]) : 0; }
  }
  return {d: best, km};
}

async function calculerTrajet(ev){
  ev.preventDefault();
  infoT.textContent = 'calcul…';
  try{
    const [a, b] = await Promise.all([
      geocoder(document.getElementById('depart').value),
      geocoder(document.getElementById('arrivee').value)]);
    // « Sans péage » : moteur bdtopo-pgr + interdiction des autoroutes (verifie
    // le 09/08 : la contrainte est IGNOREE par bdtopo-osrm, respectee par pgr).
    // Approximation assumee : quelques autoroutes gratuites (A75...) sont
    // evitees aussi.
    const sansP = document.getElementById('sansPeage').checked;
    const u = `${ITI}?resource=${sansP ? 'bdtopo-pgr' : 'bdtopo-osrm'}&profile=car&optimization=fastest`+
              `&start=${a.lon},${a.lat}&end=${b.lon},${b.lat}&geometryFormat=geojson`+
              (sansP ? `&constraints=${encodeURIComponent('{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}')}` : '');
    const r = await fetch(u);
    if(!r.ok) throw new Error('calcul d\'itinéraire indisponible');
    const j = await r.json();
    const pts = j.geometry.coordinates;
    const pas = Math.max(1, Math.round(pts.length/400));   // ~400 points suffisent
    ROUTE = pts.filter((_, i) => i % pas === 0);
    if(ROUTE[ROUTE.length-1] !== pts[pts.length-1]) ROUTE.push(pts[pts.length-1]);
    preparerKms();

    if(traceLigne) map.removeLayer(traceLigne);
    traceLigne = L.polyline(ROUTE.map(c => [c[1], c[0]]),
      {color:'#1d4ed8', weight:5, opacity:.45}).addTo(map);
    map.fitBounds(traceLigne.getBounds().pad(.08));
    infoT.textContent = `${(j.distance/1000).toFixed(0)} km · ${Math.round(j.duration/60)} min`+
      `${sansP ? ' · sans autoroute' : ''} · ${a.label} → ${b.label}`;
    document.getElementById('effacer').hidden = false;
    charger();
  }catch(e){
    infoT.textContent = e.message;
  }
}
document.getElementById('trajet').onsubmit = calculerTrajet;
// Inverser depart et arrivee = le trajet retour en un clic. Un champ vide vaut
// « ma position » (cf. geocoder), donc l'echange reste juste quand le depart
// est implicite. Trace deja affiche : on relance le calcul, sinon on se
// contente d'echanger les deux champs.
document.getElementById('inverser').onclick = () => {
  const d = document.getElementById('depart'), a = document.getElementById('arrivee');
  [d.value, a.value] = [a.value, d.value];
  if(ROUTE) document.getElementById('trajet').requestSubmit();
};
document.getElementById('effacer').onclick = () => {
  ROUTE = null; KMS = null;
  if(traceLigne){ map.removeLayer(traceLigne); traceLigne = null; }
  document.getElementById('effacer').hidden = true;
  infoT.textContent = '';
  situer(CENTRE[0], CENTRE[1], repere.getTooltip().getContent().split(' —')[0]);
};

document.getElementById('maposition').onclick = () => localiser(false);
document.getElementById('repere').onclick = () => {
  if(Array.isArray(REGL.centre)) situer(REGL.centre[0], REGL.centre[1], 'Point de repère');
};
map.on('contextmenu', e => situer(e.latlng.lat, e.latlng.lng, 'Point de repère'));

// Cadrage initial deterministe (~10 km autour du repere de depart). On n'utilise plus
// fitBounds : Leaflet y fige le zoom sur la taille du conteneur au moment de
// l'appel, et une mise en page pas encore stabilisee (hauteur en vh, polices,
// defilement restaure au rechargement) donnait un cadrage de travers dans
// Firefox — constate le 09/08/2026.
if(REGL.sansCher === false) document.getElementById('sansCher').checked = false;
if(REGL.couloir) document.getElementById('couloir').value = REGL.couloir;
if(REGL.queUtiles === false) document.getElementById('queUtiles').checked = false;
if(REGL.sansPeage) document.getElementById('sansPeage').checked = true;
appliquerVeh();

map.invalidateSize(false);
map.setView(CENTRE, ZOOM0);

// Le referentiel (60 km) part en parallele du premier chargement : la carte
// s'affiche sans l'attendre, puis se recolore des qu'il arrive.
async function chargerReferentiel(){
  const w = encodeURIComponent(
    `distance(geom, geom'POINT(${CENTRE[1]} ${CENTRE[0]})', 60km)`);   // secteur courant
  let rows=[], off=0, tot=1;
  while(off < tot && off < 600){
    const r = await fetch(`${URL_API}?where=${w}&select=${SEL}&limit=100&offset=${off}`);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    tot = j.total_count; rows = rows.concat(j.results); off += 100;
  }
  REF_ROWS = normalise(rows);
}
chargerReferentiel().then(rendu).catch(() => {});
charger();          // on affiche tout de suite, sans attendre l'autorisation
localiser(true);    // puis on recentre sur l'appareil si l'utilisateur accepte
</script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    # Centre de Paris par defaut : ne sert QU'AU SNAPSHOT hors-ligne embarque —
    # aucun role de repere dans la page (regle : zero coordonnee personnelle en
    # dur, geolocalisation d'abord). --lat/--lon pour un repli local.
    ap.add_argument("--lat", type=float, default=48.8566)
    ap.add_argument("--lon", type=float, default=2.3522)
    ap.add_argument("--nom", default="")   # plus utilise dans la page
    ap.add_argument("--rayon", type=int, default=25, help="rayon interroge (km)")
    ap.add_argument("--out", default=None)  # defaut : ~/Documents/fuelpilot.html
    ap.add_argument("--open", action="store_true",
                    help="ouvrir la page dans le navigateur par defaut")
    a = ap.parse_args()

    out = a.out or os.path.expanduser("~/Documents/fuelpilot.html")

    rows = snapshot(a.lat, a.lon, a.rayon)
    html = HTML
    for token, (name, sri) in LEAFLET.items():
        html = html.replace(token, leaflet_inline(name, sri))
    for token, val in (("__LAT__", repr(a.lat)), ("__LON__", repr(a.lon)),
                       ("__NOM__", a.nom), ("__RAYON__", str(a.rayon)),
                       ("__SELECT__", SELECT), ("__API__", API),
                       ("__SNAPDATE__", datetime.now().strftime("%d/%m/%Y %H:%M")),
                       ("__SNAP__", json.dumps(rows, ensure_ascii=False))):
        html = html.replace(token, val)
    html = html.replace("__CSP__", csp_meta(html))   # en dernier : empreintes du HTML final

    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{out} — {len(rows)} stations dans le snapshot de repli")

    if a.open:
        webbrowser.open("file://" + out)
        print("ouvert dans le navigateur")


if __name__ == "__main__":
    main()
