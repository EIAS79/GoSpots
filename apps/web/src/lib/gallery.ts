export type GalleryItem = {
  src: string;
  alt: string;
  tag: string;
  city?: string;
};

/** Local images (downloaded once) — no broken hotlinks, instant loads. */
export const gallery: GalleryItem[] = [
  {
    src: "/hero/billiard.jpg",
    alt: "Billiard hall with green felt and warm lights",
    tag: "Billiard",
    city: "Warsaw",
  },
  {
    src: "/hero/esports.jpg",
    alt: "Gaming lounge with neon RGB lights",
    tag: "Gaming",
    city: "Kraków",
  },
  {
    src: "/hero/pcgaming.jpg",
    alt: "PC gaming battlestation",
    tag: "PC lounge",
    city: "Wrocław",
  },
  {
    src: "/hero/boardgame.jpg",
    alt: "Board game night with friends",
    tag: "Board games",
    city: "Poznań",
  },
  {
    src: "/hero/controller.jpg",
    alt: "PlayStation controller in neon lighting",
    tag: "PlayStation",
    city: "Warsaw",
  },
  {
    src: "/hero/darts.jpg",
    alt: "Cozy pub corner",
    tag: "Darts",
    city: "Gdańsk",
  },
  {
    src: "/hero/neon.jpg",
    alt: "Neon lit bar interior at night",
    tag: "Lounge",
    city: "Łódź",
  },
  {
    src: "/hero/arcade.jpg",
    alt: "Arcade machines glowing in the dark",
    tag: "Arcade",
    city: "Kraków",
  },
  {
    src: "/hero/bowling.jpg",
    alt: "Bowling lanes at night",
    tag: "Bowling",
    city: "Warsaw",
  },
];
