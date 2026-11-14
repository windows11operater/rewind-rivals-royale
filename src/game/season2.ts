export type Season2Poi = {
  name: string;
  x: number;
  z: number;
  kind: "town" | "park" | "row" | "springs" | "woods" | "farm" | "depot" | "lodge";
};

export const SEASON_2_POIS: Season2Poi[] = [
  { name: "Pleasant Park", x: -120, z: -108, kind: "park" },
  { name: "Retail Row", x: 122, z: 10, kind: "row" },
  { name: "Salty Springs", x: 48, z: 126, kind: "springs" },
  { name: "Anarchy Acres", x: 76, z: -96, kind: "town" },
  { name: "Wailing Woods", x: 152, z: -116, kind: "woods" },
  { name: "Moisty Mire", x: 186, z: 150, kind: "town" },
  { name: "Flush Factory", x: -40, z: 156, kind: "depot" },
  { name: "Lonely Lodge", x: 112, z: -54, kind: "lodge" },
  { name: "Tomato Town", x: -140, z: -170, kind: "town" },
  { name: "Greasy Grove", x: -130, z: 64, kind: "town" },
  { name: "Fatal Fields", x: 130, z: 112, kind: "farm" },
  { name: "Dusty Depot", x: 40, z: -34, kind: "depot" },
  { name: "Shifty Shafts", x: 200, z: 210, kind: "town" },
];

export function buildSeason2PoiList() {
  return SEASON_2_POIS.map((poi) => ({
    name: poi.name,
    x: poi.x,
    z: poi.z,
    base: 0,
    kind: poi.kind,
  }));
}

export function isLaterSeasonLandmark(name: string) {
  return [
    "Tilted Towers",
    "Dusty Divot",
    "The Meteor",
    "The Desert",
    "The Agency",
    "The Spire",
    "The Shark",
  ].includes(name);
}
