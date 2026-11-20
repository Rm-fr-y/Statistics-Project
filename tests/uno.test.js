import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/rng.js';
import { createUnoDeck } from '../src/games/uno/unoDeck.js';
import {
  createUnoRound,
  playCard,
  drawForSeat,
  passAfterDraw,
  getPublicViewForSeat,
} from '../src/games/uno/unoEngine.js';
import { decideUnoMove } from '../src/games/uno/unoAI.js';

test('Uno deck contains exactly 108 standard cards with unique IDs', () => {
  const deck = createUnoDeck();
  assert.equal(deck.length, 108);
  const ids = new Set(deck.map((c) => c.id));
  assert.equal(ids.size, 108);
});

test('Uno consecutive Skip cap limits skips to 1 in a row', () => {
  const rng = createRng(77);
  const state = createUnoRound({ wager: 100, rng });
  state.currentTurn = 'player';
  state.turnNumber = 2;
  state.activeColor = 'red';
  state.discardPile = [{ id: 'top', color: 'red', value: '5', type: 'number', points: 5 }];
  state.hands.player = [
    { id: 's1', color: 'red', value: 'skip', type: 'action', points: 20 },
    { id: 's2', color: 'red', value: 'reverse', type: 'action', points: 20 },
    { id: 'n1', color: 'blue', value: '9', type: 'number', points: 9 },
  ];

  // First skip retains turn
  const r1 = playCard(state, 'player', 's1', null, rng);
  assert.ok(r1.ok);
  assert.equal(state.currentTurn, 'player');
  assert.equal(state.consecutiveSkips, 1);

  // Second consecutive skip sheds card but passes turn due to fairness Skip Cap
  const r2 = playCard(state, 'player', 's2', null, rng);
  assert.ok(r2.ok);
  assert.equal(state.currentTurn, 'house');
  assert.equal(state.consecutiveSkips, 0);
});

test('Uno symmetric +2 stacking accumulates penalty and passes turn', () => {
  const rng = createRng(88);
  const state = createUnoRound({ wager: 100, rng });
  state.currentTurn = 'player';
  state.turnNumber = 2;
  state.activeColor = 'green';
  state.discardPile = [{ id: 'top', color: 'green', value: '3', type: 'number', points: 3 }];
  state.hands.player = [
    { id: 'p_d2', color: 'green', value: 'draw2', type: 'action', points: 20 },
    { id: 'p_keep', color: 'blue', value: '1', type: 'number', points: 1 },
  ];
  state.hands.house = [
    { id: 'h_d2', color: 'red', value: 'draw2', type: 'action', points: 20 },
    { id: 'h_keep', color: 'yellow', value: '4', type: 'number', points: 4 },
  ];

  assert.ok(playCard(state, 'player', 'p_d2', null, rng).ok);
  assert.equal(state.pendingDraw, 2);
  assert.equal(state.currentTurn, 'house');

  // House stacks its own +2 onto player's +2
  assert.ok(playCard(state, 'house', 'h_d2', null, rng).ok);
  assert.equal(state.pendingDraw, 4);
  assert.equal(state.currentTurn, 'player');

  // Player cannot stack -> draws 4 penalty cards
  const before = state.hands.player.length;
  assert.ok(drawForSeat(state, 'player', rng).ok);
  assert.equal(state.hands.player.length, before + 4);
  assert.equal(state.pendingDraw, 0);
  assert.equal(state.currentTurn, 'house');
});

test('Fair Casino Uno achieves ~50/50 win rate and ~100% RTP across 4,000 symmetric AI games', () => {
  const rng = createRng(2026);
  const games = 4000;
  const wager = 100;

  let playerWins = 0;
  let houseWins = 0;
  let pushes = 0;
  let totalReturned = 0;

  for (let i = 0; i < games; i++) {
    const state = createUnoRound({ wager, rng });

    while (state.status === 'playing') {
      const seat = state.currentTurn;
      const view = getPublicViewForSeat(state, seat);
      const move = decideUnoMove(view);

      if (move.action === 'play') {
        const res = playCard(state, seat, move.cardId, move.chosenColor, rng);
        assert.ok(res.ok, `Illegal AI play: ${res.error}`);
      } else if (move.action === 'draw') {
        const res = drawForSeat(state, seat, rng);
        assert.ok(res.ok, `Illegal AI draw: ${res.error}`);
      } else {
        const res = passAfterDraw(state, seat);
        assert.ok(res.ok, `Illegal AI pass: ${res.error}`);
      }
    }

    if (state.status === 'won') playerWins += 1;
    else if (state.status === 'lost') houseWins += 1;
    else pushes += 1;

    totalReturned += state.payout;
  }

  const playerWinRate = playerWins / (playerWins + houseWins);
  const rtp = totalReturned / (games * wager);

  assert.ok(
    playerWinRate > 0.48 && playerWinRate < 0.52,
    `Expected fair 50% ± 2% win rate, got ${(playerWinRate * 100).toFixed(2)}% (${playerWins}W / ${houseWins}L / ${pushes}P)`
  );
  assert.ok(
    rtp > 0.96 && rtp < 1.04,
    `Expected fair RTP near 1.00, got ${rtp.toFixed(4)}`
  );
});
