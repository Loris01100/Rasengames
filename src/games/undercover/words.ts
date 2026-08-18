// Paires de mots proches mais distincts : un mot pour les civils, un pour les undercover.
export interface WordPair {
  a: string;
  b: string;
}

export type WordCategory =
  | "anime"
  | "character"
  | "technique"
  | "place"
  | "arc"
  | "group"
  | "object"
  | "random";

export const CATEGORY_LABELS: Record<WordCategory, string> = {
  anime: "Titres d'anime",
  character: "Personnages",
  technique: "Pouvoirs",
  place: "Lieux",
  arc: "Arcs",
  group: "Groupes",
  object: "Objets",
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

const PLACE_PAIRS: WordPair[] = [
  { a: "Konoha", b: "Suna" },
  { a: "Marineford", b: "Enies Lobby" },
  { a: "Mur Maria", b: "Mur Rose" },
  { a: "UA", b: "Shiketsu" },
  { a: "Soul Society", b: "Hueco Mundo" },
  { a: "Vallée de la Fin", b: "Pont Kannabi" },
  { a: "Wano", b: "Dressrosa" },
  { a: "Namek", b: "Planète Vegeta" },
  { a: "Tour Céleste", b: "Salle de l'Esprit et du Temps" },
  { a: "Île Céleste", b: "Water Seven" },
  { a: "Shibuya", b: "Tokyo Jujutsu" },
  { a: "Village caché de la Pluie", b: "Village caché de la Brume" },
  { a: "Mont Natagumo", b: "Quartier des Plaisirs" },
  { a: "Ville de Magnolia", b: "Ville de Crocus" },
];

const ARC_PAIRS: WordPair[] = [
  { a: "Examen Chunin", b: "Examen Hunter" },
  { a: "Guerre des Ninjas", b: "Guerre de Marineford" },
  { a: "Arc Wano", b: "Arc Alabasta" },
  { a: "Arc Shibuya", b: "Arc Kyoto" },
  { a: "Arc du Train de l'Infini", b: "Arc du Quartier des Plaisirs" },
  { a: "Arc de Namek", b: "Arc de Cell" },
  { a: "Arc de la Reconquête de Shiganshina", b: "Arc de Marley" },
  { a: "Arc Pain", b: "Arc Sasuke Retrieval" },
  { a: "Arc Soul Society", b: "Arc Arrancar" },
  { a: "Arc Chimera Ant", b: "Arc Greed Island" },
  { a: "Arc du Festival du Sport", b: "Arc du Stage" },
  { a: "Arc Aincrad", b: "Arc Alfheim" },
];

const GROUP_PAIRS: WordPair[] = [
  { a: "Akatsuki", b: "Anbu" },
  { a: "Équipage du Chapeau de Paille", b: "Équipage de Barbe Blanche" },
  { a: "Marine", b: "Cipher Pol" },
  { a: "Pilier", b: "Lune Supérieure" },
  { a: "Bataillon d'exploration", b: "Brigade Spéciale" },
  { a: "Espada", b: "Capitaines du Gotei 13" },
  { a: "Team 7", b: "Team Gai" },
  { a: "Fairy Tail", b: "Sabertooth" },
  { a: "Fantômes Troupe", b: "Zodiaques" },
  { a: "Force Ginyu", b: "Guerriers Z" },
  { a: "Sept Péchés Capitaux", b: "Dix Commandements" },
  { a: "Classe 1-A", b: "Classe 1-B" },
];

const OBJECT_PAIRS: WordPair[] = [
  { a: "Death Note", b: "Grimoire" },
  { a: "Pierre Philosophale", b: "Dragon Balls" },
  { a: "Sabre Yoru", b: "Sabre Wado Ichimonji" },
  { a: "Kunai", b: "Shuriken" },
  { a: "Bandeau frontal", b: "Cape de l'Hokage" },
  { a: "Log Pose", b: "Vivre Card" },
  { a: "Fruit du Démon", b: "Nen" },
  { a: "Boucle d'oreille Potara", b: "Ceinture de Nuage Magique" },
  { a: "Manoir hanté", b: "Lame Nichirin" },
  { a: "Équipement tridimensionnel", b: "Fusil anti-Titan" },
  { a: "Zanpakuto", b: "Hollow Mask" },
  { a: "Doigt de Sukuna", b: "Œil de Gojo" },
];

const CATEGORY_MAP: Record<Exclude<WordCategory, "random">, WordPair[]> = {
  anime: ANIME_PAIRS,
  character: CHARACTER_PAIRS,
  technique: TECHNIQUE_PAIRS,
  place: PLACE_PAIRS,
  arc: ARC_PAIRS,
  group: GROUP_PAIRS,
  object: OBJECT_PAIRS,
};

export function pickRandomPair(category: WordCategory): WordPair {
  const pool = category === "random" ? Object.values(CATEGORY_MAP).flat() : CATEGORY_MAP[category];
  return pool[Math.floor(Math.random() * pool.length)];
}
