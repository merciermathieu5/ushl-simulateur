# Simulateur de match USHL

Rejoue sur une patinoire animée un match de la ligue USHL ([ushl.ca](https://ushl.ca)) à partir de son sommaire FHL : buts, pénalités, tirs, mises en échec, avantages numériques, gardien retiré et joueurs sur la glace. Une feuille de match complète s'affiche au coup de sifflet final.

Les matchs de la ligue arrivent tout seuls : après chaque simulation, un robot GitHub Actions récupère sur ushl.ca les sommaires de la soirée et les trios publiés avec eux. Il n'y a plus rien à copier-coller. Le collage manuel reste offert.

Le site est 100 % statique : aucune compilation, aucun serveur, aucune dépendance à installer. Tout se passe dans le navigateur et rien n'est envoyé ailleurs.

## Utilisation

- **En ligne** : ouvrez la page GitHub Pages du dépôt.
- **Sur votre ordinateur** : ouvrez simplement `index.html` dans un navigateur (double-clic). Aucun serveur n'est nécessaire.

### Matchs de la ligue

La page s'ouvre sur les matchs de la dernière soirée simulée. Les flèches et la liste déroulante passent d'une soirée à l'autre; un clic sur un match le rejoue. **Rejouer les matchs de la soirée** les charge tous : le menu **Match** passe de l'un à l'autre.

Chaque match a son adresse, par exemple `…/ushl-simulateur/#match=USHL22-123` (le 123e match de la saison Y22) ou `#match=USHL22-S2-5` (5e match de la 2e ronde des séries). Le bouton **Copier le lien** donne cette adresse courte.

Sous la patinoire, une note indique d'où viennent les trios :

- **Trios publiés avec cette simulation** : la page « Team Lines » mise en ligne en même temps que le sommaire. C'est le cas normal.
- **Trios approximatifs** : la simulation de plusieurs soirées a été publiée d'un coup, ou le match a été récupéré après une simulation plus récente. Seule la dernière page des trios était disponible.

### Coller un sommaire de match (à la main)

Le lien **Coller un sommaire à la main**, sous les matchs de la ligue, ouvre le formulaire.

1. Sur ushl.ca, ouvrez la page du sommaire du match (celle qui commence par « ÉQUIPE at ÉQUIPE », par exemple `NEWJERSEY at TORONTO`).
2. Sélectionnez toute la page (Ctrl+A, ou Cmd+A sur Mac), puis copiez (Ctrl+C).
   Vous pouvez aussi copier le code source HTML de la page (Ctrl+U) : les deux formats sont acceptés.
3. Collez le tout dans le champ **Sommaire du match**.
4. Cliquez sur **Lancer le match**.

Le sommaire doit contenir au minimum la ligne « ÉQUIPE at ÉQUIPE » et la section « Player Statistics » des deux équipes. Si un message d'erreur s'affiche, vérifiez que toute la page a bien été copiée.

Pour essayer sans sommaire, cliquez sur **Charger l'exemple**.

### Plusieurs matchs à la fois

Vous pouvez coller plusieurs sommaires à la suite dans le même champ, par exemple toute une soirée de matchs. Un menu **Match** apparaît alors au-dessus du tableau pour passer d'un match à l'autre.

### Partager un match

Pendant un match, le bouton **Copier le lien** copie une adresse qui contient le sommaire et les trios des deux équipes. La personne qui ouvre ce lien voit exactement le même match, sans rien coller. Le lien fonctionne dans les navigateurs récents (Chrome, Edge, Firefox, Safari 16.4 et plus).

Pendant la lecture :

- barre d'espace : lecture ou pause ;
- flèches gauche et droite : reculer ou avancer de 15 secondes ;
- boutons « précédent » et « suivant » : sauter d'un événement à l'autre ;
- cliquer sur un événement du **Déroulement** (ou appuyer sur Entrée) ramène juste avant ce moment.

Les buts, pénalités, fins de période et le pointage final sont aussi annoncés aux lecteurs d'écran.

## Ce que le simulateur reproduit

- **Prolongation** : en saison, une seule prolongation de 20 minutes à 5 contre 5, et le match nul est possible. En séries, les prolongations de 20 minutes se suivent jusqu'au but. Dans le sommaire, chaque nouvel en-tête « Overtime » (ou « Overtime 2 », « 2nd Overtime ») compte comme une prolongation de plus.
- **Gardien retiré** : une équipe qui perd par un ou deux buts en fin de 3e période retire son gardien pour un attaquant de plus. Le gardien est toujours retiré avant un but marqué dans un filet désert (EN).
- **Changement de gardien** : quand une équipe a utilisé deux gardiens, le partant (celui de la page des trios, sinon le premier listé) est remplacé après le dernier but qu'il a accordé, ou à l'entracte le plus proche s'il n'en a accordé aucun.
- **Mises en échec** : la colonne HT de chaque joueur donne ses mises en échec, placées pendant ses présences quand l'adversaire a la rondelle.
- **Temps de glace** : la colonne IT de la feuille de match guide les présences. Le trio (ou la paire) dont les joueurs manquent le plus de temps de glace saute sur la glace. Un joueur déjà bien au-delà de son temps (blessé en cours de match, par exemple) cède sa place au joueur de sa position qui en manque le plus. Sur les 93 matchs des séries Y21, l'écart moyen est de 1,5 minute par joueur (4 minutes avant ce réglage).
- **Trios** : comme dans FHL, un attaquant peut figurer dans deux trios (il joue alors les deux) et les unités spéciales prennent les joueurs exacts de la page des trios, attaquant à la pointe compris.
- **Passes** : sur un but, la deuxième passe touche la rondelle, puis la première, puis le marqueur.

Le moment exact des tirs, des présences et des mises en échec n'est pas dans le sommaire : il est tiré au hasard, mais toujours de la même façon pour un même sommaire. Les totaux, eux, respectent le sommaire, et le temps de glace s'en approche.

Le dernier sommaire et les derniers trios utilisés sont gardés dans le navigateur (stockage local) et réapparaissent à la prochaine visite.

## Récupération automatique des matchs

Le workflow `.github/workflows/matchs.yml` lance `scripts/recuperer.js` :

- aux 20 minutes de 17 h à 2 h (heure de Québec, une heure plus tôt en hiver) et trois fois de jour;
- à la demande : onglet **Actions**, **Matchs de la ligue**, bouton **Run workflow**, par exemple juste après une simulation.

À chaque passage :

1. Le calendrier de la saison (`USHL22Schedule.html`) est demandé au serveur avec la date de la dernière version lue. Tant que la ligue ne publie rien, le serveur répond « rien de neuf » et rien n'est téléchargé. Les calendriers des séries ne sont consultés qu'une fois la saison terminée.
2. Une publication de moins de 10 minutes est laissée au passage suivant : les fichiers d'une simulation n'arrivent pas tous en même temps sur le serveur.
3. Chaque match joué qui manque est récupéré : son sommaire (`USHL22123.html`, `USHL22PLF-R2-5.html` en séries) et, pour ses deux équipes, la page des trios (`USHL22Lines.html`, `USHL22PLFLines.html` en séries). Le match est rejoué une fois avec le moteur du site : un pointage qui ne concorde pas avec le calendrier est signalé.
4. Les matchs sont enregistrés dans `data/auto/` (un fichier par match et la liste `data/auto/index.js`) et commités par le robot. GitHub Pages republie le site.

Un match simulé de nouveau (pointage différent au calendrier) est remplacé. Un sommaire absent est redemandé une fois par heure. La saison suivante (`USHL23Schedule.html`) est détectée toute seule une fois par jour. Rien n'est jamais effacé.

Le site sert parfois une page de vérification anti-robot aux serveurs de GitHub. Le passage s'arrête alors sans rien écrire, avec un avertissement dans l'onglet Actions, et le passage suivant réessaie.

### Mise en marche (une seule fois)

1. Fusionnez ces changements dans `main`.
2. Onglet **Actions** : si GitHub le demande, activez les workflows.
3. Lancez **Matchs de la ligue** avec **Run workflow**. Le premier passage crée `data/auto/index.js`. Avant le premier match de la saison, la page indique simplement qu'aucun match n'est encore simulé.
4. Pour avoir des matchs tout de suite, relancez-le en inscrivant `USHL21` dans le champ **archive** : les 93 matchs des séries Y21 sont importés depuis les archives de ushl.ca. Les trios de ces matchs sont ceux de la fin des séries (marqués approximatifs).

Rien à changer dans les réglages de GitHub Pages. Si le site ne se met pas à jour après un commit du robot, vérifiez **Settings**, **Pages** : la source doit être la branche `main`.

GitHub met en pause un workflow planifié après 60 jours sans activité dans le dépôt (l'été, par exemple). Il suffit alors de le réactiver dans l'onglet **Actions**.

### Réglages

`data/auto/config.json` :

| Clé | Rôle |
|---|---|
| `base` | Dossier des pages FHL de la ligue sur ushl.ca |
| `archive` | Modèle d'adresse des saisons archivées (`{saison}` est remplacé par `USHL21`, par exemple) |
| `saison` | Saison de départ (`USHL22`); la suivante est détectée toute seule |
| `types` | `saison` et `series` |
| `stabilisationMinutes` | Âge minimal d'une publication avant de la lire |
| `maxParPassage` | Nombre maximal de sommaires téléchargés par passage |
| `essaisMax` | Nombre d'essais pour un sommaire absent |

Sur votre ordinateur, avec Node.js 22 : `node scripts/recuperer.js` (options : `--archive USHL21`, `--saison-suivante`, `--reessayer`).

## Mettre à jour les trios

Les matchs de la ligue apportent leurs propres trios : ce qui suit sert au collage manuel.

Les trios servent à placer les bons joueurs ensemble sur la glace. Les joueurs absents des trios (échanges, rappels) sont placés selon leur temps de glace.

### Option 1 : coller les trios dans la page (pour vous seulement)

1. Sur ushl.ca, ouvrez la page **Team Lines** (`USHL22Lines.html`).
2. Copiez toute la page (Ctrl+A puis Ctrl+C), en texte ou en code HTML.
3. Dans le simulateur, cliquez sur **Vider les trios**, puis collez dans le champ **Trios de la ligue**.
4. Lancez un match : les trios collés sont enregistrés dans votre navigateur et seront réutilisés automatiquement.

Le bouton **Revenir à l'instantané** remet les trios intégrés au site.

### Option 2 : mettre à jour l'instantané du dépôt (pour tout le monde)

L'instantané intégré est utilisé par toute personne qui n'a jamais collé ses propres trios. Il se trouve dans `data/lines-snapshot.js`.

1. Ouvrez la page **Team Lines** sur ushl.ca et affichez son code source (Ctrl+U), puis copiez tout.
2. Dans `data/lines-snapshot.js`, remplacez tout le texte situé entre les deux accents graves de ``String.raw`...` `` par le code copié. Ne touchez pas aux accents graves eux-mêmes.
3. Mettez à jour la date affichée dans `LINES_SNAPSHOT_DATE`, par exemple `"25 oct. 2026"`.
   La date qui compte pour comparer les versions est celle de la ligne « As of » de la page copiée.
4. Validez (commit) et poussez la modification : GitHub Pages publie la nouvelle version.

Le texte collé ne doit contenir ni accent grave (`` ` ``) ni la suite `${`. Les pages générées par FHL n'en contiennent pas.

Une personne qui a collé ses propres trios (option 1) garde sa version tant qu'elle est plus récente que l'instantané. Dès que l'instantané du dépôt porte une date « As of » plus récente, il la remplace automatiquement.

## Structure du projet

```
index.html               Page principale (structure HTML seulement)
css/style.css            Styles, thèmes clair et sombre
js/util.js               Données des équipes, traductions, petites fonctions utilitaires
js/parser.js             Lecture du sommaire et de la page des trios (HTML ou texte)
js/game.js               Construction du match : présences, tirs, trajectoire de la rondelle
js/renderer.js           Dessin de la patinoire et des joueurs sur le canvas
js/share.js              Liens de partage (sommaire et trios compressés dans l'adresse)
js/ui.js                 Interface : formulaire, lecture, tableau, présences, déroulement, feuille de match
js/auto.js               Matchs de la ligue : soirées, cartes des matchs, lien direct #match=
data/sample-summary.js   Sommaire du match d'exemple
data/lines-snapshot.js   Instantané de la page « Team Lines »
data/auto/               Matchs récupérés par le robot (config.json se modifie à la main, le reste est généré)
scripts/recuperer.js     Récupération des matchs sur ushl.ca
scripts/fhl.js           Lecture des pages FHL : calendrier, résultats du jour, trios par équipe
scripts/moteur.js        Moteur du site chargé dans Node pour vérifier chaque match récupéré
tests/                   Tests automatiques, sommaires de test et vrais fichiers de la finale Y21
.github/workflows/       Tests à chaque modification (tests.yml) et récupération des matchs (matchs.yml)
```

Les scripts sont de simples fichiers JavaScript chargés dans l'ordre par `index.html` (sans modules ni outil de compilation), ce qui permet d'ouvrir le site directement depuis le disque.

## Tests

Avec Node.js 22 ou plus récent, sans rien installer :

```
node --test
```

Les tests vérifient la lecture des sommaires et des trios, la construction des matchs (prolongations, 5 contre 3, gardien retiré, changement de gardien, mises en échec, temps de glace, passes) et les liens de partage. La récupération automatique est éprouvée contre un faux site ushl.ca bâti avec les vrais fichiers de la finale Y21 (`tests/fixtures/auto/finale-y21/`) : soirée simple, publication en cours, plusieurs soirées d'un coup, match simulé de nouveau, sommaire absent, séries, saison archivée, saison suivante et page anti-robot. Ils s'exécutent aussi sur GitHub à chaque modification.

Le fichier `tests/golden.json` contient l'empreinte du match d'exemple : si une modification change la simulation sans le vouloir, le test échoue. Quand le changement est voulu, régénérez l'empreinte :

```
UPDATE_GOLDEN=1 node --test
```

Les sommaires de test se trouvent dans `tests/fixtures/`.

## Publication sur GitHub Pages

Dans les paramètres du dépôt, section **Pages**, choisissez la branche `main` et le dossier racine (`/`). Le site est publié tel quel.
