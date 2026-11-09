// Génère les icônes pixel de public/icons/ à partir des grilles ci-dessous.
// node scripts/icons.mjs — à relancer après avoir modifié une grille.
// Les PNG s'ouvrent dans Aseprite ; une retouche faite là-bas doit être
// reportée ici, sinon la prochaine génération l'écrase.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

// k = encre, r = rouge, w = papier, . = transparent. 16 × 16.
const ICONS = {
  bombe: [
    ".............r.r",
    "..............r.",
    "............kr.r",
    "........kkkk....",
    ".....kkkkkk.....",
    "...kkkkkkkk.....",
    "..kkwwkkkkkk....",
    "..kwwkkkkkkk....",
    ".kkwkkkkkkkkk...",
    ".kkkkkkkkkkkk...",
    ".kkkkkkkkkkkk...",
    ".kkkkkkkkkkkk...",
    "..kkkkkkkkkk....",
    "..kkkkkkkkkk....",
    "...kkkkkkkk.....",
    ".....kkkk.......",
  ],
  oeil: [
    "................",
    "................",
    "................",
    ".....kkkkkk.....",
    "...kkwwwwwwkk...",
    "..kwwwkkkkwwwk..",
    ".kwwwkkwrkkwwwk.",
    "kwwwkkrrrrkkwwwk",
    "kwwwkkrrrrkkwwwk",
    ".kwwwkkrrkkwwwk.",
    "..kwwwkkkkwwwk..",
    "...kkwwwwwwkk...",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
  ],
  son: [
    "................",
    "................",
    "........k.......",
    ".......kk...r...",
    "......kkk....r..",
    ".kkkkkkkk.r...r.",
    ".kkkkkkkk..r..r.",
    ".kkkkkkkk..r..r.",
    ".kkkkkkkk..r..r.",
    ".kkkkkkkk..r..r.",
    ".kkkkkkkk.r...r.",
    "......kkk....r..",
    ".......kk...r...",
    "........k.......",
    "................",
    "................",
  ],
  muet: [
    "................",
    "................",
    "........k.......",
    ".......kk.......",
    "......kkk.......",
    ".kkkkkkkk.rr..rr",
    ".kkkkkkkk..rrrr.",
    ".kkkkkkkk...rr..",
    ".kkkkkkkk...rr..",
    ".kkkkkkkk..rrrr.",
    ".kkkkkkkk.rr..rr",
    "......kkk.......",
    ".......kk.......",
    "........k.......",
    "................",
    "................",
  ],
  musique: [
    "................",
    ".....kkkkkkkkkk.",
    ".....kkkkkkkkkk.",
    ".....k........k.",
    ".....k........k.",
    ".....k........k.",
    ".....k........k.",
    ".....k........k.",
    ".....k........k.",
    ".....k........k.",
    "..kkkk.....kkkk.",
    ".kkwkk....kkwkk.",
    ".kkkkk....kkkkk.",
    "..kkk......kkk..",
    "................",
    "................",
  ],
  pause: [
    "................",
    "................",
    "...kkkk..kkkk...",
    "...kwwk..kwwk...",
    "...kwkk..kwkk...",
    "...kwkk..kwkk...",
    "...kkkk..kkkk...",
    "...kkkk..kkkk...",
    "...kkkk..kkkk...",
    "...kkkk..kkkk...",
    "...kkkk..kkkk...",
    "...kkkk..kkkk...",
    "...kkkk..kkkk...",
    "...kkkk..kkkk...",
    "................",
    "................",
  ],
  suivant: [
    "................",
    "................",
    "................",
    ".k....k.....kk..",
    ".kk...kk....kk..",
    ".kkk..kkk...kk..",
    ".kkkk.kkkk..kk..",
    ".kkkkkkkkkk.kk..",
    ".kkkkkkkkkk.kk..",
    ".kkkk.kkkk..kk..",
    ".kkk..kkk...kk..",
    ".kk...kk....kk..",
    ".k....k.....kk..",
    "................",
    "................",
    "................",
  ],
  etoile: [
    "................",
    ".......kk.......",
    ".......kk.......",
    "......krrk......",
    "......krrk......",
    "kkkkkkrrrrkkkkkk",
    ".krrrrrrrrrrrrk.",
    "..krrrrrrrrrrk..",
    "...krrrrrrrrk...",
    "....krrrrrrk....",
    "....krrrrrrk....",
    "...krrrkkrrrk...",
    "...krrk..krrk...",
    "..krk......krk..",
    "..kk........kk..",
    "................",
  ],
  coeur: [
    "................",
    "................",
    "..kkkk....kkkk..",
    ".krrrrk..krrrrk.",
    "krrwrrrkkrrrrrrk",
    "krwrrrrrrrrrrrrk",
    "krrrrrrrrrrrrrrk",
    "krrrrrrrrrrrrrrk",
    ".krrrrrrrrrrrrk.",
    "..krrrrrrrrrrk..",
    "...krrrrrrrrk...",
    "....krrrrrrk....",
    ".....krrrrk.....",
    "......krrk......",
    ".......kk.......",
    "................",
  ],
};
// Cœur vide : même contour, intérieur papier.
ICONS["coeur-vide"] = ICONS.coeur.map((l) => l.replace(/[rw]/g, "w"));

const PAPER = { k: [0x11, 0x11, 0x11], r: [0xd7, 0x26, 0x1e], w: [0xff, 0xff, 0xff] };
// Pour le badge spectateur, posé sur un fond encre : encre et papier s'échangent.
const NIGHT = { k: [0xf7, 0xf5, 0xf0], r: PAPER.r, w: PAPER.k };

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(rows, pal) {
  if (rows.length !== 16 || rows.some((l) => l.length !== 16)) throw new Error("grille pas en 16 × 16");
  // Une ligne = un octet de filtre (0) puis 16 pixels RGBA.
  const raw = Buffer.alloc(16 * (1 + 16 * 4));
  rows.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      if (ch === ".") return;
      const o = y * 65 + 1 + x * 4;
      raw.set([...pal[ch], 255], o);
    });
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, rows] of Object.entries(ICONS)) {
  writeFileSync(new URL(`${name}.png`, out), png(rows, PAPER));
}
writeFileSync(new URL("oeil-nuit.png", out), png(ICONS.oeil, NIGHT));
console.log(`${Object.keys(ICONS).length + 1} icônes écrites dans public/icons/`);
