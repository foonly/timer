const adjectives = [
  "Crazy",
  "Yellow",
  "Electric",
  "Mighty",
  "Sleepy",
  "Purple",
  "Wild",
  "Lucky",
  "Rusty",
  "Cosmic",
  "Grumpy",
  "Silent",
  "Golden",
  "Feral",
  "Velvet",
  "Atomic",
  "Foggy",
  "Rogue",
  "Sneaky",
  "Turbo",
  "Ancient",
  "Frosty",
  "Spicy",
  "Lazy",
];

const nouns = [
  "Horse",
  "Submarine",
  "Falcon",
  "Compass",
  "Turtle",
  "Rocket",
  "Panther",
  "Biscuit",
  "Volcano",
  "Penguin",
  "Wizard",
  "Tornado",
  "Hammer",
  "Dolphin",
  "Cactus",
  "Comet",
  "Badger",
  "Lantern",
  "Marble",
  "Pretzel",
  "Kraken",
  "Otter",
  "Banjo",
  "Tumbleweed",
];

export function randomTagName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective} ${noun}`;
}
