# Documentation RasenGames

Documentation fonctionnelle du site : ce que fait chaque brique, et comment se
joue chaque jeu. Complémentaire des guides de contribution
([CLAUDE.md](../CLAUDE.md), [src/CLAUDE.md](../src/CLAUDE.md),
[public/CLAUDE.md](../public/CLAUDE.md)) qui, eux, disent *comment travailler*
dans le dépôt et quels pièges éviter.

## Sommaire

| Fichier | Contenu |
| --- | --- |
| [architecture.md](architecture.md) | Le site de bout en bout : URL, Worker, Durable Objects, WebSocket, front, déploiement. |
| [salon.md](salon.md) | Le cycle de vie d'un salon, identique aux huit jeux : rejoindre, hôte, manches, scores, déconnexions. |
| [jeux/](jeux/README.md) | Un document par mini-jeu : règles, phases, réglages, score, messages. |

## Les huit jeux

| Jeu | Slug | Joueurs | Table | Fiche |
| --- | --- | --- | --- | --- |
| Undercover | `undercover` | 3+ | Écrit | [undercover.md](jeux/undercover.md) |
| 1 à 100 | `hundred` | 3+ | Vocal | [hundred.md](jeux/hundred.md) |
| Petit Bac | `bac` | 2+ | Écrit | [bac.md](jeux/bac.md) |
| Qui suis-je | `whoami` | 2 à 5 | Vocal | [whoami.md](jeux/whoami.md) |
| Détective Anime | `detective` | 2 à 3 | Écrit | [detective.md](jeux/detective.md) |
| Le jeu de la note | `note` | 3 à 8 | Écrit | [note.md](jeux/note.md) |
| Alphabombe | `bomb` | 2 à 10 | Écrit | [bomb.md](jeux/bomb.md) |
| Codenames Anime | `codenames` | 2 ou 4 | Écrit | [codenames.md](jeux/codenames.md) |

« Vocal » = le jeu suppose que la table se parle (en vrai ou en vocal) et que
le site ne sert qu'à distribuer l'information secrète et à arbitrer. « Écrit »
= tout passe par l'écran, le jeu se tient même sans se parler.
