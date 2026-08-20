# CLAUDE.md

Guide de ce dépôt pour Claude Code. Tout en français, commentaires de code compris.

**Détails par zone, chargés à la demande** : [src/CLAUDE.md](src/CLAUDE.md) (backend, Durable Objects, pièges de salon) et [public/CLAUDE.md](public/CLAUDE.md) (frontend, AniList, pièges CSS). Les lire avant de toucher à ces dossiers ; ne pas y dupliquer ce fichier-ci.

## De quoi il s'agit

RasenGames est une plateforme de jeux d'ambiance sur thème anime/manga, jouée entre amis depuis le web sur des appareils séparés (un onglet par joueur, pas de compte). Déployée sur Cloudflare Workers à l'adresse `rasengames.reesch.com`. Tout nouveau contenu est thématisé anime/manga par défaut, sauf consigne contraire.

Pile volontairement minimale : Workers + Durable Objects pour l'état temps réel, pas de framework, pas de base de données, pas de bundler. Backend en TypeScript (`src/`) ; frontend HTML/CSS/JS écrit à la main par jeu (`public/`), chargé via `<script src>` — aucune étape de build, aucune dépendance npm côté navigateur.

## Commandes

```
npm run dev            # wrangler dev — Durable Objects + assets statiques en local
npm run deploy         # déploiement manuel (secours)
npm run typecheck      # tsc --noEmit
npm test               # words-test.mts (règle "même mot") + logic-test.mts (les 7 logic.ts) + smoke-test.js (les 7 frontends contre un DOM bouchon)
npm run loc            # lignes de code par poste
node scripts/disconnect-test.mjs   # exige un `npm run dev` en face : hôte réattribué, phase débloquée, sonde /exists
```

La CI (`.github/workflows/ci.yml`) lance typecheck + `npm test`, rien d'autre, et ne déploie pas. Pour valider un changement de logique de jeu : `npm run dev` puis deux ou trois clients WebSocket jetables sur une manche complète (approche utilisée pendant tout le développement, scripts non versionnés).

**Déploiement** : Workers Builds est relié à `Loris01100/Rasengames` et déploie à chaque push sur `main`. Cette liaison a déjà sauté en silence (bannière « disconnected from your Git account » alors que le tableau de bord montrait toujours l'ancienne config) — si un push ne déploie pas, vérifier Settings > Build avant de soupçonner le code.

## Ajouter un mini-jeu

Créer `src/games/<slug>/` (voir `src/CLAUDE.md`), ajouter une entrée à `GAMES` dans `src/index.ts`, le binding dans l'interface `Env` de `src/env.ts`, puis dans `wrangler.toml` à la fois un `durable_objects.bindings` **et** une nouvelle entrée `migrations` (`new_sqlite_classes`). Côté client, `public/games/<slug>/{index.html,style.css,app.js}`.
