# Alphabombe (`bomb`)

> Une mèche invisible qui court de main en main.

| | |
| --- | --- |
| Joueurs | 2 à 10 |
| Table | Écrit |
| Phases | `lobby` → `play` → `ended` |
| Code | [src/games/bomb/](../../src/games/bomb/), [public/games/bomb/](../../public/games/bomb/) |

## Règles

Le joueur qui tient la bombe voit une lettre et doit taper un personnage — ou
un anime — qui commence par elle. Une réponse déjà donnée dans la manche ne
compte pas. Dès que la sienne passe, la bombe file au suivant avec une nouvelle
lettre. **La mèche est tirée au sort une seule fois par bombe (entre 20 et 50
secondes), n'est jamais affichée, et continue de courir d'un tour à l'autre** :
passer la bombe vite est la seule défense. Seule exception : celui qui reçoit
la bombe a toujours au moins **3 secondes** devant lui — si la mèche devait
finir plus tôt, sa fin est repoussée à cette limite (pas de « spawn kill »).

Si elle explose entre ses mains, on perd une vie. Chacun en a deux, donc la
troisième explosion élimine. Le dernier joueur en vie remporte la manche.

## Déroulé d'une manche

1. **`play`** — la bombe démarre chez le premier joueur avec une lettre et une
   mèche tirées au sort. À chaque réponse acceptée, la bombe passe au joueur
   suivant avec une nouvelle lettre, **sans que la mèche soit relancée**.
2. **Explosion** — le porteur perd une vie (ou est éliminé s'il n'en a plus).
   Une nouvelle mèche est tirée et la bombe repart du joueur suivant.
3. **`ended`** — il ne reste qu'un joueur en vie. L'ordre d'élimination sert au
   classement affiché.

## Réglages de l'hôte (lobby)

| Réglage | Valeurs |
| --- | --- |
| Mode | `perso` (un personnage) ou `anime` (un anime) |
| Lettres autorisées | L'hôte décoche les lettres qu'il ne veut pas voir sortir |

## Score

**1 point** au dernier survivant.

## Ce que le serveur cache

**La mèche.** C'est la seule information cachée du jeu, et elle ne figure dans
aucune vue : personne — pas même le porteur — ne sait combien de temps il
reste. Tout le reste (réponses données, vies, lettre en cours) est public et
reste affiché : c'est un jeu écrit, le journal fait partie du plaisir.

## Messages propres au jeu

| Message | Émetteur | Effet |
| --- | --- | --- |
| `start` | hôte | Lance la manche. Payload : `mode`, `letters`. |
| `submitWord` | porteur de la bombe | Propose sa réponse ; si elle passe, la bombe file au suivant. |

Une réponse est refusée si elle ne commence pas par la lettre affichée, ou si
elle a déjà été donnée dans la manche (comparaison souple : « Naruto » et
« Naruto Uzumaki » comptent pour la même réponse). Quand le mot ne vient pas du
menu de suggestions, le client vérifie son existence chez AniList — et **échoue
ouvert** : une vérification rate-limitée ne doit pas figer une partie.

## À savoir côté implémentation

- La mèche est une alarme du Durable Object. Elle passe toujours par
  `loadRoom()`, jamais par le stockage en direct, et **s'arrête dès que plus
  personne n'est connecté** — sinon elle se reprogrammait dans le vide
  indéfiniment sur un salon que personne ne regarde.
- Quand le porteur se déconnecte, on passe son tour immédiatement plutôt que de
  laisser la bombe lui exploser dessus alors qu'il est parti. La mèche, elle,
  continue de courir sans être touchée.
