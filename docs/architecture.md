# Fonctionnement du site

RasenGames est une plateforme de mini-jeux d'ambiance sur thème anime/manga,
jouée entre amis depuis le web, chacun sur son propre appareil. Pas de compte,
pas d'installation : on ouvre le site, on crée un salon, on partage le code à
cinq caractères, et chaque joueur rejoint depuis son téléphone ou son
ordinateur.

Le site tourne sur Cloudflare Workers à l'adresse `rasengames.reesch.com`.

## Le parcours d'un joueur

1. **L'accueil** (`public/index.html`) liste les dix jeux et, au-dessus, les
   « parties en cours » — les salons déclarés publics par leur hôte.
2. **Créer un salon** : `POST /api/<slug>/create` renvoie un code (5
   caractères, alphabet sans `0`/`O`/`1`/`I` pour éviter les confusions à la
   lecture). L'auteur du salon en devient l'hôte.
3. **Rejoindre** : on tape le code (ou on ouvre le lien `?room=CODE`), on
   choisit un pseudo (4 à 20 caractères, unique dans le salon), et le client
   ouvre un WebSocket sur `/ws/<slug>/<code>`.
4. **Le lobby** : l'hôte règle la partie (catégories, nombre de rôles, thème,
   lettres… selon le jeu) puis lance. Les autres voient la liste des joueurs
   se remplir.
5. **La manche** se joue. Le serveur arbitre : c'est lui qui distribue mots,
   rôles et chiffres secrets, et qui décide qui a le droit de faire quoi et
   quand.
6. **La fin de manche** affiche le résultat. L'hôte relance (nouvelle manche
   dans le même salon, les scores se cumulent), revient au lobby, ou emmène
   tout le groupe sur un autre jeu sans changer de code.

## Le Worker : un seul point d'entrée

Tout le trafic passe par le `fetch` de [src/index.ts](../src/index.ts), piloté
par le tableau `GAMES` (`{ slug, namespace }`), dérivé de `GAME_NAMESPACES`
dans [src/lib/gameSlugs.ts](../src/lib/gameSlugs.ts) :

| Route | Rôle |
| --- | --- |
| `GET /api/rooms` | Liste des salons publics en cours (registry, voir plus bas). |
| `GET /api/codenames/words` | Catalogue complet des mots Codenames (statique), pour le filtre du lobby. |
| `GET /api/undercover/sources` | Liste des séries d'où viennent les paires de mots d'Undercover. |
| `GET /api/undercover/feedback` | Retours des joueurs sur les mots d'Undercover. Réservée à l'admin : en-tête `Authorization: Bearer <ADMIN_KEY>`, sinon 401 (503 si la clé n'est pas configurée). |
| `POST /api/<slug>/create` | Tire un code libre et le renvoie en JSON. |
| `GET /api/<slug>/exists/<code>` | `{ exists }` — sonde avant de rejoindre. |
| `GET /ws/<slug>/<code>` | Upgrade WebSocket, transmis au Durable Object du salon. |
| tout le reste | `env.ASSETS.fetch(request)`, qui sert `public/` tel quel. |

Le mode soirée passe par les trois mêmes routes avec le slug `party`
(`/api/party/create`, `/api/party/exists/<code>`, `/ws/party/<code>`), servi
par son propre Durable Object `PartyRoom` — voir [soiree.md](soiree.md).

La sonde `exists` n'est pas un détail : un Durable Object naît à la demande,
donc sans elle un code mal tapé ouvre un salon fantôme où le joueur attend
seul ses amis au lieu de recevoir une erreur.

## Un salon = un Durable Object

Chaque salon est un Durable Object, retrouvé par `idFromName(code)` dans le
namespace de son jeu (`UNDERCOVER_ROOM`, `BOMB_ROOM`, …). Il détient :

- **l'état de la partie** (`RoomState`), persisté sous la clé `room` de son
  stockage — le seul état durable du produit, il n'y a pas de base de données ;
- **les sockets connectées** (`sessions: { ws, playerId }[]`), acceptées en
  mode *hibernable* : entre deux messages le runtime peut décharger le salon de
  la mémoire sans couper les connexions, et chaque socket garde son `playerId`
  dans son « attachment » pour le réveil ;
- éventuellement **une alarme** de jeu (Petit Bac, Alphabombe, Qui est-ce,
  soirée) pour les fins de tour au chrono ou les délais de grâce, ou celle du
  [chrono par action](salon.md#chrono-par-action) facultatif des sept autres ;
- dans tous les cas **une alarme de purge** : 24 h sans aucune connexion, le
  stockage est effacé (`deleteAll`) — voir [salon.md](salon.md) et
  [src/lib/idle.ts](../src/lib/idle.ts).

Le protocole WebSocket est le même partout : le client envoie
`{ type: "...", ... }`, le serveur répond en diffusant l'état.

**Client → serveur** : `join`, `start`, `restart`, `kick`, `transferHost`,
`setVisibility`, `switchGame` (communs aux dix jeux), plus les messages
propres au jeu (`clue`, `vote`, `answer`, `guess`…).

**Serveur → client** : `joined` (id + token de reconnexion), `state` (la vue du
salon, à chaque changement), `error` (message affiché en toast), `kicked`,
`switchGame` (redirection du groupe).

Tout message qui change l'état finit par une sauvegarde puis un `broadcast()`.

### La vue personnalisée

`broadcast()` n'envoie pas le `RoomState` brut : pour chaque socket, il appelle
`buildView(room, playerId)` et envoie le résultat. **C'est le seul endroit où
l'information cachée est filtrée**, avant sérialisation — un joueur ne reçoit
jamais dans son onglet le mot des autres, la clé adverse ou le chiffre secret
qu'il doit deviner. Chaque fiche de jeu détaille ce que sa vue cache.

### Garde-fous

Rien n'authentifie un client : qui connaît un code peut envoyer ce qu'il veut.
D'où [src/lib/throttle.ts](../src/lib/throttle.ts) — 4 Ko par message, 150
messages par fenêtre de 10 s, les messages en trop sont ignorés sans fermer la
socket (une rafale légitime ne doit pas éjecter un joueur en pleine manche). Et
d'où, dans chaque handler, la vérification systématique de la phase, du tour et
du rôle de l'émetteur.

## La liste des parties en cours

Les Durable Objects ne s'énumèrent pas. Chaque salon déclare donc son résumé
(`slug`, `code`, `phase`, nombre de connectés, visibilité) à un DO unique,
`LobbyRegistry` ([src/lib/registry.ts](../src/lib/registry.ts)), que l'accueil
interroge via `GET /api/rooms`.

- Un salon est **privé par défaut** ; l'hôte le bascule en public depuis le
  lobby (`setVisibility`).
- Un salon repassé en privé, ou vidé de ses joueurs connectés, est retiré de la
  liste immédiatement ; les entrées de plus de 3 h sont purgées.
- Le rapport n'est envoyé que si le résumé a changé, pour ne pas marteler le
  registre à chaque frappe.
- Un échec du registre n'interrompt jamais une partie : le salon n'apparaît
  simplement pas dans la liste.

## Le front

Pas de framework, pas de bundler, pas de dépendance npm côté navigateur :
HTML/CSS/JS écrits à la main, chargés en `<script src>`.

- [public/styles.css](../public/styles.css) — thème sombre partagé (tokens en
  variables CSS) et composants communs (écran de connexion, lobby, lignes de
  joueurs).
- [public/js/room-client.js](../public/js/room-client.js) — le global `Room` :
  WebSocket et reconnexion, écran rejoindre/créer, identité en `localStorage`,
  lobby, badge de salon, toasts, bouton « Règles », bouton « Revenir au
  lobby », copie du lien, changement de jeu, écran d'attente. **Tout ce qui est
  identique d'un jeu à l'autre vit ici.**
- `public/games/<slug>/{index.html,style.css,app.js}` — un dossier par jeu.
  `app.js` ne contient que les écrans, messages et sons du jeu : une fonction
  `render(state)` qui reconstruit intégralement le DOM de l'écran concerné à
  chaque message reçu (pas de diffing — l'état reste assez petit).
- [public/js/anilist.js](../public/js/anilist.js) — complétion, illustrations et
  vérification d'existence via graphql.anilist.co, interrogé **depuis le
  navigateur du joueur** (les IP de sortie des Workers sont blacklistées chez
  AniList).
- [public/js/suggest.js](../public/js/suggest.js) — le menu de complétion sous
  un champ texte (Qui suis-je, Détective, 1 à 100).
- [public/js/sound.js](../public/js/sound.js), [ui.js](../public/js/ui.js),
  [rooms.js](../public/js/rooms.js) — sons, avatars, liste des parties en cours.

Chaque page de jeu porte un `<template id="rules">` : c'est le contenu du
bouton « Règles » du header, affiché dans un `<dialog>` natif. C'est aussi la
formulation de référence des règles, reprise dans les fiches de `docs/jeux/`.

## Ce que le site ne fait pas

Pas de comptes, pas de profils, pas d'historique entre deux salons : les scores
vivent dans le salon et meurent avec lui. Pas de modération ni de chat — la
table se parle par ailleurs. Pas de matchmaking : on joue avec les gens à qui
on a donné le code.

## Déploiement

Workers Builds est relié au dépôt GitHub et déploie à chaque push sur `main`.
La CI (`.github/workflows/ci.yml`) lance `npm run typecheck` et `npm test`, et
ne déploie pas. Voir [CLAUDE.md](../CLAUDE.md) pour les commandes et les pièges
de déploiement.
