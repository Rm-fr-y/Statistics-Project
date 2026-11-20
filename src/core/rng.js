/**
 * Seedable pseudo-random number generator and non-uniform statistical distributions.
 * Supports deterministic simulation in automated tests while defaulting to Math.random in live play.
 */

/**
 * Mulberry32 deterministic 32-bit PRNG.
 * @param {number} seed
 * @returns {() => number} Uniform float in [0, 1)
 */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard Normal N(0, 1) via Box-Muller transform.
 * @param {() => number} rng
 * @returns {number}
 */
export function sampleNormal(rng = Math.random) {
  let u1 = 0;
  let u2 = 0;
  while (u1 <= 1e-12) u1 = rng();
  u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Gamma(alpha, 1) sampler using Marsaglia-Tsang method (supports alpha > 0).
 * @param {number} alpha
 * @param {() => number} rng
 * @returns {number}
 */
export function sampleGamma(alpha, rng = Math.random) {
  if (alpha < 1) {
    const u = Math.max(1e-12, rng());
    return sampleGamma(alpha + 1, rng) * Math.pow(u, 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }
    if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Beta(alpha, beta) distribution on (0, 1).
 * @param {number} alpha
 * @param {number} beta
 * @param {() => number} rng
 * @returns {number}
 */
export function sampleBeta(alpha, beta, rng = Math.random) {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

/**
 * Triangular distribution on [min, max] with peak at mode.
 * @param {number} min
 * @param {number} mode
 * @param {number} max
 * @param {() => number} rng
 * @returns {number}
 */
export function sampleTriangular(min, mode, max, rng = Math.random) {
  const u = rng();
  const f = (mode - min) / (max - min);
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * In-place Fisher-Yates unbiased shuffle.
 * @template T
 * @param {T[]} array
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffleInPlace(array, rng = Math.random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
