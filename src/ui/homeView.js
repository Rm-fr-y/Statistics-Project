/**
 * Home Screen Lobby — Game Selection Salon
 */

import { bankroll, formatChips } from '../core/bankroll.js';

export function mountHomeView(container) {
  function render(snapshot) {
    const { stats } = snapshot;

    const formatRtp = (bucket) => {
      if (!bucket.wagered) return 'Unplayed';
      const rtp = (bucket.returned / bucket.wagered) * 100;
      return `${bucket.rounds} hands · ${rtp.toFixed(0)}% RTP`;
    };

    container.innerHTML = `
      <section class="home-lobby">
        <div class="lobby-hero">
          <p class="lobby-eyebrow">Monte Carlo Salon &middot; Three Engineered Tables</p>
          <h1>Select Your Table</h1>
          <p class="lobby-lead">
            Every table shares your virtual bankroll and showcases a distinct statistical balance:
            one built for the house, one skewed for the player, and one calibrated to a 50/50 fair long run.
          </p>
        </div>

        <div class="table-grid">
          <article class="table-card table-card--jackpot">
            <div class="table-card__art" aria-hidden="true">
              <svg viewBox="0 0 260 124" width="100%" height="124" fill="none">
                <path d="M26 92 Q 130 8 224 72" stroke="#d4a853" stroke-width="2" stroke-dasharray="5 5" opacity="0.65" />
                <circle cx="224" cy="72" r="22" stroke="#d4a853" stroke-width="2.4" fill="rgba(212,168,83,0.12)" />
                <circle cx="224" cy="72" r="9" stroke="#f5efe6" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.55" />
                <circle cx="152" cy="40" r="12" fill="url(#ballGrad)" />
                <path d="M144 35 C149 38, 149 43, 144 46" stroke="#992424" stroke-width="1.8" stroke-linecap="round" />
                <path d="M160 35 C155 38, 155 43, 160 46" stroke="#992424" stroke-width="1.8" stroke-linecap="round" />
                <line x1="16" y1="104" x2="244" y2="104" stroke="rgba(212,168,83,0.35)" stroke-width="1.4" />
                <defs>
                  <radialGradient id="ballGrad" cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stop-color="#fff2c6" />
                    <stop offset="50%" stop-color="#dfb154" />
                    <stop offset="100%" stop-color="#7c5315" />
                  </radialGradient>
                </defs>
              </svg>
            </div>

            <div class="table-card__body">
              <div class="table-card__meta">
                <span class="table-number">Table 01</span>
                <span class="edge-tag edge-tag--house">House Edge</span>
              </div>
              <h2>Jackpot Throw</h2>
              <p>
                Real 2D projectile physics with gravity and drag. Time your <kbd>Spacebar</kbd> catch to win <strong>2x</strong> &mdash;
                with a non-uniform rim-skew distribution giving the house an ~8% optimal edge.
              </p>
              <div class="table-card__footer">
                <span class="table-stat">${formatRtp(stats.jackpot)}</span>
                <a href="#jackpot" id="play-jackpot-btn" class="btn-primary">Play Jackpot</a>
              </div>
            </div>
          </article>

          <article class="table-card table-card--wordle">
            <div class="table-card__art" aria-hidden="true">
              <svg viewBox="0 0 260 124" width="100%" height="124" fill="none">
                <g transform="translate(34, 24)">
                  <rect x="0" y="0" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <rect x="40" y="0" width="34" height="34" rx="5" fill="#c79535" stroke="#dfb154" />
                  <rect x="80" y="0" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <rect x="120" y="0" width="34" height="34" rx="5" fill="#1d2b26" stroke="#364a42" />
                  <rect x="160" y="0" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <text x="17" y="23" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">S</text>
                  <text x="57" y="23" fill="#171311" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">T</text>
                  <text x="97" y="23" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">A</text>
                  <text x="137" y="23" fill="#8b9d95" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">C</text>
                  <text x="177" y="23" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">E</text>

                  <rect x="0" y="42" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <rect x="40" y="42" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <rect x="80" y="42" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <rect x="120" y="42" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <rect x="160" y="42" width="34" height="34" rx="5" fill="#2e7d52" stroke="#47a471" />
                  <text x="17" y="65" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">S</text>
                  <text x="57" y="65" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">L</text>
                  <text x="97" y="65" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">A</text>
                  <text x="137" y="65" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">T</text>
                  <text x="177" y="65" fill="#f5efe6" font-family="JetBrains Mono, monospace" font-weight="700" font-size="16" text-anchor="middle">E</text>
                </g>
              </svg>
            </div>

            <div class="table-card__body">
              <div class="table-card__meta">
                <span class="table-number">Table 02</span>
                <span class="edge-tag edge-tag--player">Player Edge</span>
              </div>
              <h2>Casino Wordle</h2>
              <p>
                6 guesses with high-frequency letter rates and a selectable <strong>3&ndash;5 player skew variable</strong>.
                Solve early for up to <strong>5.0x</strong> &mdash; mathematically skewed in the player's favor.
              </p>
              <div class="table-card__footer">
                <span class="table-stat">${formatRtp(stats.wordle)}</span>
                <a href="#wordle" id="play-wordle-btn" class="btn-primary">Play Wordle</a>
              </div>
            </div>
          </article>

          <article class="table-card table-card--uno">
            <div class="table-card__art" aria-hidden="true">
              <svg viewBox="0 0 260 124" width="100%" height="124" fill="none">
                <g transform="translate(88, 18) rotate(-11 32 45)">
                  <rect x="0" y="0" width="58" height="86" rx="8" fill="#a82c2c" stroke="#f5efe6" stroke-width="2" />
                  <ellipse cx="29" cy="43" rx="20" ry="30" transform="rotate(24 29 43)" fill="rgba(245,239,230,0.16)" />
                  <text x="29" y="51" fill="#f5efe6" font-family="Playfair Display, serif" font-weight="700" font-size="24" text-anchor="middle">+2</text>
                </g>
                <g transform="translate(120, 16) rotate(10 32 45)">
                  <rect x="0" y="0" width="58" height="86" rx="8" fill="#1e5c8a" stroke="#f5efe6" stroke-width="2" />
                  <ellipse cx="29" cy="43" rx="20" ry="30" transform="rotate(24 29 43)" fill="rgba(245,239,230,0.16)" />
                  <text x="29" y="52" fill="#f5efe6" font-family="Playfair Display, serif" font-weight="700" font-size="26" text-anchor="middle">7</text>
                </g>
              </svg>
            </div>

            <div class="table-card__body">
              <div class="table-card__meta">
                <span class="table-number">Table 03</span>
                <span class="edge-tag edge-tag--fair">Fair 50/50</span>
              </div>
              <h2>Fair Casino Uno</h2>
              <p>
                Head-to-head against a zero-peeking dealer with balanced rules: 50/50 coin-flip start,
                1-skip cap, symmetric +2 stacking, and <strong>2x</strong> even-money payouts.
              </p>
              <div class="table-card__footer">
                <span class="table-stat">${formatRtp(stats.uno)}</span>
                <a href="#uno" id="play-uno-btn" class="btn-primary">Play Fair Uno</a>
              </div>
            </div>
          </article>
        </div>

        <div class="lobby-footnote">
          <div class="footnote-item">
            <span class="footnote-label">Active Bankroll</span>
            <strong>${formatChips(snapshot.balance)}</strong>
          </div>
          <div class="footnote-item">
            <span class="footnote-label">Total Hands Played</span>
            <strong>${stats.jackpot.rounds + stats.wordle.rounds + stats.uno.rounds}</strong>
          </div>
          <div class="footnote-item">
            <span class="footnote-label">Net Session P&amp;L</span>
            <strong>${formatChips(
              stats.jackpot.returned +
                stats.wordle.returned +
                stats.uno.returned -
                (stats.jackpot.wagered + stats.wordle.wagered + stats.uno.wagered)
            )}</strong>
          </div>
        </div>
      </section>
    `;
  }

  const unsub = bankroll.subscribe(render);
  return function cleanup() {
    unsub();
  };
}
