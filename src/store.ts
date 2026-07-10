import { DEFAULT_THEME_ID } from './render/themes';
import type { Difficulty } from './game/types';

// Everything Carromba remembers about you lives in localStorage and nowhere else.
// No account, no server, no tracking. Clear your browser data and it is all gone,
// which is exactly how a free, no-signup game should work.

const KEY = 'carromba:v1';

export interface Prefs {
  theme: string;
  muted: boolean;
  reduceMotion: boolean;
  lastDifficulty: Difficulty;
}

export interface Stats {
  // Wins and losses against the bot, split by tier, plus local games played.
  vsBot: Record<Difficulty, { won: number; lost: number }>;
  localGames: number;
  queensCovered: number;
}

interface Saved {
  prefs: Prefs;
  stats: Stats;
}

function fresh(): Saved {
  return {
    prefs: {
      theme: DEFAULT_THEME_ID,
      muted: false,
      reduceMotion: false,
      lastDifficulty: 'medium',
    },
    stats: {
      vsBot: {
        easy: { won: 0, lost: 0 },
        medium: { won: 0, lost: 0 },
        hard: { won: 0, lost: 0 },
      },
      localGames: 0,
      queensCovered: 0,
    },
  };
}

let cache: Saved | null = null;

function load(): Saved {
  if (cache) return cache;
  const base = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      // Merge defensively so an older or hand-edited blob never crashes the game.
      const merged: Saved = {
        prefs: { ...base.prefs, ...parsed.prefs },
        stats: {
          ...base.stats,
          ...parsed.stats,
          vsBot: { ...base.stats.vsBot, ...parsed.stats?.vsBot },
        },
      };
      // A hand-edited blob could carry a bogus difficulty, which would later
      // index vsBot with `undefined` and throw. Snap it back to a known tier.
      if (!['easy', 'medium', 'hard'].includes(merged.prefs.lastDifficulty)) {
        merged.prefs.lastDifficulty = 'medium';
      }
      cache = merged;
      return cache;
    }
  } catch {
    // Corrupt or unavailable storage: fall back to defaults, never throw.
  }
  cache = base;
  return cache;
}

function persist(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private mode or a full disk: the game still plays, it just will not remember.
  }
}

export function getPrefs(): Prefs {
  return { ...load().prefs };
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  load().prefs[key] = value;
  persist();
}

export function getStats(): Stats {
  return load().stats;
}

export function recordResult(mode: 'ai' | 'local', difficulty: Difficulty, humanWon: boolean): void {
  const s = load().stats;
  if (mode === 'ai') {
    if (humanWon) s.vsBot[difficulty].won += 1;
    else s.vsBot[difficulty].lost += 1;
  } else {
    s.localGames += 1;
  }
  persist();
}

export function recordQueenCovered(): void {
  load().stats.queensCovered += 1;
  persist();
}
