// A flat pool of well-known anime characters spanning many series, so a
// room of up to 8 players can each get a unique one with no repeats.
export const CHARACTERS: string[] = [
  "Naruto Uzumaki",
  "Sasuke Uchiha",
  "Itachi Uchiha",
  "Kakashi Hatake",
  "Monkey D. Luffy",
  "Roronoa Zoro",
  "Nami",
  "Sanji",
  "Son Goku",
  "Vegeta",
  "Piccolo",
  "Eren Yeager",
  "Mikasa Ackerman",
  "Levi Ackerman",
  "Tanjiro Kamado",
  "Nezuko Kamado",
  "Zenitsu Agatsuma",
  "Izuku Midoriya",
  "Katsuki Bakugo",
  "Shoto Todoroki",
  "Saitama",
  "Genos",
  "Light Yagami",
  "L",
  "Edward Elric",
  "Alphonse Elric",
  "Natsu Dragneel",
  "Erza Scarlet",
  "Ichigo Kurosaki",
  "Rukia Kuchiki",
  "Satoru Gojo",
  "Yuji Itadori",
  "Sukuna",
  "Killua Zoldyck",
  "Gon Freecss",
  "Rem",
  "Emilia",
  "Megumin",
  "Kazuma Sato",
  "Violet Evergarden",
  "Lelouch Lamperouge",
  "Spike Spiegel",
  "Anya Forger",
  "Loid Forger",
  "Denji",
  "Power",
  "Kaneki Ken",
  "Sailor Moon",
  "Ash Ketchum",
  "Pikachu",
  "Rimuru Tempest",
];

export function pickRandomCharacters(count: number): string[] {
  const pool = [...CHARACTERS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
