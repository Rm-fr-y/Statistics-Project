/**
 * Game 2: Casino Wordle Engine (Skewed for the Player)
 *
 * - 5-letter words, 6 guesses
 * - Adjusted letter rates so common, high-frequency English letters dominate
 * - Configurable player-skew / luck variable `skewLevel` in {3, 4, 5}:
 *     3 (Lucky):          Excludes rare letters (Q,Z,X,J,V,K), frequency-weighted sampling (exponent 2.2)
 *     4 (High Roller):    Top 55% unique-letter common pool, exponent 3.6 + 1 guaranteed present-letter hint
 *     5 (VIP Edge):       Top 28% ultra-common unique-letter pool, exponent 5.0 + 1 revealed green starting letter
 * - Adjusted prize multiplier based on the guess number on which the player solves the word
 */

import { SCORED_ANSWERS, isValidGuess } from './wordList.js';

export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

export const SKEW_LEVEL_CONFIG = Object.freeze({
  3: {
    level: 3,
    label: 'Level 3 · Lucky Letters',
    shortLabel: 'Skew 3',
    exponent: 2.2,
    poolFraction: 0.78,
    requireUnique: false,
    excludeRare: true,
    hintType: 'none',
    description: 'Rare letters removed; weighted toward high-frequency English letters.',
  },
  4: {
    level: 4,
    label: 'Level 4 · High Roller',
    shortLabel: 'Skew 4',
    exponent: 3.6,
    poolFraction: 0.52,
    requireUnique: true,
    excludeRare: true,
    hintType: 'present',
    description: 'Unique common-letter words only + 1 guaranteed letter revealed in yellow.',
  },
  5: {
    level: 5,
    label: 'Level 5 · VIP Player Edge',
    shortLabel: 'Skew 5',
    exponent: 5.0,
    poolFraction: 0.28,
    requireUnique: true,
    excludeRare: true,
    hintType: 'exact',
    description: 'Ultra-common core words only + 1 exact green letter revealed at start.',
  },
});

/**
 * Tiered prize multipliers by winning guess (1..6).
 * Calibrated with skew levels 3–5 to deliver positive player EV (> 1.0x RTP).
 */
export const GUESS_PAYOUT_MULTIPLIERS = Object.freeze({
  1: 5.0,
  2: 2.75,
  3: 1.75,
  4: 1.25,
  5: 0.9,
  6: 0.6,
});

export function normalizeSkewLevel(level) {
  const n = Math.round(Number(level));
  if (n <= 3) return 3;
  if (n >= 5) return 5;
  return 4;
}

/**
 * Get the eligible weighted answer pool for a given skewLevel (3, 4, or 5).
 */
export function getSkewedWordPool(skewLevel = 4) {
  const cfg = SKEW_LEVEL_CONFIG[normalizeSkewLevel(skewLevel)];
  let filtered = SCORED_ANSWERS.filter((entry) => {
    if (cfg.excludeRare && entry.hasRare) return false;
    if (cfg.requireUnique && entry.uniqueCount < WORD_LENGTH) return false;
    return true;
  });

  const cutoff = Math.max(40, Math.floor(filtered.length * cfg.poolFraction));
  filtered = filtered.slice(0, cutoff);

  const weighted = filtered.map((entry) => ({
    ...entry,
    weight: Math.pow(entry.score, cfg.exponent),
  }));
  const totalWeight = weighted.reduce((acc, item) => acc + item.weight, 0);

  return { cfg, items: weighted, totalWeight };
}

/**
 * Sample a secret 5-letter word from the player-skewed letter-rate pool.
 */
export function selectSkewedWord(skewLevel = 4, rng = Math.random) {
  const { cfg, items, totalWeight } = getSkewedWordPool(skewLevel);
  let target = rng() * totalWeight;
  let chosen = items[items.length - 1];

  for (const item of items) {
    target -= item.weight;
    if (target <= 0) {
      chosen = item;
      break;
    }
  }

  let hint = null;
  if (cfg.hintType === 'present') {
    const idx = Math.floor(rng() * WORD_LENGTH);
    hint = { type: 'present', letter: chosen.word[idx], index: null };
  } else if (cfg.hintType === 'exact') {
    const idx = Math.floor(rng() * WORD_LENGTH);
    hint = { type: 'exact', letter: chosen.word[idx], index: idx };
  }

  return {
    word: chosen.word,
    score: chosen.score,
    skewLevel: cfg.level,
    hint,
  };
}

/**
 * Standard Wordle duplicate-safe evaluation.
 * Returns array of 5 statuses: 'correct' | 'present' | 'absent'
 */
export function evaluateGuess(guess, secret) {
  const g = guess.toUpperCase();
  const s = secret.toUpperCase();
  const result = new Array(WORD_LENGTH).fill('absent');
  const remaining = Object.create(null);

  // First pass: exact green matches
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === s[i]) {
      result[i] = 'correct';
    } else {
      remaining[s[i]] = (remaining[s[i]] || 0) + 1;
    }
  }

  // Second pass: yellow present matches respecting remaining counts
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    const ch = g[i];
    if (remaining[ch] > 0) {
      result[i] = 'present';
      remaining[ch] -= 1;
    }
  }

  return result;
}

/**
 * Calculate chip payout for solving on `guessNumber` (1..6) or failing (null).
 */
export function calculateWordlePayout(wager, solvedOnGuess) {
  if (!solvedOnGuess || !GUESS_PAYOUT_MULTIPLIERS[solvedOnGuess]) {
    return { multiplier: 0, payout: 0, net: -wager };
  }
  const multiplier = GUESS_PAYOUT_MULTIPLIERS[solvedOnGuess];
  const payout = Math.round(wager * multiplier);
  return {
    multiplier,
    payout,
    net: payout - wager,
  };
}

/**
 * Create a fresh stateful Casino Wordle round.
 */
export function createWordleRound({ wager, skewLevel = 4, rng = Math.random }) {
  const selection = selectSkewedWord(skewLevel, rng);
  return {
    wager,
    skewLevel: selection.skewLevel,
    secret: selection.word,
    secretScore: selection.score,
    hint: selection.hint,
    guesses: [], // Array of { word, states }
    status: 'playing', // 'playing' | 'won' | 'lost'
    solvedOnGuess: null,
    payout: 0,
    multiplier: 0,
  };
}

/**
 * Submit a 5-letter guess to an active round.
 */
export function submitWordleGuess(round, rawGuess) {
  if (round.status !== 'playing') {
    return { ok: false, error: 'Round already finished.' };
  }

  const guess = String(rawGuess).trim().toUpperCase();
  if (guess.length !== WORD_LENGTH || !/^[A-Z]{5}$/.test(guess)) {
    return { ok: false, error: 'Enter a 5-letter word.' };
  }
  if (!isValidGuess(guess)) {
    return { ok: false, error: `"${guess}" is not in the casino dictionary.` };
  }

  const states = evaluateGuess(guess, round.secret);
  round.guesses.push({ word: guess, states });

  const isWin = states.every((s) => s === 'correct');
  if (isWin) {
    round.status = 'won';
    round.solvedOnGuess = round.guesses.length;
    const { multiplier, payout } = calculateWordlePayout(round.wager, round.solvedOnGuess);
    round.multiplier = multiplier;
    round.payout = payout;
  } else if (round.guesses.length >= MAX_GUESSES) {
    round.status = 'lost';
    round.solvedOnGuess = null;
    round.multiplier = 0;
    round.payout = 0;
  }

  return { ok: true, guess, states, status: round.status };
}
