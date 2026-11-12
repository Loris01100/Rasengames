# Qui suis-je (`whoami`)

> Tout le monde voit ton personnage sauf toi.

| | |
| --- | --- |
| Joueurs | 2 à 5 |
| Table | Vocal — les questions se posent à voix haute, l'écran tient les compteurs |
| Phases | `lobby` → `submit` → `play` → `ended` |
| Code | [src/games/whoami/](../../src/games/whoami/), [public/games/whoami/](../../public/games/whoami/) |

## Règles

Chacun écrit un personnage : c'est **un autre joueur** qui devra le deviner,
jamais soi. Le sien reste caché à ses propres yeux et visible de tous les
autres. Chacun son tour, on pose une question à voix haute à laquelle la table
répond par oui ou non, puis on marque son tour comme joué. Quand on croit
savoir, on propose un nom : l'hôte confirme ou non. Après une proposition
ratée, il faut reposer **deux questions** avant d'avoir le droit d'en retenter
une.

Le but est de trouver avec le moins de questions possible — le décompte est
affiché à côté de chaque joueur.

## Déroulé d'une manche

1. **`submit`** — chacun écrit le personnage qu'il donne à deviner (champ avec
   suggestions AniList). On passe en jeu quand tout le monde a soumis.
2. **`play`** — l'attribution est un **dérangement circulaire** : l'ordre est
   mélangé, puis chacun reçoit le mot du suivant dans cet ordre. Personne ne
   peut recevoir son propre mot, et qui a reçu quoi reste imprévisible. Le tour
   tourne : question posée → `askedQuestion` → au suivant. Une proposition
   (`guess`) ne coûte pas le tour, elle attend la validation.
3. **`ended`** — l'hôte clôt la manche quand la table en a assez ; les
   personnages non trouvés sont révélés.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Mode de saisie | `libre` (chacun écrit ce qu'il veut) ou `categorie` |
| Catégorie | Texte libre imposé à tous en mode `categorie` (« que des méchants », « personnages de shōnen ») |
| Chrono par action | Désactivé (défaut), 30 s, 45 s, 1 min, 1 min 30 ou 2 min — voir [le salon](../salon.md#chrono-par-action) |

À l'échéance du chrono : le tour de question passe au suivant, sans compter de question. Ni la saisie des personnages (sans le mot d'un joueur, le dérangement laisserait quelqu'un sans personnage) ni la validation des propositions par l'hôte ne sont chronométrées.

La catégorie est une **consigne affichée**, pas une contrainte vérifiée : le
serveur ne juge pas si un mot la respecte.

## Score

**1 point par joueur ayant trouvé son personnage**, encaissé à la fin de la
manche.

## Ce que le serveur cache

Le mot attribué à un joueur lui est masqué tant que la manche tourne — tous les
autres le voient, c'est tout le jeu — et est révélé en `ended`. Les tentatives
déjà faites sont publiques (ce sont juste des noms tapés), y compris pour
l'intéressé.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Ouvre la saisie. Payload : `submitMode`, `category`, `stepTimer`. |
| `submitWord` | joueur | Enregistre le personnage qu'il fait deviner. |
| `askedQuestion` | joueur dont c'est le tour | Incrémente son compteur et passe la main. |
| `guess` | joueur | Propose un nom, mis en attente de validation. |
| `validateGuess` | hôte (ou n'importe qui pour la proposition de l'hôte) | Tranche juste/faux. |
| `endRound` | hôte | Termine la manche et encaisse les points. |

## À savoir côté implémentation

- Une proposition n'est **jamais** vérifiée automatiquement : l'application ne
  sait pas distinguer « Naruto » de « Naruto Uzumaki » comme la table le fait.
  Elle met le nom en file et l'hôte tranche.
- Exception nécessaire : l'hôte ne peut pas valider sa **propre** proposition
  (ça lui dirait s'il a raison) — n'importe quel autre joueur s'en charge.
- Trouver ne coûte le tour de personne : la rotation n'est relancée que si le
  tour en cours était justement celui du trouveur, devenu inéligible.
