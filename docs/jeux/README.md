# Les mini-jeux

Une fiche par jeu. Chacune suit le même plan : à quoi ça se joue, le déroulé
d'une manche phase par phase, les réglages de l'hôte, le barème, ce que le
serveur cache à qui, et les messages WebSocket propres au jeu.

Ce qui est commun aux dix (rejoindre, hôte, scores cumulés, retardataires,
déconnexions) est décrit une fois dans [../salon.md](../salon.md).

| Jeu | Joueurs | Table | En une phrase |
| --- | --- | --- | --- |
| [Undercover](undercover.md) | 3+ | Écrit | Des mots presque identiques, et des infiltrés qui ne savent pas lequel ils ont. |
| [1 à 100](hundred.md) | 3+ | Vocal | Un chiffre secret chacun, un thème commun, une ligne à remettre dans l'ordre. |
| [Petit Bac](bac.md) | 2+ | Écrit | Une lettre, des catégories anime, un chrono qui court. |
| [Qui suis-je](whoami.md) | 2 à 5 | Vocal | Tout le monde voit ton personnage sauf toi. |
| [Détective Anime](detective.md) | 2 à 3 | Écrit | Chacun cache une catégorie et la fait deviner sans jamais la dire. |
| [Le jeu de la note](note.md) | 3 à 8 | Écrit | Un chiffre que toute la table connaît, sauf une personne. |
| [Alphabombe](bomb.md) | 2 à 10 | Écrit | Une mèche invisible qui court de main en main. |
| [Codenames Anime](codenames.md) | 2 ou 4 | Écrit | Des indices d'un seul mot, une grille à retourner, un assassin à éviter. |
| [Même longueur d'onde](sync.md) | 3 à 10 | Écrit | Trois questions, et des points pour chaque réponse qu'un autre a écrite aussi. |
| [Qui est-ce ?](guesswho.md) | 2 | Vocal | Vingt-quatre personnages, des questions en oui ou non, un seul à trouver. |

## Points communs de conception

- **Le serveur arbitre tout ce qui est secret** : rôles, mots, chiffres et clés
  sont tirés côté Durable Object et filtrés par destinataire dans `buildView`.
  Un onglet ne reçoit jamais ce que son joueur n'a pas le droit de savoir.
- **L'humain arbitre tout ce qui demande du jugement** : « Naruto » vaut-il
  « Naruto Uzumaki » ? un personnage entre-t-il dans une catégorie floue ? Ces
  questions vont à l'hôte ou à la table, jamais à une comparaison de chaînes.
  Les seules vérifications automatiques sont mécaniques (première lettre,
  doublon exact via `sameWord`, existence AniList) et, quand elles font appel au
  réseau, elles échouent *ouvert*.
- **Une manche se rejoue dans le même salon** : les scores se cumulent (sauf
  Même longueur d'onde, qui ne compte que la dernière manche), les
  réglages du lobby sont conservés d'une manche à l'autre.
- **Le thème est anime/manga par défaut** — mots, catégories, thèmes et listes
  de suggestions.
