/**
 * Main Application Entry Point & Hash Router
 */

import { bankroll, formatChips } from './core/bankroll.js';
import { sound } from './core/audio.js';
import { mountHomeView } from './ui/homeView.js';
import { mountJackpotGame } from './games/jackpot/jackpotGame.js';
import { mountWordleGame } from './games/wordle/wordleGame.js';
import { mountUnoGame } from './games/uno/unoGame.js';

const ROUTES = {
  home: { mount: mountHomeView, title: 'Velvet & Brass Casino — Lobby' },
  jackpot: { mount: mountJackpotGame, title: 'Jackpot Throw — Velvet & Brass Casino' },
  wordle: { mount: mountWordleGame, title: 'Casino Wordle — Velvet & Brass Casino' },
  uno: { mount: mountUnoGame, title: 'Fair Casino Uno — Velvet & Brass Casino' },
};

const appView = document.getElementById('app-view');
const bankrollValueEl = document.getElementById('header-bankroll-value');
const rebuyBtn = document.getElementById('btn-rebuy');
const ledgerToggleBtn = document.getElementById('btn-ledger-toggle');
const ledgerDrawer = document.getElementById('ledger-drawer');
const ledgerContent = document.getElementById('ledger-content');
const resetSessionBtn = document.getElementById('btn-reset-session');
const audioToggleBtn = document.getElementById('btn-audio-toggle');
const audioIconOn = document.getElementById('audio-icon-on');
const audioIconOff = document.getElementById('audio-icon-off');

let currentCleanup = null;

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return ROUTES[hash] ? hash : 'home';
}

function renderLedger(snapshot) {
  bankrollValueEl.textContent = formatChips(snapshot.balance);
  rebuyBtn.classList.toggle('is-urgent', snapshot.balance < 50);

  const rows = [
    { key: 'jackpot', name: 'Jackpot Throw', target: 'House Edge (~92% RTP)' },
    { key: 'wordle', name: 'Casino Wordle', target: 'Player Edge (>100% RTP)' },
    { key: 'uno', name: 'Fair Casino Uno', target: 'Fair 50/50 (~100% RTP)' },
  ];

  ledgerContent.innerHTML = rows
    .map(({ key, name, target }) => {
      const b = snapshot.stats[key];
      const net = b.returned - b.wagered;
      const rtp = b.wagered > 0 ? `${((b.returned / b.wagered) * 100).toFixed(1)}%` : '—';
      const winRate = b.rounds > 0 ? `${((b.wins / b.rounds) * 100).toFixed(1)}%` : '—';
      return `
        <div class="ledger-item">
          <div class="ledger-item__head">
            <strong>${name}</strong>
            <span>${target}</span>
          </div>
          <dl class="ledger-metrics">
            <div><dt>Rounds</dt><dd>${b.rounds}</dd></div>
            <div><dt>Win %</dt><dd>${winRate}</dd></div>
            <div><dt>RTP</dt><dd>${rtp}</dd></div>
            <div><dt>Net</dt><dd class="${net > 0 ? 'is-pos' : net < 0 ? 'is-neg' : ''}">${net > 0 ? '+' : ''}${formatChips(net)}</dd></div>
          </dl>
        </div>
      `;
    })
    .join('');
}

function mountCurrentRoute() {
  const routeKey = parseRoute();
  const route = ROUTES[routeKey];

  if (typeof currentCleanup === 'function') {
    currentCleanup();
    currentCleanup = null;
  }

  document.title = route.title;
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    const active = tab.dataset.route === routeKey;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-current', active ? 'page' : 'false');
  });

  appView.innerHTML = '';
  currentCleanup = route.mount(appView) || null;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// Header control listeners
rebuyBtn.addEventListener('click', () => {
  bankroll.rebuy(1000);
  sound.chipClick();
});

ledgerToggleBtn.addEventListener('click', () => {
  const isHidden = ledgerDrawer.classList.toggle('hidden');
  ledgerToggleBtn.setAttribute('aria-expanded', String(!isHidden));
});

resetSessionBtn.addEventListener('click', () => {
  bankroll.resetAll();
  sound.chipClick();
});

audioToggleBtn.addEventListener('click', () => {
  const next = !sound.isEnabled();
  sound.setEnabled(next);
  audioToggleBtn.setAttribute('aria-pressed', String(next));
  audioIconOn.classList.toggle('hidden', !next);
  audioIconOff.classList.toggle('hidden', next);
  if (next) sound.chipClick();
});

bankroll.subscribe(renderLedger);
window.addEventListener('hashchange', mountCurrentRoute);
mountCurrentRoute();
