/**
 * Game 3: Fair Casino Uno Rules Engine
 *
 * Adjusted rules engineered so the game is strictly fair (50/50 long-run win rate, 100% RTP)
 * between the Player and the House Dealer:
 *
 *  1. Unbiased 50/50 Opening Coin Flip decides who plays first each round.
 *  2. Clean Start: First discard card is always a number card, and Turn 0 disallows Wild +4.
 *  3. Consecutive Skip Cap (Max 1): Reverse acts as Skip in 1v1, but no player can skip
 *     their opponent more than once in a row (prevents action-card snowballs).
 *  4. Symmetric +2 Stacking: Any incoming +2 can be countered with another +2.
 *  5. Draw-1-and-Play: Drawing a single card lets you play it immediately if legal, or pass.
 *  6. Seamless Discard Reshuffle & Fair Deadlock Tiebreaker (lowest hand points wins; tie = Push).
 *  7. Even-Money Payout: 2.0x on win, 1.0x on push, 0x on loss.
 */

import { shuffleInPlace } from '../../core/rng.js';
import { createShuffledDeck, UNO_COLORS, calculateHandPoints, getCardFullName } from './unoDeck.js';

export const STARTING_HAND_SIZE = 7;
export const MAX_CONSECUTIVE_SKIPS = 1;
export const MAX_TURNS_SAFETY = 400;

export function otherSeat(seat) {
  return seat === 'player' ? 'house' : 'player';
}

/**
 * Draw n cards safely, reshuffling the discard pile underneath the top card whenever needed.
 */
function drawCardsFromPile(state, count, rng = Math.random) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length <= 1) {
        break; // No cards left to recycle
      }
      const top = state.discardPile.pop();
      const recycled = state.discardPile.splice(0, state.discardPile.length);
      shuffleInPlace(recycled, rng);
      state.drawPile.push(...recycled);
      state.discardPile.push(top);
    }
    const card = state.drawPile.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

/**
 * Create a new Fair 1v1 Uno round.
 */
export function createUnoRound({ wager = 50, rng = Math.random } = {}) {
  const deck = createShuffledDeck(rng);
  const hands = {
    player: [],
    house: [],
  };

  // Deal 7 alternating cards to each seat
  for (let i = 0; i < STARTING_HAND_SIZE; i++) {
    hands.player.push(deck.pop());
    hands.house.push(deck.pop());
  }

  // Flip until we get a clean number card as opening discard
  let openingCard = deck.pop();
  while (openingCard && openingCard.type !== 'number') {
    deck.unshift(openingCard);
    shuffleInPlace(deck, rng);
    openingCard = deck.pop();
  }

  const firstSeat = rng() < 0.5 ? 'player' : 'house';

  return {
    wager,
    drawPile: deck,
    discardPile: [openingCard],
    activeColor: openingCard.color,
    hands,
    currentTurn: firstSeat,
    firstSeat,
    pendingDraw: 0,
    consecutiveSkips: 0,
    drawnPlayableCardId: null,
    turnNumber: 0,
    status: 'playing', // 'playing' | 'won' | 'lost' | 'push'
    winner: null, // 'player' | 'house' | 'push' | null
    payout: 0,
    unoCalled: { player: false, house: false },
    lastEvent:
      firstSeat === 'player'
        ? 'Coin flip: You play first.'
        : 'Coin flip: House Dealer plays first.',
  };
}

export function getTopDiscard(state) {
  return state.discardPile[state.discardPile.length - 1];
}

/**
 * Determine whether a specific card is legal to play in the current state.
 */
export function canPlayCard(state, card) {
  if (state.status !== 'playing') return false;

  // If the player just drew 1 playable card, only that card can be played
  if (state.drawnPlayableCardId && card.id !== state.drawnPlayableCardId) {
    return false;
  }

  // Under an active +2 stack, only another +2 may be played to stack
  if (state.pendingDraw > 0) {
    return card.value === 'draw2';
  }

  // Opening turn fairness dampener: no Wild +4 on Turn 0
  if (state.turnNumber === 0 && card.value === 'wild4') {
    return false;
  }

  if (card.type === 'wild') return true;

  const top = getTopDiscard(state);
  return card.color === state.activeColor || card.value === top.value;
}

/**
 * Get all legal cards for a seat right now.
 */
export function getLegalMoves(state, seat = state.currentTurn) {
  if (state.status !== 'playing' || state.currentTurn !== seat) return [];
  return state.hands[seat].filter((card) => canPlayCard(state, card));
}

/**
 * Return a strictly sanitized view for a seat so the AI can never peek at opponent cards.
 */
export function getPublicViewForSeat(state, seat) {
  const opp = otherSeat(seat);
  return {
    seat,
    hand: state.hands[seat].map((c) => ({ ...c })),
    topCard: { ...getTopDiscard(state) },
    activeColor: state.activeColor,
    pendingDraw: state.pendingDraw,
    consecutiveSkips: state.consecutiveSkips,
    drawnPlayableCardId: state.drawnPlayableCardId,
    turnNumber: state.turnNumber,
    opponentHandSize: state.hands[opp].length,
    drawPileSize: state.drawPile.length,
    status: state.status,
  };
}

function finalizeOutcome(state, winnerSeat, reason) {
  state.winner = winnerSeat;
  if (winnerSeat === 'player') {
    state.status = 'won';
    state.payout = Math.round(state.wager * 2);
  } else if (winnerSeat === 'house') {
    state.status = 'lost';
    state.payout = 0;
  } else {
    state.status = 'push';
    state.payout = Math.round(state.wager);
  }
  state.lastEvent = reason;
}

function resolveDeadlockIfNeeded(state) {
  if (state.status !== 'playing') return;
  if (state.turnNumber < MAX_TURNS_SAFETY) return;

  const playerPts = calculateHandPoints(state.hands.player);
  const housePts = calculateHandPoints(state.hands.house);
  if (playerPts < housePts) {
    finalizeOutcome(state, 'player', `Deadlock tiebreaker: You win (${playerPts} pts vs ${housePts} pts).`);
  } else if (housePts < playerPts) {
    finalizeOutcome(state, 'house', `Deadlock tiebreaker: House wins (${housePts} pts vs ${playerPts} pts).`);
  } else {
    finalizeOutcome(state, 'push', `Deadlock exact tie (${playerPts} pts each) — Push, stake returned.`);
  }
}

/**
 * Play a card from the active seat's hand.
 */
export function playCard(state, seat, cardId, chosenColor = null, rng = Math.random) {
  if (state.status !== 'playing' || state.currentTurn !== seat) {
    return { ok: false, error: 'Not your turn.' };
  }

  const hand = state.hands[seat];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx === -1) {
    return { ok: false, error: 'Card not in hand.' };
  }

  const card = hand[idx];
  if (!canPlayCard(state, card)) {
    return { ok: false, error: 'Card is not playable right now.' };
  }

  if (card.type === 'wild' && !UNO_COLORS.includes(chosenColor)) {
    return { ok: false, error: 'Choose a valid color for Wild card.' };
  }

  // Remove card from hand & place on discard pile
  hand.splice(idx, 1);
  state.discardPile.push(card);
  state.drawnPlayableCardId = null;
  state.activeColor = card.type === 'wild' ? chosenColor : card.color;
  state.turnNumber += 1;

  const actorLabel = seat === 'player' ? 'You' : 'House Dealer';
  const opp = otherSeat(seat);

  // Check immediate win when hand empties
  if (hand.length === 0) {
    finalizeOutcome(
      state,
      seat,
      `${actorLabel} played ${getCardFullName(card)} and cleared all cards!`
    );
    return { ok: true, card, finished: true };
  }

  // Track UNO status display cleanly for both seats
  if (hand.length === 1) {
    state.unoCalled[seat] = true;
  } else {
    state.unoCalled[seat] = false;
  }

  // Apply Adjusted Fair Action Rules
  if (card.value === 'draw2') {
    state.pendingDraw += 2;
    state.consecutiveSkips = 0;
    state.currentTurn = opp;
    state.lastEvent = `${actorLabel} played ${getCardFullName(card)} — +${state.pendingDraw} stack active!`;
  } else if (card.value === 'skip' || card.value === 'reverse') {
    if (state.consecutiveSkips < MAX_CONSECUTIVE_SKIPS) {
      state.consecutiveSkips += 1;
      state.currentTurn = seat; // Keep turn once
      state.lastEvent = `${actorLabel} played ${getCardFullName(card)} — opponent skipped!`;
    } else {
      state.consecutiveSkips = 0;
      state.currentTurn = opp; // Skip capped for fairness
      state.lastEvent = `${actorLabel} played ${getCardFullName(card)} (Skip cap reached — turn passes).`;
    }
  } else if (card.value === 'wild4') {
    const penaltyCards = drawCardsFromPile(state, 4, rng);
    state.hands[opp].push(...penaltyCards);
    state.unoCalled[opp] = false;
    if (state.consecutiveSkips < MAX_CONSECUTIVE_SKIPS) {
      state.consecutiveSkips += 1;
      state.currentTurn = seat;
      state.lastEvent = `${actorLabel} played Wild +4 (${state.activeColor.toUpperCase()}) — opponent draws ${penaltyCards.length}!`;
    } else {
      state.consecutiveSkips = 0;
      state.currentTurn = opp;
      state.lastEvent = `${actorLabel} played Wild +4 (${state.activeColor.toUpperCase()}) — opponent draws ${penaltyCards.length} (Skip cap reached).`;
    }
  } else if (card.value === 'wild') {
    state.consecutiveSkips = 0;
    state.currentTurn = opp;
    state.lastEvent = `${actorLabel} played Wild and set color to ${state.activeColor.toUpperCase()}.`;
  } else {
    state.consecutiveSkips = 0;
    state.currentTurn = opp;
    state.lastEvent = `${actorLabel} played ${getCardFullName(card)}.`;
  }

  resolveDeadlockIfNeeded(state);
  return { ok: true, card, finished: state.status !== 'playing' };
}

/**
 * Draw card(s) on the active seat's turn:
 * - If pendingDraw > 0: draws the full penalty stack and passes turn.
 * - Otherwise: draws 1 card; if playable, sets `drawnPlayableCardId` so the seat may play it or pass.
 */
export function drawForSeat(state, seat, rng = Math.random) {
  if (state.status !== 'playing' || state.currentTurn !== seat) {
    return { ok: false, error: 'Not your turn.' };
  }

  const actorLabel = seat === 'player' ? 'You' : 'House Dealer';
  const opp = otherSeat(seat);

  if (state.pendingDraw > 0) {
    const count = state.pendingDraw;
    const drawn = drawCardsFromPile(state, count, rng);
    state.hands[seat].push(...drawn);
    state.pendingDraw = 0;
    state.consecutiveSkips = 0;
    state.drawnPlayableCardId = null;
    state.unoCalled[seat] = false;
    state.turnNumber += 1;
    state.currentTurn = opp;
    state.lastEvent = `${actorLabel} drew ${drawn.length} penalty cards.`;
    resolveDeadlockIfNeeded(state);
    return { ok: true, drawn, canPlayDrawn: false };
  }

  if (state.drawnPlayableCardId) {
    return { ok: false, error: 'Already drew a card this turn — play it or pass.' };
  }

  const drawn = drawCardsFromPile(state, 1, rng);
  if (drawn.length === 0) {
    // True deck exhaustion -> resolve immediately by lowest hand points
    state.turnNumber = MAX_TURNS_SAFETY;
    resolveDeadlockIfNeeded(state);
    return { ok: true, drawn: [], canPlayDrawn: false };
  }

  const card = drawn[0];
  state.hands[seat].push(card);
  state.unoCalled[seat] = false;

  if (canPlayCard(state, card)) {
    state.drawnPlayableCardId = card.id;
    state.lastEvent =
      seat === 'player'
        ? `Drew ${getCardFullName(card)} — playable now or pass.`
        : 'House Dealer drew a playable card…';
    return { ok: true, drawn, canPlayDrawn: true, drawnCard: card };
  }

  state.consecutiveSkips = 0;
  state.turnNumber += 1;
  state.currentTurn = opp;
  state.lastEvent = `${actorLabel} drew 1 card and passed.`;
  resolveDeadlockIfNeeded(state);
  return { ok: true, drawn, canPlayDrawn: false };
}

/**
 * Pass after drawing a playable card (optional decline).
 */
export function passAfterDraw(state, seat) {
  if (state.status !== 'playing' || state.currentTurn !== seat || !state.drawnPlayableCardId) {
    return { ok: false, error: 'Cannot pass right now.' };
  }
  const actorLabel = seat === 'player' ? 'You' : 'House Dealer';
  state.drawnPlayableCardId = null;
  state.consecutiveSkips = 0;
  state.turnNumber += 1;
  state.currentTurn = otherSeat(seat);
  state.lastEvent = `${actorLabel} kept the drawn card and passed.`;
  resolveDeadlockIfNeeded(state);
  return { ok: true };
}
