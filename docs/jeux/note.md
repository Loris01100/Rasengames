# Le jeu de la note (`note`)

> Un chiffre secret que toute la table connaît, sauf une personne.

| | |
| --- | --- |
| Joueurs | 3 à 8 |
| Table | Écrit |
| Phases | `lobby` → `play` (`character` → `anime` → `lastChance` → `guessing`) → `ended` |
| Code | [src/games/note/](../../src/games/note/), [public/games/note/](../../public/games/note/) |

## Règles

Un joueur est désigné pour deviner. Tous les autres voient un chiffre secret
entre 1 et 10. Trois tours de table — un personnage, puis un anime, puis un
élément au choix — où chacun donne un exemple qui « vaut » ce chiffre. Chaque
exemple doit évoquer la note sans jamais la nommer. Le devineur annonce enfin
un chiffre entre 1 et 10.

**Coopératif** : toute la table marque, ou personne.

## Déroulé d'une manche

1. **`character`** — chaque joueur informé propose un personnage qui vaut ce
   chiffre. On passe à l'étape suivante quand tous ont répondu.
2. **`anime`** — même chose avec un anime.
3. **`lastChance`** — même chose avec un élément au choix, dont il faut
   préciser la nature : **arc**, **lieu**, **pouvoir**, **groupe** ou **arme**.
4. **`guessing`** — le devineur, qui a lu tous les exemples au fur et à mesure,
   annonce son chiffre. La manche se termine immédiatement.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Devineur | Un joueur précis, ou tiré au sort |

Le chiffre (1 à 10) est toujours tiré par le serveur.

## Score

Attribué **à toute la table**, devineur compris — les indices valent autant que
la réponse :

- **2 points** si c'est pile le bon chiffre ;
- **1 point** à un près ;
- 0 au-delà.

## Ce que le serveur cache

Le chiffre est masqué **au seul devineur**, jusqu'à la fin de la manche. Tous
les autres le voient en permanence. Les exemples, eux, sont publics dès qu'ils
sont soumis : c'est le matériau du devineur.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Tire le chiffre et désigne le devineur. Payload : `guesserId` (optionnel). |
| `submitClue` | joueur informé | Soumet son exemple pour l'étape en cours. Payload : `text`, plus `kind` en `lastChance`. |
| `submitGuess` | devineur | Annonce un chiffre entre 1 et 10, clôt la manche. |

## À savoir côté implémentation

- Le passage d'une étape à la suivante est déclenché quand **tous les joueurs
  informés et connectés** ont répondu — condition réévaluée aussi à chaque
  déconnexion, sinon le départ du dernier joueur attendu figeait l'étape.
