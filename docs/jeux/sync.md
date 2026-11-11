# Même longueur d'onde (`sync`)

> Trois questions, et des points pour chaque réponse qu'un autre a écrite aussi.

| | |
| --- | --- |
| Joueurs | 3 à 10 (un arbitre + au moins deux répondants) |
| Table | Écrit |
| Phases | `lobby` → `questions` → `answering` → `reveal` → `ended` |
| Code | [src/games/sync/](../../src/games/sync/), [public/games/sync/](../../public/games/sync/) |

## Règles

Un joueur est l'**arbitre** : il écrit trois questions et ne répond pas. Tous
les autres répondent en même temps, chacun de son côté, sans se concerter. Le
but n'est pas d'avoir raison mais de **penser comme les autres** : pour chaque
question, une réponse rapporte un point par autre joueur qui a écrit la même
chose.

La comparaison ignore les majuscules, les accents et la ponctuation
(« Gojo ! » = « gojo »), mais pas les variantes : « Gojo » et « Satoru Gojo »
sont deux réponses différentes.

## Déroulé d'une manche

1. **`questions`** — l'arbitre écrit ses trois questions (140 caractères max
   chacune) et les envoie d'un coup. Les autres attendent.
2. **`answering`** — chaque répondant valide ses réponses **une question après
   l'autre** (80 caractères max). Une réponse validée ne se modifie plus. Dès
   que tous les répondants connectés ont validé leurs trois réponses, on passe
   à la révélation.
3. **`reveal`** — l'arbitre voit toutes les réponses en privé et les dévoile à
   la table une par une, question par question, au clic.
4. **`ended`** — après la dernière réponse de la dernière question, les scores
   tombent.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Arbitre | Un joueur connecté choisi par l'hôte, ou tirage au sort |

## Score

Pour chaque question, on regroupe les réponses identiques (après
normalisation). Chaque membre d'un groupe de *n* joueurs marque *n − 1* points.
Une réponse que personne d'autre n'a donnée vaut 0. L'arbitre ne marque rien.

**Exception à la règle commune** : les scores de ce jeu ne se cumulent pas.
`scores` est remis à zéro au lancement de chaque manche et au retour au lobby ;
il ne contient que la manche qui vient de se jouer.

## Ce que le serveur cache

- **Les réponses**, à tous sauf l'arbitre, tant qu'elles ne sont pas révélées.
  La vue de chaque répondant porte `null` à la place d'une réponse non encore
  dévoilée ; seul l'arbitre reçoit `refereeAnswers` en clair.
- Les trois questions, elles, partent dans la vue de tout le monde dès
  `answering` : c'est le client qui les présente une par une.
- L'avancement de chacun (combien de réponses validées) est public, pour que la
  table voie qui traîne.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Lance la manche. Payload : `refereeId` (facultatif, sinon tirage). |
| `submitQuestions` | arbitre | Envoie `questions`, un tableau de trois chaînes non vides. |
| `submitAnswer` | répondant | Valide `answer` pour `question` (0, 1 ou 2, dans l'ordre). |
| `revealNext` | arbitre | Révèle la réponse suivante, puis passe à la question suivante, puis termine. |

## À savoir côté implémentation

- Au lancement, les joueurs déconnectés sont purgés du salon.
- Si l'**arbitre** part en cours de manche, l'hôte (ou à défaut le premier
  joueur connecté) reprend le rôle sur-le-champ, et ses éventuelles réponses
  sont effacées puisqu'un arbitre ne répond pas. S'il ne reste personne, la
  manche se termine avec un `endReason`.
- La bascule vers `reveal` (`maybeStartReveal`) est évaluée à chaque réponse
  **et** à chaque déconnexion : le départ du dernier répondant attendu
  débloque la révélation.
