/**
 * Standard 108-card Uno Deck Generator & Card Helpers
 * for Game 3 (Long-Run Fair Casino Uno).
 */

import { shuffleInPlace } from '../../core/rng.js';

export const UNO_COLORS = Object.freeze(['red', 'yellow', 'green', 'blue']);

export const COLOR_LABELS = Object.freeze({
  red: 'Crimson',
  yellow: 'Gold',
  green: 'Emerald',
  blue: 'Sapphire',
});

/**
 * Create a standard 108-card Uno deck with unique IDs.
 */
export function createUnoDeck() {
  const deck = [];
  let seq = 1;

  for (const color of UNO_COLORS) {
    // One 0 per color
    deck.push({ id: `c_${seq++}`, color, value: '0', type: 'number', points: 0 });

    // Two each of 1..9
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: `c_${seq++}`, color, value: String(n), type: 'number', points: n });
      deck.push({ id: `c_${seq++}`, color, value: String(n), type: 'number', points: n });
    }

    // Two each of Skip, Reverse, Draw Two
    for (let k = 0; k < 2; k++) {
      deck.push({ id: `c_${seq++}`, color, value: 'skip', type: 'action', points: 20 });
      deck.push({ id: `c_${seq++}`, color, value: 'reverse', type: 'action', points: 20 });
      deck.push({ id: `c_${seq++}`, color, value: 'draw2', type: 'action', points: 20 });
    }
  }

  // Four Wild and four Wild Draw Four
  for (let k = 0; k < 4; k++) {
    deck.push({ id: `c_${seq++}`, color: 'wild', value: 'wild', type: 'wild', points: 50 });
    deck.push({ id: `c_${seq++}`, color: 'wild', value: 'wild4', type: 'wild', points: 50 });
  }

  return deck;
}

export function createShuffledDeck(rng = Math.random) {
  return shuffleInPlace(createUnoDeck(), rng);
}

export function getCardDisplayLabel(card) {
  switch (card.value) {
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return 'W';
    case 'wild4':
      return '+4';
    default:
      return card.value;
  }
}

export function getCardFullName(card) {
  if (card.value === 'wild') return 'Wild';
  if (card.value === 'wild4') return 'Wild +4';
  const colorName = COLOR_LABELS[card.color] || card.color;
  if (card.value === 'draw2') return `${colorName} +2`;
  if (card.value === 'skip') return `${colorName} Skip`;
  if (card.value === 'reverse') return `${colorName} Reverse`;
  return `${colorName} ${card.value}`;
}

export function calculateHandPoints(hand) {
  return hand.reduce((sum, c) => sum + c.points, 0);
}
