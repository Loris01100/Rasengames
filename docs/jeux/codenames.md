# Codenames Anime (`codenames`)

> Des indices d'un seul mot, une grille de 25 à retourner, un assassin à
> éviter.

| | |
| --- | --- |
| Joueurs | Exactement 2 (coopératif) ou 4 (2 contre 2) |
| Table | Écrit |
| Phases | `lobby` → `playing` → `ended` |
| Code | [src/games/codenames/](../../src/games/codenames/), [public/games/codenames/](../../public/games/codenames/) |

Le nombre de joueurs connectés détermine seul le mode : 2 → `duet`, 4 →
`teams`. Tout autre effectif fait refuser le démarrage.

## Le plateau

25 mots tirés d'un catalogue anime/manga. Sous chaque mot, sa **série
d'origine** en petit — public, pour permettre de construire un indice même sur
un mot qu'on ne reconnaît pas. Une case n'est révélée qu'une fois ; sa couleur
retenue est celle de la clé active au moment du clic.

## Mode `duet` — 2 joueurs, coopératif

Chacun voit **sa propre clé** sur les mêmes 25 mots, en permanence (pas
seulement à son tour) : 9 agents, 3 assassins, le reste en passants. À tour de
rôle, on donne un indice (un mot + un nombre) d'après sa clé et l'autre devine.

- **Bonne pioche** (agent) : on continue à deviner, dans la limite de
  `nombre + 1` tentatives.
- **Mauvaise pioche** (passant) : le tour passe et la réserve d'erreurs
  commune baisse d'un cran (9 au départ). À zéro, c'est perdu.
- **Assassin** : défaite immédiate.

On gagne ensemble en trouvant **tous les mots agent des deux clés** avant
d'épuiser la réserve. Une case peut être agent pour une clé et assassin pour
l'autre : le total gagnant n'est donc pas fixe, il est calculé au démarrage
comme l'union des agents des deux clés.

## Mode `teams` — 4 joueurs, 2 contre 2

Deux équipes de deux, chacune avec un **chiffreur** (voit toute la grille) et
un **agent de terrain** (devine). La grille : 9 mots pour l'équipe qui
commence, 8 pour l'autre, 1 assassin, le reste neutre.

- Toucher un de ses mots : on continue.
- Toucher un mot neutre : le tour passe.
- Toucher un mot adverse : il compte **pour l'adversaire**, et le tour passe.
- Toucher l'assassin : défaite immédiate de l'équipe qui a cliqué.

La première équipe à avoir fait deviner tous ses mots gagne.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Répartition (mode `teams`) | L'hôte place les 4 joueurs sur les 4 places : chiffreur A, agent A, chiffreur B, agent B |
| Gérer les mots | Retire des mots du pool (filtre par série, par exemple pour écarter un anime que personne n'a vu) |

La répartition est validée strictement côté serveur : exactement les quatre
joueurs du salon, une place chacun. Sinon l'hôte est prévenu plutôt que de
démarrer une partie bancale (deux chiffreurs dans la même équipe, un joueur
sans rôle…). En mode `duet` il n'y a rien à répartir : le serveur tire les
sièges. **Les mots exclus persistent d'une manche à l'autre** dans le salon,
contrairement au reste qui se réinitialise.

Le catalogue complet est servi par `GET /api/codenames/words` (statique, sans
passer par un Durable Object).

## Score

**1 point** à chaque joueur du camp gagnant : les deux joueurs en cas de
victoire coopérative, les deux membres de l'équipe gagnante en mode `teams`.

## Ce que le serveur cache

Toute la couleur des cases passe par une seule fonction, `cellColorFor` :

- une case **révélée** est publique ;
- une case cachée n'est colorée que pour qui détient la clé correspondante —
  le chiffreur de son équipe en `teams`, le joueur du siège concerné en `duet` ;
- personne d'autre ne reçoit la moindre couleur.

En fin de partie, les clés complètes sont envoyées pour la révélation.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Tire le plateau et les clés. Payload : répartition en mode `teams`. |
| `setWordFilter` | hôte | Met à jour la liste des mots exclus du pool. |
| `clue` | celui dont c'est le tour de chiffrer | Publie un indice (mot + nombre). |
| `guess` | celui dont c'est le tour de deviner | Retourne une case. |
| `pass` | celui dont c'est le tour de deviner | Rend la main sans retourner de case. |

## À savoir côté implémentation

- Le chiffreur ou le devineur qui part en plein tour figerait la partie —
  personne d'autre ne connaît sa clé pour le remplacer. On passe le tour à sa
  place, en boucle courte, parce que le nouveau tour peut retomber sur un
  joueur déconnecté lui aussi.
