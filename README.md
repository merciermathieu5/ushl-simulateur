# Simulateur de match USHL

Rejoue sur une patinoire animée un match de la ligue USHL ([ushl.ca](https://ushl.ca)) à partir de son sommaire FHL, à la manière des suivis de match en ligne : la rondelle passe de joueur en joueur, les équipes sortent de leur zone, entrent en zone adverse et tirent, chaque arrêt de jeu est suivi d'une mise au jeu au bon endroit. Buts et passes décisives, tirs de chaque joueur, pénalités, mises en échec, hors-jeu, dégagements refusés, avantages numériques, gardien retiré et joueurs sur la glace (avec leur numéro). Un déroulement détaillé et des statistiques en direct accompagnent la patinoire; la feuille de match complète s'affiche au coup de sifflet final.

Les matchs de la ligue arrivent tout seuls : après chaque simulation, un robot GitHub Actions récupère sur ushl.ca les sommaires de la soirée, les trios et les alignements (numéros de chandail) publiés avec eux. Il n'y a plus rien à copier-coller. Le collage manuel reste offert.

Le site est 100 % statique : aucune compilation, aucun serveur, aucune dépendance à installer. Tout se passe dans le navigateur et rien n'est envoyé ailleurs.

## Utilisation

- **En ligne** : ouvrez la page GitHub Pages du dépôt.
- **Sur votre ordinateur** : ouvrez simplement `index.html` dans un navigateur (double-clic). Aucun serveur n'est nécessaire.

### Matchs de la ligue

La page s'ouvre sur les matchs de la dernière soirée simulée. Les flèches et la liste déroulante passent d'une soirée à l'autre; un clic sur un match le rejoue. **Rejouer les matchs de la soirée** les charge tous : le menu **Match** passe de l'un à l'autre.

Les pointages restent cachés tant que le match n'a pas été vu jusqu'au bout : la carte indique « À voir » et la ligne du temps ne montre pas les buts. Une fois le match terminé, son pointage apparaît. Le bouton **Afficher les pointages** les montre tous (et **Cacher les pointages** les cache de nouveau).

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

- chaque coup de sifflet arrête l'animation un instant : la ligne en cause s'allume (ligne bleue d'un hors-jeu, ligne des buts d'un dégagement refusé), les joueurs gagnent leur place et la rondelle est portée au point de mise au jeu ;
- le **Déroulement** montre tout le jeu (mises au jeu, tirs, arrêts, mises en échec, revirements) ou seulement les **Faits saillants** (buts, pénalités, fins de période) ;
- **Sur la glace** donne le numéro de chaque joueur et ses tirs jusqu'ici; **Statistiques du match** compare les deux équipes en direct ;
- barre d'espace : lecture ou pause ;
- flèches gauche et droite : reculer ou avancer de 15 secondes ;
- boutons « précédent » et « suivant » : sauter d'un événement à l'autre ;
- cliquer sur un événement du **Déroulement** (ou appuyer sur Entrée) ramène juste avant ce moment.

Les buts, pénalités, fins de période et le pointage final sont aussi annoncés aux lecteurs d'écran.

## Ce que le simulateur reproduit

Le sommaire FHL donne les buts (avec leurs passes), les pénalités, les tirs et les mises en échec de chaque joueur, son temps de glace et les tirs par période. Le simulateur en tire une trame de jeu complète, en suivant les conventions du hockey (règles de la LNH) :

- **Tirs** : chaque joueur a exactement le nombre de tirs de la feuille de match, répartis selon les tirs de son équipe à chaque période et pris pendant ses présences (un peu plus en avantage numérique). Jamais de tir au but contre un filet désert, sauf le but lui-même. Sur une feuille modifiée à la main dont les totaux ne concordent pas, les totaux par période l'emportent et le diagnostic le signale.
- **Jeu** : le match est calculé dix fois par seconde et chaque joueur décide seul, selon la situation. Le porteur patine vers l'espace libre, passe, contourne son filet, protège la rondelle le long de la bande, la lance au fond ou la ressort de sa zone. Ses coéquipiers prennent une place libre (derrière le filet, le long de la bande, l'enclave, devant le filet, la pointe) ou un couloir en zone neutre, chacun à sa profondeur, et se croisent parfois. L'adversaire presse le porteur, couvre l'enclave et les pointes ou se replie. Chaque joueur a sa vitesse (cote SP), son contrôle de rondelle et sa force, et un tempérament : plus ou moins audacieux, créatif ou vif. La rondelle a sa propre physique : passes interceptées ou ratées, rondelle qui longe la bande et contourne le filet, rebonds, tirs bloqués ou à côté du filet.
- **Patinage** : les joueurs patinent en courbe. Celui qui doit revenir sur ses pas tourne en arc au lieu de s'arrêter net pour repartir, et le jeu sans urgence (tenir sa place, suivre la montée, se replier) se fait en glissant, sans à-coup quand le joueur change d'idée. Personne ne reste figé : un joueur qui tient sa place y tourne doucement. Celui qui défend ou court à la rondelle réagit tout de suite (il peut freiner sec). Sur les sept matchs de la finale Y21, un joueur n'est figé que 1,6 % du temps de jeu (6,6 % avant ce réglage) et les arrêts nets suivis d'un départ sont cinq fois plus rares (environ 420 par match plutôt que 2 200).
- **Vitesse** : la cote SP de FHL donne à chaque patineur sa vitesse de pointe et son accélération. La médiane de la ligue (SP 77) atteint 26 pi/s; chaque point de SP vaut 0,25 pi/s, de 20 pi/s à SP 50 jusqu'à 32 pi/s à SP 99 (de 25 à 29 pi/s pour la plupart des joueurs). Chacun patine à une fraction de sa propre vitesse selon la situation : le plus rapide gagne les courses à la rondelle, mène la montée, rattrape un adversaire au repli ou s'échappe. Sur les sept matchs de la finale Y21, la vitesse de pointe de chaque patineur suit sa cote (corrélation de 0,94) : 23 pi/s pour le cinquième le plus lent, 27 pi/s pour le plus rapide.
- **Échappée** : un porteur parti seul (entre la ligne rouge et le filet, face au filet, chaque patineur adverse à au moins 8 pi derrière lui, même celui qui s'en va au banc) fonce au filet et tire toujours : ni passe, ni demi-tour, et personne ne lui enlève la rondelle. Il tire d'assez près, ou plus tôt si un adversaire le rattrape, avant un coup de sifflet ou la sirène. S'il reprend son propre retour seul devant le filet, il tire encore. Ses coéquipiers attendent à la ligne bleue qu'il l'ait franchie; un coéquipier déjà en zone en ressort pendant que le porteur l'attend à la ligne (pas de hors-jeu). Quand la feuille de match lui laisse un tir plus tard dans la période, ce tir est avancé à l'échappée : c'est un tir au but (arrêt ou retour), sans rien changer aux totaux du joueur, de l'équipe par période ni du gardien. Sinon, son tir rate le filet de peu ou frappe le poteau. Pour que ce soit rare, un passeur ne lance pas seul devant le gardien un coéquipier à qui la feuille ne laisse plus de tir dans la période. La feuille passe avant : les passes décisives d'un but prévu se font, un coéquipier qui doit tirer dans les secondes qui suivent reçoit la rondelle, et une équipe qui doit tirer bientôt à l'autre bout reprend la rondelle avant que l'échappée commence; tout près du filet, le porteur tire quand même d'abord. Une échappée partie de loin est annoncée dans le déroulement (« Tir en échappée », ou « Échappée » pour un tir à côté ou sur le poteau) et figure parmi les faits saillants. Sur les huit premiers matchs de la saison USHL22 : un peu plus de cinq échappées par match, dont la moitié au filet; environ deux sont parties de loin.
- **Tirs et buts à la seconde près** : un réalisateur discret prépare chaque tir de la feuille de match dans les secondes qui précèdent. L'équipe qui doit tirer reprend la rondelle, monte et s'installe en zone, sans hors-jeu ni dégagement refusé; sur un but, la deuxième passe, puis la première, puis le tir du marqueur. Le gardien immobilise la rondelle ou laisse un retour.
- **Mises au jeu** au point prévu par la règle : au centre en début de période et après un but; dans la zone de l'équipe du gardien qui immobilise la rondelle, du côté du tir; dans la zone de l'équipe pénalisée; dans la zone de l'équipe qui a dégagé illégalement; au point de la zone neutre devant la zone du hors-jeu, du côté où la rondelle a franchi la ligne; en zone neutre quand l'attaque envoie la rondelle hors de la patinoire. Seuls les deux centres entrent dans le cercle : les ailiers sont sur les lignes de mise au jeu, les défenseurs derrière. Une cinquantaine de mises au jeu par match, comme dans la LNH.
- **Hors-jeu** : un attaquant franchit la ligne bleue avant la rondelle, le jeu est arrêté. Lors des autres entrées en zone, aucun attaquant ne devance la rondelle : quand la rondelle ressort de la zone, les attaquants en sortent aussi avant d'y revenir. Le porteur qui veut rester en zone y retient la rondelle à la ligne bleue au lieu d'en ressortir sur sa lancée, et un joueur qui saute sur la glace le fait du côté de la zone neutre. Deux à quatre hors-jeu par match en moyenne.
- **Dégagements refusés** : rondelle lancée de sa moitié de patinoire jusqu'au-delà de la ligne des buts adverse; permis à l'équipe en désavantage numérique.
- **Positions** : repères selon la zone et la possession (relance, transition, défenseurs à la pointe qui glissent avec la rondelle, avantage numérique en 1-3-1, désavantage en boîte, couverture du côté du filet), que chaque joueur adapte à ce qu'il voit.
- **Défense et espacement** : un défenseur ne laisse jamais l'attaquant le plus avancé de son côté filer derrière lui, et la pression sur le porteur se fait à une longueur de bâton, du côté du filet. Un porteur seul devant le filet fonce et tire (voir **Échappée**), sans remettre la rondelle derrière lui. Deux coéquipiers ne visent jamais le même endroit, chacun sort du banc et y rentre à sa place, et personne ne s'installe sur un gardien.
- **Changements** : attaquants et défenseurs changent chacun à leur rythme (un trio reste une quarantaine de secondes sur la glace, une paire un peu plus). Le changement se fait à la mise au jeu ou à la volée, au bon moment : rondelle lancée au fond de la zone adverse, défenseur qui relance, attaquant qui lance la rondelle au fond avant de filer au banc, adversaire qui repart de loin. Une équipe évite de changer pendant que l'adversaire attaque dans sa zone, à moins qu'une présence ne s'étire trop. Chaque remplaçant saute sur la glace quand celui qu'il remplace arrive au banc : une équipe peut se faire prendre en plein changement et accorder une échappée. Les unités spéciales changent d'un bloc.
- **Prolongation** : en saison, une seule prolongation de 20 minutes à 5 contre 5, et le match nul est possible. En séries, les prolongations de 20 minutes se suivent jusqu'au but. Dans le sommaire, chaque nouvel en-tête « Overtime » (ou « Overtime 2 », « 2nd Overtime ») compte comme une prolongation de plus.
- **Gardien retiré** : une équipe qui perd par un ou deux buts en fin de 3e période retire son gardien pour un attaquant de plus. Le gardien est toujours retiré avant un but marqué dans un filet désert (EN).
- **Changement de gardien** : quand une équipe a utilisé deux gardiens, le partant (celui de la page des trios, sinon le premier listé) est remplacé après le dernier but qu'il a accordé, ou à l'entracte le plus proche s'il n'en a accordé aucun.
- **Mises en échec** : la colonne HT de chaque joueur donne ses mises en échec, toutes jouées. De préférence contre la bande, sur le porteur ou celui qui vient de lâcher la rondelle; à défaut, sur un adversaire tout près. Dans les derniers pieds, le joueur fonce droit sur lui au lieu de lui tourner autour.
- **Temps de glace** : la colonne IT de la feuille de match guide les présences. Le trio (ou la paire) dont les joueurs manquent le plus de temps de glace saute sur la glace. Un joueur déjà bien au-delà de son temps (blessé en cours de match, par exemple) cède sa place au joueur de sa position qui en manque le plus. Sur les 93 matchs des séries Y21, l'écart moyen est de 1,5 minute par joueur (4 minutes avant ce réglage).
- **Trios** : comme dans FHL, un attaquant peut figurer dans deux trios (il joue alors les deux) et les unités spéciales prennent les joueurs exacts de la page des trios, attaquant à la pointe compris.
- **Numéros et vitesse** : la page des alignements publiée avec la simulation donne le numéro de chaque joueur (affiché dans sa pastille, à peu près de la taille d'un joueur vu d'en haut) et sa cote SP. Sans cette page (sommaire collé à la main, lien partagé, match d'exemple), la cote vient du relevé de la ligue (`data/vitesses.js`, voir **Cotes de vitesse**); un joueur absent des deux a la cote médiane de la ligue.
- **Ouverture immédiate** : le match s'affiche tout de suite et la suite se calcule pendant qu'on regarde (une seconde environ pour un match complet). Un saut plus loin dans le match attend seulement que le calcul y soit rendu.

Les mises au jeu, hors-jeu, dégagements refusés, revirements et récupérations ne sont pas dans le sommaire FHL : ils sont simulés (marqués d'un astérisque dans les statistiques). Le moment exact des tirs, des présences et des mises en échec non plus : ils sont tirés au hasard, mais toujours de la même façon pour un même sommaire. Les totaux, eux, respectent le sommaire, et le temps de glace s'en approche.

Le dernier sommaire et les derniers trios utilisés sont gardés dans le navigateur (stockage local) et réapparaissent à la prochaine visite.

## Récupération automatique des matchs

Le workflow `.github/workflows/matchs.yml` lance `scripts/recuperer.js` :

- aux 20 minutes de 17 h à 2 h (heure de Québec, une heure plus tôt en hiver) et trois fois de jour;
- à la demande : onglet **Actions**, **Matchs de la ligue**, bouton **Run workflow**, par exemple juste après une simulation.

À chaque passage :

1. Le calendrier de la saison (`USHL22Schedule.html`) est demandé au serveur avec la date de la dernière version lue. Tant que la ligue ne publie rien, le serveur répond « rien de neuf » et rien n'est téléchargé. Les calendriers des séries ne sont consultés qu'une fois la saison terminée.
2. Une publication de moins de 10 minutes est laissée au passage suivant : les fichiers d'une simulation n'arrivent pas tous en même temps sur le serveur.
3. Chaque match joué qui manque est récupéré : son sommaire (`USHL22123.html`, `USHL22PLF-R2-5.html` en séries) et, pour ses deux équipes, la page des trios (`USHL22Lines.html`, `USHL22PLFLines.html` en séries) et celle des alignements (`USHL22Rosters.html`, `USHL22PLFRosters.html` en séries) pour les numéros. Le match est rejoué une fois avec le moteur du site : un pointage qui ne concorde pas avec le calendrier (sommaire pas encore à jour, par exemple) fait reprendre le match plus tard; après trois essais, il est gardé et signalé « À vérifier ».
4. Les matchs sont enregistrés dans `data/auto/` (un fichier par match et la liste `data/auto/index.js`) et commités par le robot. GitHub Pages republie le site.

Un match simulé de nouveau (pointage différent au calendrier) est remplacé. Un sommaire absent est redemandé après 1 h, puis 2 h, 4 h... (24 h au plus entre deux essais). La saison suivante (`USHL23Schedule.html`) est détectée toute seule aux passages de 8 h, 12 h et 16 h (UTC), mais seulement une fois la finale terminée ou la nouvelle saison commencée : des séries en cours ne sont jamais abandonnées. Rien n'est jamais effacé.

Le site sert parfois une page de vérification anti-robot aux serveurs de GitHub, ou ne répond plus. Les sommaires déjà récupérés sont gardés, le reste attend le passage suivant et un avertissement (pas une erreur) s'affiche dans l'onglet Actions. Chaque requête abandonne après 30 secondes sans réponse.

### Mise en marche (une seule fois)

1. Fusionnez ces changements dans `main`.
2. Onglet **Actions** : si GitHub le demande, activez les workflows.
3. Lancez **Matchs de la ligue** avec **Run workflow**. Le premier passage crée `data/auto/index.js`. Avant le premier match de la saison, la page indique simplement qu'aucun match n'est encore simulé.
4. Facultatif : le champ **archive** importe les séries d'une saison archivée sur ushl.ca (par exemple `USHL21`). Inutile en cours de saison : ces matchs s'ajouteraient au menu des saisons à côté de la saison en cours.

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
| `essaisPointage` | Nombre d'essais pour un sommaire dont le pointage ne concorde pas avec le calendrier (3 par défaut) |

Sur votre ordinateur, avec Node.js 22 : `node scripts/recuperer.js` (options : `--archive USHL21`, `--saison-suivante`, `--reessayer`).

## Cotes de vitesse

`data/vitesses.js` donne la cote SP de chaque patineur de la ligue, par équipe. Il est tiré du relevé quotidien des alignements PRO des 32 équipes fait par l'interface des Sharks (`github.com/merciermathieu5/Sharks`, fichier `data/rosters.json`, lui-même relevé sur ushl.ca).

- Le workflow `.github/workflows/vitesses.yml` le relit chaque jour (12 h 23 UTC, après le relevé des Sharks) et le commite seulement si une cote a changé (école de hockey, nouveau joueur, échange). Bouton **Run workflow** de l'onglet Actions pour le faire tout de suite.
- À la main, avec Node.js 22 : `node scripts/vitesses.js` (ou `node scripts/vitesses.js chemin/vers/rosters.json`).

Les matchs de la ligue n'en dépendent pas : ils gardent les cotes de la page des alignements publiée avec leur simulation. Les tests utilisent une copie figée (`tests/fixtures/vitesses.js`), pour que la mise à jour quotidienne ne change pas les matchs des tests.

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
js/game.js               Construction du match : buts, pénalités, gardiens, présences (temps de glace et trios)
js/jeu.js                Simulation du jeu : décisions et patinage de chaque joueur, rondelle, mises au jeu, hors-jeu, changements, tirs à la seconde près
js/renderer.js           Dessin de la patinoire, des joueurs, de la rondelle et de sa trace sur le canvas
js/share.js              Liens de partage (sommaire et trios compressés dans l'adresse)
js/ui.js                 Interface : formulaire, lecture, arrêts de jeu, tableau, présences, déroulement, statistiques
js/auto.js               Matchs de la ligue : soirées, cartes des matchs, lien direct #match=
data/sample-summary.js   Sommaire du match d'exemple
data/lines-snapshot.js   Instantané de la page « Team Lines »
data/vitesses.js         Cote SP de chaque patineur de la ligue (relevé des Sharks, mis à jour chaque jour)
data/auto/               Matchs récupérés par le robot (config.json se modifie à la main, le reste est généré)
scripts/recuperer.js     Récupération des matchs sur ushl.ca
scripts/fhl.js           Lecture des pages FHL : calendrier, résultats du jour, trios et alignements par équipe
scripts/moteur.js        Moteur du site chargé dans Node pour vérifier chaque match récupéré
scripts/vitesses.js      Mise à jour de data/vitesses.js
tests/                   Tests automatiques, sommaires de test et vrais fichiers de la finale Y21
.github/workflows/       Tests à chaque modification (tests.yml), récupération des matchs (matchs.yml), cotes de vitesse (vitesses.yml)
```

Les scripts sont de simples fichiers JavaScript chargés dans l'ordre par `index.html` (sans modules ni outil de compilation), ce qui permet d'ouvrir le site directement depuis le disque.

## Tests

Avec Node.js 22 ou plus récent, sans rien installer :

```
node --test
```

Les tests vérifient la lecture des sommaires et des trios, la construction des matchs (prolongations, 5 contre 3, gardien retiré, changement de gardien, mises en échec, temps de glace, passes) et les liens de partage. Sur les sept vrais matchs de la finale Y21 et les sommaires de test, la trame de jeu est contrôlée (`tests/jeu.test.js`) : tirs exacts de chaque joueur pendant ses présences, passes décisives dans l'ordre, nombre et emplacement des mises au jeu après chaque sorte d'arrêt, alignement des joueurs au moment de la mise au jeu, hors-jeu et entrées en zone, dégagements refusés, porteur et receveur toujours sur la glace, rondelle sans saut. Les jeux étranges sont aussi mesurés (`tests/comportement.test.js`) : échappées rares et jamais terminées par une passe vers l'arrière (sauf, rarement, quand la feuille de match l'impose), joueurs qui ne restent pas collés, patineurs qui ne s'installent pas sur un gardien, presque aucun tir au but de sa propre zone. Et ce qu'on veut voir : l'échappée finit par un tir du porteur (au moins 75 % des cas, 85 % avec les passes que la feuille exige, jamais par une passe que la feuille n'exige pas), un patinage fluide (au plus 3 % du temps figé, au plus 800 arrêts nets suivis d'un départ par match), une vitesse de pointe qui suit la cote SP. Les cotes de vitesse ont leurs propres tests (`tests/vitesses.test.js`) : relevé des Sharks lu par équipe, page des alignements du match d'abord, relevé de la ligue ensuite. Le même sommaire rejoué avec d'autres graines reste fidèle à la feuille; les changements d'attaquants et de défenseurs sont échelonnés, à la mise au jeu comme en plein jeu; toutes les mises en échec de la feuille ont lieu, souvent contre la bande. La récupération automatique est éprouvée contre un faux site ushl.ca bâti avec les vrais fichiers de la finale Y21 (`tests/fixtures/auto/finale-y21/`) : soirée simple, publication en cours, plusieurs soirées d'un coup, match simulé de nouveau, sommaire absent, séries, saison archivée, saison suivante, alignements, page anti-robot (au calendrier, au milieu des sommaires, à la page des trios), pannes du serveur et délai dépassé. Ils s'exécutent aussi sur GitHub à chaque modification.

Le fichier `tests/golden.json` contient l'empreinte du match d'exemple : si une modification change la simulation sans le vouloir, le test échoue. Quand le changement est voulu, régénérez l'empreinte :

```
UPDATE_GOLDEN=1 node --test
```

Les sommaires de test se trouvent dans `tests/fixtures/`.

## Publication sur GitHub Pages

Dans les paramètres du dépôt, section **Pages**, choisissez la branche `main` et le dossier racine (`/`). Le site est publié tel quel.
