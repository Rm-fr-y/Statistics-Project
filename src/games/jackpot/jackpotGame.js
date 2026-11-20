/**
 * Game 1: Jackpot — Interactive Physics Canvas Controller & UI
 */

import { bankroll, formatChips } from '../../core/bankroll.js';
import { sound } from '../../core/audio.js';
import {
  WORLD,
  FIXED_DT,
  createThrow,
  stepBallState,
  computeRawCatchOffset,
  applyRimBounce,
} from './physics.js';
import {
  WIN_RADIUS,
  PAYOUT_MULTIPLIER,
  evaluateCatch,
  getSkewDistributionCurve,
} from './skew.js';

const CHIP_DENOMS = [10, 25, 50, 100, 250];

export function mountJackpotGame(container) {
  let wager = Math.min(50, Math.max(10, bankroll.getBalance()));
  let phase = 'idle'; // 'idle' | 'windup' | 'flying' | 'caught' | 'missed'
  let windupTimer = 0;
  let settleTimer = 0;
  let ball = null;
  let activeBet = 0;
  let lastResult = null;
  let rafId = null;
  let lastFrameTime = 0;
  let accumulator = 0;
  let catchFlash = 0;
  let showMathPanel = false;

  container.innerHTML = `
    <section class="game-page jackpot-page">
      <div class="game-header">
        <div class="game-header__title-group">
          <a href="#home" class="back-link">&larr; Back to Lobby</a>
          <h1>Jackpot</h1>
          <p class="game-tagline">Time the catch with <kbd>Spacebar</kbd> to double your stake &mdash; beware the subtle brass-rim house skew.</p>
        </div>
        <div class="edge-badge edge-badge--house">
          <span class="edge-badge__label">Long-Run Edge</span>
          <strong>House Edge (~8% Optimal)</strong>
        </div>
      </div>

      <div class="jackpot-stage-card">
        <div class="jackpot-canvas-wrap">
          <canvas id="jackpot-canvas" aria-label="Jackpot physics ball throw arena"></canvas>
          <div id="jackpot-overlay-banner" class="jackpot-banner hidden" aria-live="assertive"></div>
          <div id="jackpot-prompt-hint" class="jackpot-prompt-hint">
            Press <kbd>Space</kbd> or click <strong>Throw Ball</strong> to begin
          </div>
        </div>

        <div class="jackpot-hud">
          <div class="hud-metric">
            <span class="hud-metric__label">Throw Arc</span>
            <span id="jp-arc-readout" class="hud-metric__value">&mdash;</span>
          </div>
          <div class="hud-metric">
            <span class="hud-metric__label">Raw Timing</span>
            <span id="jp-raw-readout" class="hud-metric__value">&mdash;</span>
          </div>
          <div class="hud-metric">
            <span class="hud-metric__label">House Skew (&Delta;)</span>
            <span id="jp-skew-readout" class="hud-metric__value">&mdash;</span>
          </div>
          <div class="hud-metric">
            <span class="hud-metric__label">Outcome</span>
            <span id="jp-outcome-readout" class="hud-metric__value">Ready</span>
          </div>
        </div>

        <div class="jackpot-controls">
          <div class="wager-group">
            <span class="control-label">Ball Stake (2x Win)</span>
            <div class="chip-row" id="jp-chip-row">
              ${CHIP_DENOMS.map(
                (val) => `<button type="button" class="chip-btn" data-wager="${val}">$${val}</button>`
              ).join('')}
              <button type="button" class="chip-btn chip-btn--allin" data-wager="all">All-In</button>
            </div>
          </div>

          <div class="action-group">
            <button type="button" id="jp-primary-btn" class="btn-primary btn-primary--lg">
              Throw Ball <span class="btn-kbd">Space</span>
            </button>
            <button type="button" id="jp-math-toggle" class="btn-secondary">
              Inspect Distribution
            </button>
          </div>
        </div>
      </div>

      <div id="jp-math-panel" class="math-inspector hidden">
        <div class="math-inspector__text">
          <h2>Non-Uniform House-Skew Distribution</h2>
          <p>
            Every throw uses full 2D projectile physics (gravity <code>9.81 m/s&sup2;</code> + quadratic air drag) targeted
            directly through the catch ring. When your timing lands inside the catch window
            (<code>|e| &le; ${WIN_RADIUS}</code>), a non-uniform perturbation <code>&Delta;</code> is drawn:
          </p>
          <ul>
            <li><strong>38% Exact Zero (&Delta; = 0):</strong> Completely unaffected — a well-timed catch lands cleanly for 2x.</li>
            <li><strong>8% Inner Triangular Jitter:</strong> Subtle natural variance; dead-center timing still wins cleanly.</li>
            <li><strong>54% Left / Right Beta(2, 5) Rim Lobes:</strong> Nudges the ball slightly early or late onto the brass rim so it clips out.</li>
          </ul>
          <p class="math-inspector__summary">
            Even with mathematically perfect timing (<code>e = 0</code>), optimal win probability is <strong>46.0%</strong> on a
            <strong>2.0x</strong> payout &rArr; <strong>&minus;8.0% Expected Value</strong> (house favored in the long run).
          </p>
        </div>
        <div class="math-inspector__chart">
          <svg id="jp-dist-svg" viewBox="0 0 360 170" role="img" aria-label="Non-uniform skew probability distribution chart"></svg>
        </div>
      </div>
    </section>
  `;

  const canvas = container.querySelector('#jackpot-canvas');
  const ctx = canvas.getContext('2d');
  const primaryBtn = container.querySelector('#jp-primary-btn');
  const chipRow = container.querySelector('#jp-chip-row');
  const bannerEl = container.querySelector('#jackpot-overlay-banner');
  const promptEl = container.querySelector('#jackpot-prompt-hint');
  const arcReadout = container.querySelector('#jp-arc-readout');
  const rawReadout = container.querySelector('#jp-raw-readout');
  const skewReadout = container.querySelector('#jp-skew-readout');
  const outcomeReadout = container.querySelector('#jp-outcome-readout');
  const mathToggleBtn = container.querySelector('#jp-math-toggle');
  const mathPanel = container.querySelector('#jp-math-panel');
  const distSvg = container.querySelector('#jp-dist-svg');

  renderDistributionChart(distSvg);

  function syncWagerUI() {
    const bal = bankroll.getBalance();
    if (phase === 'idle' && bal > 0 && wager > bal) {
      wager = bal;
    }
    chipRow.querySelectorAll('.chip-btn').forEach((btn) => {
      const raw = btn.dataset.wager;
      const isAll = raw === 'all';
      const val = isAll ? bal : Number(raw);
      btn.disabled = phase !== 'idle' || bal <= 0 || (!isAll && val > bal);
      btn.classList.toggle('is-active', !isAll ? wager === val : bal > 0 && wager === bal && !CHIP_DENOMS.includes(bal));
    });

    if (phase === 'idle') {
      primaryBtn.disabled = bal <= 0 || wager <= 0;
      primaryBtn.innerHTML =
        bal <= 0
          ? 'No Chips — Click +$1k'
          : `Throw Ball (${formatChips(wager)}) <span class="btn-kbd">Space</span>`;
    } else if (phase === 'windup') {
      primaryBtn.disabled = true;
      primaryBtn.innerHTML = 'Dealer Winding Up&hellip;';
    } else if (phase === 'flying') {
      primaryBtn.disabled = false;
      primaryBtn.innerHTML = 'CATCH NOW! <span class="btn-kbd">Space</span>';
    } else {
      primaryBtn.disabled = settleTimer > 0.35;
      primaryBtn.innerHTML = `Throw Again (${formatChips(Math.min(wager, Math.max(10, bal)))}) <span class="btn-kbd">Space</span>`;
    }
  }

  function showBanner(title, subtitle, variant) {
    bannerEl.className = `jackpot-banner jackpot-banner--${variant}`;
    bannerEl.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
    bannerEl.classList.remove('hidden');
  }

  function hideBanner() {
    bannerEl.classList.add('hidden');
  }

  function startThrow() {
    if (phase !== 'idle' && phase !== 'caught' && phase !== 'missed') return;
    const bal = bankroll.getBalance();
    if (bal <= 0) return;
    if (wager > bal) wager = bal;
    if (!bankroll.placeBet(wager)) return;

    activeBet = wager;
    lastResult = null;
    ball = createThrow();
    phase = 'windup';
    windupTimer = 0.44;
    settleTimer = 0;
    catchFlash = 0;

    hideBanner();
    sound.chipClick();

    arcReadout.textContent = `${ball.speed.toFixed(1)} m/s @ ${ball.launchAngleDeg.toFixed(0)}°`;
    rawReadout.textContent = 'In flight…';
    skewReadout.textContent = 'Pending…';
    outcomeReadout.textContent = `Stake ${formatChips(activeBet)}`;
    promptEl.innerHTML = 'Wait for the ball to reach the brass ring, then press <kbd>Space</kbd>!';
    promptEl.classList.remove('hidden');
    syncWagerUI();
  }

  function attemptCatch() {
    if (phase !== 'flying' || !ball) return;

    const rawOffset = computeRawCatchOffset(ball, WIN_RADIUS);
    const result = evaluateCatch(rawOffset, activeBet);
    lastResult = result;
    settleTimer = 1.0;

    // Format telemetry
    const rawPct = Math.round((rawOffset / WIN_RADIUS) * 100);
    const rawLabel =
      Math.abs(rawOffset) <= 0.08
        ? 'Dead Center (0%)'
        : `${rawPct > 0 ? '+' : ''}${rawPct}% (${rawPct < 0 ? 'Early' : 'Late'})`;
    rawReadout.textContent = rawLabel;

    if (result.regime === 'raw_miss') {
      skewReadout.textContent = 'N/A (Outside zone)';
    } else if (result.regime === 'unaffected') {
      skewReadout.textContent = '0.00 (Unaffected)';
    } else {
      const sign = result.delta >= 0 ? '+' : '';
      const tag =
        result.regime === 'micro_jitter'
          ? 'Micro'
          : result.regime === 'skew_left'
            ? 'Left Rim Skew'
            : 'Right Rim Skew';
      skewReadout.textContent = `${sign}${result.delta.toFixed(2)} (${tag})`;
    }

    if (result.won) {
      phase = 'caught';
      catchFlash = 1.0;
      ball.x = WORLD.catchCenter.x + (result.effectiveOffset / WIN_RADIUS) * WORLD.catchWindowMeters * 0.45;
      ball.y = WORLD.catchCenter.y;
      ball.vx = 0;
      ball.vy = 0;
      ball.spin = 0;

      bankroll.settleRound('jackpot', activeBet, result.payout, 'win');
      sound.catchThud();
      sound.winChime();

      const subtitle =
        result.regime === 'unaffected'
          ? `Clean unaffected catch! Paid ${formatChips(result.payout)} (2x)`
          : `Held inside the rim! Paid ${formatChips(result.payout)} (2x)`;
      showBanner('JACKPOT CATCH!', subtitle, 'win');
      outcomeReadout.textContent = `+${formatChips(result.net)}`;
    } else {
      phase = 'missed';
      bankroll.settleRound('jackpot', activeBet, 0, 'loss');

      if (result.insideRawWindow) {
        // Visually apply the rim deflection so the player sees the ball clip the left or right rim
        const rimDir = result.effectiveOffset < 0 ? -1 : 1;
        ball.x = WORLD.catchCenter.x + rimDir * (WORLD.catchWindowMeters * 0.85);
        ball.y = WORLD.catchCenter.y + 0.08;
        applyRimBounce(ball, result.effectiveOffset);
        sound.rimClink();
        sound.loseTone();
        const sideWord = rimDir < 0 ? 'left' : 'right';
        showBanner(
          'RIM DEFLECTION!',
          `Timed well, but the house skew nudged it off the ${sideWord} rim.`,
          'loss'
        );
      } else {
        sound.loseTone();
        const timingWord = rawOffset < 0 ? 'Too early' : 'Too late';
        showBanner('MISSED CATCH', `${timingWord} — lost ${formatChips(activeBet)}`, 'loss');
      }
      outcomeReadout.textContent = `-${formatChips(activeBet)}`;
    }

    promptEl.innerHTML = 'Press <kbd>Space</kbd> to throw the next ball';
    syncWagerUI();
  }

  function handlePrimaryAction() {
    if (phase === 'flying') {
      attemptCatch();
    } else if (phase === 'idle' || ((phase === 'caught' || phase === 'missed') && settleTimer <= 0.35)) {
      startThrow();
    }
  }

  function onKeyDown(e) {
    if (e.code === 'Space') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      handlePrimaryAction();
    }
  }

  chipRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn || btn.disabled) return;
    const raw = btn.dataset.wager;
    wager = raw === 'all' ? bankroll.getBalance() : Number(raw);
    sound.chipClick();
    syncWagerUI();
  });

  primaryBtn.addEventListener('click', handlePrimaryAction);

  mathToggleBtn.addEventListener('click', () => {
    showMathPanel = !showMathPanel;
    mathPanel.classList.toggle('hidden', !showMathPanel);
    mathToggleBtn.textContent = showMathPanel ? 'Hide Distribution' : 'Inspect Distribution';
  });

  window.addEventListener('keydown', onKeyDown);
  const unsubBankroll = bankroll.subscribe(() => syncWagerUI());

  // Canvas resizing for crisp HiDPI rendering
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.round(width * 0.48);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Coordinate mapping from metric world -> canvas pixels
  function worldToScreen(wx, wy, cw, ch) {
    const sx = (wx / WORLD.width) * cw;
    const sy = ch - (wy / WORLD.height) * ch;
    return { x: sx, y: sy };
  }

  function drawArena(cw, ch) {
    ctx.clearRect(0, 0, cw, ch);
    // Emerald velvet backdrop with subtle spotlight
    const bgGrad = ctx.createRadialGradient(cw * 0.52, ch * 0.32, cw * 0.05, cw * 0.5, ch * 0.5, cw * 0.72);
    bgGrad.addColorStop(0, '#134f3d');
    bgGrad.addColorStop(0.65, '#0b3529');
    bgGrad.addColorStop(1, '#07221a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    // Subtle inlaid brass table rail & floor plane
    const floorPos = worldToScreen(0, WORLD.floorY, cw, ch);
    const floorGrad = ctx.createLinearGradient(0, floorPos.y, 0, ch);
    floorGrad.addColorStop(0, '#1e1612');
    floorGrad.addColorStop(0.18, '#15100d');
    floorGrad.addColorStop(1, '#0e0a08');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorPos.y, cw, ch - floorPos.y);

    // Brass trim line along table edge
    ctx.strokeStyle = 'rgba(212, 168, 83, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, floorPos.y);
    ctx.lineTo(cw, floorPos.y);
    ctx.stroke();

    // Subtle distance tick marks on the baize rail
    ctx.fillStyle = 'rgba(212, 168, 83, 0.25)';
    for (let m = 2; m <= 8; m++) {
      const p = worldToScreen(m, WORLD.floorY, cw, ch);
      ctx.fillRect(p.x - 0.5, p.y + 4, 1, 8);
    }

    // Draw Dealer silhouette on the left
    drawDealer(cw, ch);

    // Draw Catch Ring / Velvet Mitt Target on the right
    drawCatchZone(cw, ch);

    // Draw ball & shadow
    if (ball) {
      drawBallAndTrail(cw, ch);
    } else {
      // Idle ball resting in dealer's hand
      const hand = worldToScreen(WORLD.dealerRelease.x, WORLD.dealerRelease.y, cw, ch);
      drawJackpotBall(hand.x, hand.y, (WORLD.ballRadius / WORLD.width) * cw, 0);
    }
  }

  function drawDealer(cw, ch) {
    const base = worldToScreen(WORLD.dealerRelease.x - 0.32, WORLD.floorY, cw, ch);
    const release = worldToScreen(WORLD.dealerRelease.x, WORLD.dealerRelease.y, cw, ch);

    ctx.save();
    // Podium / Dealer Marker
    ctx.fillStyle = 'rgba(212, 168, 83, 0.12)';
    ctx.strokeStyle = 'rgba(212, 168, 83, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(base.x - 24, base.y - 8, 48, 8, 3);
    ctx.fill();
    ctx.stroke();

    // Stylized dealer torso & vest
    const torsoH = base.y - release.y + 12;
    ctx.fillStyle = '#1b1614';
    ctx.strokeStyle = 'rgba(212, 168, 83, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(base.x - 16, base.y - torsoH, 32, torsoH - 6, [12, 12, 4, 4]);
    ctx.fill();
    ctx.stroke();

    // Bowtie accent
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(base.x - 6, base.y - torsoH + 10);
    ctx.lineTo(base.x + 6, base.y - torsoH + 14);
    ctx.lineTo(base.x + 6, base.y - torsoH + 6);
    ctx.lineTo(base.x - 6, base.y - torsoH + 10);
    ctx.fill();

    // Head
    ctx.fillStyle = '#d4c3aa';
    ctx.beginPath();
    ctx.arc(base.x, base.y - torsoH - 14, 11, 0, Math.PI * 2);
    ctx.fill();

    // Throwing arm animation during windup / release
    let armAngle = -0.35;
    if (phase === 'windup') {
      const p = 1 - windupTimer / 0.44;
      armAngle = -0.35 - Math.sin(p * Math.PI) * 1.15;
    } else if (phase === 'flying' && ball && ball.t < 0.25) {
      armAngle = 0.45;
    }

    const shoulderX = base.x + 6;
    const shoulderY = base.y - torsoH + 16;
    const armLen = Math.hypot(release.x - shoulderX, release.y - shoulderY);
    const handX = shoulderX + Math.cos(armAngle) * armLen;
    const handY = shoulderY - Math.sin(armAngle) * armLen;

    ctx.strokeStyle = '#f5efe6';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    if (phase === 'windup') {
      drawJackpotBall(handX, handY, (WORLD.ballRadius / WORLD.width) * cw, windupTimer * 6);
    }

    // Dealer label
    ctx.fillStyle = 'rgba(245, 239, 230, 0.55)';
    ctx.font = '600 11px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DEALER', base.x, base.y + 22);
    ctx.restore();
  }

  function drawCatchZone(cw, ch) {
    const center = worldToScreen(WORLD.catchCenter.x, WORLD.catchCenter.y, cw, ch);
    const floor = worldToScreen(WORLD.catchCenter.x, WORLD.floorY, cw, ch);
    const zoneRadiusPx = (WORLD.catchWindowMeters / WORLD.width) * cw;

    ctx.save();

    // Brass stand supporting the catch ring
    ctx.strokeStyle = 'rgba(212, 168, 83, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y + zoneRadiusPx * 0.72);
    ctx.lineTo(center.x, floor.y);
    ctx.stroke();

    // Soft catch zone halo
    const ringAlpha = phase === 'flying' ? 0.2 : 0.11;
    ctx.fillStyle =
      catchFlash > 0
        ? `rgba(74, 222, 128, ${0.18 + catchFlash * 0.35})`
        : `rgba(212, 168, 83, ${ringAlpha})`;
    ctx.beginPath();
    ctx.arc(center.x, center.y, zoneRadiusPx, 0, Math.PI * 2);
    ctx.fill();

    // Outer brass rim ring
    ctx.strokeStyle = catchFlash > 0 ? '#4ade80' : '#d4a853';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(center.x, center.y, zoneRadiusPx, 0, Math.PI * 2);
    ctx.stroke();

    // Inner sweet-spot reticle
    ctx.strokeStyle = 'rgba(245, 239, 230, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, zoneRadiusPx * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Left & right brass rim studs (visual cue for rim-bounce edges)
    ctx.fillStyle = '#e5be6a';
    ctx.beginPath();
    ctx.arc(center.x - zoneRadiusPx, center.y, 4, 0, Math.PI * 2);
    ctx.arc(center.x + zoneRadiusPx, center.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(212, 168, 83, 0.85)';
    ctx.font = '600 11px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CATCH ZONE', center.x, floor.y + 22);
    ctx.restore();
  }

  function drawBallAndTrail(cw, ch) {
    if (phase === 'windup') return;
    const radiusPx = Math.max(8, (WORLD.ballRadius / WORLD.width) * cw);

    // Motion trail
    if (ball.trail.length > 1) {
      for (let i = 0; i < ball.trail.length; i++) {
        const pt = ball.trail[i];
        const s = worldToScreen(pt.x, pt.y, cw, ch);
        const frac = (i + 1) / ball.trail.length;
        ctx.fillStyle = `rgba(212, 168, 83, ${frac * 0.24})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, radiusPx * (0.35 + frac * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ground shadow directly beneath ball (helps judge height & distance!)
    const shadowPos = worldToScreen(ball.x, WORLD.floorY, cw, ch);
    const heightAboveFloor = Math.max(0, ball.y - WORLD.floorY);
    const shadowScale = Math.max(0.35, 1 - heightAboveFloor * 0.18);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.42 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(shadowPos.x, shadowPos.y + 3, radiusPx * 1.15 * shadowScale, radiusPx * 0.34 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball body
    const screenPos = worldToScreen(ball.x, ball.y, cw, ch);
    drawJackpotBall(screenPos.x, screenPos.y, radiusPx, ball.angle);
  }

  function drawJackpotBall(x, y, r, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const grad = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.12, 0, 0, r);
    grad.addColorStop(0, '#fff2c6');
    grad.addColorStop(0.42, '#e2b55a');
    grad.addColorStop(0.85, '#9d6d1f');
    grad.addColorStop(1, '#5d3d0c');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Crimson casino stitching seams to make spin clearly visible
    ctx.strokeStyle = 'rgba(145, 29, 29, 0.85)';
    ctx.lineWidth = Math.max(1.5, r * 0.13);
    ctx.beginPath();
    ctx.arc(-r * 0.72, 0, r * 0.62, -0.85, 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.72, 0, r * 0.62, Math.PI - 0.85, Math.PI + 0.85);
    ctx.stroke();

    ctx.restore();
  }

  function frame(now) {
    if (!lastFrameTime) lastFrameTime = now;
    const rawDt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (catchFlash > 0) {
      catchFlash = Math.max(0, catchFlash - rawDt * 2.1);
    }

    if (settleTimer > 0) {
      const prev = settleTimer;
      settleTimer = Math.max(0, settleTimer - rawDt);
      if (prev > 0.35 && settleTimer <= 0.35) {
        syncWagerUI();
      }
    }

    if (phase === 'windup') {
      windupTimer -= rawDt;
      if (windupTimer <= 0) {
        phase = 'flying';
        sound.throwWhoosh();
        syncWagerUI();
      }
    } else if (phase === 'flying' && ball) {
      accumulator += rawDt;
      while (accumulator >= FIXED_DT) {
        stepBallState(ball, FIXED_DT);
        accumulator -= FIXED_DT;
      }
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 18) ball.trail.shift();

      // Auto-miss if the ball sails completely past the catch ring without a Spacebar press
      if (ball.x > WORLD.width + 0.35 || ball.t > ball.flightTime + 0.45) {
        phase = 'missed';
        settleTimer = 0.8;
        bankroll.settleRound('jackpot', activeBet, 0, 'loss');
        sound.loseTone();
        rawReadout.textContent = 'No press (Expired)';
        skewReadout.textContent = 'N/A';
        outcomeReadout.textContent = `-${formatChips(activeBet)}`;
        showBanner('BALL PASSED!', `Press Spacebar before the ball clears the ring. Lost ${formatChips(activeBet)}.`, 'loss');
        promptEl.innerHTML = 'Press <kbd>Space</kbd> to try again';
        syncWagerUI();
      }
    } else if (phase === 'missed' && ball) {
      accumulator += rawDt;
      while (accumulator >= FIXED_DT) {
        stepBallState(ball, FIXED_DT);
        accumulator -= FIXED_DT;
      }
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();
    }

    const cw = canvas.clientWidth || 640;
    const ch = canvas.clientHeight || 308;
    drawArena(cw, ch);

    rafId = requestAnimationFrame(frame);
  }

  syncWagerUI();
  rafId = requestAnimationFrame(frame);

  return function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', resizeCanvas);
    unsubBankroll();
  };
}

function renderDistributionChart(svgEl) {
  const { points, winRadius } = getSkewDistributionCurve(110);
  const w = 360;
  const h = 170;
  const padL = 24;
  const padR = 24;
  const padT = 18;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const mapX = (val) => padL + ((val + 1.15) / 2.3) * plotW;
  const maxDensity = Math.max(...points.map((p) => p.density), 1.8);
  const mapY = (d) => padT + plotH - (d / maxDensity) * (plotH * 0.78);

  const winLeft = mapX(-winRadius);
  const winRight = mapX(winRadius);
  const zeroX = mapX(0);
  const baseY = padT + plotH;

  const pathD = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.x).toFixed(1)} ${mapY(pt.density).toFixed(1)}`)
    .join(' ');
  const fillD = `${pathD} L ${mapX(1.15).toFixed(1)} ${baseY} L ${mapX(-1.15).toFixed(1)} ${baseY} Z`;

  svgEl.innerHTML = `
    <rect x="${winLeft.toFixed(1)}" y="${padT}" width="${(winRight - winLeft).toFixed(1)}" height="${plotH}" fill="rgba(74, 222, 128, 0.12)" />
    <line x1="${padL}" y1="${baseY}" x2="${w - padR}" y2="${baseY}" stroke="rgba(245,239,230,0.3)" stroke-width="1" />
    <path d="${fillD}" fill="rgba(212, 168, 83, 0.24)" />
    <path d="${pathD}" fill="none" stroke="#d4a853" stroke-width="2" />
    <line x1="${zeroX.toFixed(1)}" y1="${baseY}" x2="${zeroX.toFixed(1)}" y2="${padT + 8}" stroke="#4ade80" stroke-width="3" />
    <circle cx="${zeroX.toFixed(1)}" cy="${padT + 8}" r="4" fill="#4ade80" />
    <text x="${zeroX.toFixed(1)}" y="${padT - 3}" fill="#4ade80" font-size="10" font-family="JetBrains Mono, monospace" text-anchor="middle">38% Exact Δ=0</text>
    <text x="${mapX(-0.85).toFixed(1)}" y="${padT + 26}" fill="#e2b55a" font-size="9.5" font-family="DM Sans, sans-serif" text-anchor="middle">Left Rim</text>
    <text x="${mapX(0.85).toFixed(1)}" y="${padT + 26}" fill="#e2b55a" font-size="9.5" font-family="DM Sans, sans-serif" text-anchor="middle">Right Rim</text>
    <text x="${mapX(-1.0).toFixed(1)}" y="${h - 8}" fill="rgba(245,239,230,0.6)" font-size="9.5" font-family="JetBrains Mono, monospace" text-anchor="middle">-1.0</text>
    <text x="${zeroX.toFixed(1)}" y="${h - 8}" fill="rgba(245,239,230,0.75)" font-size="9.5" font-family="JetBrains Mono, monospace" text-anchor="middle">0 (Win Zone)</text>
    <text x="${mapX(1.0).toFixed(1)}" y="${h - 8}" fill="rgba(245,239,230,0.6)" font-size="9.5" font-family="JetBrains Mono, monospace" text-anchor="middle">+1.0</text>
  `;
}
