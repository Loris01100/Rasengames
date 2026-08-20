// Compte les lignes de code du dépôt, par poste. `npm run loc`
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Ordre important : premier motif qui matche gagne.
const POSTES = [
  [/^src\/games\//, 'jeux (serveur)'],
  [/^src\//, 'moteur'],
  [/^public\/games\/.*\.js$/, 'jeux (client)'],
  [/^public\/.*\.(js|html)$/, 'client'],
  [/\.css$/, 'style'],
  [/^public\/games\//, 'jeux (client)'],
  [/^scripts\//, 'tests'],
  [/^\.github\/|\.(json|toml)$/, 'config'],
  [/\.md$/, 'docs'],
];

const files = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n')
  .filter((f) => /\.(ts|mts|js|mjs|html|css|json|toml|md|yml)$/.test(f) && f !== 'package-lock.json');

const stats = new Map();
for (const f of files) {
  const poste = POSTES.find(([re]) => re.test(f))?.[1] ?? 'divers';
  const lignes = readFileSync(f, 'utf8').split('\n');
  // « code » = hors lignes vides et hors commentaires en début de ligne.
  const code = lignes.filter((l) => l.trim() && !/^\s*(\/\/|\/\*|\*|<!--|#)/.test(l)).length;
  const s = stats.get(poste) ?? { fichiers: 0, lignes: 0, code: 0 };
  stats.set(poste, { fichiers: s.fichiers + 1, lignes: s.lignes + lignes.length, code: s.code + code });
}

const rows = [...stats].sort((a, b) => b[1].code - a[1].code);
const total = rows.reduce((t, [, s]) => ({
  fichiers: t.fichiers + s.fichiers, lignes: t.lignes + s.lignes, code: t.code + s.code,
}), { fichiers: 0, lignes: 0, code: 0 });

const w = Math.max(6, ...rows.map(([p]) => p.length));
const ligne = (p, s) => `${p.padEnd(w)} ${String(s.fichiers).padStart(9)} ${String(s.lignes).padStart(9)} ${String(s.code).padStart(9)}`;
console.log(ligne('poste', { fichiers: 'fichiers', lignes: 'lignes', code: 'code' }));
console.log('');
for (const [p, s] of rows) console.log(ligne(p, s));
console.log('-'.repeat(w + 30));
console.log(ligne('total', total));
