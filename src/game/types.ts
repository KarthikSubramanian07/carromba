import type { Body } from '../engine/body';
import type { World } from '../engine/world';

export type Player = 'p1' | 'p2';
export type PieceColor = 'white' | 'black';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Mode = 'ai' | 'local' | 'online';

// The board's life cycle. `placing` waits for the striker to be set on the
// baseline, `aiming` for the flick, `simulating` while physics runs, `resolving`
// while the rules digest the outcome, and `gameover` when someone has won.
export type Phase = 'placing' | 'aiming' | 'simulating' | 'resolving' | 'gameover';

// Who the Queen belongs to, and whether the covering shot has landed. `pending`
// means the Queen is off the board but still needs a covering piece next stroke,
// otherwise she comes back to the center.
export interface QueenState {
  onBoard: boolean;
  pocketedBy: Player | null;
  covered: boolean;
  pending: boolean;
}

export interface GameState {
  mode: Mode;
  difficulty: Difficulty;
  world: World;
  striker: Body;

  turn: Player;
  // Colors are assigned on the first pocketed man ("open" rule). Null until then.
  colors: { p1: PieceColor | null; p2: PieceColor | null };
  // Pieces each player still has to sink (their own color that remain on board).
  phase: Phase;
  queen: QueenState;

  // Which side the human plays in AI mode. In local play both sides are human.
  humanSide: Player;

  winner: Player | null;
  // A short, human-readable note about what just happened, for the HUD.
  lastEvent: string;
}

// What a single stroke produced once the board came to rest. This is the pure
// input the rules engine digests; it holds no physics, just outcomes.
export interface StrokeResult {
  // Pocketed bodies in the order they dropped this stroke.
  pocketed: { id: number; kind: Body['kind'] }[];
  strikerPocketed: boolean;
  // Did the striker make contact with any piece at all? A whiff is a foul.
  strikerTouchedPiece: boolean;
}
