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
    inline (pas de 'unsafe-inline'), connect-src borne aux trois API publiques et a
    la page elle-meme ('self' : controle de version).
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
            "connect-src 'self' https://data.economie.gouv.fr https://data.geopf.fr "
            "https://api-adresse.data.gouv.fr; "
            "base-uri 'none'; form-action 'self'\">")


SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")


def lire(nom):
    with open(os.path.join(SRC, nom), encoding="utf-8") as f:
        return f.read()


def assembler():
    """Le gabarit vit dans src/ (index.html, app.css, plan.js, app.js) ; le
    livrable reste UN fichier : tout est inline ici, dans cet ordre. plan.js
    (algorithme des pleins) precede app.js pour rester testable seul (node)."""
    html = lire("index.html")
    html = html.replace("__APP_CSS__", lire("app.css").rstrip("\n"))
    html = html.replace("__APP_JS__", lire("plan.js").rstrip("\n") + "\n\n" + lire("app.js").rstrip("\n"))
    return html


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
    html = assembler()
    for token, (name, sri) in LEAFLET.items():
        html = html.replace(token, leaflet_inline(name, sri))
    for token, val in (("__LAT__", repr(a.lat)), ("__LON__", repr(a.lon)),
                       ("__NOM__", a.nom), ("__RAYON__", str(a.rayon)),
                       ("__SELECT__", SELECT), ("__API__", API),
                       ("__SNAPDATE__", datetime.now().strftime("%d/%m/%Y %H:%M")),
                       ("__BUILD__", datetime.now().strftime("%Y%m%d-%H%M%S")),
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
