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
  { a: "Dragon Ball", b: "Dragon Ball Super" },
  { a: "Jujutsu Kaisen", b: "Bleach" },
  { a: "Hunter x Hunter", b: "Yu Yu Hakusho" },
  { a: "My Hero Academia", b: "One Punch Man" },
  { a: "Demon Slayer", b: "Jujutsu Kaisen" },
  { a: "Black Clover", b: "Fairy Tail" },
  { a: "Blue Exorcist", b: "Noragami" },
  { a: "Fire Force", b: "Soul Eater" },
  { a: "Fullmetal Alchemist", b: "Soul Eater" },
  { a: "Attack on Titan", b: "86 Eighty-Six" },
  { a: "Tokyo Ghoul", b: "Parasyte" },
  { a: "Chainsaw Man", b: "Dorohedoro" },
  { a: "Hell's Paradise", b: "Demon Slayer" },
  { a: "Death Note", b: "Code Geass" },
  { a: "Steins;Gate", b: "Erased" },
  { a: "Monster", b: "20th Century Boys" },
  { a: "Psycho-Pass", b: "Ghost in the Shell" },
  { a: "Tokyo Ghoul", b: "Ajin" },
  { a: "Parasyte", b: "Ajin" },
  { a: "Made in Abyss", b: "The Promised Neverland" },
  { a: "Terror in Resonance", b: "Death Note" },
  { a: "Violet Evergarden", b: "Your Lie in April" },
  { a: "Kaguya-sama", b: "Horimiya" },
  { a: "Toradora!", b: "Golden Time" },
  { a: "Clannad", b: "Angel Beats!" },
  { a: "Oregairu", b: "Rascal Does Not Dream of Bunny Girl Senpai" },
  { a: "Your Name", b: "Weathering With You" },
  { a: "A Silent Voice", b: "I Want to Eat Your Pancreas" },
  { a: "Sword Art Online", b: "Log Horizon" },
  { a: "Re:Zero", b: "Steins;Gate" },
  { a: "Konosuba", b: "Isekai Quartet" },
  { a: "Overlord", b: "That Time I Got Reincarnated as a Slime" },
  { a: "Mushoku Tensei", b: "Re:Zero" },
  { a: "The Rising of the Shield Hero", b: "Arifureta" },
  { a: "No Game No Life", b: "Kakegurui" },
  { a: "Haikyuu", b: "Kuroko no Basket" },
  { a: "Blue Lock", b: "Ao Ashi" },
  { a: "Slam Dunk", b: "Kuroko no Basket" },
  { a: "Hajime no Ippo", b: "Megalo Box" },
  { a: "Yuri!!! on Ice", b: "Free!" },
  { a: "Pokémon", b: "Digimon" },
  { a: "Yu-Gi-Oh!", b: "Cardfight!! Vanguard" },
  { a: "Inazuma Eleven", b: "Captain Tsubasa" },
  { a: "Beyblade", b: "Bakugan" },
  { a: "Saint Seiya", b: "Yu Yu Hakusho" },
  { a: "Mob Psycho 100", b: "One Punch Man" },
  { a: "Dr. Stone", b: "Cells at Work!" },
  { a: "The Disastrous Life of Saiki K.", b: "Mob Psycho 100" },
  { a: "Gintama", b: "KonoSuba" },
  { a: "JoJo's Bizarre Adventure", b: "Hunter x Hunter" },
  { a: "Vinland Saga", b: "Kingdom" },
  { a: "Berserk", b: "Vinland Saga" },
  { a: "Frieren", b: "Violet Evergarden" },
  { a: "Delicious in Dungeon", b: "Frieren" },
];

const CHARACTER_PAIRS: WordPair[] = [
  { a: "Naruto", b: "Boruto" },
  { a: "Itachi", b: "Sasuke" },
  { a: "Kakashi", b: "Obito" },
  { a: "Madara", b: "Hashirama" },
  { a: "Naruto", b: "Sasuke" },
  { a: "Gaara", b: "Rock Lee" },
  { a: "Minato", b: "Kakashi" },
  { a: "Jiraiya", b: "Orochimaru" },
  { a: "Luffy", b: "Ace" },
  { a: "Zoro", b: "Sanji" },
  { a: "Shanks", b: "Mihawk" },
  { a: "Law", b: "Kid" },
  { a: "Doflamingo", b: "Crocodile" },
  { a: "Katakuri", b: "Doflamingo" },
  { a: "Robin", b: "Nami" },
  { a: "Usopp", b: "Buggy" },
  { a: "Goku", b: "Vegeta" },
  { a: "Gohan", b: "Trunks" },
  { a: "Piccolo", b: "Vegeta" },
  { a: "Frieza", b: "Cell" },
  { a: "Broly", b: "Jiren" },
  { a: "Goku", b: "Gohan" },
  { a: "Ichigo", b: "Rukia" },
  { a: "Ichigo", b: "Renji" },
  { a: "Byakuya", b: "Kenpachi" },
  { a: "Aizen", b: "Urahara" },
  { a: "Yhwach", b: "Aizen" },
  { a: "Gojo", b: "Sukuna" },
  { a: "Yuji", b: "Megumi" },
  { a: "Yuji", b: "Yuta" },
  { a: "Nobara", b: "Maki" },
  { a: "Toji", b: "Maki" },
  { a: "Nanami", b: "Gojo" },
  { a: "Geto", b: "Gojo" },
  { a: "Tanjiro", b: "Inosuke" },
  { a: "Tanjiro", b: "Zenitsu" },
  { a: "Giyu", b: "Sanemi" },
  { a: "Rengoku", b: "Tengen" },
  { a: "Mitsuri", b: "Shinobu" },
  { a: "Akaza", b: "Doma" },
  { a: "Muzan", b: "Kokushibo" },
  { a: "Deku", b: "Bakugo" },
  { a: "Deku", b: "Todoroki" },
  { a: "Bakugo", b: "Todoroki" },
  { a: "All Might", b: "Endeavor" },
  { a: "Shigaraki", b: "Dabi" },
  { a: "Aizawa", b: "Present Mic" },
  { a: "Gon", b: "Killua" },
  { a: "Kurapika", b: "Leorio" },
  { a: "Hisoka", b: "Illumi" },
  { a: "Chrollo", b: "Hisoka" },
  { a: "Meruem", b: "Netero" },
  { a: "Eren", b: "Levi" },
  { a: "Mikasa", b: "Annie" },
  { a: "Armin", b: "Erwin" },
  { a: "Reiner", b: "Bertholdt" },
  { a: "Eren", b: "Reiner" },
  { a: "Levi", b: "Mikasa" },
  { a: "Winry", b: "Riza Hawkeye" },
  { a: "Saitama", b: "Genos" },
  { a: "Saitama", b: "Garou" },
  { a: "Garou", b: "Boros" },
  { a: "Mob", b: "Reigen" },
  { a: "Mob", b: "Teruki" },
  { a: "Rem", b: "Emilia" },
  { a: "Rem", b: "Ram" },
  { a: "Subaru", b: "Kazuma" },
  { a: "Natsu", b: "Gray" },
  { a: "Natsu", b: "Gajeel" },
  { a: "Erza", b: "Mirajane" },
  { a: "Lucy", b: "Wendy" },
  { a: "Jotaro", b: "Dio" },
  { a: "Jonathan", b: "Joseph" },
  { a: "Josuke", b: "Giorno" },
  { a: "Light Yagami", b: "L" },
  { a: "Light Yagami", b: "Coca Light" },
  { a: "Lelouch", b: "Light Yagami" },
  { a: "Kirito", b: "Eugeo" },
  { a: "Shinra", b: "Arthur" },
  { a: "Thorfinn", b: "Askeladd" },
  { a: "Guts", b: "Griffith" },
  { a: "Denji", b: "Aki" },
  { a: "Denji", b: "Power" },
  { a: "Makima", b: "Power" },
  { a: "Frieren", b: "Fern" },
  { a: "Senku", b: "Chrome" },
  { a: "Isagi", b: "Rin" },
  { a: "Bachira", b: "Isagi" },
  { a: "Kageyama", b: "Hinata" },
  { a: "Takemichi", b: "Mikey" },
  { a: "Mikey", b: "Draken" },
];

const TECHNIQUE_PAIRS: WordPair[] = [
  { a: "Rasengan", b: "Chidori" },
  { a: "Amaterasu", b: "Kagutsuchi" },
  { a: "Kamui", b: "Izanagi" },
  { a: "Izanami", b: "Izanagi" },
  { a: "Shadow Clone", b: "Multi Shadow Clone" },
  { a: "Summoning Jutsu", b: "Reanimation Jutsu" },
  { a: "Rasenshuriken", b: "Chidori" },
  { a: "Kamehameha", b: "Galick Gun" },
  { a: "Kamehameha", b: "Final Flash" },
  { a: "Genkidama", b: "Kamehameha" },
  { a: "Kaioken", b: "Ultra Instinct" },
  { a: "Instant Transmission", b: "Shunpo" },
  { a: "Bankai", b: "Shikai" },
  { a: "Hollow Purple", b: "Black Flash" },
  { a: "Domain Expansion", b: "Simple Domain" },
  { a: "Domain Expansion", b: "Domain Amplification" },
  { a: "Black Flash", b: "Divergent Fist" },
  { a: "Cursed Speech", b: "Ten Shadows Technique" },
  { a: "Limitless", b: "Ten Shadows Technique" },
  { a: "Malevolent Shrine", b: "Unlimited Void" },
  { a: "Gear Second", b: "Gear Third" },
  { a: "Gear Third", b: "Gear Fourth" },
  { a: "Gear Fourth", b: "Gear Fifth" },
  { a: "Room", b: "Gamma Knife" },
  { a: "Divine Departure", b: "Kamishini no Yari" },
  { a: "Souffle de l'Eau", b: "Souffle du Feu" },
  { a: "Souffle de la foudre", b: "Souffle du Vent" },
  { a: "One For All", b: "All For One" },
  { a: "Detroit Smash", b: "United States of Smash" },
  { a: "Blackwhip", b: "Fa Jin" },
  { a: "Hellflame", b: "Half-Cold Half-Hot" },
  { a: "Jajanken", b: "Bungee Gum" },
  { a: "Godspeed", b: "Jajanken" },
  { a: "Skill Hunter", b: "Bungee Gum" },
  { a: "Star Platinum", b: "The World" },
  { a: "Crazy Diamond", b: "Killer Queen" },
  { a: "King Crimson", b: "The World" },
  { a: "Gold Experience", b: "Gold Experience Requiem" },
  { a: "Consecutive Normal Punches", b: "Serious Series" },
  { a: "Rasengan", b: "Spiral Power" },
  { a: "Black Flash", b: "Divergent Fist" },
  { a: "Spirit Gun", b: "Dragon of the Darkness Flame" },
  { a: "Getsuga Tenshou", b: "Getsuga Jūjishō" },
  { a: "Nichirin Sword", b: "Breathing Technique" },
  { a: "Alchemy", b: "Nen" },
  { a: "Nen", b: "Chakra" },
  { a: "Haki de l'Observation", b: "Haki des Rois" },
  { a: "Haki de l'Armement", b: "Haki des Rois" },
];

const PLACE_PAIRS: WordPair[] = [
  { a: "Konoha", b: "Suna" },
  { a: "Konoha", b: "Kiri" },
  { a: "Konoha", b: "Iwa" },
  { a: "Konoha", b: "Kumo" },
  { a: "Vallée de la Fin", b: "Mont Myoboku" },
  { a: "Vallée de la Fin", b: "Pont Kannabi" },
  { a: "Village caché de la Pluie", b: "Village caché de la Brume" },
  { a: "Village caché de la Pierre", b: "Village caché de la Foudre" },
  { a: "Forêt de la Mort", b: "Arène de l'Examen Chunin" },
  { a: "Marineford", b: "Enies Lobby" },
  { a: "Wano", b: "Dressrosa" },
  { a: "Water Seven", b: "Sabaody" },
  { a: "Alabasta", b: "Skypiea" },
  { a: "Whole Cake Island", b: "Wano" },
  { a: "Egghead", b: "Punk Hazard" },
  { a: "Impel Down", b: "Marineford" },
  { a: "Sabaody", b: "Amazon Lily" },
  { a: "Île des Hommes-Poissons", b: "Zou" },
  { a: "Mur Maria", b: "Mur Rose" },
  { a: "Mur Sina", b: "Mur Maria" },
  { a: "Shiganshina", b: "Liberio" },
  { a: "Trost", b: "Shiganshina" },
  { a: "Forêt des Arbres Géants", b: "Château d'Utgard" },
  { a: "Shibuya", b: "Tokyo Jujutsu" },
  { a: "Tokyo Jujutsu", b: "Kyoto Jujutsu" },
  { a: "École de Tokyo", b: "École de Kyoto" },
  { a: "Culling Game", b: "Shibuya" },
  { a: "Mont Natagumo", b: "Quartier des Plaisirs" },
  { a: "Village des Forgerons", b: "Domaine des Papillons" },
  { a: "Train de l'Infini", b: "Quartier des Plaisirs" },
  { a: "Forteresse Infinie", b: "Village des Forgerons" },
  { a: "Namek", b: "Planète Vegeta" },
  { a: "Capsule Corp", b: "Maison de Tortue Géniale" },
  { a: "Salle de l'Esprit et du Temps", b: "Tour de Karin" },
  { a: "Planète Kaioshin", b: "Planète de Kaio" },
  { a: "UA", b: "Kamino" },
  { a: "Tour Céleste", b: "Yorknew City" },
  { a: "Greed Island", b: "Yorknew City" },
  { a: "Palais de l'Est", b: "Mont Kukuroo" },
  { a: "Aincrad", b: "Alfheim" },
  { a: "Aincrad", b: "Gun Gale Online" },
];

const ARC_PAIRS: WordPair[] = [
  // Naruto
  { a: "Examen Chunin", b: "Examen Hunter" },
  { a: "Arc Pain", b: "Arc Sasuke Retrieval" },
  { a: "Arc Itachi Pursuit", b: "Arc Pain" },
  { a: "Guerre des Ninjas", b: "Guerre de Marineford" },
  { a: "Examen Chunin", b: "Arc de la Forêt de la Mort" },

  // One Piece
  { a: "Arc Wano", b: "Arc Alabasta" },
  { a: "Arc Marineford", b: "Arc Enies Lobby" },
  { a: "Arc Dressrosa", b: "Arc Whole Cake Island" },
  { a: "Arc Sabaody", b: "Arc Impel Down" },
  { a: "Arc Egghead", b: "Arc Wano" },
  { a: "Arc Water Seven", b: "Arc Enies Lobby" },
  { a: "Arc Alabasta", b: "Arc Skypiea" },
  { a: "Arc Thriller Bark", b: "Arc Punk Hazard" },

  // JJK
  { a: "Arc Shibuya", b: "Arc Kyoto" },
  { a: "Arc Shibuya", b: "Arc Culling Game" },
  { a: "Arc Hidden Inventory", b: "Arc Shibuya" },

  // Demon Slayer
  { a: "Arc du Train de l'Infini", b: "Arc du Quartier des Plaisirs" },
  { a: "Arc du Quartier des Plaisirs", b: "Arc du Village des Forgerons" },
  { a: "Arc du Village des Forgerons", b: "Arc de l'Entraînement des Piliers" },
  { a: "Arc de la Sélection Finale", b: "Arc du Train de l'Infini" },

  // Dragon Ball
  { a: "Arc de Namek", b: "Arc de Cell" },
  { a: "Arc des Saiyans", b: "Arc de Freezer" },
  { a: "Arc de Cell", b: "Arc de Boo" },
  { a: "Arc de Beerus", b: "Arc de Freezer" },

  // Attack on Titan
  { a: "Arc de la Reconquête de Shiganshina", b: "Arc de Marley" },
  { a: "Arc de Trost", b: "Arc de la Bataille de Shiganshina" },
  { a: "Arc du Titan Féminin", b: "Arc du Titan Bestial" },

  // Hunter x Hunter
  { a: "Arc Chimera Ant", b: "Arc Greed Island" },
  { a: "Arc Yorknew City", b: "Arc Greed Island" },
  { a: "Arc Hunter Exam", b: "Arc Heavens Arena" },

  // My Hero Academia
  { a: "Arc du Festival du Sport", b: "Arc du Stage" },
  { a: "Arc de l'Examen des Licences", b: "Arc du Festival du Sport" },
  { a: "Arc Paranormal Liberation War", b: "Arc Kamino" },

  // Sword Art Online
  { a: "Arc Aincrad", b: "Arc Alfheim" },
  { a: "Arc Aincrad", b: "Arc Alicization" },
  { a: "Arc Gun Gale Online", b: "Arc Alicization" },

  // Autres
  { a: "Arc Dark Tournament", b: "Arc Chimera Ant" },
  { a: "Arc Golden Age", b: "Arc Eclipse" },
  { a: "Arc Shibuya", b: "Arc Marineford" },
  { a: "Arc Yorknew", b: "Arc Shibuya" },
];

const GROUP_PAIRS: WordPair[] = [
  // Naruto
  { a: "Akatsuki", b: "Anbu" },
  { a: "Team 7", b: "Team Gai" },
  { a: "Team 10", b: "Team 8" },
  { a: "Akatsuki", b: "Sept Épéistes de la Brume" },
  { a: "Anbu", b: "Police Militaire de Konoha" },

  // One Piece
  { a: "Équipage du Chapeau de Paille", b: "Équipage de Barbe Blanche" },
  { a: "Marine", b: "Cipher Pol" },
  { a: "Équipage de Barbe Noire", b: "Équipage de Barbe Blanche" },
  { a: "Supernovas", b: "Shichibukai" },
  { a: "Révolutionnaires", b: "Marine" },
  { a: "CP9", b: "CP0" },

  // Demon Slayer
  { a: "Piliers", b: "Lunes Supérieures" },
  { a: "Pourfendeurs de Démons", b: "Démons" },
  { a: "Piliers", b: "Douze Lunes Démoniaques" },
  { a: "Lunes Inférieures", b: "Lunes Supérieures" },

  // Attack on Titan
  { a: "Bataillon d'Exploration", b: "Brigade Spéciale" },
  { a: "Brigade Spéciale", b: "Garnison" },
  { a: "Guerriers de Marley", b: "Bataillon d'Exploration" },
  { a: "Guerriers de Marley", b: "Police Militaire" },

  // Bleach
  { a: "Espada", b: "Capitaines du Gotei 13" },
  { a: "Gotei 13", b: "Onmitsukido" },
  { a: "Vizards", b: "Arrancars" },
  { a: "Quincy", b: "Shinigami" },

  // Fairy Tail
  { a: "Fairy Tail", b: "Sabertooth" },
  { a: "Fairy Tail", b: "Blue Pegasus" },
  { a: "Sabertooth", b: "Lamia Scale" },

  // Hunter x Hunter
  { a: "Brigade Fantôme", b: "Zodiaques" },
  { a: "Brigade Fantôme", b: "Famille Zoldyck" },
  { a: "Association Hunter", b: "Brigade Fantôme" },

  // Dragon Ball
  { a: "Force Ginyu", b: "Guerriers Z" },
  { a: "Guerriers Z", b: "Armée de Freezer" },
  { a: "Patrouille Galactique", b: "Armée de Freezer" },

  // MHA
  { a: "Classe 1-A", b: "Classe 1-B" },
  { a: "Ligue des Vilains", b: "Armée de Libération des Super-Pouvoirs" },
  { a: "Héros Pro", b: "Ligue des Vilains" },

  // JJK
  { a: "École de Tokyo", b: "École de Kyoto" },
  { a: "Fléaux", b: "Exorcistes" },
  { a: "Clan Zenin", b: "Clan Gojo" },

  // Seven Deadly Sins
  { a: "Sept Péchés Capitaux", b: "Dix Commandements" },
  { a: "Dix Commandements", b: "Chevaliers Sacrés" },

  // Autres
  { a: "Guilde Fairy Tail", b: "Guilde Phantom Lord" },
  { a: "Homunculus", b: "Alchimistes d'État" },
  { a: "Équipage de Roger", b: "Équipage de Barbe Blanche" },
  { a: "Akatsuki", b: "Phantom Troupe" },
];

const OBJECT_PAIRS: WordPair[] = [
  // Naruto
  { a: "Kunai", b: "Shuriken" },
  { a: "Bandeau frontal", b: "Gilet de ninja" },
  { a: "Parchemin", b: "Parchemin explosif" },
  { a: "Éventail de Gunbai", b: "Faux de Hidan" },

  // One Piece
  { a: "Log Pose", b: "Vivre Card" },
  { a: "Den Den Mushi", b: "Den Den Mushi Noir" },
  { a: "Chapeau de paille", b: "Manteau de capitaine" },
  { a: "Yoru", b: "Wado Ichimonji" },
  { a: "Enma", b: "Wado Ichimonji" },
  { a: "Fruit du Démon", b: "Fruit du Démon artificiel" },

  // Dragon Ball
  { a: "Dragon Balls", b: "Boules du Dragon Noir" },
  { a: "Potara", b: "Danse de la Fusion" },
  { a: "Senzu", b: "Capsule Hoi-Poi" },
  { a: "Bâton Magique", b: "Nuage Magique" },

  // JJK
  { a: "Doigt de Sukuna", b: "Objet Maudit" },
  { a: "Doigt de Sukuna", b: "Œil de Gojo" },
  { a: "Arme Inversée du Paradis", b: "Lance Céleste Inversée" },

  // Demon Slayer
  { a: "Lame Nichirin", b: "Épée rouge Nichirin" },
  { a: "Boîte de Nezuko", b: "Épée de Nichirin" },
  { a: "Masque de Sabito", b: "Masque de Kitsune" },

  // Attack on Titan
  { a: "Équipement tridimensionnel", b: "Fusil anti-Titan" },
  { a: "Lame anti-Titan", b: "Lance Foudroyante" },
  { a: "Clé de la cave", b: "Badge du Bataillon" },

  // My Hero Academia
  { a: "Costume de héros", b: "Costume de héros professionnel" },
  { a: "Support Item", b: "Costume de combat" },

  // Hunter x Hunter
  { a: "Téléphone de Hunter", b: "Carte de Hunter" },
  { a: "Carte de Greed Island", b: "Livre de Greed Island" },

  // Death Note
  { a: "Death Note", b: "Death Eraser" },
  { a: "Death Note", b: "Grimoire" },
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

export type PairCategory = Exclude<WordCategory, "random">;
export interface PickedPair extends WordPair {
  category: PairCategory;
}

// La catégorie voyage avec la paire : en "random" personne ne sait de quelle
// liste le mot sort, et le client en a besoin pour décider s'il peut chercher
// une image (un groupe ou un lieu n'existe pas sur AniList — voir app.js).
const ALL_PAIRS: PickedPair[] = (Object.entries(CATEGORY_MAP) as [PairCategory, WordPair[]][]).flatMap(
  ([category, pairs]) => pairs.map((pair) => ({ ...pair, category }))
);

export function pickRandomPair(category: WordCategory): PickedPair {
  const pool = category === "random" ? ALL_PAIRS : ALL_PAIRS.filter((p) => p.category === category);
  return pool[Math.floor(Math.random() * pool.length)];
}
