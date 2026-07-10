// A theme is just a bag of colors plus a couple of switches for the fancier
// rendering. The board, the men, and the page chrome all read from the same
// object, so adding a new look later is a matter of writing one more of these and
// nothing else. Warm Heritage is the one Carromba wears by default.

export interface Theme {
  id: string;
  name: string;
  blurb: string; // one line shown in the theme picker

  // Page chrome (CSS variables are generated from these).
  pageBg: string;
  pageBg2: string; // for a soft radial backdrop
  ink: string; // primary text
  inkDim: string; // secondary text
  accent: string; // buttons, highlights
  accentInk: string; // text on top of accent
  panel: string; // menu/card surface
  panelBorder: string;

  // The board itself.
  frame: string;
  frameHi: string; // lit edge of the wood
  frameLo: string; // shaded edge of the wood
  frameLine: string; // thin inlay between frame and felt
  felt: string;
  feltHi: string; // center of the felt (radial highlight)
  feltShadow: string; // inner shadow where felt meets the frame
  grain: number; // 0..1 amount of surface texture
  line: string; // baselines, arrows, center rosette
  lineStrong: string; // base circles and accents
  pocket: string; // the hole
  pocketRim: string;

  // The pieces. Each disc is a soft radial gradient from `Hi` to base with `Edge`.
  whiteHi: string;
  white: string;
  whiteEdge: string;
  blackHi: string;
  black: string;
  blackEdge: string;
  queenHi: string;
  queen: string;
  queenEdge: string;
  strikerHi: string;
  striker: string;
  strikerEdge: string;
  strikerGrip: string; // the ring dimpled into the striker

  // Aiming overlay + effects.
  aim: string;
  aimGhost: string; // faint projected striker outline
  powerLo: string;
  powerHi: string;
  glow: boolean; // soft light bloom on hits and pockets (Midnight)
  shadow: string; // drop shadow under pieces
}

const warmHeritage: Theme = {
  id: 'heritage',
  name: 'Warm Heritage',
  blurb: 'Walnut frame, cream felt, a board you would keep on the shelf.',
  pageBg: '#2a1f16',
  pageBg2: '#3a2b1e',
  ink: '#f3e7d2',
  inkDim: '#b8a488',
  accent: '#c8622f',
  accentInk: '#1c130b',
  panel: '#241a12',
  panelBorder: '#4a3623',

  frame: '#7a4f2c',
  frameHi: '#9c6c40',
  frameLo: '#5a381d',
  frameLine: '#3d2716',
  felt: '#e6d3a8',
  feltHi: '#f0e2c0',
  feltShadow: '#c3ab7c',
  grain: 0.5,
  line: '#9c5a3c',
  lineStrong: '#b0202f',
  pocket: '#241610',
  pocketRim: '#4a2f1c',

  whiteHi: '#fffdf6',
  white: '#f2e6cf',
  whiteEdge: '#b79b6f',
  blackHi: '#4b4640',
  black: '#26221d',
  blackEdge: '#0d0b09',
  queenHi: '#e0455a',
  queen: '#b0202f',
  queenEdge: '#6d1019',
  strikerHi: '#fff4dd',
  striker: '#e8c68a',
  strikerEdge: '#a9803f',
  strikerGrip: '#c69a5a',

  aim: '#fbf1d9',
  aimGhost: 'rgba(251,241,217,0.35)',
  powerLo: '#e8c66a',
  powerHi: '#d23b2f',
  glow: false,
  shadow: 'rgba(60,35,15,0.32)',
};

const modernMinimal: Theme = {
  id: 'minimal',
  name: 'Modern Minimal',
  blurb: 'Flat, calm, and quiet. Nothing on the board you do not need.',
  pageBg: '#eceae4',
  pageBg2: '#f6f5f1',
  ink: '#23262b',
  inkDim: '#6b7078',
  accent: '#2f6d5b',
  accentInk: '#f6f5f1',
  panel: '#ffffff',
  panelBorder: '#d9d7cf',

  frame: '#dedbd2',
  frameHi: '#eceae3',
  frameLo: '#cbc8be',
  frameLine: '#c2bfb4',
  felt: '#f7f6f2',
  feltHi: '#fdfdfb',
  feltShadow: '#e4e2da',
  grain: 0,
  line: '#c8c5ba',
  lineStrong: '#2f6d5b',
  pocket: '#2b2f34',
  pocketRim: '#c2bfb4',

  whiteHi: '#ffffff',
  white: '#eceae3',
  whiteEdge: '#bcb9ad',
  blackHi: '#565b62',
  black: '#2b2f34',
  blackEdge: '#15181b',
  queenHi: '#4a9a83',
  queen: '#2f6d5b',
  queenEdge: '#1d463a',
  strikerHi: '#ffffff',
  striker: '#dcd9cf',
  strikerEdge: '#a8a49a',
  strikerGrip: '#bcb9ad',

  aim: '#2b2f34',
  aimGhost: 'rgba(43,47,52,0.22)',
  powerLo: '#4a9a83',
  powerHi: '#c8563f',
  glow: false,
  shadow: 'rgba(40,42,46,0.16)',
};

const midnightArcade: Theme = {
  id: 'midnight',
  name: 'Midnight Arcade',
  blurb: 'Dark felt, glowing lines, a little bloom when the men clack.',
  pageBg: '#080a12',
  pageBg2: '#111527',
  ink: '#e8ecff',
  inkDim: '#8891b5',
  accent: '#37e0c8',
  accentInk: '#04120f',
  panel: '#121629',
  panelBorder: '#2a3358',

  frame: '#161b2e',
  frameHi: '#243056',
  frameLo: '#0c0f1c',
  frameLine: '#050710',
  felt: '#0e1322',
  feltHi: '#16203a',
  feltShadow: '#070a14',
  grain: 0.12,
  line: '#2f8fb0',
  lineStrong: '#ff5d8f',
  pocket: '#02030a',
  pocketRim: '#1b2b45',
  whiteHi: '#ffffff',
  white: '#cfd8ff',
  whiteEdge: '#7b86c0',
  blackHi: '#3a4468',
  black: '#171c30',
  blackEdge: '#05060d',
  queenHi: '#ff8fb0',
  queen: '#ff5d8f',
  queenEdge: '#a12a54',
  strikerHi: '#b6fff2',
  striker: '#37e0c8',
  strikerEdge: '#1a7d70',
  strikerGrip: '#0e5049',

  aim: '#8ff5e6',
  aimGhost: 'rgba(143,245,230,0.3)',
  powerLo: '#37e0c8',
  powerHi: '#ff5d8f',
  glow: true,
  shadow: 'rgba(0,0,0,0.45)',
};

export const THEMES: Theme[] = [warmHeritage, modernMinimal, midnightArcade];
export const DEFAULT_THEME_ID = warmHeritage.id;

export function getTheme(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? warmHeritage;
}
