# Le salon, de bout en bout

Ce qui suit vaut pour les dix jeux : c'est la plomberie commune, décrite une
fois ici plutôt que répétée dans chaque fiche. Le code correspondant vit dans
[src/lib/](../src/lib/) (côté serveur) et
[public/js/room-client.js](../public/js/room-client.js) (côté client).

## Créer, rejoindre, revenir

- **Créer** tire un code de 5 caractères non utilisé dans le namespace du jeu
  (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — ni `0`/`O` ni `1`/`I`). Le premier
  joueur à rejoindre devient l'hôte.
- **Rejoindre** vérifie d'abord que le salon existe (`/api/<slug>/exists/…`),
  puis ouvre le WebSocket et envoie `join` avec le pseudo. Le pseudo fait 4 à
  20 caractères et doit être libre parmi les joueurs connectés du salon.
- **Le lien de partage** `?room=CODE` pré-remplit le code ; un bouton « copier
  le lien » est disponible au lobby.
- **Identité** : rejoindre attribue un `id` et un `token` aléatoires. Le token
  revient dans le message `joined` et le client le garde en `localStorage`,
  indexé par code de salon (dix derniers codes par jeu). Rejoindre avec un
  token connu **rattache le joueur existant** au lieu d'en créer un nouveau —
  c'est ce qui fait qu'un rafraîchissement ou un passage sous tunnel ne coûte
  pas sa place. La reconnexion n'est jamais refusée, mais elle ne peut pas
  reprendre le pseudo d'un autre joueur, même déconnecté (`rejoinName`) : le
  joueur garde alors son ancien pseudo, ou celui-ci suffixé d'un numéro
  (« Naruto 2 ») si un nouveau venu l'a pris entre-temps. La soirée rattache
  les scores par pseudo, deux homonymes s'y partageraient un même score.
- **Une déconnexion ne supprime jamais un joueur** : elle le marque
  `connected: false`. Il garde son rôle, son mot et son score, et les retrouve
  en revenant. Le client se reconnecte automatiquement (backoff jusqu'à 30 s,
  mais immédiatement sur `visibilitychange` et `online` — le cas du téléphone
  qu'on rallume).
- **Un salon abandonné est effacé** : 24 h après la fermeture de sa dernière
  socket (spectateurs compris), sans retour entre-temps, une alarme vide tout
  son stockage. Le code ne répond plus à la sonde `exists` et les tokens gardés
  par les clients ne rattachent plus rien. Une alarme de jeu en cours (mèche,
  chrono, chrono par action, forfait, délai de l'hôte soirée) passe d'abord ; la purge est
  reprogrammée derrière. Vaut aussi pour la soirée.

## L'hôte

L'hôte est le seul à pouvoir démarrer une manche, la relancer, revenir au
lobby, exclure quelqu'un, changer la visibilité du salon ou emmener le groupe
sur un autre jeu. Certains jeux lui confient en plus un rôle d'arbitre
(validation des réponses au Petit Bac et à Qui suis-je, rangement des cartes à
1 à 100, répartition des équipes à Codenames).

- **`transferHost`** : l'hôte passe la main à un joueur connecté, au lobby
  seulement.
- **`kick`** : exclusion, hôte uniquement et au lobby uniquement — une
  exclusion en pleine manche demanderait des réparations de tour et de vote
  propres à chaque jeu, et une déconnexion couvre déjà le cas de quelqu'un qui
  s'en va.
- **Départ subi** : si l'hôte se déconnecte, `reassignHost` désigne
  immédiatement un successeur. Un salon sans hôte est un salon mort.

## Manches, scores, retardataires

- **`scores`** cumule les points sur toutes les manches du salon. Le barème est
  propre à chaque jeu (voir les fiches) ; le score s'affiche à côté du nom de
  chaque joueur.
- **`restart`** (bouton « Revenir au lobby » / « Nouvelle manche ») est accepté
  depuis n'importe quelle phase **sauf** le lobby : c'est aussi la sortie de
  secours de l'hôte quand une manche reste bloquée. Il purge les joueurs
  déconnectés (eux perdent leur score) et fait entrer les joueurs en attente.
- **Arrivée en cours de manche** : quelqu'un qui rejoint alors qu'une manche
  tourne, sans token ou avec un token que le salon ne connaît pas (salon
  recréé, joueur exclu), n'est pas renvoyé créer son propre salon — il devient
  spectateur, hors de `players` et `playerOrder`, en lecture seule. De retour
  au lobby, son client le fait rejoindre comme joueur pour la manche suivante.
  `waiting` ne sert plus qu'à relire les retardataires d'anciens salons
  persistés, que `restart` fait entrer.
- **Pas deux fois le même tirage** : chaque salon garde dans `recentDraws` ce
  qui est déjà sorti et le tirage l'évite tant que le pool le permet — les 40
  dernières paires Undercover, les 15 derniers thèmes de 1 à 100 (seuls ceux
  tirés au hasard, pas ceux saisis par l'hôte), les mots des 4 derniers
  plateaux Codenames, les personnages des 3 dernières grilles de Qui est-ce
  (donc aussi les personnages secrets), les 8 dernières lettres du Petit Bac et
  les 5 dernières de la Bombe (une par tour). Si les filtres de l'hôte
  (catégorie, sources exclues, lettres décochées, mots retirés) laissent moins
  de choix que l'historique, ce sont les tirages les plus anciens qui
  reviennent en premier. L'historique vit dans le salon d'un jeu : il survit
  aux manches et aux `restart`, pas à un `switchGame` (autre salon).
- **`switchGame`** : l'hôte emmène tout le groupe sur un autre jeu. Le serveur
  tire un code neuf dans le jeu cible et redirige tout le monde, sans rien à
  repartager. Pour que l'hôte le reste quel que soit l'ordre d'arrivée, le
  salon d'origine dépose dans le salon cible une clé à usage unique qu'il ne
  transmet qu'à l'hôte (`hostKey`, reprise dans son `join`). Le rôle ne se
  réclame jamais sur simple déclaration du client.
- **`setVisibility`** : privé par défaut, public pour apparaître sur l'accueil.

## Chrono par action

Un joueur parti ne bloque rien (section suivante), mais un joueur *présent* qui
traîne le pouvait : la table attendait son indice, son vote ou sa réponse sans
autre recours que « Revenir au lobby ». Sept jeux proposent donc à l'hôte, au
lobby, un **chrono par action** : désactivé par défaut, ou 30 s, 45 s, 1 min,
1 min 30, 2 min. Le réglage part avec `start` (`stepTimer`, en secondes ; une
valeur hors liste vaut désactivé) et reste celui du salon d'une manche à
l'autre.

- Chaque fois que le salon attend quelqu'un — un tour, un vote, une étape —
  le chrono repart à plein. Un compte à rebours fixe s'affiche en bas d'écran
  chez tout le monde, rouge dans les dix dernières secondes.
- À l'échéance, le jeu tranche **comme si le retardataire était parti** pour
  cette étape : tour sauté, vote clos avec les bulletins déposés, réponse
  vide. Le détail est dans chaque fiche, section « Réglages de l'hôte ».
- Ce qui demande un jugement ou un contenu sans équivalent vide n'est pas
  chronométré : la validation d'une proposition par l'hôte, les réponses
  oui/non de Détective, la saisie des personnages de Qui suis-je ou des
  catégories de Détective, le rangement et les révélations menés à la main.
- Petit Bac, Alphabombe et Qui est-ce ? n'en ont pas : ils ont déjà leur
  propre chrono, mèche ou forfait.
- Le chrono ne court que si un joueur est connecté. Quand le salon se vide,
  il tombe ; le premier joueur qui revient le relance à plein.

Côté code : [src/lib/stepTimer.ts](../src/lib/stepTimer.ts), et dans chaque
salon `stepKey` (l'étape attendue) et `onStepTimeout` (que faire à
l'échéance). La vue envoie `stepTimer` (le réglage) et `stepEndsIn` (le temps
restant en ms, ou `null`).

## Un joueur qui part ne doit jamais figer un salon

C'est la règle qui structure le plus de code dans les `room.ts`. Toute bascule
du type « tout le monde a joué / voté / répondu » est évaluée **à la réception
du message et aussi à chaque déconnexion** : sinon, quand c'est justement le
départ du dernier joueur attendu qui rend la condition vraie, elle n'arrive
jamais. Chaque jeu applique en plus ses propres réparations : passer le tour de
celui qui tient la bombe et s'en va, trancher comme une mauvaise réponse le Mr
White éliminé qui ne devinera plus, sauter le tour d'un chiffreur parti.
