/**
 * 2D Projectile Physics Engine for Game 1 (Jackpot)
 * Metric coordinate space (meters, seconds) with gravity, quadratic air drag,
 * deterministic fixed-step integration, throw velocity solver, and rim-bounce physics.
 */

export const WORLD = {
  width: 10.0,
  height: 4.8,
  floorY: 0.52,
  dealerRelease: { x: 1.18, y: 1.68 },
  catchCenter: { x: 8.55, y: 1.52 },
  ballRadius: 0.16,
  /** Physical half-width (meters) of the catch window corresponding to normalized |e| <= 0.35 */
  catchWindowMeters: 0.44,
};

export const GRAVITY = 9.81; // m/s^2
export const AIR_DRAG = 0.014; // 1/m (quadratic drag coefficient k = 0.5 * rho * Cd * A / m)
export const FIXED_DT = 1 / 240;

/**
 * Advance ball state by a single small step dt using semi-implicit Euler with quadratic drag.
 * @param {object} state
 * @param {number} dt
 */
export function stepBallState(state, dt) {
  const speed = Math.hypot(state.vx, state.vy);
  const ax = -AIR_DRAG * speed * state.vx;
  const ay = -GRAVITY - AIR_DRAG * speed * state.vy;

  state.vx += ax * dt;
  state.vy += ay * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.angle += state.spin * dt;
  state.t += dt;

  // Floor collision & felt rolling friction
  const minY = WORLD.floorY + WORLD.ballRadius;
  if (state.y < minY) {
    state.y = minY;
    if (Math.abs(state.vy) > 0.35) {
      state.vy = -state.vy * 0.56;
      state.vx *= 0.82;
      state.spin = -state.vx / WORLD.ballRadius;
    } else {
      state.vy = 0;
      state.vx *= Math.pow(0.22, dt);
      state.spin = -state.vx / WORLD.ballRadius;
    }
  }
}

/**
 * Simulate a throw forward from release for duration T using fixed substeps.
 */
export function simulateTrajectoryToTime(vx, vy, duration, start = WORLD.dealerRelease) {
  const state = {
    x: start.x,
    y: start.y,
    vx,
    vy,
    angle: 0,
    spin: -9.5,
    t: 0,
  };
  let remaining = duration;
  while (remaining > 1e-9) {
    const dt = Math.min(FIXED_DT, remaining);
    stepBallState(state, dt);
    remaining -= dt;
  }
  return state;
}

/**
 * Numerically solve initial launch velocity (vx, vy) under gravity + quadratic air drag
 * so the ball passes directly through target (xc, yc) at t = flightTime.
 * @param {number} flightTime Seconds in air (typically 1.05 - 1.65s)
 * @param {{x:number, y:number}} start
 * @param {{x:number, y:number}} target
 */
export function solveThrowVelocity(
  flightTime,
  start = WORLD.dealerRelease,
  target = WORLD.catchCenter
) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;

  // Vacuum analytical initial guess
  let vx = dx / flightTime;
  let vy = (dy + 0.5 * GRAVITY * flightTime * flightTime) / flightTime;

  // Iterative shooting correction to account for quadratic air drag
  for (let iter = 0; iter < 12; iter++) {
    const end = simulateTrajectoryToTime(vx, vy, flightTime, start);
    const errX = target.x - end.x;
    const errY = target.y - end.y;
    if (Math.hypot(errX, errY) < 1e-4) break;
    vx += (errX / flightTime) * 1.06;
    vy += (errY / flightTime) * 1.06;
  }

  const speed = Math.hypot(vx, vy);
  const launchAngleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;

  return {
    vx,
    vy,
    speed,
    launchAngleDeg,
    flightTime,
  };
}

/**
 * Create a fresh throw with randomized realistic arc duration (fast drive to lofty lob).
 * @param {() => number} rng
 */
export function createThrow(rng = Math.random) {
  // Varied flight times make every throw require real visual timing
  const flightTime = 1.06 + rng() * 0.58;
  const solved = solveThrowVelocity(flightTime);

  return {
    ...solved,
    x: WORLD.dealerRelease.x,
    y: WORLD.dealerRelease.y,
    angle: 0,
    spin: -(7.5 + rng() * 5.0),
    t: 0,
    trail: [],
  };
}

/**
 * Compute the player's raw normalized catch offset relative to the catch ring center.
 * Returns normalized offset e where |e| <= WIN_RADIUS (0.35) means inside catch zone.
 * Negative = early (ball still left of ring center); Positive = late (ball past ring center).
 */
export function computeRawCatchOffset(ball, winRadius = 0.35) {
  // Combine horizontal distance with vertical alignment weighting
  const dx = ball.x - WORLD.catchCenter.x;
  const dy = ball.y - WORLD.catchCenter.y;
  const radialSign = dx < 0 ? -1 : 1;
  // Emphasize horizontal arrival timing while still penalizing catching way above/below ring
  const effectiveDistMeters = Math.hypot(dx, dy * 0.65);
  return (radialSign * effectiveDistMeters / WORLD.catchWindowMeters) * winRadius;
}

/**
 * Apply physical rim-deflection impulse when the house skew or timing pushes the ball onto the rim.
 * @param {object} ball
 * @param {number} effectiveOffset Normalized effective offset (negative = near/left rim, positive = far/right rim)
 */
export function applyRimBounce(ball, effectiveOffset) {
  const dir = effectiveOffset < 0 ? -1 : 1;
  ball.vx = dir * (1.85 + Math.min(1.6, Math.abs(effectiveOffset) * 0.9));
  ball.vy = 2.65 + Math.min(1.1, Math.abs(effectiveOffset) * 0.45);
  ball.spin = -dir * 16;
}
