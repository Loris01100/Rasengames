# Le mode soirée (`party`)

> Plusieurs jeux d'affilée, un seul groupe, un classement qui court sur toute la
> soirée.

| | |
| --- | --- |
| Joueurs | 2 à 10 |
| Adresse | `/party/` (carte « mode soirée » de l'accueil) |
| Phases | `lobby` → `playing` → `summary` → … → `ended` |
| Code | [src/party/](../src/party/), [public/party/](../public/party/), passerelle dans [public/js/room-client.js](../public/js/room-client.js) |

## À quoi ça sert

Un salon normal joue un jeu ; `switchGame` emmène le groupe sur un autre, mais
chaque jeu garde ses propres scores. La soirée ajoute une couche au-dessus :
un **lobby organisateur** qui lance les jeux les uns après les autres et
additionne un **classement de soirée** commun, quel que soit le barème de
chaque jeu.

## Déroulé

1. **`lobby`** — on crée ou rejoint la soirée avec un pseudo (4 à 20
   caractères, unique). Le premier arrivé est l'hôte. L'hôte choisit un jeu
   dans la liste, ou « Jeu aléatoire » parmi les jeux compatibles. Un jeu dont la
   fourchette de joueurs ne colle pas au nombre de **connectés** est grisé.
2. **`playing`** — le serveur crée un salon neuf pour ce jeu et envoie
   `launchGame` à tout le monde : chaque onglet part sur la page du jeu avec
   rejoindre automatique, et l'hôte de la soirée y reste hôte. On joue
   normalement. Quand la manche du jeu arrive en `ended`, l'hôte voit un
   bandeau « Valider et voir le classement ».
3. **`summary`** — le résultat de ce jeu et le classement général. L'hôte
   choisit le jeu suivant (retour en 2) ou termine la soirée.
4. **`ended`** — podium final. « Recommencer une soirée » remet les scores à
   zéro et revient au lobby avec le même groupe.

Une fois la soirée lancée, seuls les joueurs déjà inscrits peuvent revenir ;
une nouvelle personne ne peut plus entrer.

## Barème de soirée

À la validation, l'hôte envoie le score de chaque joueur **dans le jeu qui vient
de se jouer** (le `scores` du salon de jeu). Ces scores sont convertis en points
de soirée (`awardPartyPoints`) :

| Place dans le jeu | Points de soirée |
| --- | --- |
| Meilleur score (strictement positif) | 3 |
| Deuxième score distinct | 2 |
| Tout le reste, y compris 0 | 1 |

Les ex æquo prennent la même place. Un score nul vaut une simple participation
(1 point) : dans un jeu à victoire binaire, les perdants ne deviennent pas
« deuxièmes » pour autant. Si personne n'a marqué, tout le monde prend 1.

Les scores du jeu sont rapprochés des joueurs de la soirée **par pseudo**, sans
tenir compte de la casse : un joueur qui change de pseudo dans le jeu compte 0.

## Pouvoirs de l'hôte

| Action | Quand |
| --- | --- |
| Choisir / tirer au sort le jeu | `lobby`, `summary` |
| Valider le résultat d'un jeu | depuis la page du jeu, en fin de manche |
| Terminer la soirée | `summary` |
| Recommencer | `ended` |
| Exclure un joueur | `lobby`, `summary` — pendant un jeu, c'est l'exclusion du salon de jeu qui s'applique |

Un joueur exclu disparaît de la soirée et du classement, reçoit `kicked` et
revient à l'accueil ; son token est oublié pour qu'un rechargement ne le fasse
pas rentrer. S'il est encore sur une page de jeu, la connexion de soirée de
cette page se coupe définitivement (plus de reconnexion), et il en va de même
quand elle se voit refuser l'entrée : la partie en cours reste jouable, sans
lien avec la soirée.

## Messages

| Message | Émetteur | Effet |
| --- | --- | --- |
| `join` | tous | Payload : `name`, `token` (pour revenir). |
| `start` | hôte | Lance le premier jeu. Payload : `slug`. |
| `finishGame` | hôte, depuis la page du jeu | Payload : `results`, liste de `{ name, score }`. Passe en `summary`. |
| `nextGame` | hôte | Lance le jeu suivant. Payload : `slug`. |
| `endParty` | hôte | Passe en `ended`. |
| `restart` | hôte | Depuis `ended` : scores à zéro, retour au lobby. |
| `kick` | hôte | Exclut `playerId`. |

Le serveur envoie en plus `launchGame` (`slug`, `code`, et pour l'hôte seul
`hostKey`, la clé à usage unique qui lui rend la main dans le salon du jeu) et
`returnToParty` (redirection collective vers `/party/`).

## La passerelle dans les pages de jeu

Une page de jeu ouverte depuis une soirée porte `&party=CODE` dans son URL.
`room-client.js` ouvre alors une **seconde connexion** vers le salon de soirée.
Le jeu n'en sait rien et reste autonome : cette connexion sert seulement à
porter le bouton de validation de l'hôte et à ramener tout le monde sur
`/party/`. Si le signal `returnToParty` s'est perdu pendant une coupure, l'état
de la soirée suffit : dès qu'elle n'est plus en `playing` sur ce salon-là, la
page de jeu redirige d'elle-même.

Un joueur revenu sur `/party/` pendant un jeu voit un bouton « Rejoindre le jeu ».

## À savoir côté implémentation

- `PartyRoom` a sa propre plomberie, comme chaque jeu ; elle n'utilise pas
  `lib/session.ts` et n'apparaît pas dans la liste des parties publiques.
- La liste des jeux et leurs fourchettes de joueurs existent en double :
  `src/party/games.ts` (fait foi côté serveur) et le tableau `GAMES` de
  `public/party/app.js`. Ajouter un jeu, c'est mettre à jour les deux.
- **Hôte parti** : une déconnexion marque le joueur hors ligne. Si c'est
  l'hôte, il a **30 secondes** pour revenir avant que la main passe au premier
  joueur connecté (alarme du Durable Object). Le délai existe parce que chaque
  passage entre `/party/` et une page de jeu ferme puis rouvre sa socket : une
  réattribution immédiate comme dans les salons de jeu lui volerait la main à
  chaque lancement. Le délai en cours n'est pas repoussé par les allées et
  venues des autres ; si personne n'est connecté à la sonnerie, rien ne change
  et le prochain retour relance le délai.
- Sur une page de jeu, le bouton « Valider et voir le classement » suit l'hôte
  **de la soirée** (vu par la passerelle), pas celui du salon de jeu : les deux
  peuvent diverger après un départ.
