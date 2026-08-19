# Audio

Les bruitages (proposition reçue, réponse de l'adversaire, tour de jeu, victoire)
sont **synthétisés** dans `public/js/sound.js` avec la Web Audio API : aucun fichier,
aucune licence à gérer, aucune requête réseau.

L'ambiance, elle, ce sont de vrais fichiers posés ici. La liste des pistes est
dans `TRACKS`, en haut de `public/js/sound.js` :

```js
const TRACKS = ["theme.mp3", "chill.mp3", "battle.mp3"];
```

Elles sont jouées en playlist mélangée (ordre tiré au sort à chaque page), une
piste enchaîne sur la suivante, et le bouton ⏭ apparaît dès qu'il y en a
plusieurs. Un fichier absent ou illisible est simplement sauté ; si aucune piste
ne charge, le bouton 🎵 se cache tout seul et le reste du site fonctionne
normalement. Aucun fichier n'est téléchargé tant que la musique n'est pas activée.

## Ajouter une piste

Dépose un MP3 libre de droits ici, ajoute son nom de fichier dans `TRACKS`
(`public/js/sound.js`), et note-le dans le tableau plus bas. Vise 2-3 Mo par
piste, l'ambiance recherchée est anime/chill. Sources utilisables :

- [Pixabay Music](https://pixabay.com/music/) — licence Pixabay, usage commercial ok, sans attribution
- [FreePD](https://freepd.com/) — domaine public (CC0)
- [Incompetech (Kevin MacLeod)](https://incompetech.com/music/royalty-free/) — CC-BY, **attribution obligatoire**
- [Free Music Archive](https://freemusicarchive.org/) — vérifier la licence piste par piste

Si la licence impose une attribution, ajoute-la dans le footer de `public/index.html`
et note la source ci-dessous.

## Pistes utilisées

| Fichier | Titre / auteur | Licence | Source |
| --- | --- | --- | --- |
| `theme.mp3` | _(à remplir)_ | | |
| _(ajoute une ligne par piste)_ | | | |
