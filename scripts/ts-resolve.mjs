// `src/` est écrit pour la résolution "Bundler" de wrangler : les imports
// relatifs y sont sans extension. Node ESM, lui, l'exige. Ce hook rajoute
// `.ts` à la volée pour que les tests puissent importer les sources telles
// quelles, sans toucher au code de prod ni ajouter de bundler.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        // Pas un module TS : on laisse Node résoudre normalement.
      }
    }
    return next(specifier, context);
  },
});
