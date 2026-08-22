// Pool de mots pour les tuiles du plateau — des mots seuls, pas des paires
// comme dans undercover/words.ts : chaque jeu reste autonome (cf.
// src/CLAUDE.md), et Codenames a besoin d'un seul grand sac de mots courts
// plutôt que de catégories.
export const WORDS: string[] = [
  // Personnages
  "Naruto", "Sasuke", "Sakura", "Kakashi", "Itachi", "Gaara", "Jiraiya", "Orochimaru", "Boruto",
  "Tsunade", "Kabuto", "Deidara", "Sasori", "Kisame", "Nagato", "Neji", "Shikamaru", "Choji",
  "Luffy", "Zoro", "Nami", "Sanji", "Chopper", "Robin", "Shanks", "Ace", "Law", "Katakuri",
  "Yamato", "Kaido", "Big Mom", "Usopp", "Franky", "Brook", "Jinbe", "Buggy", "Crocodile",
  "Doflamingo", "Whitebeard", "Blackbeard",
  "Goku", "Vegeta", "Gohan", "Piccolo", "Frieza", "Trunks", "Broly", "Beerus",
  "Ichigo", "Rukia", "Aizen", "Byakuya", "Kenpachi", "Toshiro", "Orihime", "Chad", "Uryu",
  "Yoruichi", "Grimmjow", "Ulquiorra",
  "Gojo", "Sukuna", "Yuji", "Nobara", "Megumi", "Nanami", "Maki", "Toji", "Yuta",
  "Tanjiro", "Nezuko", "Zenitsu", "Inosuke", "Muzan", "Rengoku", "Shinobu", "Kanao", "Giyu",
  "Akaza", "Doma",
  "Deku", "Bakugo", "Todoroki", "Endeavor", "Shigaraki", "Ochaco", "Iida", "Kirishima",
  "Tokoyami", "Aizawa",
  "Gon", "Killua", "Kurapika", "Hisoka", "Chrollo", "Meruem", "Leorio", "Netero",
  "Eren", "Mikasa", "Levi", "Armin", "Erwin", "Annie", "Historia", "Hange", "Zeke", "Reiner", "Ymir",
  "Saitama", "Genos", "Garou", "Mob", "Reigen", "Bang", "Tatsumaki", "King", "Fubuki",
  "Light", "Misa", "Near", "Lelouch", "Suzaku", "Nunnally",
  "Kirito", "Asuna", "Klein", "Sinon", "Guts", "Thorfinn", "Canute", "Einar",
  "Senku", "Rem", "Natsu", "Erza", "Jotaro", "Dio",
  "Makima", "Power", "Denji", "Aki", "Kobeni",
  "Frieren", "Fern", "Himmel", "Stark",
  "Isagi", "Rin", "Bachira", "Hinata", "Kageyama",
  "Subaru", "Rimuru", "Anya", "Loid", "Yor", "Bond", "Draken", "Mikey",

  // Lieux
  "Konoha", "Suna", "Wano", "Alabasta", "Marineford", "Namek", "Shibuya", "Karakura",
  "Hueco Mundo", "Zou", "Aincrad", "Egghead", "Kamino", "Yorknew", "Shiganshina", "Trost",
  "Whole Cake", "Sabaody", "Impel Down", "Skypiea", "Water Seven",
  "Dressrosa", "Punk Hazard", "Enies Lobby", "Amazon Lily", "Onigashima", "Grand Line",

  // Objets et pouvoirs
  "Rasengan", "Chidori", "Sharingan", "Byakugan", "Rinnegan", "Zanpakuto", "Bankai",
  "Kamehameha", "Genkidama", "Domain Expansion", "Nichirin", "Kunai", "Shuriken",
  "One For All", "Death Note", "Poneglyph", "Fruit du Démon", "Dragon Balls", "Haki",
  "Susanoo", "Amaterasu", "Izanagi", "Gear Fifth", "Haoshoku Haki", "Poké Ball",

  // Groupes et concepts
  "Akatsuki", "Marine", "Espada", "Piliers", "Hokage", "Titan", "Shinobi", "Samurai",
  "Ninja", "Yokai", "Kaiju", "Mecha", "Isekai", "Nakama", "Dojo", "Onigiri", "Ramen", "Sake",
  "Mangaka", "Otaku", "Shonen", "Kawaii", "Chibi", "Bushido", "Ronin", "Sensei",
  "Bento", "Katana", "Cosplay", "Hollow", "Quincy", "Shinigami", "Arrancar",
  "Jinchuriki", "Kekkei Genkai", "Seiyuu", "Doujin", "Shoujo",

  // Séries et studios
  "Ghibli", "Totoro", "Pikachu", "Digimon", "Doraemon", "Conan", "Evangelion", "Gundam",
  "Haikyuu", "Bleach", "One Piece", "Dragon Ball", "Jujutsu Kaisen", "Chainsaw Man",
  "Spy x Family", "Demon Slayer", "My Hero Academia", "Attack on Titan", "Hunter x Hunter",
  "Code Geass", "Sword Art Online", "Vinland Saga", "Fairy Tail", "Fullmetal Alchemist",
  "Mob Psycho", "One Punch Man", "Steins;Gate", "Cowboy Bebop", "JoJo",
  "Tokyo Ghoul", "Made in Abyss", "Re:Zero", "Konosuba", "Overlord", "Toradora",
  "Your Name", "A Silent Voice", "Berserk", "Slam Dunk", "Inuyasha", "Sailor Moon",
  "Yu-Gi-Oh", "Pokémon", "Violet Evergarden", "Kaguya-sama", "Black Clover", "Fire Force",
  "Dr. Stone", "Assassination Classroom", "Blue Exorcist", "Monster", "Psycho-Pass",
  "Kill la Kill", "Fist of the North Star", "Rurouni Kenshin", "Yu Yu Hakusho", "Trigun",
  "Hellsing", "Elfen Lied", "Tokyo Revengers",
];
