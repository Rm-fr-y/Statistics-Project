/**
 * Fair, Zero-Peeking Uno AI Policy
 * Operates strictly on the sanitized public view for a seat (never sees opponent hand).
 * Used both as the House Dealer opponent and in symmetric self-play Monte Carlo tests.
 */

import { UNO_COLORS } from './unoDeck.js';
import { canPlayCard } from './unoEngine.js';

/**
 * Choose the best color for a Wild card based solely on the seat's remaining hand.
 */
export function chooseBestWildColor(hand, excludeCardId = null) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of hand) {
    if (card.id === excludeCardId) continue;
    if (card.color !== 'wild') {
      counts[card.color] += 1;
    }
  }

  let bestColor = UNO_COLORS[0];
  let bestCount = -1;
  for (const color of UNO_COLORS) {
    if (counts[color] > bestCount) {
      bestCount = counts[color];
      bestColor = color;
    }
  }
  return bestColor;
}

/**
 * Decide the next action for a seat from its sanitized public view.
 * Returns:
 *   { action: 'play', cardId, chosenColor }
 *   { action: 'draw' }
 *   { action: 'pass' }
 */
export function decideUnoMove(view) {
  const syntheticState = {
    status: view.status,
    drawnPlayableCardId: view.drawnPlayableCardId,
    pendingDraw: view.pendingDraw,
    turnNumber: view.turnNumber,
    activeColor: view.activeColor,
    discardPile: [view.topCard],
  };

  const legal = view.hand.filter((card) => canPlayCard(syntheticState, card));

  if (legal.length === 0) {
    if (view.drawnPlayableCardId) {
      return { action: 'pass' };
    }
    return { action: 'draw' };
  }

  // Count how many cards of each color we hold to favor switching toward our strongest suit
  const colorCounts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of view.hand) {
    if (card.color !== 'wild') {
      colorCounts[card.color] += 1;
    }
  }

  // Score each legal move
  let bestCard = legal[0];
  let bestScore = -Infinity;

  for (const card of legal) {
    let score = 0;

    // Immediately win if this is our last card
    if (view.hand.length === 1) {
      score += 1000;
    }

    if (card.type === 'wild') {
      // Save wilds for when needed or when opponent is close to winning
      score += view.opponentHandSize <= 2 ? 32 : -18;
      if (card.value === 'wild4') {
        score += view.opponentHandSize <= 2 ? 22 : -8;
      }
    } else {
      // Prefer shedding high-point & action cards while staying in strong colors
      score += card.points * 1.1;
      score += colorCounts[card.color] * 3.5;

      if (card.value === 'draw2') {
        score += view.pendingDraw > 0 ? 50 : 24;
      } else if (card.value === 'skip' || card.value === 'reverse') {
        score += view.consecutiveSkips === 0 ? 22 : 6;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }

  const chosenColor =
    bestCard.type === 'wild' ? chooseBestWildColor(view.hand, bestCard.id) : null;

  return {
    action: 'play',
    cardId: bestCard.id,
    chosenColor,
  };
}
