// Pool de mots pour les tuiles du plateau — des mots seuls, pas des paires
// comme dans undercover/words.ts : chaque jeu reste autonome (cf.
// src/CLAUDE.md), et Codenames a besoin d'un seul grand sac de mots courts
// plutôt que de catégories.
export const WORDS: string[] = [
  // Personnages
  "Naruto", "Sasuke", "Sakura", "Kakashi", "Itachi", "Gaara", "Jiraiya", "Orochimaru", "Boruto",
  "Luffy", "Zoro", "Nami", "Sanji", "Chopper", "Robin", "Shanks", "Ace", "Law", "Katakuri",
  "Goku", "Vegeta", "Gohan", "Piccolo", "Frieza", "Trunks", "Broly", "Beerus",
  "Ichigo", "Rukia", "Aizen", "Byakuya", "Kenpachi",
  "Gojo", "Sukuna", "Yuji", "Nobara", "Megumi", "Nanami",
  "Tanjiro", "Nezuko", "Zenitsu", "Inosuke", "Muzan", "Rengoku",
  "Deku", "Bakugo", "Todoroki", "Endeavor", "Shigaraki",
  "Gon", "Killua", "Kurapika", "Hisoka", "Chrollo", "Meruem",
  "Eren", "Mikasa", "Levi", "Armin", "Erwin", "Annie",
  "Saitama", "Genos", "Garou", "Mob", "Reigen",
  "Light", "Lelouch", "Kirito", "Asuna", "Guts", "Thorfinn",
  "Senku", "Rem", "Natsu", "Erza", "Jotaro", "Dio",
  "Makima", "Power", "Denji", "Aki",
  "Frieren", "Fern", "Isagi", "Hinata", "Kageyama",
  "Subaru", "Rimuru", "Anya", "Loid",

  // Lieux
  "Konoha", "Suna", "Wano", "Alabasta", "Marineford", "Namek", "Shibuya", "Karakura",
  "Hueco Mundo", "Zou", "Aincrad", "Egghead", "Kamino", "Yorknew", "Shiganshina", "Trost",
  "Whole Cake", "Sabaody", "Impel Down", "Skypiea", "Water Seven",

  // Objets et pouvoirs
  "Rasengan", "Chidori", "Sharingan", "Byakugan", "Rinnegan", "Zanpakuto", "Bankai",
  "Kamehameha", "Genkidama", "Domain Expansion", "Nichirin", "Kunai", "Shuriken",
  "One For All", "Death Note", "Poneglyph", "Fruit du Démon", "Dragon Balls", "Haki",

  // Groupes et concepts
  "Akatsuki", "Marine", "Espada", "Piliers", "Hokage", "Titan", "Shinobi", "Samurai",
  "Ninja", "Yokai", "Kaiju", "Mecha", "Isekai", "Nakama", "Dojo", "Onigiri", "Ramen", "Sake",
  "Mangaka", "Otaku", "Shonen", "Kawaii", "Tsundere", "Chibi", "Bushido", "Ronin", "Sensei",
  "Bento", "Katana", "Cosplay",

  // Séries et studios
  "Ghibli", "Totoro", "Pikachu", "Digimon", "Doraemon", "Conan", "Evangelion", "Gundam",
  "Haikyuu", "Bleach", "One Piece", "Dragon Ball", "Jujutsu Kaisen", "Chainsaw Man",
  "Spy x Family", "Demon Slayer", "My Hero Academia", "Attack on Titan", "Hunter x Hunter",
  "Code Geass", "Sword Art Online", "Vinland Saga", "Fairy Tail", "Fullmetal Alchemist",
  "Mob Psycho", "One Punch Man", "Steins;Gate", "Cowboy Bebop", "JoJo",
];
