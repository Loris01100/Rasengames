# Petit Bac (`bac`)

> Une lettre, des catégories anime, et un chrono qui court.

| | |
| --- | --- |
| Joueurs | 2 minimum (pas de plafond) |
| Table | Écrit |
| Phases | `lobby` → `play` → `review` → `ended` |
| Code | [src/games/bac/](../../src/games/bac/), [public/games/bac/](../../public/games/bac/) |

## Règles

L'hôte choisit les catégories, le serveur tire une lettre au sort et lance le
chrono. Chacun remplit une réponse par catégorie, toutes commençant par cette
lettre. Ce qu'on écrit reste privé jusqu'à la fin de la manche. Dès qu'on a
rempli les trois quarts des cases, le bouton « Stop » se débloque et coupe le
chrono pour tout le monde — sinon le temps s'en charge. L'hôte relit ensuite
les réponses une par une et valide ce qui compte.

## Déroulé d'une manche

1. **`play`** — la lettre s'affiche, le compte à rebours tourne (10 minutes
   maximum). Chacun tape ses réponses ; personne ne voit celles des autres.
   La manche s'arrête quand quelqu'un crie stop (75 % des cases remplies
   minimum) ou quand le temps expire.
2. **`review`** — le tableau complet apparaît, une catégorie après l'autre,
   toutes les réponses marquées invalides par défaut. L'hôte coche ce qui
   compte. **Rien n'est accepté automatiquement** : la première lettre est
   vérifiée mécaniquement et affichée comme indication, mais c'est l'hôte qui
   tranche.
3. **`ended`** — les totaux de la manche s'ajoutent au cumul du salon.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Catégories | Anime/Manga, Personnage principal, Personnage secondaire, Antagoniste, Technique/Pouvoir, Objet/Arme, Lieu/Monde, Guilde/Clan/Équipe, Animal/Créature, Studio d'animation |
| Lettres autorisées | L'hôte décoche les lettres qu'il ne veut pas voir sortir |

Au moins une catégorie et au moins une lettre. Les catégories choisies sont
conservées d'une manche à l'autre.

## Score

Barème classique appliqué **aux seules réponses validées par l'hôte** :

- **2 points** pour une réponse validée que personne d'autre n'a écrite ;
- **1 point** si c'est un doublon (comparaison souple : « Naruto » et « Naruto
  Uzumaki » comptent pour la même réponse) ;
- 0 pour une réponse refusée ou vide.

## Ce que le serveur cache

Les réponses en cours de saisie ne sortent jamais de l'onglet de leur auteur
pendant `play` — la vue ne contient que les siennes. Le tableau complet
n'apparaît qu'en `review`.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Tire la lettre, arme l'alarme. Payload : `categories`, `letters`. |
| `answer` | joueur | Met à jour une case (écriture groupée, voir plus bas). |
| `stop` | joueur ayant rempli 75 % des cases | Coupe la manche pour tout le monde. |
| `setValid` | hôte | Valide/invalide une réponse et recalcule les totaux. |
| `finishReview` | hôte | Clôt la relecture et encaisse les points. |

## À savoir côté implémentation

- La vue envoie **`endsIn`** (durée restante) et non `endsAt` : l'horloge d'un
  téléphone peut être décalée de plusieurs minutes et affichait un compte à
  rebours faux. Le client ancre la deadline sur sa propre horloge à la
  réception.
- `answer` ne sauvegarde pas à chaque frappe : les réponses étant privées
  jusqu'à la fin de la manche, l'écriture est groupée toutes les 2 secondes.
- La fin au chrono passe par une alarme du Durable Object, qui se déclenche
  même si plus personne n'est connecté à cet instant.
