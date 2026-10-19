# Simulateur de match USHL

Rejoue sur une patinoire animée un match de la ligue USHL ([ushl.ca](https://ushl.ca)) à partir de son sommaire FHL : buts, pénalités, tirs, mises en échec, avantages numériques, gardien retiré et joueurs sur la glace. Une feuille de match complète s'affiche au coup de sifflet final.

Le site est 100 % statique : aucune compilation, aucun serveur, aucune dépendance à installer. Tout se passe dans le navigateur et rien n'est envoyé ailleurs.

## Utilisation

- **En ligne** : ouvrez la page GitHub Pages du dépôt.
- **Sur votre ordinateur** : ouvrez simplement `index.html` dans un navigateur (double-clic). Aucun serveur n'est nécessaire.

### Coller un sommaire de match

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

Le moment exact des tirs, des présences et des mises en échec n'est pas dans le sommaire : il est tiré au hasard, mais toujours de la même façon pour un même sommaire. Les totaux, eux, respectent le sommaire.

Le dernier sommaire et les derniers trios utilisés sont gardés dans le navigateur (stockage local) et réapparaissent à la prochaine visite.

## Mettre à jour les trios

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
data/sample-summary.js   Sommaire du match d'exemple
data/lines-snapshot.js   Instantané de la page « Team Lines »
tests/                   Tests automatiques et sommaires de test
.github/workflows/       Exécution des tests sur GitHub à chaque modification
```

Les scripts sont de simples fichiers JavaScript chargés dans l'ordre par `index.html` (sans modules ni outil de compilation), ce qui permet d'ouvrir le site directement depuis le disque.

## Tests

Avec Node.js 22 ou plus récent, sans rien installer :

```
node --test
```

Les tests vérifient la lecture des sommaires et des trios, la construction des matchs (prolongations, 5 contre 3, gardien retiré, changement de gardien, mises en échec) et les liens de partage. Ils s'exécutent aussi sur GitHub à chaque modification.

Le fichier `tests/golden.json` contient l'empreinte du match d'exemple : si une modification change la simulation sans le vouloir, le test échoue. Quand le changement est voulu, régénérez l'empreinte :

```
UPDATE_GOLDEN=1 node --test
```

Les sommaires de test se trouvent dans `tests/fixtures/`.

## Publication sur GitHub Pages

Dans les paramètres du dépôt, section **Pages**, choisissez la branche `main` et le dossier racine (`/`). Le site est publié tel quel.
