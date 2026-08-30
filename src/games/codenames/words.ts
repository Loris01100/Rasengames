// Pool de mots pour les tuiles du plateau. Chaque mot porte un indice de
// contexte (`hint`) — sa série d'origine, ou une catégorie générique pour les
// mots de culture japonaise pas liés à une série précise — affiché en petit
// sous le mot sur chaque tuile. Ça aide surtout qui doit donner un indice :
// un chiffreur qui ne reconnaît pas "Grimoire" ou "Poneglyph" voit quand même
// "Black Clover" / "One Piece" et peut construire son indice autour de ça.
// Un jeu autonome par jeu (cf. src/CLAUDE.md), donc pas de paires comme dans
// undercover/words.ts : juste ce grand sac de mots.
export interface WordEntry {
  word: string;
  hint: string;
}

function group(hint: string, words: string[]): WordEntry[] {
  return words.map((word) => ({ word, hint }));
}

export const WORDS: WordEntry[] = [
  ...group("Naruto", [
    "Naruto", "Sasuke", "Sakura", "Kakashi", "Itachi", "Gaara", "Jiraiya", "Orochimaru", "Boruto",
    "Tsunade", "Kabuto", "Deidara", "Sasori", "Kisame", "Nagato", "Neji", "Shikamaru", "Choji",
    "Konoha", "Suna", "Rasengan", "Chidori", "Sharingan", "Byakugan", "Rinnegan", "Kunai", "Shuriken",
    "Susanoo", "Amaterasu", "Izanagi", "Akatsuki", "Hokage", "Shinobi", "Jinchuriki", "Kekkei Genkai",
  ]),

  ...group("One Piece", [
    "Luffy", "Zoro", "Nami", "Sanji", "Chopper", "Robin", "Shanks", "Ace", "Law", "Katakuri",
    "Yamato", "Kaido", "Big Mom", "Usopp", "Franky", "Brook", "Jinbe", "Buggy", "Crocodile",
    "Doflamingo", "Whitebeard", "Blackbeard",
    "Wano", "Alabasta", "Marineford", "Zou", "Egghead", "Whole Cake", "Sabaody", "Impel Down",
    "Skypiea", "Water Seven", "Dressrosa", "Punk Hazard", "Enies Lobby", "Amazon Lily",
    "Onigashima", "Grand Line",
    "Poneglyph", "Fruit du Démon", "Haki", "Gear Fifth", "Haoshoku Haki", "Marine",
  ]),

  ...group("Dragon Ball", [
    "Goku", "Vegeta", "Gohan", "Piccolo", "Frieza", "Trunks", "Broly", "Beerus", "Namek",
    "Kamehameha", "Genkidama", "Dragon Balls",
  ]),

  ...group("Bleach", [
    "Ichigo", "Rukia", "Aizen", "Byakuya", "Kenpachi", "Toshiro", "Orihime", "Chad", "Uryu",
    "Yoruichi", "Grimmjow", "Ulquiorra", "Karakura", "Hueco Mundo", "Zanpakuto", "Bankai",
    "Espada", "Hollow", "Quincy", "Shinigami", "Arrancar",
  ]),

  ...group("Jujutsu Kaisen", [
    "Gojo", "Sukuna", "Yuji", "Nobara", "Megumi", "Nanami", "Maki", "Toji", "Yuta",
    "Shibuya", "Domain Expansion",
  ]),

  ...group("Demon Slayer", [
    "Tanjiro", "Nezuko", "Zenitsu", "Inosuke", "Muzan", "Rengoku", "Shinobu", "Kanao", "Giyu",
    "Akaza", "Doma", "Nichirin", "Piliers",
  ]),

  ...group("My Hero Academia", [
    "Deku", "Bakugo", "Todoroki", "Endeavor", "Shigaraki", "Ochaco", "Iida", "Kirishima",
    "Tokoyami", "Aizawa", "All Might", "Momo", "Tsuyu", "Mineta", "Jiro", "Mirio", "Dabi",
    "Toga", "Twice", "Mirko", "Hawks", "Nezu", "Stain", "Eri", "Nomu", "All For One",
    "Kamino", "One For All", "Plus Ultra", "Quirk",
  ]),

  ...group("Hunter x Hunter", [
    "Gon", "Killua", "Kurapika", "Hisoka", "Chrollo", "Meruem", "Leorio", "Netero",
    "Feitan", "Machi", "Shalnark", "Phinks", "Nobunaga", "Illumi", "Silva", "Zeno",
    "Biscuit", "Knuckle", "Morel", "Kite", "Komugi", "Palm", "Yorknew",
    "Nen", "Godspeed", "Bungee Gum", "Jajanken",
    "Phantom Troupe", "Zoldyck Family", "Hunter Exam", "Greed Island", "Chimera Ant",
  ]),

  ...group("Attack on Titan", [
    "Eren", "Mikasa", "Levi", "Armin", "Erwin", "Annie", "Historia", "Hange", "Zeke", "Reiner",
    "Ymir", "Shiganshina", "Trost", "Titan",
  ]),

  ...group("One Punch Man", ["Saitama", "Genos", "Garou", "Bang", "Tatsumaki", "King", "Fubuki"]),
  ...group("Mob Psycho 100", ["Mob", "Reigen"]),
  ...group("Death Note", ["Light", "Misa", "Near", "Death Note"]),
  ...group("Code Geass", ["Lelouch", "Suzaku", "Nunnally"]),
  ...group("Sword Art Online", ["Kirito", "Asuna", "Klein", "Sinon", "Aincrad"]),
  ...group("Berserk", ["Guts"]),
  ...group("Vinland Saga", ["Thorfinn", "Canute", "Einar"]),
  ...group("Dr. Stone", ["Senku"]),
  ...group("Re:Zero", ["Rem", "Subaru"]),
  ...group("Fairy Tail", ["Natsu", "Erza"]),
  ...group("JoJo", ["Jotaro", "Dio"]),
  ...group("Chainsaw Man", ["Makima", "Power", "Denji", "Aki", "Kobeni"]),
  ...group("Frieren", ["Frieren", "Fern", "Himmel", "Stark"]),
  ...group("Blue Lock", ["Isagi", "Rin", "Bachira"]),
  ...group("Haikyuu", ["Hinata", "Kageyama"]),
  ...group("Reincarnated as a Slime", ["Rimuru"]),
  ...group("Spy x Family", ["Anya", "Loid", "Yor", "Bond"]),
  ...group("Tokyo Revengers", ["Draken", "Mikey"]),

  ...group("Black Clover", [
    "Asta", "Yuno", "Noelle", "Yami", "Klaus", "Finral", "Charmy", "Magna", "Luck",
    "Gauche", "Vanessa", "Nacht", "Julius", "Licht", "Zenon", "Mereoleona", "Fuegoleon",
    "Nozel", "Charlotte", "Zora", "Leopold", "Mimosa",
    "Clover Kingdom", "Spade Kingdom", "Heart Kingdom", "Diamond Kingdom",
    "Grimoire", "Anti Magic", "Magic Knights", "Black Bulls",
  ]),

  ...group("Pokémon", ["Pikachu", "Poké Ball"]),
  ...group("Studio", ["Ghibli"]),
  ...group("Ghibli", ["Totoro"]),

  // Culture / vocabulaire anime générique, pas rattaché à une série précise.
  ...group("Culture japonaise", [
    "Samurai", "Ninja", "Yokai", "Kaiju", "Mecha", "Isekai", "Nakama", "Dojo", "Onigiri",
    "Ramen", "Sake", "Mangaka", "Otaku", "Shonen", "Kawaii", "Chibi", "Bushido", "Ronin",
    "Sensei", "Bento", "Katana", "Cosplay", "Seiyuu", "Doujin", "Shoujo",
  ]),

  // Titres de série : le mot se désigne déjà lui-même, l'indice confirme
  // juste que c'est bien un anime/manga et pas autre chose.
  ...group("Anime", [
    "Digimon", "Evangelion", "Haikyuu", "Bleach", "One Piece",
    "Dragon Ball", "Jujutsu Kaisen", "Chainsaw Man", "Spy x Family", "Demon Slayer",
    "My Hero Academia", "Attack on Titan", "Hunter x Hunter", "Code Geass", "Sword Art Online",
    "Vinland Saga", "Fairy Tail", "Fullmetal Alchemist", "Mob Psycho", "One Punch Man",
    "Steins;Gate", "Cowboy Bebop", "JoJo", "Tokyo Ghoul", "Re:Zero",
    "Konosuba", "Overlord", "Toradora", "Your Name", "A Silent Voice", "Berserk", "Slam Dunk",
    "Inuyasha", "Sailor Moon", "Yu-Gi-Oh", "Pokémon", "Violet Evergarden", "Love is War",
    "Black Clover", "Fire Force", "Dr. Stone", "Assassination Classroom", "Blue Exorcist",
    "Monster", "Psycho-Pass", "Kill la Kill", "Yu Yu Hakusho", "Trigun", "Elfen Lied", "Tokyo Revengers", "Monogatari",
    "Solo Leveling", "Blue Lock", "Dandadan", "Kaiju No. 8", "Horimiya",
    "Oshi no Ko", "The Apothecary Diaries", "Mashle", "Wind Breaker", "Hell's Paradise",
    "Cyberpunk Edgerunners", "Bocchi the Rock", "Delicious in Dungeon", "My Dress-Up Darling",
    "Mushoku Tensei", "The Eminence in Shadow", "Sakamoto Days", "Zom 100",
  ]),
];
