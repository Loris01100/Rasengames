# 1 à 100 (`hundred`)

> Un chiffre secret chacun, un thème commun, et une ligne à remettre dans
> l'ordre.

| | |
| --- | --- |
| Joueurs | 3 minimum (pas de plafond) |
| Table | Vocal — le débat se fait de vive voix, l'écran ne sert qu'aux cartes |
| Phases | `lobby` → `propose` → `arrange` → `reveal` → `ended` |
| Code | [src/games/hundred/](../../src/games/hundred/), [public/games/hundred/](../../public/games/hundred/) |

## Règles

Chacun reçoit un chiffre secret entre 1 et 100 et voit le thème commun (par
exemple « Talent pour les punchlines »). Il propose un personnage — ou un
anime — qui correspond à son chiffre sur ce thème : 1 c'est le minimum absolu,
100 le maximum. Une fois tout le monde servi, la table débat à voix haute et
l'hôte range les cartes de gauche (petit chiffre) à droite (grand chiffre).
Puis on révèle.

**C'est un jeu coopératif** : la table joue contre le hasard, pas les uns
contre les autres.

## Déroulé d'une manche

1. **`propose`** — chacun voit son chiffre et le thème, et tape sa
   proposition. Les doublons (et quasi-doublons) sont refusés : deux cartes
   identiques sur la ligne, c'est un débat sans réponse. Le refus ne cite
   jamais la proposition déjà prise, seulement celle du demandeur. Un champ de
   suggestions AniList aide à trouver l'orthographe exacte.
2. **`arrange`** — dès que tout le monde a proposé, les cartes apparaissent
   mélangées. L'hôte les glisse-dépose pour former la ligne du plus petit au
   plus grand pendant que la table argumente.
3. **`reveal`** — l'hôte retourne les cartes une par une, de gauche à droite.
4. **`ended`** — la ligne complète est notée.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Mode | `perso` (chacun propose un personnage) ou `anime` (chacun propose un anime) |
| Thème | Choisi dans la liste du mode, ou tapé à la main (60 caractères max) |
| Chrono par action | Désactivé (défaut), 30 s, 45 s, 1 min, 1 min 30 ou 2 min — voir [le salon](../salon.md#chrono-par-action) |

À l'échéance du chrono, seule la phase `propose` est chronométrée : qui n'a rien proposé ne pose pas de carte, et la ligne se fait avec les autres. Le rangement et la révélation restent à la main de l'hôte.

Les deux modes ont exactement la même mécanique ; seules la liste de thèmes et
les formulations changent. En mode `perso` le thème est un trait qu'un
personnage peut avoir plus ou moins (Puissance, Cringe, Style vestimentaire…) ;
en mode `anime` c'est une dimension sur laquelle noter une série entière.

## Score

**Un point par paire de voisins dans le bon ordre**, attribué à *tout le
monde* — la ligne est l'œuvre collective de la table. Une ligne de 5 cartes
vaut donc au maximum 4 points par joueur.

## Ce que le serveur cache

- **Les chiffres** restent cachés jusqu'à la révélation, un par un dans
  l'ordre de la ligne. Chacun voit toujours le sien.
- **Les propositions** ne sont secrètes que pendant `propose` : une fois tout
  le monde servi, les voir est tout l'intérêt du débat.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Tire les chiffres, fixe le thème. Payload : `mode`, `theme`, `stepTimer`. |
| `propose` | joueur | Enregistre la proposition (+ `anilistRef` éventuelle). |
| `move` | hôte | Déplace une carte à un index de la ligne. |
| `reveal` | hôte | Passe en phase de révélation. |
| `revealNext` | hôte | Retourne la carte suivante ; la dernière clôt la manche. |

## À savoir côté implémentation

- Quand la proposition vient du menu de suggestions, elle emporte sa référence
  AniList exacte (`character:83801`). Ça sert à illustrer la carte, et à
  refuser un titre d'anime proposé en mode `perso` (ou l'inverse) sans avoir à
  interroger le réseau côté serveur.
- Le glisser-déposer de l'écran `arrange` utilise une seule paire d'écouteurs
  `pointermove`/`pointerup` sur `document` — pas de `setPointerCapture` par
  carte, qui cassait dès qu'une carte était réinsérée ailleurs en plein geste.
