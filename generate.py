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
    ./generate.py --sans-snapshot    # pas d'appel au flux (snapshot de repli vide)
    ./generate.py --signalements-url https://viaminus-signalements.<compte>.workers.dev
                                     # service de signalements « pompe vide » (partie 2) ;
                                     # absent = fonction desactivee, aucun hote ajoute a la CSP

Bibliotheques : MapLibre GL JS (BSD-3) est telechargee une fois dans ~/.cache/fuelpilot
(empreinte SHA-384 verifiee) puis inlinee. Sans reseau, deposer maplibre-gl.js et
maplibre-gl.css (dist/ du paquet npm maplibre-gl, meme version) dans ce cache.
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
# MapLibre GL JS 5.24.0 : derniere branche livree en un seul fichier classique (UMD)
# avec son worker embarque (cree en blob:, d'ou worker-src blob: dans la CSP). La
# branche 6 n'existe qu'en module ESM avec un worker separe, incompatible avec le
# fichier unique. Empreintes relevees sur le paquet npm maplibre-gl@5.24.0 (dist/).
MAPLIBRE_VERSION = "5.24.0"
MAPLIBRE = {
    "__MAPLIBRE_CSS__": (
        "maplibre-gl.css",
        "sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK"),
    "__MAPLIBRE_JS__": (
        "maplibre-gl.js",
        "sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp"),
}
# Scripts du gabarit, dans l'ordre d'assemblage (un seul <script> a la fin de la page).
SCRIPTS = ["plan.js", "conso.js", "irve.js", "bornes.js", "partage.js", "es.js", "lieux.js", "signalements.js",
           "ui/icones.js", "ui/feuilles.js", "ui/fond.js", "ui/assistant.js", "app.js"]
# Service worker (appli installable, hors-ligne, 30/10/2026) : pwa/sw.js = regles pures (testees
# en Node) + corps du worker, assembles ici en UN fichier et commites avec le manifeste et les
# icones (pwa/) ; le script de publication les copie a cote de la page. Rien n'est inline dans
# la page : le worker est un fichier a part, enregistre par app.js en https seulement.
SW_SCRIPTS = ["pwa-strategie.js", "sw.js"]
# Espagne (28/10/2026) : prix du ministere espagnol, charges par province depuis la page
# (src/es.js) ; la table des provinces est inlinee a la place du jeton __ES_PROVINCIAS__.
# Le snapshot de repli embarque reste francais : seul hote nouveau, dans connect-src.
API_ES_HOTE = "https://sedeaplicaciones.minetur.gob.es"


def signalements_url(brut):
    """Service de signalements « pompe vide » (partie 2, 30/10/2026) : URL de base passee par
    --signalements-url, inlinee a la place du jeton __SIGNALEMENTS_URL__ (vide par defaut = fonction
    desactivee, aucune requete, aucun hote dans la CSP). Renvoie (url sans barre finale, origine
    pour connect-src). https obligatoire, aucune interrogation ni fragment, aucun caractere qui
    pourrait refermer la chaine JavaScript ou la balise."""
    from urllib.parse import urlsplit
    if not brut:
        return "", ""
    u = urlsplit(brut.strip())
    if u.scheme != "https" or not u.netloc or u.query or u.fragment or u.username or u.password:
        sys.exit(f"--signalements-url : attendu https://hote[/chemin] sans ?ni #, obtenu {brut!r}")
    if re.search(r"[\s\"'<>\\]", brut):
        sys.exit("--signalements-url : caracteres interdits")
    chemin = u.path.rstrip("/")
    return f"https://{u.netloc}{chemin}", f"https://{u.netloc}"


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


def biblio_inline(name, sri):
    """Inline plutot que CDN : aucune dependance reseau a l'ouverture, donc
    aucune surface de compromission CDN a verifier a chaque chargement."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(_get(f"https://unpkg.com/maplibre-gl@{MAPLIBRE_VERSION}/dist/{name}",
                         raw=True))
    blob = open(path, "rb").read()
    got = "sha384-" + base64.b64encode(hashlib.sha384(blob).digest()).decode()
    if got != sri:
        sys.exit(f"empreinte {name} inattendue :\n  attendu {sri}\n  obtenu {got}")
    text = blob.decode("utf-8")
    assert "</script" not in text and "</style" not in text, f"{name} refermerait sa balise"
    return text


def csp_meta(html, signalements_hote=""):
    """CSP calculee sur le HTML final : script-src par empreinte de CHAQUE script
    inline (pas de 'unsafe-inline'), connect-src borne aux API publiques et a la
    page elle-meme ('self' : controle de version).
    Appli installable (30/10/2026) : worker-src 'self' pour le service worker (sw.js a cote
    de la page) et manifest-src 'self' pour manifest.webmanifest — les deux seuls ajouts.
    MapLibre : son worker est cree depuis un blob: (worker-src ; child-src = repli
    des navigateurs sans worker-src) ; tuiles vectorielles, glyphes et sprites IGN
    sont charges en fetch (connect-src data.geopf.fr), tout comme les tuiles raster
    (orthophoto IGN, OpenStreetMap en secours) : d'ou tile.openstreetmap.org dans
    connect-src, en plus d'img-src. valhalla1.openstreetmap.de : itineraire de
    secours (FOSSGIS) quand la Geoplateforme ne repond pas (vu le 24/10/2026).
    sedeaplicaciones.minetur.gob.es : prix des carburants en Espagne (ministere espagnol,
    donnees ouvertes, CORS *), charges par province quand la carte touche l'Espagne.
    signalements_hote : service de signalements « pompe vide » (--signalements-url), ajoute a
    connect-src SEULEMENT s'il est configure ; sans lui la page ne peut pas le contacter.
    Une chaine tierce (flux des stations, URL #veh=) qui reussirait malgre
    l'echappement a injecter un <script> ne s'executerait pas, et ne pourrait
    rien exfiltrer ailleurs que vers ces hotes."""
    hashes = ["'sha256-%s'" % base64.b64encode(
                  hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode()
              for m in re.finditer(r"<script>(.*?)</script>", html, re.S)]
    assert len(hashes) == html.count("<script"), "chaque script inline doit etre hache"
    assert len(hashes) >= 2, "bibliotheque + application attendues"
    return ('<meta http-equiv="Content-Security-Policy" content="'
            "default-src 'none'; script-src " + " ".join(hashes) + "; "
            "worker-src 'self' blob:; child-src blob:; manifest-src 'self'; "
            "style-src 'unsafe-inline'; "
            "img-src 'self' data: blob: https://data.geopf.fr https://tile.openstreetmap.org; "
            "connect-src 'self' https://data.economie.gouv.fr https://data.geopf.fr "
            "https://api-adresse.data.gouv.fr https://tile.openstreetmap.org "
            "https://valhalla1.openstreetmap.de " + API_ES_HOTE +
            (" " + signalements_hote if signalements_hote else "") + "; "
            "base-uri 'none'; form-action 'self'\">")


SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")


def lire(nom):
    with open(os.path.join(SRC, nom), encoding="utf-8") as f:
        return f.read()


def json_inline(valeur, **options):
    """JSON a inliner dans le <script> de la page (snapshot du flux, table des provinces) :
    une chaine de texte libre (adresse, ville) contenant « </script> » refermerait le script,
    « <!-- » suivi de « <script » empecherait sa fermeture, et un « <script » de plus ferait
    echouer le compte de csp_meta (ou, la balise refermee, y serait hache donc autorise).
    Chaque « < » est donc ecrit \\u003c : la meme chaine pour JavaScript comme pour JSON,
    sans aucune suite de caracteres que le lecteur HTML reconnaisse."""
    return json.dumps(valeur, ensure_ascii=False, **options).replace("<", "\\u003c")


def assembler_sw():
    """pwa/sw.js : les regles (src/pwa-strategie.js, pures, globales dans le worker) puis le
    corps (src/sw.js), dans un seul fichier, comme la page. Ecrit seulement s'il change."""
    texte = "\n\n".join(lire(n).rstrip("\n") for n in SW_SCRIPTS) + "\n"
    chemin = os.path.join(os.path.dirname(SRC), "pwa", "sw.js")
    actuel = open(chemin, encoding="utf-8").read() if os.path.exists(chemin) else None
    if actuel != texte:
        os.makedirs(os.path.dirname(chemin), exist_ok=True)
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(texte)
    return chemin, len(texte.encode("utf-8"))


def assembler():
    """Le gabarit vit dans src/ (index.html, app.css, plan.js, conso.js, irve.js, bornes.js,
    partage.js, ui/*.js, app.js) ; le livrable reste UN fichier : tout est inline ici, dans
    l'ordre de SCRIPTS. plan.js (algorithme des pleins et du plan de charge), conso.js, irve.js
    (bornes de recharge), bornes.js (bornes cote interface) et partage.js (format #veh=)
    viennent en tete pour rester testables seuls (node) ; les modules d'interface (icones,
    feuilles, fond de carte, assistant) precedent app.js qui les utilise.
    Les donnees IRVE (data/irve/*.json, produites par irve_build.py) ne sont PAS
    embarquees : servies a cote de la page, chargees en fetch ('self')."""
    html = lire("index.html")
    html = html.replace("__APP_CSS__", lire("app.css").rstrip("\n"))
    html = html.replace("__APP_JS__", "\n\n".join(lire(n).rstrip("\n") for n in SCRIPTS))
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
    ap.add_argument("--sans-snapshot", action="store_true",
                    help="ne pas interroger le flux : snapshot de repli vide")
    ap.add_argument("--signalements-url", default="",
                    help="URL de base du service de signalements « pompe vide » (https://…) ; "
                         "absente = fonction desactivee, aucun hote ajoute a la CSP")
    a = ap.parse_args()
    sig_url, sig_hote = signalements_url(a.signalements_url)

    out = a.out or os.path.expanduser("~/Documents/fuelpilot.html")

    # Le snapshot n'est qu'un repli hors ligne : si le flux est inaccessible au
    # moment de la generation (reseau filtre, API en panne), la page se genere
    # quand meme, avec un repli vide, et l'avertissement le dit.
    rows = []
    if not a.sans_snapshot:
        try:
            rows = snapshot(a.lat, a.lon, a.rayon)
        except Exception as e:   # urllib, JSON, cle manquante : meme repli
            print(f"avertissement : flux des prix inaccessible ({e}) — "
                  "snapshot de repli vide", file=sys.stderr)
    html = assembler()
    for token, (name, sri) in MAPLIBRE.items():
        html = html.replace(token, biblio_inline(name, sri))
    for token, val in (("__LAT__", repr(a.lat)), ("__LON__", repr(a.lon)),
                       ("__NOM__", a.nom), ("__RAYON__", str(a.rayon)),
                       ("__SELECT__", SELECT), ("__API__", API),
                       ("__ES_PROVINCIAS__", json_inline(json.loads(lire("es-provincias.json")),
                                                         separators=(",", ":"))),
                       ("__SIGNALEMENTS_URL__", sig_url),
                       ("__SNAPDATE__", datetime.now().strftime("%d/%m/%Y %H:%M")),
                       ("__BUILD__", datetime.now().strftime("%Y%m%d-%H%M%S")),
                       ("__SNAP__", json_inline(rows))):
        html = html.replace(token, val)
    assert "__ES_PROVINCIAS__" not in html, "table des provinces espagnoles non inlinee"
    assert "__SIGNALEMENTS_URL__" not in html, "URL du service de signalements non inlinee"
    html = html.replace("__CSP__", csp_meta(html, sig_hote))   # en dernier : empreintes du HTML final

    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{out} — {len(rows)} stations dans le snapshot de repli — "
          f"{os.path.getsize(out) / 1024:.0f} Ko — signalements : "
          f"{sig_url if sig_url else 'desactives (pas de --signalements-url)'}")
    sw, octets = assembler_sw()
    print(f"{sw} — service worker — {octets / 1024:.0f} Ko (a publier a cote de la page avec pwa/)")

    if a.open:
        webbrowser.open("file://" + out)
        print("ouvert dans le navigateur")


if __name__ == "__main__":
    main()
