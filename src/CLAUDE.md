# Backend (`src/`)

## Routage des requêtes (`src/index.ts`)

Un seul handler `fetch` pour tout le site, piloté par le tableau `GAMES` (`{ slug, namespace }`), dérivé de `GAME_NAMESPACES` (`lib/gameSlugs.ts`, seule table slug → namespace du dépôt) :
- `POST /api/<slug>/create` → génère un code de salon unique et le renvoie en JSON.
- `GET /api/<slug>/exists/<code>` → `{ exists }`, transmis au Durable Object du salon. Le client s'en sert avant de rejoindre : un DO naît à la demande, donc sans cette sonde un code mal tapé ouvre un salon fantôme où le joueur attend seul au lieu de recevoir une erreur.
- `GET /ws/<slug>/<code>` → retrouve (ou crée) le DO du jeu par `idFromName(code)` et lui transmet l'upgrade WebSocket.
- Tout le reste tombe dans `env.ASSETS.fetch(request)`, qui sert `public/`.

**Piège du code de salon** : le `fetch()` de `room.ts` extrait le code en prenant le *dernier* segment non vide du chemin, et regarde si l'avant-dernier vaut `exists` pour distinguer la sonde d'un upgrade WebSocket. `src/lib/rooms.ts` doit donc sonder `/<slug>/exists/<code>` (le code en dernier) — mettre `/exists` après le code casse silencieusement l'analyse (déjà arrivé une fois).

## Structure d'un jeu (`src/games/<slug>/`)

Chaque jeu est autonome et suit la même forme (`undercover/` et `hundred/` comme références) :
- `types.ts` — la forme du `RoomState` persisté dans le stockage du DO, plus `createEmptyRoom(code)`.
- `logic.ts` — fonctions pures (attribution des rôles/nombres, conditions de victoire, score), sans dépendance au DO ni aux WebSockets. C'est le seul endroit testé unitairement (`scripts/logic-test.mts`) : y mettre toute règle de jeu non triviale plutôt que de l'inliner dans `room.ts`.
- `room.ts` — la classe Durable Object : un tableau `sessions: {ws, playerId}[]` reconstruit dans le constructeur (`restoreSessions`) et un `RoomState` en cache (`this.room`), lu/écrit via `loadRoom()`/`saveRoom()`. Tout message qui change l'état finit par `saveRoom()` + `broadcast()`. `broadcast()` envoie à chaque socket une vue *personnalisée* via `buildView(room, playerId)` — c'est là que l'information cachée est filtrée par destinataire avant sérialisation.
- Les données statiques du jeu (`words.ts`, `themes.ts`, etc.).

Chaque `room.ts` réimplémente sa propre plomberie session/join/reconnexion/broadcast plutôt que d'hériter d'une classe de base : les sémantiques de tour, de vote et de déconnexion divergent trop. Seul ce qui était *identique à l'octet près* dans les neuf salons a été factorisé (typage générique/structurel, chaque `RoomState` garde sa forme) :
- `lib/session.ts` — `Session`, `acceptSession`/`restoreSessions`/`dispatchMessage`/`dispatchClose` (cf. ci-dessous), `broadcastState`, `sendError`, `nameTaken`, `promoteWaiting`, `kickPlayer`, `switchGame`.
- `lib/host.ts` — `reassignHost` (départ subi) et `transferHost` (l'hôte passe la main à un joueur connecté, message `transferHost`, lobby seulement comme `kickPlayer`), typés sur les trois champs que tout `RoomState` partage.
- `lib/letters.ts` — alphabet, validation et tirage des lettres autorisées (bombe et petit bac : l'hôte décoche des lettres au lobby, la sélection part avec `start` et est stockée dans `letters`).
- `lib/throttle.ts` — taille et débit max des messages entrants ; rien n'authentifie un client et chaque message coûte une écriture d'état, au-delà du quota les messages sont ignorés sans fermer la socket.

## Un joueur qui part ne doit jamais figer un salon

- `handleClose()` appelle `reassignHost(room, player.id)` — l'hôte est le seul à pouvoir démarrer/relancer/exclure/changer de jeu, sans successeur le salon est mort.
- toute bascule « tout le monde a joué » vit dans une méthode (`maybeAdvancePhase` / `maybeAdvanceStep` / `maybeStartArrange`) appelée **et** à la réception du message **et** dans `handleClose()` : évaluée seulement sur message, elle n'arrive jamais quand c'est le départ du dernier joueur attendu qui la rend vraie.
- `onRestart` accepte n'importe quelle phase sauf `lobby` : c'est la sortie de secours de l'hôte (bouton « Revenir au lobby ») pour tout blocage résiduel.

Une alarme (`bomb`, `bac`) passe par `loadRoom()` et jamais par `storage.get("room")` en direct — c'est `loadRoom()` qui recharge la visibilité et rétro-remplit les champs récents. Elle doit s'arrêter quand plus personne n'est connecté, sinon elle se reprogramme dans le vide indéfiniment.

**Purge des salons abandonnés (`lib/idle.ts`)** : un DO n'a qu'une alarme, partagée entre le jeu et la purge (24 h sans connexion → `deleteAll`). Chaque salon (soirée comprise) appelle `cancelIdlePurge` à l'ouverture d'un WebSocket, `armIdlePurge(storage, sessions.length)` après `handleClose`, et son `alarm()` commence par `purgeIfIdle` (si vrai : `this.room = null`, rien d'autre). Un jeu qui a sa propre alarme la met dans `onGameAlarm()` et finit `alarm()` par `rearmIdlePurge`. L'échéance vit sous la clé `idlePurgeAt`, jamais dans `RoomState` : `armIdlePurge` n'écrase pas une alarme de jeu en attente (un rafraîchissement ferme la dernière socket en pleine manche). Tout nouveau `setAlarm` de jeu reste compatible tant qu'il n'est programmé qu'avec quelqu'un de connecté.

## Manches, scores et retardataires

Chaque `RoomState` porte `scores` (cumul sur les manches du salon, attribué en fin de manche — la règle diffère par jeu) et conserve `waiting` pour relire les anciens salons persistés. Toute nouvelle arrivée sans token pendant une manche est désormais une session spectatrice éphémère, hors de `players`/`playerOrder` et en lecture seule ; `promoteWaiting()` ne sert plus qu'aux retardataires déjà persistés avant ce changement.

## Identité du joueur / reconnexion

Rejoindre attribue un `id` et un `token` aléatoires ; le token revient dans le message `joined` et le client le garde en `localStorage`, indexé par code de salon. Rejoindre avec un token connu rattache le joueur existant au lieu d'en créer un nouveau (rafraîchissement, coupure réseau). Une déconnexion marque `connected: false` plutôt que de supprimer le joueur.

## Chrono et écritures (Petit Bac)

La vue envoie `endsIn` (durée restante) et non `endsAt` : l'horloge d'un téléphone peut être décalée de plusieurs minutes et affichait un compte à rebours faux ; le client ancre la deadline sur son horloge à la réception. `onAnswer` ne sauvegarde pas à chaque frappe — les réponses sont privées jusqu'à la fin de la manche, l'écriture est groupée (2 s) via `scheduleAnswerSave()`. Compatible avec l'hibernation : un `setTimeout` en attente empêche le DO de s'endormir, le flush aboutit toujours.

## WebSockets hibernables

Les salons (soirée comprise) acceptent leurs sockets par `state.acceptWebSocket()` (`acceptSession`), jamais `ws.accept()` : un salon calme est déchargé de la mémoire sans couper les connexions, et la durée d'exécution n'est plus facturée pendant qu'un groupe réfléchit. Le runtime appelle `webSocketMessage` / `webSocketClose` / `webSocketError` sur la classe, qui délèguent à `dispatchMessage` / `dispatchClose`. Conséquences :
- **tout champ d'instance peut avoir été perdu** au début de chaque événement. `this.room` est rechargé par `loadRoom(session.code)` dans `dispatch*` ; `lastReport` repart vide (un rapport de plus à la registry, sans gravité) ; le quota `recent` repart à zéro. Un nouvel état en mémoire qui doit survivre à une pause va dans le stockage, pas dans un champ.
- **l'état par socket vit dans l'attachment** (`playerId`, `spectator`, `spectatorName`, `code`), réécrit par `dispatchMessage` après chaque message. Une session modifiée hors du traitement de *son propre* message devrait appeler `persistSession` elle-même — aucun cas aujourd'hui.
- `dispatchClose` retire la session du tableau avant tout `await` : c'est ce qui rend `handleClose` idempotent quand `error` et `close` arrivent tous deux. Il appelle aussi `ws.close()` : avant la compatibility_date 2026-04-07, le runtime ne répond pas seul à la trame Close.
- un `setTimeout` en attente empêche l'hibernation ; une alarme, non (elle réveille le DO à l'échéance).

## Stockage

`wrangler.toml` utilise `new_sqlite_classes` pour les neuf classes de salon comme pour la registry — défaut actuel des nouveaux projets Workers, et ce que `wrangler dev` provisionne en local.
