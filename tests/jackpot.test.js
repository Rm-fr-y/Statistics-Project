import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/rng.js';
import {
  WORLD,
  solveThrowVelocity,
  simulateTrajectoryToTime,
  createThrow,
  computeRawCatchOffset,
} from '../src/games/jackpot/physics.js';
import {
  WIN_RADIUS,
  sampleHouseSkew,
  evaluateCatch,
} from '../src/games/jackpot/skew.js';

test('Jackpot physics solver lands ball at catch center across varied flight durations', () => {
  const rng = createRng(42);
  for (let i = 0; i < 50; i++) {
    const ball = createThrow(rng);
    const solved = solveThrowVelocity(ball.flightTime);
    const end = simulateTrajectoryToTime(solved.vx, solved.vy, ball.flightTime);

    const errMeters = Math.hypot(end.x - WORLD.catchCenter.x, end.y - WORLD.catchCenter.y);
    assert.ok(
      errMeters < 0.015,
      `Expected ball to reach catch center within 0.015m at t=${ball.flightTime.toFixed(3)}s, got ${errMeters.toFixed(4)}m`
    );

    const rawOffset = computeRawCatchOffset(end, WIN_RADIUS);
    assert.ok(Math.abs(rawOffset) < 0.02, `Expected near-zero catch offset, got ${rawOffset}`);
  }
});

test('Jackpot non-uniform skew allows unaffected zero-perturbation wins and maintains ~8% house edge', () => {
  const rng = createRng(1337);
  const trials = 20000;
  const wager = 100;

  let exactZeroCount = 0;
  let leftSkewCount = 0;
  let rightSkewCount = 0;
  let wins = 0;
  let totalReturned = 0;

  for (let i = 0; i < trials; i++) {
    const res = evaluateCatch(0, wager, rng); // Optimal dead-center timing every throw
    if (res.delta === 0) exactZeroCount += 1;
    if (res.regime === 'skew_left') leftSkewCount += 1;
    if (res.regime === 'skew_right') rightSkewCount += 1;
    if (res.won) wins += 1;
    totalReturned += res.payout;
  }

  const zeroRate = exactZeroCount / trials;
  const winRate = wins / trials;
  const ev = totalReturned / (trials * wager) - 1;
  const leftShare = leftSkewCount / (leftSkewCount + rightSkewCount);

  assert.ok(zeroRate > 0.35 && zeroRate < 0.41, `Expected ~38% unaffected catches, got ${(zeroRate * 100).toFixed(2)}%`);
  assert.ok(leftShare > 0.47 && leftShare < 0.53, `Expected symmetric left/right rim skew, got ${(leftShare * 100).toFixed(2)}% left`);
  assert.ok(winRate > 0.44 && winRate < 0.48, `Expected ~46% optimal win rate, got ${(winRate * 100).toFixed(2)}%`);
  assert.ok(ev > -0.12 && ev < -0.04, `Expected ~ -8% EV (house edge), got ${(ev * 100).toFixed(2)}%`);
});

test('Jackpot dead-center timing strictly outperforms off-center timing', () => {
  const trials = 10000;
  const winRateAt = (offset, seed) => {
    const rng = createRng(seed);
    let w = 0;
    for (let i = 0; i < trials; i++) {
      if (evaluateCatch(offset, 100, rng).won) w += 1;
    }
    return w / trials;
  };

  const centerRate = winRateAt(0, 101);
  const edgeRate = winRateAt(0.28, 102);
  const outsideRate = winRateAt(0.8, 103);

  assert.ok(centerRate > edgeRate, `Center (${centerRate}) should beat edge (${edgeRate})`);
  assert.equal(outsideRate, 0, 'Pressing outside catch window must always miss');

  // Verify sampleHouseSkew produces both negative and positive non-zero values
  const rng = createRng(999);
  const deltas = Array.from({ length: 500 }, () => sampleHouseSkew(rng).delta);
  assert.ok(deltas.some((d) => d === 0), 'Must include exact zero draws');
  assert.ok(deltas.some((d) => d < -0.7), 'Must include left rim lobe draws');
  assert.ok(deltas.some((d) => d > 0.7), 'Must include right rim lobe draws');
});
