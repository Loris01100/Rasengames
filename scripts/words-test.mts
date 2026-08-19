// Vérifie la règle "même personnage" de src/lib/words.ts, utilisée par le
// score du Petit Bac et le refus des doublons de 1 à 100.
import assert from "node:assert";
import { sameWord } from "../src/lib/words.ts";

const same: [string, string][] = [
  ["Naruto", "Naruto Uzumaki"],
  ["naruto uzumaki", "Uzumaki Naruto"],
  ["Rem ", "rém"],
  ["Edward Elric", "Elric"],
];
const different: [string, string][] = [
  ["Ash", "Ashita no Joe"],
  ["Naruto", "Sasuke"],
  ["", "Naruto"],
];

for (const [a, b] of same) assert.ok(sameWord(a, b), `${a} / ${b} devraient être le même mot`);
for (const [a, b] of different) assert.ok(!sameWord(a, b), `${a} / ${b} ne devraient pas matcher`);
console.log("words: ok");
