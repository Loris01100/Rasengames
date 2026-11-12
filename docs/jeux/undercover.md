# Undercover (`undercover`)

> Des mots presque identiques, et des infiltrés qui ne savent pas lequel ils
> ont.

| | |
| --- | --- |
| Joueurs | 3 minimum (pas de plafond) |
| Table | Écrit — les indices se tapent, la lecture se fait à l'écran |
| Phases | `lobby` → `clue` → `vote` → (`whiteguess`) → `ended` |
| Code | [src/games/undercover/](../../src/games/undercover/), [public/games/undercover/](../../public/games/undercover/) |

## Règles

Chacun reçoit un mot secret. Les **civils** ont tous le même, les
**Undercover** en ont un autre très proche (« Sharingan » contre « Byakugan »),
et **Mr. White** n'en a aucun. Chacun son tour, on donne un indice d'un seul
mot sur le sien — ni le mot lui-même, ni un synonyme évident. Après le tour de
table, tout le monde vote ; le plus voté est éliminé et son rôle est révélé.

Les civils gagnent quand il ne reste plus aucun infiltré. Les infiltrés
gagnent dès qu'ils sont aussi nombreux que les civils.

## Déroulé d'une manche

1. **`clue`** — le serveur tire une paire de mots, distribue les rôles et
   mélange l'ordre de parole. Chacun à son tour envoie son indice ; ils
   s'affichent au fur et à mesure. L'historique des indices est conservé
   d'une manche à l'autre (avec le numéro de manche), le tableau du tour en
   cours est vidé à chaque nouvelle manche.
2. **`vote`** — tout le monde vote pour un joueur vivant. La résolution
   attend le vote de **tous les vivants connectés**.
   - Égalité : personne ne sort, on repart sur un tour d'indices.
   - Sinon l'élu est éliminé et son rôle apparaît.
3. **`whiteguess`** — si l'éliminé était Mr. White, il a droit à une dernière
   chance : s'il devine le mot des civils, il gagne sur-le-champ. (Un Mr.
   White parti sans deviner est tranché comme une mauvaise réponse plutôt que
   de laisser la manche en suspens.)
4. Sinon on vérifie les conditions de victoire, et soit la manche se termine
   (**`ended`**, avec le résumé de tous les mots), soit un nouveau tour
   d'indices commence.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Nombre d'Undercover | ≥ 0 |
| Nombre de Mr. White | ≥ 0 |
| Catégorie de mots | Titres d'anime, Personnages, Pouvoirs, Lieux, Arcs, Groupes, Objets, ou Aléatoire |
| Chrono par action | Désactivé (défaut), 30 s, 45 s, 1 min, 1 min 30 ou 2 min — voir [le salon](../salon.md#chrono-par-action) |

À l'échéance du chrono : l'indice du joueur au tour est sauté, le vote se résout avec les bulletins déjà déposés (aucun bulletin : égalité, nouveau tour d'indices), et Mr. White qui tarde est tranché comme une mauvaise réponse.

La combinaison doit laisser **au moins 2 civils**, sinon le démarrage est
refusé avec un message. Les valeurs par défaut suivent l'effectif : 1
Undercover jusqu'à 4 joueurs, +1 Mr. White à partir de 5, 2 Undercover à
partir de 7, 3 à partir de 9.

## Score

**1 point** à chaque joueur du camp gagnant. Mr. White qui devine le mot des
civils gagne seul (les Undercover marquent avec lui lorsque la victoire est
« undercover »).

## Ce que le serveur cache

- **Un Undercover ne sait pas qu'il est Undercover** : son propre rôle lui est
  présenté comme « civil » jusqu'à la révélation. Il n'a que son mot,
  légèrement décalé, pour s'en douter. Mr. White, lui, le sait forcément — il
  n'a pas de mot du tout.
- Les rôles des autres, les deux mots de la paire et le mot de chacun
  n'apparaissent qu'en phase `ended`.
- Sous chaque mot, un **indice de contexte** (sa série, ou une catégorie
  générique) aide qui ne reconnaît pas le mot reçu. Il voyage avec le mot,
  puisque personne ne voit l'autre côté de la paire.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Distribue rôles et mots, ouvre `clue`. Payload : `settings`, `stepTimer`. |
| `clue` | joueur dont c'est le tour | Ajoute l'indice, passe la main. |
| `vote` | joueur vivant | Enregistre le vote ; résolution quand tous ont voté. |
| `whiteGuess` | Mr. White éliminé | Tente le mot des civils. |

## À savoir côté implémentation

- `maybeAdvancePhase` tourne **en boucle** (avec un garde-fou), parce qu'une
  phase débloquée peut en débloquer une autre : le dernier vote ouvre un tour
  d'indices dont le premier joueur est peut-être parti lui aussi.
- Les paires de mots vivent dans [words.ts](../../src/games/undercover/words.ts) ;
  la plupart opposent deux mots de la même série, la catégorie « anime »
  oppose deux titres.
