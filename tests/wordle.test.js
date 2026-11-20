import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/rng.js';
import { ANSWER_WORDS, SCORED_ANSWERS } from '../src/games/wordle/wordList.js';
import {
  evaluateGuess,
  selectSkewedWord,
  createWordleRound,
  submitWordleGuess,
  MAX_GUESSES,
} from '../src/games/wordle/wordleEngine.js';

test('Wordle evaluateGuess handles duplicate letters accurately', () => {
  // ERASE contains two E's -> both E's in SPEED are present
  assert.deepEqual(evaluateGuess('SPEED', 'ERASE'), [
    'present',
    'absent',
    'present',
    'present',
    'absent',
  ]);
  // CRANE contains only one E -> first E in SPEED is present, second E is absent
  assert.deepEqual(evaluateGuess('SPEED', 'CRANE'), [
    'absent',
    'absent',
    'present',
    'absent',
    'absent',
  ]);
  assert.deepEqual(evaluateGuess('ALLEY', 'LLAMA'), [
    'present',
    'correct',
    'present',
    'absent',
    'absent',
  ]);
  assert.deepEqual(evaluateGuess('SLATE', 'SLATE'), [
    'correct',
    'correct',
    'correct',
    'correct',
    'correct',
  ]);
});

test('Wordle skew variable (3-5) increases letter-rate friendliness monotonically', () => {
  const sampleMeanScore = (level, seed) => {
    const rng = createRng(seed);
    let sum = 0;
    const n = 1500;
    for (let i = 0; i < n; i++) {
      sum += selectSkewedWord(level, rng).score;
    }
    return sum / n;
  };

  const baselineMean =
    SCORED_ANSWERS.reduce((acc, item) => acc + item.score, 0) / SCORED_ANSWERS.length;
  const mean3 = sampleMeanScore(3, 301);
  const mean4 = sampleMeanScore(4, 302);
  const mean5 = sampleMeanScore(5, 303);

  assert.ok(mean3 > baselineMean, `Level 3 mean (${mean3.toFixed(2)}) should exceed uniform baseline (${baselineMean.toFixed(2)})`);
  assert.ok(mean4 > mean3, `Level 4 mean (${mean4.toFixed(2)}) should exceed Level 3 (${mean3.toFixed(2)})`);
  assert.ok(mean5 > mean4, `Level 5 mean (${mean5.toFixed(2)}) should exceed Level 4 (${mean4.toFixed(2)})`);
});

/**
 * Consistent greedy Wordle solver: always picks the highest letter-rate candidate
 * remaining after applying feedback and any skew-level starting hint.
 */
function simulateWordleBotRound(skewLevel, rng) {
  const round = createWordleRound({ wager: 100, skewLevel, rng });
  // Candidates already ordered by descending English letter-frequency friendliness
  let candidates = SCORED_ANSWERS.map((entry) => entry.word);

  if (round.hint?.type === 'present') {
    candidates = candidates.filter((w) => w.includes(round.hint.letter));
  } else if (round.hint?.type === 'exact') {
    candidates = candidates.filter((w) => w[round.hint.index] === round.hint.letter);
  }

  for (let turn = 0; turn < MAX_GUESSES && round.status === 'playing'; turn++) {
    const guess = candidates[0] || 'STARE';
    const res = submitWordleGuess(round, guess);
    assert.ok(res.ok, `Solver produced invalid guess ${guess}`);
    if (round.status !== 'playing') break;

    const patternKey = res.states.join(',');
    candidates = candidates.filter((word) => evaluateGuess(guess, word).join(',') === patternKey);
  }

  return round;
}

test('Casino Wordle yields positive player EV (> 1.0x RTP) across skew levels 3, 4, and 5', () => {
  const roundsPerLevel = 450;
  const rtpByLevel = {};

  for (const level of [3, 4, 5]) {
    const rng = createRng(500 + level);
    let totalWagered = 0;
    let totalReturned = 0;
    let wins = 0;

    for (let i = 0; i < roundsPerLevel; i++) {
      const round = simulateWordleBotRound(level, rng);
      totalWagered += round.wager;
      totalReturned += round.payout;
      if (round.status === 'won') wins += 1;
    }

    const rtp = totalReturned / totalWagered;
    const winRate = wins / roundsPerLevel;
    rtpByLevel[level] = rtp;

    assert.ok(
      winRate > 0.9,
      `Expected >90% solve rate at skewLevel=${level}, got ${(winRate * 100).toFixed(1)}%`
    );
    assert.ok(
      rtp > 1.05,
      `Expected player-favorable RTP > 1.05 at skewLevel=${level}, got ${rtp.toFixed(3)}`
    );
  }

  assert.ok(
    rtpByLevel[4] >= rtpByLevel[3],
    `Expected RTP(4)=${rtpByLevel[4].toFixed(3)} >= RTP(3)=${rtpByLevel[3].toFixed(3)}`
  );
  assert.ok(
    rtpByLevel[5] >= rtpByLevel[4],
    `Expected RTP(5)=${rtpByLevel[5].toFixed(3)} >= RTP(4)=${rtpByLevel[4].toFixed(3)}`
  );
});
