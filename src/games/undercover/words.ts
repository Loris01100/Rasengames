// Paires de mots proches mais distincts : un mot pour les civils, un pour les undercover.
// Chaque mot porte son propre indice de contexte (`hintA`/`hintB`, en général
// une série, parfois une catégorie générique) : le joueur qui reçoit ce mot
// ne voit jamais l'autre côté de la paire, donc l'indice doit voyager avec
// LUI, pas avec la paire dans son ensemble — utile pour deviner de quoi on
// parle sans connaître le mot exact (cf. la même idée côté Codenames).
export interface WordPair {
  a: string;
  b: string;
  hintA: string;
  hintB: string;
}

export type WordCategory =
  | "anime"
  | "character"
  | "technique"
  | "place"
  | "arc"
  | "group"
  | "object"
  | "crossover"
  | "random";

export const CATEGORY_LABELS: Record<WordCategory, string> = {
  anime: "Titres d'anime",
  character: "Personnages",
  technique: "Pouvoirs",
  place: "Lieux",
  arc: "Arcs",
  group: "Groupes",
  object: "Objets",
  crossover: "Décalé & pop culture",
  random: "Aléatoire (tout mélangé)",
};

// La plupart des paires opposent deux mots de la même série (samePairs) ;
// quelques-unes comparent volontairement deux séries différentes (crossPair) —
// notamment toute la catégorie "anime", où les deux mots SONT deux titres.
function samePairs(hint: string, pairs: [string, string][]): WordPair[] {
  return pairs.map(([a, b]) => ({ a, b, hintA: hint, hintB: hint }));
}

function crossPair(hintA: string, a: string, hintB: string, b: string): WordPair {
  return { a, hintA, b, hintB };
}

const ANIME_PAIRS: WordPair[] = samePairs("Anime", [
  ["Naruto", "Boruto"],
  ["One Piece", "Fairy Tail"],
  ["Dragon Ball", "Dragon Ball Super"],
  ["Jujutsu Kaisen", "Bleach"],
  ["Hunter x Hunter", "Yu Yu Hakusho"],
  ["My Hero Academia", "One Punch Man"],
  ["Demon Slayer", "Jujutsu Kaisen"],
  ["Black Clover", "Fairy Tail"],
  ["Blue Exorcist", "Noragami"],
  ["Fire Force", "Soul Eater"],
  ["Fullmetal Alchemist", "Soul Eater"],
  ["Attack on Titan", "86 Eighty-Six"],
  ["Tokyo Ghoul", "Parasyte"],
  ["Chainsaw Man", "Dorohedoro"],
  ["Hell's Paradise", "Demon Slayer"],
  ["Death Note", "Code Geass"],
  ["Steins;Gate", "Erased"],
  ["Monster", "20th Century Boys"],
  ["Psycho-Pass", "Ghost in the Shell"],
  ["Tokyo Ghoul", "Ajin"],
  ["Parasyte", "Ajin"],
  ["Made in Abyss", "The Promised Neverland"],
  ["Terror in Resonance", "Death Note"],
  ["Violet Evergarden", "Your Lie in April"],
  ["Kaguya-sama", "Horimiya"],
  ["Toradora!", "Golden Time"],
  ["Clannad", "Angel Beats!"],
  ["Oregairu", "Rascal Does Not Dream of Bunny Girl Senpai"],
  ["Your Name", "Weathering With You"],
  ["A Silent Voice", "I Want to Eat Your Pancreas"],
  ["Sword Art Online", "Log Horizon"],
  ["Re:Zero", "Steins;Gate"],
  ["Konosuba", "Isekai Quartet"],
  ["Overlord", "That Time I Got Reincarnated as a Slime"],
  ["Mushoku Tensei", "Re:Zero"],
  ["The Rising of the Shield Hero", "Arifureta"],
  ["No Game No Life", "Kakegurui"],
  ["Haikyuu", "Kuroko no Basket"],
  ["Blue Lock", "Ao Ashi"],
  ["Slam Dunk", "Kuroko no Basket"],
  ["Hajime no Ippo", "Megalo Box"],
  ["Yuri!!! on Ice", "Free!"],
  ["Pokémon", "Digimon"],
  ["Yu-Gi-Oh!", "Cardfight!! Vanguard"],
  ["Inazuma Eleven", "Captain Tsubasa"],
  ["Beyblade", "Bakugan"],
  ["Saint Seiya", "Yu Yu Hakusho"],
  ["Mob Psycho 100", "One Punch Man"],
  ["Dr. Stone", "Cells at Work!"],
  ["The Disastrous Life of Saiki K.", "Mob Psycho 100"],
  ["Gintama", "KonoSuba"],
  ["JoJo's Bizarre Adventure", "Hunter x Hunter"],
  ["Vinland Saga", "Kingdom"],
  ["Berserk", "Vinland Saga"],
  ["Frieren", "Violet Evergarden"],
  ["Delicious in Dungeon", "Frieren"],
  ["Kaiju No. 8", "Attack on Titan"],
  ["Solo Leveling", "Sword Art Online"],
  ["Dandadan", "Mob Psycho 100"],
  ["Sakamoto Days", "Spy x Family"],
  ["Wind Breaker", "Tokyo Revengers"],
  ["The Apothecary Diaries", "Raven of the Inner Palace"],
  ["Bocchi the Rock!", "K-On!"],
  ["Cyberpunk: Edgerunners", "Akudama Drive"],
  ["Blue Box", "Horimiya"],
  ["Mashle", "One Punch Man"],
  ["Hell's Paradise", "Chainsaw Man"],
  ["Frieren", "To Your Eternity"],
]);

const CHARACTER_PAIRS: WordPair[] = [
  ...samePairs("Naruto", [
    ["Naruto", "Boruto"],
    ["Itachi", "Sasuke"],
    ["Kakashi", "Obito"],
    ["Madara", "Hashirama"],
    ["Naruto", "Sasuke"],
    ["Gaara", "Rock Lee"],
    ["Minato", "Kakashi"],
    ["Jiraiya", "Orochimaru"],
  ]),
  ...samePairs("One Piece", [
    ["Luffy", "Ace"],
    ["Zoro", "Sanji"],
    ["Shanks", "Mihawk"],
    ["Law", "Kid"],
    ["Doflamingo", "Crocodile"],
    ["Katakuri", "Doflamingo"],
    ["Robin", "Nami"],
    ["Usopp", "Buggy"],
  ]),
  ...samePairs("Dragon Ball", [
    ["Goku", "Vegeta"],
    ["Gohan", "Trunks"],
    ["Piccolo", "Vegeta"],
    ["Frieza", "Cell"],
    ["Broly", "Jiren"],
    ["Goku", "Gohan"],
  ]),
  ...samePairs("Bleach", [
    ["Ichigo", "Rukia"],
    ["Ichigo", "Renji"],
    ["Byakuya", "Kenpachi"],
    ["Aizen", "Urahara"],
    ["Yhwach", "Aizen"],
  ]),
  ...samePairs("Jujutsu Kaisen", [
    ["Gojo", "Sukuna"],
    ["Yuji", "Megumi"],
    ["Yuji", "Yuta"],
    ["Nobara", "Maki"],
    ["Toji", "Maki"],
    ["Nanami", "Gojo"],
    ["Geto", "Gojo"],
  ]),
  ...samePairs("Demon Slayer", [
    ["Tanjiro", "Inosuke"],
    ["Tanjiro", "Zenitsu"],
    ["Giyu", "Sanemi"],
    ["Rengoku", "Tengen"],
    ["Mitsuri", "Shinobu"],
    ["Akaza", "Doma"],
    ["Muzan", "Kokushibo"],
    ["Inosuke", "Shinobu"],
  ]),
  ...samePairs("My Hero Academia", [
    ["Deku", "Bakugo"],
    ["Deku", "Todoroki"],
    ["Bakugo", "Todoroki"],
    ["All Might", "Endeavor"],
    ["Shigaraki", "Dabi"],
    ["Aizawa", "Present Mic"],
  ]),
  ...samePairs("Hunter x Hunter", [
    ["Gon", "Killua"],
    ["Kurapika", "Leorio"],
    ["Hisoka", "Illumi"],
    ["Chrollo", "Hisoka"],
    ["Meruem", "Netero"],
  ]),
  ...samePairs("Attack on Titan", [
    ["Eren", "Levi"],
    ["Mikasa", "Annie"],
    ["Armin", "Erwin"],
    ["Reiner", "Bertholdt"],
    ["Eren", "Reiner"],
    ["Levi", "Mikasa"],
  ]),
  ...samePairs("Fullmetal Alchemist", [["Winry", "Riza Hawkeye"]]),
  ...samePairs("One Punch Man", [
    ["Saitama", "Genos"],
    ["Saitama", "Garou"],
    ["Garou", "Boros"],
  ]),
  ...samePairs("Mob Psycho 100", [
    ["Mob", "Reigen"],
    ["Mob", "Teruki"],
  ]),
  ...samePairs("Re:Zero", [
    ["Rem", "Emilia"],
    ["Rem", "Ram"],
  ]),
  crossPair("Re:Zero", "Subaru", "Konosuba", "Kazuma"),
  ...samePairs("Fairy Tail", [
    ["Natsu", "Gray"],
    ["Natsu", "Gajeel"],
    ["Erza", "Mirajane"],
    ["Lucy", "Wendy"],
  ]),
  ...samePairs("JoJo", [
    ["Jotaro", "Dio"],
    ["Jonathan", "Joseph"],
    ["Josuke", "Giorno"],
  ]),
  ...samePairs("Death Note", [["Light Yagami", "L"]]),
  crossPair("Code Geass", "Lelouch", "Death Note", "Light Yagami"),
  ...samePairs("Sword Art Online", [["Kirito", "Eugeo"]]),
  ...samePairs("Fire Force", [["Shinra", "Arthur"]]),
  ...samePairs("Vinland Saga", [["Thorfinn", "Askeladd"]]),
  ...samePairs("Berserk", [["Guts", "Griffith"]]),
  ...samePairs("Chainsaw Man", [
    ["Denji", "Aki"],
    ["Denji", "Power"],
    ["Makima", "Power"],
  ]),
  ...samePairs("Frieren", [["Frieren", "Fern"]]),
  ...samePairs("Dr. Stone", [["Senku", "Chrome"]]),
  ...samePairs("Blue Lock", [
    ["Isagi", "Rin"],
    ["Bachira", "Isagi"],
  ]),
  ...samePairs("Haikyuu", [["Kageyama", "Hinata"]]),
  ...samePairs("Tokyo Revengers", [
    ["Takemichi", "Mikey"],
    ["Mikey", "Draken"],
  ]),
  // Paires inter-anime : elles partagent un rôle, un caractère ou un détail
  // visuel assez net pour donner des indices, sans être des copies évidentes.
  crossPair("Jujutsu Kaisen", "Mahito", "My Hero Academia", "Shigaraki"),
  crossPair("Jujutsu Kaisen", "Gojo", "Naruto", "Kakashi"),
  crossPair("Jujutsu Kaisen", "Sukuna", "Demon Slayer", "Muzan"),
  crossPair("Jujutsu Kaisen", "Yuji", "Chainsaw Man", "Denji"),
  crossPair("Jujutsu Kaisen", "Nobara", "Chainsaw Man", "Power"),
  crossPair("Jujutsu Kaisen", "Megumi", "Naruto", "Sasuke"),
  crossPair("Demon Slayer", "Tanjiro", "My Hero Academia", "Deku"),
  crossPair("Demon Slayer", "Zenitsu", "One Piece", "Sanji"),
  crossPair("Attack on Titan", "Eren", "Tokyo Ghoul", "Kaneki"),
  crossPair("One Piece", "Luffy", "Fairy Tail", "Natsu"),
  crossPair("One Piece", "Zoro", "Berserk", "Guts"),
  crossPair("Black Clover", "Asta", "Naruto", "Rock Lee"),
  crossPair("One Punch Man", "Saitama", "Mashle", "Mash"),
  crossPair("Mob Psycho 100", "Mob", "Saiki K.", "Saiki"),
  crossPair("Chainsaw Man", "Makima", "Akame ga Kill!", "Esdeath"),
  crossPair("Bleach", "Urahara", "Naruto", "Kakashi"),
  crossPair("My Hero Academia", "Bakugo", "Demon Slayer", "Inosuke"),
  crossPair("Attack on Titan", "Levi", "Hunter x Hunter", "Killua"),
  crossPair("Spy x Family", "Anya", "One Piece", "Chopper"),
  crossPair("Frieren", "Frieren", "The Apothecary Diaries", "Maomao"),
  crossPair("Spy x Family", "Loid", "Naruto", "Kakashi"),
  crossPair("Demon Slayer", "Tanjiro", "Bleach", "Ichigo"),
  crossPair("Demon Slayer", "Obanai", "Naruto", "Orochimaru"),
  crossPair("Chainsaw Man", "Kishibe", "Jujutsu Kaisen", "Nanami"),
  crossPair("Seven Deadly Sins", "Meliodas", "Black Clover", "Asta"),
  crossPair("One Punch Man", "Saitama", "Mob Psycho 100", "Mob"),
  // Quelques pièges hors anime fondés sur un nom ou une sonorité : drôles,
  // mais encore devinables avec des indices prudents.
];

const TECHNIQUE_PAIRS: WordPair[] = [
  ...samePairs("Naruto", [
    ["Rasengan", "Chidori"],
    ["Amaterasu", "Kagutsuchi"],
    ["Kamui", "Izanagi"],
    ["Izanami", "Izanagi"],
    ["Shadow Clone", "Multi Shadow Clone"],
    ["Summoning Jutsu", "Reanimation Jutsu"],
    ["Rasenshuriken", "Chidori"],
  ]),
  ...samePairs("Dragon Ball", [
    ["Kamehameha", "Galick Gun"],
    ["Kamehameha", "Final Flash"],
    ["Genkidama", "Kamehameha"],
    ["Kaioken", "Ultra Instinct"],
  ]),
  crossPair("Dragon Ball", "Instant Transmission", "Bleach", "Shunpo"),
  ...samePairs("Bleach", [["Bankai", "Shikai"]]),
  ...samePairs("Jujutsu Kaisen", [
    ["Hollow Purple", "Black Flash"],
    ["Domain Expansion", "Simple Domain"],
    ["Domain Expansion", "Domain Amplification"],
    ["Black Flash", "Divergent Fist"],
    ["Cursed Speech", "Ten Shadows Technique"],
    ["Limitless", "Ten Shadows Technique"],
    ["Malevolent Shrine", "Unlimited Void"],
  ]),
  ...samePairs("One Piece", [
    ["Gear Second", "Gear Third"],
    ["Gear Third", "Gear Fourth"],
    ["Gear Fourth", "Gear Fifth"],
    ["Room", "Gamma Knife"],
    ["Haki de l'Observation", "Haki des Rois"],
    ["Haki de l'Armement", "Haki des Rois"],
  ]),
  ...samePairs("Demon Slayer", [
    ["Divine Departure", "Kamishini no Yari"],
    ["Souffle de l'Eau", "Souffle du Feu"],
    ["Souffle de la foudre", "Souffle du Vent"],
    ["Nichirin Sword", "Breathing Technique"],
  ]),
  ...samePairs("My Hero Academia", [
    ["One For All", "All For One"],
    ["Detroit Smash", "United States of Smash"],
    ["Hellflame", "Half-Cold Half-Hot"],
  ]),
  crossPair("My Hero Academia", "Blackwhip", "My Hero Academia", "Fa Jin"),
  ...samePairs("Hunter x Hunter", [
    ["Jajanken", "Bungee Gum"],
    ["Godspeed", "Jajanken"],
    ["Skill Hunter", "Bungee Gum"],
  ]),
  ...samePairs("JoJo", [
    ["Star Platinum", "The World"],
    ["Crazy Diamond", "Killer Queen"],
    ["King Crimson", "The World"],
    ["Gold Experience", "Gold Experience Requiem"],
    ["Consecutive Normal Punches", "Serious Series"],
  ]),
  crossPair("Naruto", "Rasengan", "Gurren Lagann", "Spiral Power"),
  ...samePairs("Jujutsu Kaisen", [["Black Flash", "Divergent Fist"]]),
  ...samePairs("Yu Yu Hakusho", [["Spirit Gun", "Dragon of the Darkness Flame"]]),
  ...samePairs("Bleach", [["Getsuga Tenshou", "Getsuga Jūjishō"]]),
  crossPair("Fullmetal Alchemist", "Alchemy", "Hunter x Hunter", "Nen"),
  crossPair("Hunter x Hunter", "Nen", "Naruto", "Chakra"),
  crossPair("Jujutsu Kaisen", "Extension du Territoire", "Bleach", "Bankai"),
  crossPair("Naruto", "Sharingan", "Jujutsu Kaisen", "Six Eyes"),
  crossPair("Jujutsu Kaisen", "Énergie occulte", "Hunter x Hunter", "Nen"),
  crossPair("One Piece", "Fruit du Démon", "My Hero Academia", "Alter"),
  crossPair("Demon Slayer", "Souffle", "Naruto", "Chakra"),
];

const PLACE_PAIRS: WordPair[] = [
  ...samePairs("Naruto", [
    ["Konoha", "Suna"],
    ["Konoha", "Kiri"],
    ["Konoha", "Iwa"],
    ["Konoha", "Kumo"],
    ["Vallée de la Fin", "Mont Myoboku"],
    ["Vallée de la Fin", "Pont Kannabi"],
    ["Village caché de la Pluie", "Village caché de la Brume"],
    ["Village caché de la Pierre", "Village caché de la Foudre"],
    ["Forêt de la Mort", "Arène de l'Examen Chunin"],
  ]),
  ...samePairs("One Piece", [
    ["Marineford", "Enies Lobby"],
    ["Wano", "Dressrosa"],
    ["Water Seven", "Sabaody"],
    ["Alabasta", "Skypiea"],
    ["Whole Cake Island", "Wano"],
    ["Egghead", "Punk Hazard"],
    ["Impel Down", "Marineford"],
    ["Sabaody", "Amazon Lily"],
    ["Île des Hommes-Poissons", "Zou"],
  ]),
  ...samePairs("Attack on Titan", [
    ["Mur Maria", "Mur Rose"],
    ["Mur Sina", "Mur Maria"],
    ["Shiganshina", "Liberio"],
    ["Trost", "Shiganshina"],
    ["Forêt des Arbres Géants", "Château d'Utgard"],
  ]),
  ...samePairs("Jujutsu Kaisen", [
    ["Shibuya", "Tokyo Jujutsu"],
    ["Tokyo Jujutsu", "Kyoto Jujutsu"],
    ["École de Tokyo", "École de Kyoto"],
    ["Culling Game", "Shibuya"],
  ]),
  ...samePairs("Demon Slayer", [
    ["Mont Natagumo", "Quartier des Plaisirs"],
    ["Village des Forgerons", "Domaine des Papillons"],
    ["Train de l'Infini", "Quartier des Plaisirs"],
    ["Forteresse Infinie", "Village des Forgerons"],
  ]),
  ...samePairs("Dragon Ball", [
    ["Namek", "Planète Vegeta"],
    ["Capsule Corp", "Maison de Tortue Géniale"],
    ["Salle de l'Esprit et du Temps", "Tour de Karin"],
    ["Planète Kaioshin", "Planète de Kaio"],
  ]),
  ...samePairs("My Hero Academia", [["UA", "Kamino"]]),
  ...samePairs("Hunter x Hunter", [
    ["Tour Céleste", "Yorknew City"],
    ["Greed Island", "Yorknew City"],
    ["Palais de l'Est", "Mont Kukuroo"],
  ]),
  ...samePairs("Sword Art Online", [
    ["Aincrad", "Alfheim"],
    ["Aincrad", "Gun Gale Online"],
  ]),
];

const ARC_PAIRS: WordPair[] = [
  crossPair("Naruto", "Examen Chunin", "Hunter x Hunter", "Examen Hunter"),
  ...samePairs("Naruto", [
    ["Arc Pain", "Arc Sasuke Retrieval"],
    ["Arc Itachi Pursuit", "Arc Pain"],
  ]),
  crossPair("Naruto", "Guerre des Ninjas", "One Piece", "Guerre de Marineford"),
  ...samePairs("Naruto", [["Examen Chunin", "Arc de la Forêt de la Mort"]]),

  ...samePairs("One Piece", [
    ["Arc Wano", "Arc Alabasta"],
    ["Arc Marineford", "Arc Enies Lobby"],
    ["Arc Dressrosa", "Arc Whole Cake Island"],
    ["Arc Sabaody", "Arc Impel Down"],
    ["Arc Egghead", "Arc Wano"],
    ["Arc Water Seven", "Arc Enies Lobby"],
    ["Arc Alabasta", "Arc Skypiea"],
    ["Arc Thriller Bark", "Arc Punk Hazard"],
  ]),

  ...samePairs("Jujutsu Kaisen", [
    ["Arc Shibuya", "Arc Kyoto"],
    ["Arc Shibuya", "Arc Culling Game"],
    ["Arc Hidden Inventory", "Arc Shibuya"],
  ]),

  ...samePairs("Demon Slayer", [
    ["Arc du Train de l'Infini", "Arc du Quartier des Plaisirs"],
    ["Arc du Quartier des Plaisirs", "Arc du Village des Forgerons"],
    ["Arc du Village des Forgerons", "Arc de l'Entraînement des Piliers"],
    ["Arc de la Sélection Finale", "Arc du Train de l'Infini"],
  ]),

  ...samePairs("Dragon Ball", [
    ["Arc de Namek", "Arc de Cell"],
    ["Arc des Saiyans", "Arc de Freezer"],
    ["Arc de Cell", "Arc de Boo"],
    ["Arc de Beerus", "Arc de Freezer"],
  ]),

  ...samePairs("Attack on Titan", [
    ["Arc de la Reconquête de Shiganshina", "Arc de Marley"],
    ["Arc de Trost", "Arc de la Bataille de Shiganshina"],
    ["Arc du Titan Féminin", "Arc du Titan Bestial"],
  ]),

  ...samePairs("Hunter x Hunter", [
    ["Arc Chimera Ant", "Arc Greed Island"],
    ["Arc Yorknew City", "Arc Greed Island"],
    ["Arc Hunter Exam", "Arc Heavens Arena"],
  ]),

  ...samePairs("My Hero Academia", [
    ["Arc du Festival du Sport", "Arc du Stage"],
    ["Arc de l'Examen des Licences", "Arc du Festival du Sport"],
    ["Arc Paranormal Liberation War", "Arc Kamino"],
  ]),

  ...samePairs("Sword Art Online", [
    ["Arc Aincrad", "Arc Alfheim"],
    ["Arc Aincrad", "Arc Alicization"],
    ["Arc Gun Gale Online", "Arc Alicization"],
  ]),

  crossPair("Yu Yu Hakusho", "Arc Dark Tournament", "Hunter x Hunter", "Arc Chimera Ant"),
  ...samePairs("Berserk", [["Arc Golden Age", "Arc Eclipse"]]),
  crossPair("Jujutsu Kaisen", "Arc Shibuya", "One Piece", "Arc Marineford"),
  crossPair("Hunter x Hunter", "Arc Yorknew", "Jujutsu Kaisen", "Arc Shibuya"),
];

const GROUP_PAIRS: WordPair[] = [
  ...samePairs("Naruto", [
    ["Akatsuki", "Anbu"],
    ["Team 7", "Team Gai"],
    ["Team 10", "Team 8"],
    ["Akatsuki", "Sept Épéistes de la Brume"],
    ["Anbu", "Police Militaire de Konoha"],
  ]),

  ...samePairs("One Piece", [
    ["Équipage du Chapeau de Paille", "Équipage de Barbe Blanche"],
    ["Marine", "Cipher Pol"],
    ["Équipage de Barbe Noire", "Équipage de Barbe Blanche"],
    ["Supernovas", "Shichibukai"],
    ["Révolutionnaires", "Marine"],
    ["CP9", "CP0"],
  ]),

  ...samePairs("Demon Slayer", [
    ["Piliers", "Lunes Supérieures"],
    ["Pourfendeurs de Démons", "Démons"],
    ["Piliers", "Douze Lunes Démoniaques"],
    ["Lunes Inférieures", "Lunes Supérieures"],
  ]),

  ...samePairs("Attack on Titan", [
    ["Bataillon d'Exploration", "Brigade Spéciale"],
    ["Brigade Spéciale", "Garnison"],
    ["Guerriers de Marley", "Bataillon d'Exploration"],
    ["Guerriers de Marley", "Police Militaire"],
  ]),

  ...samePairs("Bleach", [
    ["Espada", "Capitaines du Gotei 13"],
    ["Gotei 13", "Onmitsukido"],
    ["Vizards", "Arrancars"],
    ["Quincy", "Shinigami"],
  ]),

  ...samePairs("Fairy Tail", [
    ["Fairy Tail", "Sabertooth"],
    ["Fairy Tail", "Blue Pegasus"],
    ["Sabertooth", "Lamia Scale"],
    ["Guilde Fairy Tail", "Guilde Phantom Lord"],
  ]),

  ...samePairs("Hunter x Hunter", [
    ["Brigade Fantôme", "Zodiaques"],
    ["Brigade Fantôme", "Famille Zoldyck"],
    ["Association Hunter", "Brigade Fantôme"],
  ]),

  ...samePairs("Dragon Ball", [
    ["Force Ginyu", "Guerriers Z"],
    ["Guerriers Z", "Armée de Freezer"],
    ["Patrouille Galactique", "Armée de Freezer"],
  ]),

  ...samePairs("My Hero Academia", [
    ["Classe 1-A", "Classe 1-B"],
    ["Ligue des Vilains", "Armée de Libération des Super-Pouvoirs"],
    ["Héros Pro", "Ligue des Vilains"],
  ]),

  ...samePairs("Jujutsu Kaisen", [
    ["École de Tokyo", "École de Kyoto"],
    ["Fléaux", "Exorcistes"],
    ["Clan Zenin", "Clan Gojo"],
  ]),

  ...samePairs("Seven Deadly Sins", [
    ["Sept Péchés Capitaux", "Dix Commandements"],
    ["Dix Commandements", "Chevaliers Sacrés"],
  ]),

  ...samePairs("Fullmetal Alchemist", [["Homunculus", "Alchimistes d'État"]]),
  ...samePairs("One Piece", [["Équipage de Roger", "Équipage de Barbe Blanche"]]),
  crossPair("Naruto", "Akatsuki", "Hunter x Hunter", "Phantom Troupe"),
  crossPair("Naruto", "Akatsuki", "My Hero Academia", "Ligue des Vilains"),
  crossPair("Demon Slayer", "Piliers", "My Hero Academia", "Héros Pro"),
  crossPair("Attack on Titan", "Bataillon d'Exploration", "Demon Slayer", "Pourfendeurs de Démons"),
  crossPair("Bleach", "Gotei 13", "Demon Slayer", "Piliers"),
];

const OBJECT_PAIRS: WordPair[] = [
  ...samePairs("Naruto", [
    ["Kunai", "Shuriken"],
    ["Bandeau frontal", "Gilet de ninja"],
    ["Parchemin", "Parchemin explosif"],
    ["Éventail de Gunbai", "Faux de Hidan"],
  ]),

  ...samePairs("One Piece", [
    ["Log Pose", "Vivre Card"],
    ["Den Den Mushi", "Den Den Mushi Noir"],
    ["Chapeau de paille", "Manteau de capitaine"],
    ["Yoru", "Wado Ichimonji"],
    ["Enma", "Wado Ichimonji"],
    ["Fruit du Démon", "Fruit du Démon artificiel"],
  ]),

  ...samePairs("Dragon Ball", [
    ["Dragon Balls", "Boules du Dragon Noir"],
    ["Potara", "Danse de la Fusion"],
    ["Senzu", "Capsule Hoi-Poi"],
    ["Bâton Magique", "Nuage Magique"],
  ]),

  ...samePairs("Jujutsu Kaisen", [
    ["Doigt de Sukuna", "Objet Maudit"],
    ["Doigt de Sukuna", "Œil de Gojo"],
    ["Arme Inversée du Paradis", "Lance Céleste Inversée"],
  ]),

  ...samePairs("Demon Slayer", [
    ["Lame Nichirin", "Épée rouge Nichirin"],
    ["Boîte de Nezuko", "Épée de Nichirin"],
    ["Masque de Sabito", "Masque de Kitsune"],
  ]),

  ...samePairs("Attack on Titan", [
    ["Équipement tridimensionnel", "Fusil anti-Titan"],
    ["Lame anti-Titan", "Lance Foudroyante"],
    ["Clé de la cave", "Badge du Bataillon"],
  ]),

  ...samePairs("My Hero Academia", [
    ["Costume de héros", "Costume de héros professionnel"],
    ["Support Item", "Costume de combat"],
  ]),

  ...samePairs("Hunter x Hunter", [
    ["Téléphone de Hunter", "Carte de Hunter"],
    ["Carte de Greed Island", "Livre de Greed Island"],
  ]),

  ...samePairs("Death Note", [
    ["Death Note", "Death Eraser"],
    ["Death Note", "Grimoire"],
  ]),
  crossPair("Death Note", "Death Note", "Jujutsu Kaisen", "Doigt de Sukuna"),
  crossPair("Pokémon", "Poké Ball", "Dragon Ball", "Dragon Ball"),
  crossPair("Demon Slayer", "Lame Nichirin", "Bleach", "Zanpakutō"),
  crossPair("One Piece", "Chapeau de paille", "Naruto", "Bandeau frontal"),
];

// Les références non-anime restent volontairement isolées : une partie
// classique ne doit pas tomber par surprise sur Coca Light ou Poudlard.
const CROSSOVER_PAIRS: WordPair[] = [
  crossPair("Death Note", "Light Yagami", "Blague", "Coca Light"),
  crossPair("Dragon Ball", "Freezer", "Histoire", "Hitler"),
  crossPair("My Hero Academia", "Tenya Iida", "DC Comics", "Flash"),
  crossPair("Naruto", "Pain", "Boulangerie", "Pain au chocolat"),
  crossPair("Chainsaw Man", "Power", "Bureautique", "PowerPoint"),
  crossPair("Naruto", "Rasengan", "Street Fighter", "Hadouken"),
  crossPair("Dragon Ball", "Kamehameha", "Street Fighter", "Hadouken"),
  crossPair("Naruto", "Sharingan", "Marvel", "Spider-Sense"),
  crossPair("My Hero Academia", "U.A.", "Marvel", "Institut Xavier"),
  crossPair("Naruto", "Konoha", "Harry Potter", "Poudlard"),
  crossPair("Jujutsu Kaisen", "Shibuya", "DC Comics", "Gotham"),
  crossPair("Naruto", "Examen Chunin", "Harry Potter", "Tournoi des Trois Sorciers"),
  crossPair("One Piece", "Bataille de Marineford", "Harry Potter", "Bataille de Poudlard"),
  crossPair("Jujutsu Kaisen", "Culling Game", "Hunger Games", "Hunger Games"),
  crossPair("Naruto", "Akatsuki", "Kingdom Hearts", "Organisation XIII"),
  crossPair("Attack on Titan", "Bataillon d'Exploration", "Game of Thrones", "Garde de Nuit"),
  crossPair("My Hero Academia", "Ligue des Vilains", "DC Comics", "Suicide Squad"),
  crossPair("Death Note", "Death Note", "Le Seigneur des Anneaux", "Anneau Unique"),
  crossPair("Demon Slayer", "Lame Nichirin", "Star Wars", "Sabre laser"),
  crossPair("Dragon Ball", "Dragon Balls", "Marvel", "Pierres d'Infinité"),
  crossPair("Attack on Titan", "Équipement tridimensionnel", "Marvel", "Lance-toiles de Spider-Man"),
];

const CATEGORY_MAP: Record<Exclude<WordCategory, "random">, WordPair[]> = {
  anime: ANIME_PAIRS,
  character: CHARACTER_PAIRS,
  technique: TECHNIQUE_PAIRS,
  place: PLACE_PAIRS,
  arc: ARC_PAIRS,
  group: GROUP_PAIRS,
  object: OBJECT_PAIRS,
  crossover: CROSSOVER_PAIRS,
};

export type PairCategory = Exclude<WordCategory, "random">;
export interface PickedPair extends WordPair {
  category: PairCategory;
  id: string;
}

// La catégorie voyage avec la paire : en "random" personne ne sait de quelle
// liste le mot sort, et le client en a besoin pour décider s'il peut chercher
// une image (un groupe ou un lieu n'existe pas sur AniList — voir app.js).
function normalizeId(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const ALL_PAIRS: PickedPair[] = (Object.entries(CATEGORY_MAP) as [PairCategory, WordPair[]][]).flatMap(
  ([category, pairs]) => pairs.map((pair) => ({
    ...pair,
    category,
    id: `${category}:${normalizeId(pair.a)}:${normalizeId(pair.b)}`,
  }))
);

const NON_ANIME_HINTS = new Set([
  "Anime", "Blague", "Histoire", "Boulangerie", "Bureautique", "DC Comics", "Marvel",
  "Street Fighter", "Harry Potter", "Hunger Games", "Kingdom Hearts", "Game of Thrones",
  "Le Seigneur des Anneaux", "Star Wars",
]);

export const UNDERCOVER_SOURCES = [...new Set(ALL_PAIRS.flatMap((pair) =>
  pair.category === "anime"
    ? [pair.a, pair.b]
    : [pair.hintA, pair.hintB].filter((hint) => !NON_ANIME_HINTS.has(hint))
))].sort((a, b) => a.localeCompare(b));

function sourcesOf(pair: PickedPair): string[] {
  return pair.category === "anime"
    ? [pair.a, pair.b]
    : [pair.hintA, pair.hintB].filter((hint) => UNDERCOVER_SOURCES.includes(hint));
}

export function availablePairCount(category: WordCategory, excludedSources: string[] = []): number {
  const excluded = new Set(excludedSources.map((source) => source.toLowerCase()));
  return ALL_PAIRS.filter((pair) =>
    (category === "random" || pair.category === category) &&
    !sourcesOf(pair).some((source) => excluded.has(source.toLowerCase()))
  ).length;
}

export function pickRandomPair(category: WordCategory, excludedSources: string[] = []): PickedPair {
  const excluded = new Set(excludedSources.map((source) => source.toLowerCase()));
  const pool = ALL_PAIRS.filter((pair) =>
    (category === "random" || pair.category === category) &&
    !sourcesOf(pair).some((source) => excluded.has(source.toLowerCase()))
  );
  if (pool.length === 0) throw new Error("Aucune paire disponible avec ces exclusions.");
  return pool[Math.floor(Math.random() * pool.length)];
}
