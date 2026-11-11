# Banc de non-régression « 10 trajets »

Le 26/10/2026, un banc **manuel** de dix trajets a trouvé quatre défauts que les tests unitaires de
`src/plan.js` ne pouvaient pas voir, parce qu'ils naissent dans la chaîne complète (géocodage,
itinéraire, chargement des stations du couloir, choix des candidates, rendu du plan) : station
muette depuis plus de 21 jours proposée ; plein d'arrivée sur un prix figé sans alerte ; carburant à
bord valorisé différemment selon la largeur de couloir ; message « détour nécessaire » hors du vrai
cas. Ce dossier rend ce banc **rejouable en tests automatiques, sans réseau**.

## Principe : deux modes

```
enregistre.js  (hors cloud, réseau réel)        rejeu.test.js / rejeu.js  (partout, sans réseau)
┌──────────────────────────────┐                ┌──────────────────────────────────────┐
│ page générée + #trajet=…     │                │ page générée + #trajet=…             │
│ Chromium headless            │                │ Chromium headless, horloge figée     │
│ chaque réponse des API  ─────┼─► fixtures/ ──►┼─ chaque requête servie depuis       │
│ (géocodage, itinéraire,      │   <slug>/      │   la fixture ; hors fixture = échec  │
│  flux des prix) enregistrée  │                │ plan lu par window.__viaminus_plan   │
│ plan obtenu → attendu.json   │                │ règles métier + déterminisme + fidélité│
└──────────────────────────────┘                └──────────────────────────────────────┘
```

- **Point d'accès de test** (`src/app.js`, `publierPlan`) : après chaque `rendu()` d'un trajet, le
  plan est publié **en données** dans `window.__viaminus_plan` (et l'événement `viaminus:plan`) :
  stations retenues avec id, km, litres, prix et date du prix ; coût total ; économie ; les cinq
  largeurs comparées ; messages et alertes affichés. Inerte pour l'utilisateur : ni DOM, ni réseau,
  ni donnée personnelle. Aucune lecture de pixels.
- **Hôtes** : les API (`data.economie.gouv.fr`, `api-adresse.data.gouv.fr`, `data.geopf.fr`
  géocodage et navigation, `valhalla1.openstreetmap.de`) sont enregistrées et rejouées. Le **fond de
  carte** (style vectoriel, tuiles, glyphes, OSM de secours) est **hors banc** : jamais enregistré,
  coupé au rejeu sans faire échouer le test, le plan n'en dépend pas. Tout autre hôte = échec.
- **Horloge** : au rejeu, `Date` est figé à `meta.date` (date de l'enregistrement) : « prix figé
  depuis 14 jours », seuil des ruptures (90 jours) et âge des prix se jugent à cette date.
- **Clé d'une réponse** : URL normalisée (hôte + chemin + paramètres décodés, triés).
- `generate.py` reste le seul build de la page (`--sans-snapshot`, sortie dans un dossier
  temporaire) ; `src/plan.js` reste pur.

## Prérequis

- Node ≥ 20, Python 3, et MapLibre dans `~/.cache/fuelpilot/` (téléchargé par `generate.py` ;
  sans accès à unpkg : `npm pack maplibre-gl@5.24.0` puis copier `package/dist/maplibre-gl.{js,css}`
  dans ce cache, les empreintes SHA-384 de `generate.py` sont vérifiées).
- Playwright + Chromium : `cd banc && npm install && npx playwright install chromium`. C'est la
  seule dépendance npm du dépôt, déclarée dans `banc/package.json` seulement. Un Playwright déjà
  installé globalement (`require('playwright')` résolu) convient aussi.

## Rejouer

```bash
node --test src/*.test.js banc/*.test.js     # tout : modules purs + règles du banc + rejeu des fixtures
node --test banc/*.test.js                   # le banc seul (Node 22 n'accepte pas un dossier nu)
```

Pour chaque dossier de `banc/fixtures/` ayant un `meta.json`, le rejeu vérifie :

| Règle (commune à tous les scénarios) | seuil |
|---|---|
| toutes les requêtes réseau sont servies depuis la fixture (aucune manquante, aucun hôte inconnu) | — |
| aucune station retenue (départ, étapes, arrivée) dont le prix du carburant choisi date de plus de **21 jours** à la date de l'enregistrement | `MUET_JOURS` |
| un plein d'arrivée dont le prix date de plus de **14 jours** porte une alerte | `ARRIVEE_JOURS` = `FIGE_J` |
| le carburant à bord au départ est valorisé **une seule fois, au même prix**, quelle que soit la largeur de couloir (les cinq largeurs comparées) | ½ centime |
| le message « détour nécessaire » n'apparaît que si le détour minimal dépasse **2 km** (et il apparaît quand un seul choix reste au-delà) | `SANS_DETOUR_KM` |
| le coût total égale la somme des pleins (carburant à bord + achats aux étapes) | ½ centime |
| l'économie annoncée est non négative | ½ centime |
| le total du plan (dernière abscisse du tracé) égale la distance annoncée par le service d'itinéraire | 0,5 % (`TOL_DISTANCE`) |
| le plan est identique entre deux rejeux (déterminisme) | égalité stricte |
| le plan rejoué est celui enregistré (`attendu.json`, résumé arrondi) | égalité stricte |

Les règles vivent dans `regles.js` (une fonction nommée par règle, qui renvoie la liste des
manquements) et sont elles-mêmes testées sans navigateur dans `regles.test.js`.

## Lire un échec

```bash
node banc/rejeu.js paris-lyon            # requêtes servies / manquantes, plan résumé, verdict par règle
node banc/rejeu.js paris-lyon --brut     # le plan complet (candidats, largeurs, alertes…)
```

Un échec donne la règle en clair, puis chaque manquement avec la station, son id, son km, la date
du prix et l'âge à la date de l'enregistrement. Exemple réel (fixture synthétique Paris → Lyon,
`e10_maj` de Beaune reculé au 25/09) : Beaune devient « prix figé » (ses autres carburants restent
frais), le plan l'évite et retient Chalon-sur-Saône, muette sur **tous** ses carburants, que le code
du 30/10/2026 ne détecte pas — c'est le défaut n° 1 du banc manuel du 26/10 :

```
ÉCHEC aucune station retenue dont le prix du carburant choisi date de plus de 21 jours
      - étape 1 : Chalon-sur-Saône (station 71100001, km 250) retenue avec un prix e10 du 2026-09-25T08:30:00 (35 j à la date de l'enregistrement 2026-10-30)
ÉCHEC fidélité à attendu.json
      - etapes.0.id : "21200001" ≠ "71100001"
      …
```

Une requête **manquante** signifie que l'application demande quelque chose que la fixture n'a pas :
soit le code a changé sa façon d'interroger les API (nouvelle emprise, nouveau paramètre), soit la
fixture est incomplète — réenregistrer le scénario. Un échec de **fidélité** à `attendu.json` avec
toutes les règles vertes signale un changement de plan : s'il est voulu, régénérer
`attendu.json` (`node banc/rejeu.js <slug> --attendu`) et le relire dans la revue.

## Enregistrer (hors cloud, là où les API sont joignables)

```bash
node banc/enregistre.js --liste                                   # les scénarios et leur état
node banc/enregistre.js --scenario montpellier-orleans            # un scénario de scenarios.json
node banc/enregistre.js --tous                                    # tous ceux sans fixture
node banc/enregistre.js "Montpellier > Orléans" --veh polo-e85    # à la main : « A > B », « A ⇄ B »
node banc/enregistre.js "Lodève > Orléans" --veh polo-e85 --abord 80       # réservoir au départ (km ; --litres)
node banc/enregistre.js "Montpellier > Toulouse" --veh gazole --sans-peage --couloir 10 --slug mon-slug --ecraser
```

Écrit `fixtures/<slug>/` : `meta.json` (date, scénario, fiche véhicule, URL `#trajet=`, liste des
réponses avec statut, type et SHA-256, empreinte globale), `reponses/NN-<api>-<détail>.json` (une
réponse par fichier, JSON lisible) et `attendu.json` (plan obtenu, résumé). Les réponses en erreur
(HTTP 404 de l'IGN par exemple) sont enregistrées telles quelles : le rejeu reproduit alors le
repli de l'application (Valhalla). Sans réseau, la commande échoue proprement (« réseau
indisponible », code 2) et n'écrit rien.

Les fiches véhicule de `vehicules.json` (`polo-e85`, `honda`, `e10`, `spmin`, `gazole`, `gplc`) sont
des **valeurs de travail**, sans source : ajustez-les avant d'enregistrer, la fiche utilisée est
copiée dans `meta.json`. Un véhicule peut aussi être donné au format du lien :
`--veh "Nom|e85|7.5|45|30|550"`.

## Ajouter un scénario

1. Ajouter une ligne à `scenarios.json` (`slug`, `depart`, `arrivee`, `veh`, et au besoin
   `couloir`, `sansPeage`, `allerRetour`, `aBord` + `aBordUnite`). Les trajets sont des villes :
   aucune coordonnée personnelle.
2. `node banc/enregistre.js --scenario <slug>` hors cloud.
3. `node banc/rejeu.js <slug>` : lire le plan et les règles ; si une règle rougit sur un défaut réel
   de l'application, la fixture est précieuse — garder la fixture, corriger l'application, puis
   `--attendu`.
4. Commiter le dossier `fixtures/<slug>/`.

Les dix scénarios attendus (26/10/2026) sont déjà dans `scenarios.json` : Montpellier → Orléans
(Polo E85), Lodève → Orléans avec 80 km au départ, Montpellier → Paris (Honda), Paris ⇄ Lyon,
Montpellier → Toulouse sans péage (gazole), Lyon → Marseille (SP le moins cher), Bordeaux → Nantes
(E10, 120 km au départ), Montpellier → Aniane, Strasbourg → Lille (gazole), Perpignan → Bordeaux
(GPLc). Leurs fixtures réelles sont à enregistrer hors cloud.

## Fixtures synthétiques (`paris-lyon`, `montpellier-aniane`)

Fabriquées à la main pour que le banc soit testable sans aucune API : `meta.json` porte
`"origine": "synthetique"`, les réponses de géocodage et d'itinéraire sont au format réel (champs
minimaux), et le flux des prix est **émulé** à partir de `stations.json` (liste de stations au
format réel du flux) par `lib/flux.js`, qui applique la clause `where` de la requête (`in_bbox`,
`distance`, `x_prix is not null`, ruptures), `select`, `order_by`, `limit`, `offset`. Chaque fixture a un
`LISEZMOI.md` qui dit quelle station exerce quelle règle (station muette, prix figé, rupture,
détour nécessaire). Les fixtures **enregistrées** n'utilisent pas l'émulation : leurs réponses sont
rejouées telles quelles.

## Limites connues

- Le fond de carte et la géolocalisation ne font pas partie du banc (contexte neuf : aucune
  position, repère France entière, titre inchangé).
- Node 22 : `node --test` veut des fichiers (`banc/*.test.js`), pas un dossier.
- Les fixtures enregistrées dépendent de la façon dont l'application interroge les API : changer
  les emprises, le `select` ou le moteur d'itinéraire oblige à réenregistrer (le test le dit :
  requête manquante).
- Les deux fixtures synthétiques sont construites pour que le code du 30/10/2026 les passe ; ce
  sont les fixtures réelles qui diront si les quatre défauts du 26/10 sont corrigés.
