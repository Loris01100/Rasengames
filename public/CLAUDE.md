# Frontend (`public/`)

- `index.html` + `styles.css` — accueil et thème sombre partagé (tokens en variables CSS), plus les styles des composants communs (écran de connexion, lobby, lignes de joueurs, formulaires en ligne) réutilisés par toutes les pages de jeu.
- `games/<slug>/{index.html,style.css,app.js}` — un jeu par dossier, liant la feuille partagée puis la sienne. `app.js` ne contient que les écrans, messages et sons de ce jeu : une fonction `render(state)` qui reconstruit intégralement le DOM de l'écran concerné à chaque message (pas de diffing ni de DOM virtuel — l'état reste assez petit pour que ce soit simple et correct). Les écrans sont des `<section id="screen-*">` basculés par `Room.showScreen(id)` (classe `hidden`).

## `js/room-client.js`

Le global `Room`, chargé avant l'`app.js` de chaque jeu. Il possède le WebSocket et sa reconnexion, l'écran rejoindre/créer, l'identité en localStorage (dix derniers codes par jeu), le badge de salon, le toast, l'entête « changer de jeu », les lignes de joueurs et le lobby : `Room.init({ slug, minPlayers, maxPlayers, onState })`, puis `Room.send/toast/showScreen/playerRow/renderLobby/showSwitchGame`, plus `Room.playerId` / `Room.state` vivants. **Tout ce qui est identique d'un jeu à l'autre va ici**, pas copié dans un neuvième `app.js`.

Il possède aussi la sonde d'existence du salon sur « Rejoindre », la reconnexion immédiate sur `visibilitychange`/`online` (le backoff monte à 30 s et ne doit pas faire attendre celui qui revient — cas mobile classique), et six choses qu'aucun jeu ne connaît :
- le bouton « Règles » du header — contenu pris dans le `<template id="rules">` de la page et déplacé dans un `<dialog>` natif (la top layer passe au-dessus des `.card` sans le contournement de `suggest.js` ; Échap et le fond assombri sont gratuits). `npm test` vérifie que chaque page en porte un.
- le bouton « Revenir au lobby » de l'hôte (envoie `restart`, hors lobby seulement).
- le bouton « copier le lien », construit en JS à côté de `#lobby-code` (`?room=CODE` était déjà géré au chargement).
- l'étiquette de score cumulé (`state.scores`) sur chaque ligne de joueur.
- les deux boutons d'hôte sur les lignes des *autres* joueurs au lobby (`.row-actions`) : « Passer hôte » (envoie `transferHost`, seulement si la cible est connectée) et « Exclure » (`kick`).
- le mode spectateur : une arrivée sans ancien token pendant une partie devient automatiquement spectatrice ; elle voit l'état courant sans entrer dans `players` ni pouvoir envoyer d'action.

## `js/anilist.js`

`Anilist.suggest(text, kind)` (complétion) et `Anilist.setImage(img, name, kind)` (illustration) interrogent graphql.anilist.co **depuis le navigateur du joueur**, avec un cache par onglet. Ça tournait dans le Worker jusqu'à un `403 "You have been manually blocked"` : les Workers partagent quelques IP de sortie qu'AniList blackliste, aucun throttling de notre côté n'y change rien. Depuis le navigateur, chaque joueur utilise sa propre IP et le CORS d'AniList. Les salons ne stockent donc plus d'URL d'image — le client résout l'illustration à partir du nom qu'il affiche déjà.

Quand un joueur choisit une suggestion, l'entrée exacte voyage avec le mot sous forme d'`anilistRef` (`"character:83801"`, validé côté serveur, stocké en `wordRef`/`proposalRef`) et l'emporte sur la recherche par nom : chercher « King » renvoie Lelouch (alias « Black King »), pas le King de Nanatsu no Taizai. Les mots tapés à la main n'ont pas de ref et retombent sur le nom.

`Anilist.exists(name, kind, strict)` (Alphabombe, 1 à 100) répond `found`/`notfound`/`unknown` et échoue *ouvert* sur `unknown` : une vérification rate-limitée ne doit pas figer une partie, ce qui fait du budget de requêtes une partie de la fonctionnalité — la recherche demande personnages et animes en une seule requête, et les deux jeux sautent la vérification quand le mot vient du menu de suggestions. Les mots d'Undercover n'ont aucune ref : images résolues par nom, et seulement pour les catégories `character` et `anime` (AniList n'a pas d'entrée pour un groupe ou un lieu et répondrait « Akatsuki » par un personnage — d'où `wordCategory` dans son `RoomState`). Pas de test en direct (il faudrait le réseau) ; `npm test` bouchonne le point d'entrée.

## `js/suggest.js`

`Suggest.attach(input, kindOf)` accroche un menu sous un champ texte et le remplit via `Anilist.suggest` (3 caractères min, 350 ms de debounce, cache dans la page). Branché sur les champs de personnage de Qui suis-je, Détective et 1 à 100. Délibérément pas de `<datalist>` natif : Firefox ne rafraîchit pas un popup déjà ouvert quand les options sont injectées après la frappe. Le `keydown` est en phase de capture pour que la validation par Entrée passe avant le handler « Entrée = envoyer » du jeu. Le menu liste aussi jusqu'à trois animes ; en ouvrir un (plutôt que le choisir) le remplace par le casting de la série — deux clics pour qui connaît l'anime mais pas l'orthographe ; le titre reste sélectionnable en haut de la liste.

## Pièges

- **CSS / empilement** : chaque `.card` joue `animation: fadeInUp ... both`, et le `transform` retenu de la dernière keyframe fait de chaque carte son propre contexte d'empilement — un popup `position: absolute` dans une carte ne peindra jamais par-dessus la carte *suivante*, quel que soit son `z-index`. `suggest.js` contourne ça avec une classe `.suggest-open` sur la carte hôte tant que le menu est ouvert ; faire pareil pour tout futur popup.
- **Balises de partage** : le lien d'un salon se colle dans une conversation de groupe, donc chaque `index.html` porte ses `og:` (image commune `og.png`, 1200×630) et le favicon `favicon.svg`. `npm test` échoue si une page de jeu en manque.
- **Glisser-déposer de « 1 à 100 »** (`games/hundred/app.js`) : une seule paire d'écouteurs `pointermove`/`pointerup` sur `document`, pas d'écouteurs par carte avec `setPointerCapture` — la capture ne cantonnait pas les événements à une carte dès qu'elle était réinsérée ailleurs dans le DOM en plein geste. Garder ce schéma si on étend cet écran.
