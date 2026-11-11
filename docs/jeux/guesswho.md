# Qui est-ce ? (`guesswho`)

> Vingt-quatre personnages, des questions en oui ou non, un seul à trouver.

| | |
| --- | --- |
| Joueurs | 2 exactement |
| Table | Vocal — les questions se posent à voix haute, l'écran tient la grille |
| Phases | `lobby` → `play` → `ended` |
| Code | [src/games/guesswho/](../../src/games/guesswho/), [public/games/guesswho/](../../public/games/guesswho/) |

## Règles

Le jeu de déduction classique, en version anime. Les deux joueurs partagent la
même grille de **24 personnages**, tirée au sort parmi un catalogue d'environ
120 personnages très connus (`characters.ts`). Chacun reçoit en secret un
personnage différent de la grille : c'est celui que l'**autre** doit trouver.

À son tour, un joueur pose **à voix haute** une question à laquelle l'adversaire
répond par oui ou non, puis clique sur « J'ai posé ma question » pour passer la
main. Chaque joueur élimine les cartes qui ne correspondent plus, d'un clic
(un second clic la remet).

Quand il ne reste qu'**une seule carte** non éliminée et que c'est son tour, elle
devient automatiquement sa tentative. Si c'est le bon personnage, il gagne la
manche ; sinon, **c'est l'adversaire qui gagne**.

## Déroulé d'une manche

1. **`play`** — la grille et les deux personnages secrets sont tirés. Le premier
   à questionner est celui choisi par l'hôte (ou tiré au sort). Les tours
   alternent à chaque « J'ai posé ma question ».
2. **`ended`** — dès qu'une tentative est faite. L'écran révèle le personnage
   visé, la tentative et le nombre de questions posées.

À la manche suivante (`nextRound`), le joueur qui n'a **pas** commencé la
précédente ouvre.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Premier joueur | L'un des deux joueurs, ou tirage au sort |

## Score

**1 point** au vainqueur de la manche, cumulé dans le salon.

## Ce que le serveur cache

- **Le personnage secret de chacun.** Chaque vue ne reçoit que `ownTargetId`,
  le personnage que l'autre doit deviner, jamais celui qu'on cherche soi-même.
- En fin de manche, la vue révèle le personnage visé par la tentative et le
  personnage tenté.
- **Les cartes éliminées** ne passent jamais par le serveur : elles vivent
  dans la mémoire de l'onglet, propres à chaque joueur. Recharger la page les
  remet toutes en jeu.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Lance la manche. Payload : `guesserId` (facultatif, sinon tirage). |
| `endTurn` | joueur dont c'est le tour | « J'ai posé ma question » : la main passe à l'autre. |
| `guess` | joueur dont c'est le tour | Tente `characterId` ; envoyé automatiquement par le client quand une seule carte reste. |
| `nextRound` | hôte | Relance une manche, l'autre joueur commence. |

## À savoir côté implémentation

- Les illustrations sont résolues côté navigateur via AniList, à partir du nom
  (ou de l'`anilistRef` d'une carte) ; la partie reste jouable avec le nom et
  l'anime si le service est indisponible.
- La tentative automatique attend 700 ms et revérifie qu'il ne reste bien
  qu'une carte : un clic de trop ne part pas en tentative.
- Si l'un des deux se déconnecte, la manche ne se termine pas d'elle-même :
  passer la main est refusé tant que l'autre n'est pas revenu. L'hôte peut
  toujours revenir au lobby.
