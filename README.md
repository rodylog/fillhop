# ⛽ FuelPilot

Carte des prix des carburants en France **avec planification optimale des pleins**,
dans **un seul fichier HTML** partageable — sans compte, sans serveur, sans tracker.

## Ce que ça fait

- **Prix en direct** : flux instantané officiel du ministère de l'Économie
  (déclaration obligatoire des stations, mise à jour ~10 min), rechargé à chaque
  ouverture et à chaque déplacement de la carte.
- **Garage multi-véhicules** : chaque véhicule a sa fiche (carburants, conso,
  réservoir, réserve en km), mémorisée dans le navigateur. Import/partage d'une
  fiche par l'URL : `fuelpilot.html#veh=Nom|e85+e10|6.5|50|30`.
- **Plan de pleins optimal** (problème de la station-service, programmation
  dynamique avant/arrière) : où s'arrêter en partant plein, détours facturés en
  carburant ET en minutes, pénalité par arrêt, coût du voyage complet,
  comparatif selon la largeur du couloir, « plein du retour ».
- **Itinéraire** : géocodage Base Adresse Nationale + tracé Géoplateforme IGN,
  option **sans péage** (moteur `bdtopo-pgr`, autoroutes exclues), couloir
  1-20 km, les stations suivent le zoom ; flèche **⇄** entre les deux champs pour
  inverser départ et arrivée (trajet retour recalculé d'un clic).
- **Sécurité** : toute chaîne venue de l'extérieur (flux des stations, URL `#veh=`)
  est échappée à l'ingestion ; Content-Security-Policy calculée à la génération
  (scripts autorisés par empreinte SHA-256, pas d'`unsafe-inline`, `connect-src`
  borné aux trois API publiques). Rien ne s'exécute côté serveur : un fichier
  statique servi en https suffit.
- **Lisibilité** : bleu = le moins cher affiché (ex æquo compris), rouge = les
  10 % les plus chers du secteur, stations en **rupture** écartées, dates de
  relevé dans chaque bulle (rouge au-delà de 4 jours).
- **Position** : géolocalisation de l'appareil (contexte sécurisé requis —
  servir en https), clic droit pour poser le repère, `#pos=lat,lon` par l'URL.
  Aucune coordonnée personnelle embarquée.

## Usage

```bash
./generate.py            # écrit ~/Documents/fuelpilot.html
./generate.py --open     # puis l'ouvre dans le navigateur
```

Le fichier généré est autonome (Leaflet embarqué, empreintes SHA-384 vérifiées) ;
seul le chargement des prix, des tuiles et du géocodage passe par le réseau.

## Sources et licences

- Prix : [data.economie.gouv.fr](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/) (Licence Ouverte).
- Fonds de carte : Plan IGN / orthophotos (Géoplateforme), Carto (repli).
- Itinéraires : Géoplateforme IGN. Géocodage : Base Adresse Nationale.
- [Leaflet](https://leafletjs.com) (BSD-2). Code : MIT.

## Limites connues

- France uniquement (multi-pays étudié : Espagne intégrable — API ouverte CORS `*` ;
  Italie sans CORS ; Allemagne à clé personnelle).
- `file://` : Firefox y refuse la géolocalisation et cloisonne le stockage par
  fichier — héberger en https règle les deux.
- 400 stations chargées par zone au maximum (annoncé à l'écran quand ça tronque).
