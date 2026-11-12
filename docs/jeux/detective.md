# Détective Anime (`detective`)

> Chacun cache une catégorie, et la fait deviner sans jamais la dire.

| | |
| --- | --- |
| Joueurs | 2 à 3 |
| Table | Écrit |
| Phases | `lobby` → `setup` → `play` → `ended` |
| Code | [src/games/detective/](../../src/games/detective/), [public/games/detective/](../../public/games/detective/) |

## Règles

Chacun choisit une catégorie secrète, en texte libre : « ceux qui portent des
lunettes », « les personnages en rouge », ce qu'on veut. Chacun son tour, on
propose un personnage aux autres, qui répondent simplement s'il entre ou non
dans leur catégorie. **Toutes les réponses sont publiques** : la table entière
apprend en même temps. Quand on croit avoir trouvé la catégorie de quelqu'un,
on tente sa chance à la place d'une proposition.

## Déroulé d'une manche

1. **`setup`** — chacun écrit sa catégorie (60 caractères max). On passe en jeu
   quand tout le monde est prêt.
2. **`play`** — à son tour, on choisit entre :
   - **proposer un personnage** : il part chez *tous* les adversaires dont la
     catégorie n'est pas encore trouvée, qui répondent chacun oui/non ;
   - **deviner une catégorie** : ça ne part que chez la personne visée, qui
     dit si c'est ça.

   Chaque réponse alimente un journal public. Une catégorie trouvée sort du
   jeu : plus la peine d'en faire juger son propriétaire.
3. **`ended`** — la manche se termine quand **toutes** les catégories des
   joueurs connectés ont été trouvées : personne ne reste avec son secret en
   suspens.

## Réglages de l'hôte (lobby)

Tout le contenu vient des joueurs ; un seul réglage, facultatif.

| Réglage | Valeurs |
| --- | --- |
| Chrono par action | Désactivé (défaut), 30 s, 45 s, 1 min, 1 min 30 ou 2 min — voir [le salon](../salon.md#chrono-par-action) |

À l'échéance du chrono, le tour passe au suivant sans proposition. Ni la
saisie des catégories ni les réponses oui/non ne sont chronométrées : personne
ne peut juger à la place du propriétaire d'une catégorie.

## Score

**1 point** au joueur dont la catégorie a été trouvée **en dernier** : c'est
lui qui a tenu le plus longtemps, et c'est le gagnant affiché sur l'écran de
fin.

## Ce que le serveur cache

La catégorie d'un joueur n'est visible que de lui, jusqu'à ce qu'elle soit
trouvée — à ce moment elle devient publique, sans attendre la fin. Chaque
joueur ne voit dans sa file (`incoming`) que les questions qu'il doit juger.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Ouvre la saisie des catégories. Payload : `stepTimer`. |
| `setCategory` | joueur | Enregistre sa catégorie secrète. |
| `proposeCharacter` | joueur dont c'est le tour | Envoie un personnage à tous les adversaires encore en jeu. |
| `guessCategory` | joueur dont c'est le tour | Tente la catégorie d'une cible précise. Payload : `target`, `text`. |
| `answerIncoming` | destinataire | Répond oui/non à la plus ancienne question de sa file. |

## À savoir côté implémentation

- `advanceTurn` saute quiconque n'a plus personne à interroger — typiquement le
  salon à 2 joueurs où la catégorie de l'adversaire vient d'être trouvée. Sans
  ça, son tour bloquerait la manche.
