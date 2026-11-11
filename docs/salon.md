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
  chrono, forfait, délai de l'hôte soirée) passe d'abord ; la purge est
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
- **`waiting`** : quelqu'un qui rejoint alors qu'une manche tourne n'est pas
  renvoyé créer son propre salon — il est mis de côté, tenu hors de `players`
  et `playerOrder` pour que la manche en cours ne le voie pas, et voit un écran
  d'attente. Il entre à la manche suivante.
- **`switchGame`** : l'hôte emmène tout le groupe sur un autre jeu. C'est un
  simple signal de redirection — le groupe garde son code de salon et pointe
  simplement son WebSocket vers le salon d'un autre jeu, sans avoir à
  repartager un nouveau code.
- **`setVisibility`** : privé par défaut, public pour apparaître sur l'accueil.

## Un joueur qui part ne doit jamais figer un salon

C'est la règle qui structure le plus de code dans les `room.ts`. Toute bascule
du type « tout le monde a joué / voté / répondu » est évaluée **à la réception
du message et aussi à chaque déconnexion** : sinon, quand c'est justement le
départ du dernier joueur attendu qui rend la condition vraie, elle n'arrive
jamais. Chaque jeu applique en plus ses propres réparations : passer le tour de
celui qui tient la bombe et s'en va, trancher comme une mauvaise réponse le Mr
White éliminé qui ne devinera plus, sauter le tour d'un chiffreur parti.
