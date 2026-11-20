/**
 * Non-Uniform House-Skew Perturbation Distribution for Game 1 (Jackpot)
 *
 * When a player times a catch inside the catch zone (|e| <= WIN_RADIUS),
 * the ball receives an additive/subtractive perturbation Δ drawn from a
 * zero-inflated, non-uniform bimodal Beta-lobe mixture:
 *
 *  - 38% probability: Δ = 0 (exact zero — completely unaffected clean win!)
 *  -  8% probability: Δ ~ Triangular(-0.25, 0, +0.25) (subtle organic variance)
 *  - 54% probability: Δ = ±(0.72 + 0.30 * Beta(2, 5)) (left/right rim deflection lobes)
 *
 * Key mathematical guarantees (with 2x payout on win):
 *  1. It is genuinely possible to land the catch completely unaffected (38% exact Δ=0).
 *  2. Dead-center timing (e = 0) is strictly optimal: P(win | e=0) = 0.460.
 *  3. Long-run Expected Value for an optimal player is 2 * 0.460 - 1 = -0.08 (-8.0% house edge).
 *  4. Aiming intentionally off-center can never beat aiming dead-center (max lobe overlap ≤ 0.27).
 */

import { sampleBeta, sampleTriangular } from '../../core/rng.js';

export const WIN_RADIUS = 0.35;
export const PAYOUT_MULTIPLIER = 2;

export const SKEW_WEIGHTS = Object.freeze({
  exactZeroProb: 0.38,
  innerTriangularProb: 0.08,
  rimLobeProb: 0.54, // 27% left, 27% right
  innerHalfWidth: 0.25,
  lobeStart: 0.72,
  lobeSpan: 0.30,
  betaAlpha: 2,
  betaBeta: 5,
});

/**
 * Sample a perturbation Δ from the non-uniform zero-inflated distribution.
 * @param {() => number} rng
 * @returns {{ delta: number, regime: 'unaffected' | 'micro_jitter' | 'skew_left' | 'skew_right' }}
 */
export function sampleHouseSkew(rng = Math.random) {
  const u = rng();

  if (u < SKEW_WEIGHTS.exactZeroProb) {
    return { delta: 0, regime: 'unaffected' };
  }

  if (u < SKEW_WEIGHTS.exactZeroProb + SKEW_WEIGHTS.innerTriangularProb) {
    const delta = sampleTriangular(
      -SKEW_WEIGHTS.innerHalfWidth,
      0,
      SKEW_WEIGHTS.innerHalfWidth,
      rng
    );
    return { delta, regime: 'micro_jitter' };
  }

  const side = rng() < 0.5 ? -1 : 1;
  const betaDraw = sampleBeta(SKEW_WEIGHTS.betaAlpha, SKEW_WEIGHTS.betaBeta, rng);
  const magnitude = SKEW_WEIGHTS.lobeStart + SKEW_WEIGHTS.lobeSpan * betaDraw;
  return {
    delta: side * magnitude,
    regime: side < 0 ? 'skew_left' : 'skew_right',
  };
}

/**
 * Evaluate a catch attempt given normalized raw timing error and wager.
 * @param {number} rawOffset Normalized offset e (0 = dead center, |e| <= WIN_RADIUS = inside catch window)
 * @param {number} wager Chip wager placed in the ball
 * @param {() => number} rng
 */
export function evaluateCatch(rawOffset, wager, rng = Math.random) {
  const insideRawWindow = Math.abs(rawOffset) <= WIN_RADIUS;
  const wasPerfectTiming = Math.abs(rawOffset) <= 0.14;

  if (!insideRawWindow) {
    return {
      rawOffset,
      delta: 0,
      effectiveOffset: rawOffset,
      regime: 'raw_miss',
      wasPerfectTiming: false,
      insideRawWindow: false,
      won: false,
      payout: 0,
      net: -wager,
    };
  }

  const { delta, regime } = sampleHouseSkew(rng);
  const effectiveOffset = rawOffset + delta;
  const won = Math.abs(effectiveOffset) <= WIN_RADIUS;
  const payout = won ? Math.round(wager * PAYOUT_MULTIPLIER) : 0;

  return {
    rawOffset,
    delta,
    effectiveOffset,
    regime,
    wasPerfectTiming,
    insideRawWindow: true,
    won,
    payout,
    net: payout - wager,
  };
}

/**
 * Beta(2, 5) analytical PDF on [0, 1]: B(2,5) = 1/30 -> f(u) = 30 * u * (1 - u)^4
 */
function beta25Pdf(u) {
  if (u <= 0 || u >= 1) return 0;
  return 30 * u * Math.pow(1 - u, 4);
}

/**
 * Compute continuous PDF curve points (plus exact-zero point mass metadata)
 * for visualizing the non-uniform house-skew distribution in the UI.
 */
export function getSkewDistributionCurve(steps = 120) {
  const minX = -1.15;
  const maxX = 1.15;
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const x = minX + ((maxX - minX) * i) / steps;
    let density = 0;

    // Inner triangular component
    if (Math.abs(x) < SKEW_WEIGHTS.innerHalfWidth) {
      const triPdf = (1 - Math.abs(x) / SKEW_WEIGHTS.innerHalfWidth) / SKEW_WEIGHTS.innerHalfWidth;
      density += SKEW_WEIGHTS.innerTriangularProb * triPdf;
    }

    // Left & right Beta(2,5) rim deflection lobes
    const absX = Math.abs(x);
    if (absX > SKEW_WEIGHTS.lobeStart && absX < SKEW_WEIGHTS.lobeStart + SKEW_WEIGHTS.lobeSpan) {
      const u = (absX - SKEW_WEIGHTS.lobeStart) / SKEW_WEIGHTS.lobeSpan;
      const lobePdf = beta25Pdf(u) / SKEW_WEIGHTS.lobeSpan;
      density += (SKEW_WEIGHTS.rimLobeProb / 2) * lobePdf;
    }

    points.push({ x, density });
  }

  return {
    points,
    exactZeroProb: SKEW_WEIGHTS.exactZeroProb,
    winRadius: WIN_RADIUS,
    optimalWinProb: SKEW_WEIGHTS.exactZeroProb + SKEW_WEIGHTS.innerTriangularProb,
  };
}
