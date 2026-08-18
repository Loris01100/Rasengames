// Characters grouped by their series, so a room can play with the whole pool
// or restrict the round to one anime everybody has actually watched.
export const CHARACTERS_BY_ANIME: Record<string, string[]> = {
  Naruto: ["Naruto Uzumaki", "Sasuke Uchiha", "Itachi Uchiha", "Kakashi Hatake", "Sakura Haruno", "Gaara", "Jiraiya", "Hinata Hyuga"],
  "One Piece": ["Monkey D. Luffy", "Roronoa Zoro", "Nami", "Sanji", "Tony Tony Chopper", "Nico Robin", "Portgas D. Ace", "Trafalgar Law"],
  "Dragon Ball": ["Son Goku", "Vegeta", "Piccolo", "Gohan", "Freezer", "Trunks", "Bulma"],
  "L'Attaque des Titans": ["Eren Yeager", "Mikasa Ackerman", "Levi Ackerman", "Armin Arlert", "Historia Reiss", "Erwin Smith"],
  "Demon Slayer": ["Tanjiro Kamado", "Nezuko Kamado", "Zenitsu Agatsuma", "Inosuke Hashibira", "Giyu Tomioka", "Kyojuro Rengoku", "Muzan Kibutsuji"],
  "My Hero Academia": ["Izuku Midoriya", "Katsuki Bakugo", "Shoto Todoroki", "Ochaco Uraraka", "All Might", "Tsuyu Asui"],
  "One Punch Man": ["Saitama", "Genos", "Tatsumaki", "Mumen Rider"],
  "Death Note": ["Light Yagami", "L", "Misa Amane", "Ryuk", "Near"],
  "Fullmetal Alchemist": ["Edward Elric", "Alphonse Elric", "Roy Mustang", "Winry Rockbell", "Envy"],
  "Fairy Tail": ["Natsu Dragneel", "Erza Scarlet", "Lucy Heartfilia", "Gray Fullbuster", "Happy"],
  Bleach: ["Ichigo Kurosaki", "Rukia Kuchiki", "Byakuya Kuchiki", "Kisuke Urahara", "Aizen"],
  "Jujutsu Kaisen": ["Satoru Gojo", "Yuji Itadori", "Sukuna", "Megumi Fushiguro", "Nobara Kugisaki", "Kento Nanami"],
  "Hunter x Hunter": ["Killua Zoldyck", "Gon Freecss", "Kurapika", "Leorio", "Hisoka", "Meruem"],
  "Re:Zero": ["Rem", "Emilia", "Subaru Natsuki", "Ram", "Beatrice"],
  Konosuba: ["Megumin", "Kazuma Sato", "Aqua", "Darkness"],
  "Code Geass": ["Lelouch Lamperouge", "C.C.", "Suzaku Kururugi", "Kallen Stadtfeld"],
  "Spy x Family": ["Anya Forger", "Loid Forger", "Yor Forger", "Bond Forger"],
  "Chainsaw Man": ["Denji", "Power", "Makima", "Aki Hayakawa"],
  "Tokyo Ghoul": ["Kaneki Ken", "Touka Kirishima", "Juzo Suzuya", "Rize Kamishiro"],
  Pokemon: ["Ash Ketchum", "Pikachu", "Ondine", "Team Rocket Jessie", "Sacha Dracaufeu"],
  Divers: ["Violet Evergarden", "Spike Spiegel", "Sailor Moon", "Rimuru Tempest", "Edward Wong", "Vash the Stampede", "Guts", "Thorfinn"],
};

export const ANIME_LIST: string[] = Object.keys(CHARACTERS_BY_ANIME);

// `anime` null/unknown means "anything goes": draw from the whole pool.
export function pickCharacter(anime?: string | null): { name: string; anime: string } {
  // Flattened for the "any anime" case so every character is equally likely,
  // instead of favouring whoever belongs to the shortest cast.
  const pool =
    anime && CHARACTERS_BY_ANIME[anime]
      ? CHARACTERS_BY_ANIME[anime].map((name) => ({ name, anime }))
      : ANIME_LIST.flatMap((series) =>
          CHARACTERS_BY_ANIME[series].map((name) => ({ name, anime: series }))
        );
  return pool[Math.floor(Math.random() * pool.length)];
}
