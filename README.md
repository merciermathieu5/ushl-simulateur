# Simulateur de match USHL

Rejoue sur une patinoire animée un match de la ligue USHL ([ushl.ca](https://ushl.ca)) à partir de son sommaire FHL : buts, pénalités, tirs, avantages numériques et joueurs sur la glace.

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

Pendant la lecture :

- barre d'espace : lecture ou pause ;
- flèches gauche et droite : reculer ou avancer de 15 secondes ;
- boutons « précédent » et « suivant » : sauter d'un événement à l'autre ;
- cliquer sur un événement du **Déroulement** ramène juste avant ce moment.

Le dernier sommaire et les derniers trios utilisés sont gardés dans le navigateur (stockage local) et réapparaissent à la prochaine visite.

## Mettre à jour les trios

Les trios servent à placer les bons joueurs ensemble sur la glace. Les joueurs absents des trios (échanges, rappels) sont placés selon leur temps de glace.

### Option 1 : coller les trios dans la page (pour vous seulement)

1. Sur ushl.ca, ouvrez la page **Team Lines** (`USHL22Lines.html`).
2. Copiez toute la page (Ctrl+A puis Ctrl+C), en texte ou en code HTML.
3. Dans le simulateur, cliquez sur **Vider les trios**, puis collez dans le champ **Trios de la ligue**.
4. Lancez un match : les trios collés sont enregistrés dans votre navigateur et seront réutilisés automatiquement.

### Option 2 : mettre à jour l'instantané du dépôt (pour tout le monde)

L'instantané intégré est utilisé par toute personne qui n'a jamais collé ses propres trios. Il se trouve dans `data/lines-snapshot.js`.

1. Ouvrez la page **Team Lines** sur ushl.ca et affichez son code source (Ctrl+U), puis copiez tout.
2. Dans `data/lines-snapshot.js`, remplacez tout le texte situé entre les deux accents graves de ``String.raw`...` `` par le code copié. Ne touchez pas aux accents graves eux-mêmes.
3. Mettez à jour la date affichée dans `LINES_SNAPSHOT_DATE`, par exemple `"25 oct. 2026"`.
4. Validez (commit) et poussez la modification : GitHub Pages publie la nouvelle version.

Le texte collé ne doit contenir ni accent grave (`` ` ``) ni la suite `${`. Les pages générées par FHL n'en contiennent pas.

À noter : si vous avez déjà collé des trios vous-même (option 1), votre version enregistrée a priorité sur l'instantané. Pour revenir à l'instantané, effacez les données du site dans votre navigateur.

## Structure du projet

```
index.html               Page principale (structure HTML seulement)
css/style.css            Styles, thèmes clair et sombre
js/util.js               Données des équipes, traductions, petites fonctions utilitaires
js/parser.js             Lecture du sommaire et de la page des trios (HTML ou texte)
js/game.js               Construction du match : présences, tirs, trajectoire de la rondelle
js/renderer.js           Dessin de la patinoire et des joueurs sur le canvas
js/ui.js                 Interface : formulaire, lecture, tableau, présences, déroulement
data/sample-summary.js   Sommaire du match d'exemple
data/lines-snapshot.js   Instantané de la page « Team Lines »
```

Les scripts sont de simples fichiers JavaScript chargés dans l'ordre par `index.html` (sans modules ni outil de compilation), ce qui permet d'ouvrir le site directement depuis le disque.

## Publication sur GitHub Pages

Dans les paramètres du dépôt, section **Pages**, choisissez la branche `main` et le dossier racine (`/`). Le site est publié tel quel.
