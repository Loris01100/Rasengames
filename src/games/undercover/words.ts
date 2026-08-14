// Paires de mots proches mais distincts : un mot pour les civils, un pour les undercover.
export interface WordPair {
  a: string;
  b: string;
}

export type WordCategory = "anime" | "character" | "technique" | "random";

export const CATEGORY_LABELS: Record<WordCategory, string> = {
  anime: "Titres d'anime",
  character: "Personnages",
  technique: "Techniques / Jutsu",
  random: "Aléatoire (tout mélangé)",
};

const ANIME_PAIRS: WordPair[] = [
  { a: "Naruto", b: "Boruto" },
  { a: "One Piece", b: "Fairy Tail" },
  { a: "Attack on Titan", b: "Demon Slayer" },
  { a: "Death Note", b: "Code Geass" },
  { a: "My Hero Academia", b: "One Punch Man" },
  { a: "Dragon Ball", b: "Dragon Ball Super" },
  { a: "Jujutsu Kaisen", b: "Bleach" },
  { a: "Hunter x Hunter", b: "Yu Yu Hakusho" },
  { a: "Tokyo Ghoul", b: "Chainsaw Man" },
  { a: "Fullmetal Alchemist", b: "Soul Eater" },
  { a: "Sword Art Online", b: "Re:Zero" },
  { a: "Spy x Family", b: "Kaguya-sama" },
  { a: "Haikyuu", b: "Kuroko no Basket" },
  { a: "Violet Evergarden", b: "Your Lie in April" },
  { a: "Konosuba", b: "Overlord" },
  { a: "Steins;Gate", b: "Erased" },
  { a: "Naruto", b: "One Piece" },
  { a: "Pokémon", b: "Digimon" },
];

const CHARACTER_PAIRS: WordPair[] = [
  { a: "Naruto", b: "Boruto" },
  { a: "Luffy", b: "Ace" },
  { a: "Goku", b: "Vegeta" },
  { a: "Itachi", b: "Sasuke" },
  { a: "Light Yagami", b: "L" },
  { a: "Eren", b: "Levi" },
  { a: "Tanjiro", b: "Inosuke" },
  { a: "Deku", b: "Bakugo" },
  { a: "Saitama", b: "Genos" },
  { a: "Edward Elric", b: "Alphonse Elric" },
  { a: "Natsu", b: "Gray" },
  { a: "Ichigo", b: "Rukia" },
  { a: "Gojo", b: "Sukuna" },
  { a: "Killua", b: "Gon" },
  { a: "Rem", b: "Emilia" },
  { a: "Mikasa", b: "Annie" },
  { a: "Shanks", b: "Mihawk" },
  { a: "Zoro", b: "Sanji" },
  { a: "Kakashi", b: "Obito" },
  { a: "Meliodas", b: "Ban" },
];

const TECHNIQUE_PAIRS: WordPair[] = [
  { a: "Rasengan", b: "Chidori" },
  { a: "Kamehameha", b: "Genkidama" },
  { a: "Amaterasu", b: "Susanoo" },
  { a: "Bankai", b: "Shikai" },
  { a: "Domain Expansion", b: "Cursed Technique" },
  { a: "Gear Second", b: "Gear Fourth" },
  { a: "Kamui", b: "Izanagi" },
  { a: "Getsuga Tenshou", b: "Cero" },
  { a: "One For All", b: "All For One" },
  { a: "Respiration de l'Eau", b: "Respiration du Feu" },
  { a: "Byakugan", b: "Sharingan" },
  { a: "Instant Transmission", b: "Shunpo" },
  { a: "Hollow Purple", b: "Black Flash" },
  { a: "Kaioken", b: "Ultra Instinct" },
];

const CATEGORY_MAP: Record<Exclude<WordCategory, "random">, WordPair[]> = {
  anime: ANIME_PAIRS,
  character: CHARACTER_PAIRS,
  technique: TECHNIQUE_PAIRS,
};

export function pickRandomPair(category: WordCategory): WordPair {
  const pool = category === "random" ? Object.values(CATEGORY_MAP).flat() : CATEGORY_MAP[category];
  return pool[Math.floor(Math.random() * pool.length)];
}
