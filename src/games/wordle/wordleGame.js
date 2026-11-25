/**
 * Game 2: Casino Wordle — Interactive 6x5 Board, On-Screen Keyboard & Payout Ladder UI
 */

import { bankroll, formatChips } from '../../core/bankroll.js';
import { sound } from '../../core/audio.js';
import {
  MAX_GUESSES,
  WORD_LENGTH,
  SKEW_LEVEL_CONFIG,
  getPayoutMultipliers,
  createWordleRound,
  submitWordleGuess,
} from './wordleEngine.js';

const CHIP_DENOMS = [10, 25, 50, 100, 250];
const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
];

const KEY_PRIORITY = { absent: 1, present: 2, correct: 3 };

export function mountWordleGame(container) {
  let wager = Math.min(50, Math.max(10, bankroll.getBalance()));
  let skewLevel = 4; // Selectable 3, 4, or 5
  let round = null;
  let currentInput = '';
  let keyStates = Object.create(null);
  let toastTimeout = null;

  container.innerHTML = `
    <section class="game-page wordle-page">
      <div class="game-header">
        <div class="game-header__title-group">
          <a href="#home" class="back-link">&larr; Back to Lobby</a>
          <h1>Casino Wordle</h1>
          <p class="game-tagline">6 guesses, high-frequency English letter rates, and a tunable <strong>3&ndash;5 player skew</strong> with guess-tiered payouts.</p>
        </div>
        <div class="edge-badge edge-badge--player">
          <span class="edge-badge__label">Long-Run Edge</span>
          <strong>Player Edge (+EV)</strong>
        </div>
      </div>

      <div class="wordle-layout">
        <div class="wordle-board-panel">
          <div class="wordle-status-bar">
            <div id="wd-hint-banner" class="wordle-hint-banner">
              Choose your stake &amp; player skew (3&ndash;5), then deal a word.
            </div>
            <div id="wd-toast" class="wordle-toast hidden" role="status" aria-live="polite"></div>
          </div>

          <div id="wd-grid" class="wordle-grid" role="grid" aria-label="6 by 5 Wordle board"></div>

          <div id="wd-keyboard" class="wordle-keyboard" aria-label="On-screen keyboard"></div>
        </div>

        <aside class="wordle-sidebar">
          <div class="panel-block">
            <span class="control-label">Player Skew Variable (3&ndash;5)</span>
            <div class="skew-selector" id="wd-skew-selector" role="radiogroup" aria-label="Player skew level">
              ${[3, 4, 5]
                .map(
                  (lvl) => `
                  <button type="button" class="skew-btn ${lvl === skewLevel ? 'is-active' : ''}" data-level="${lvl}">
                    <span class="skew-btn__num">${lvl}</span>
                    <span class="skew-btn__tag">${lvl === 3 ? 'Lucky' : lvl === 4 ? 'High' : 'VIP'}</span>
                  </button>`
                )
                .join('')}
            </div>
            <p id="wd-skew-desc" class="skew-desc">${SKEW_LEVEL_CONFIG[skewLevel].description}</p>
          </div>

          <div class="panel-block">
            <span class="control-label">Table Stake</span>
            <div class="chip-row" id="wd-chip-row">
              ${CHIP_DENOMS.map(
                (val) => `<button type="button" class="chip-btn" data-wager="${val}">$${val}</button>`
              ).join('')}
            </div>
            <button type="button" id="wd-deal-btn" class="btn-primary btn-primary--full">
              Deal New Word
            </button>
          </div>

          <div class="panel-block">
            <span class="control-label" id="wd-ladder-label">Adjusted Prize Ladder (Skew ${skewLevel})</span>
            <ol id="wd-payout-ladder" class="payout-ladder">
              ${Object.entries(getPayoutMultipliers(skewLevel))
                .map(
                  ([g, mult]) => `
                  <li class="payout-row" data-guess="${g}">
                    <span>Guess ${g}</span>
                    <span class="payout-row__mult">${mult.toFixed(2)}x</span>
                    <span class="payout-row__chips" data-mult="${mult}"></span>
                  </li>`
                )
                .join('')}
            </ol>
          </div>
        </aside>
      </div>
    </section>
  `;

  const gridEl = container.querySelector('#wd-grid');
  const keyboardEl = container.querySelector('#wd-keyboard');
  const hintBannerEl = container.querySelector('#wd-hint-banner');
  const toastEl = container.querySelector('#wd-toast');
  const skewSelectorEl = container.querySelector('#wd-skew-selector');
  const skewDescEl = container.querySelector('#wd-skew-desc');
  const chipRowEl = container.querySelector('#wd-chip-row');
  const dealBtn = container.querySelector('#wd-deal-btn');
  const ladderLabelEl = container.querySelector('#wd-ladder-label');
  const payoutLadderEl = container.querySelector('#wd-payout-ladder');

  function buildGrid() {
    gridEl.innerHTML = '';
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = document.createElement('div');
      row.className = 'wordle-row';
      row.dataset.row = String(r);
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement('div');
        tile.className = 'wordle-tile';
        tile.dataset.col = String(c);
        row.appendChild(tile);
      }
      gridEl.appendChild(row);
    }
  }

  function buildKeyboard() {
    keyboardEl.innerHTML = KEYBOARD_ROWS.map(
      (row) => `
      <div class="kb-row">
        ${row
          .map((key) => {
            const wide = key === 'ENTER' || key === 'BACK' ? ' kb-key--wide' : '';
            const label = key === 'BACK' ? '⌫' : key;
            return `<button type="button" class="kb-key${wide}" data-key="${key}">${label}</button>`;
          })
          .join('')}
      </div>`
    ).join('');
  }

  function showToast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden', 'is-error');
    if (isError) toastEl.classList.add('is-error');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2400);
  }

  function shakeActiveRow() {
    if (!round) return;
    const rowEl = gridEl.querySelector(`.wordle-row[data-row="${round.guesses.length}"]`);
    if (!rowEl) return;
    rowEl.classList.remove('is-shaking');
    void rowEl.offsetWidth;
    rowEl.classList.add('is-shaking');
  }

  function renderBoard() {
    const rows = gridEl.querySelectorAll('.wordle-row');
    const activeRowIdx = round && round.status === 'playing' ? round.guesses.length : -1;

    rows.forEach((rowEl, r) => {
      const tiles = rowEl.querySelectorAll('.wordle-tile');
      const submitted = round && round.guesses[r];

      tiles.forEach((tile, c) => {
        tile.className = 'wordle-tile';
        tile.textContent = '';

        if (submitted) {
          tile.textContent = submitted.word[c];
          tile.classList.add('is-revealed', `state-${submitted.states[c]}`);
        } else if (r === activeRowIdx) {
          if (currentInput[c]) {
            tile.textContent = currentInput[c];
            tile.classList.add('is-filled');
          } else if (
            round.hint &&
            round.hint.type === 'exact' &&
            round.hint.index === c
          ) {
            tile.textContent = round.hint.letter;
            tile.classList.add('is-ghost-hint');
          }
        }
      });
    });

    // Update keyboard key colors
    keyboardEl.querySelectorAll('.kb-key').forEach((btn) => {
      const k = btn.dataset.key;
      btn.classList.remove('state-correct', 'state-present', 'state-absent');
      if (keyStates[k]) {
        btn.classList.add(`state-${keyStates[k]}`);
      }
    });

    // Update payout ladder active row, multipliers & chip values
    const isPlaying = Boolean(round && round.status === 'playing');
    const stake = isPlaying ? round.wager : wager;
    const activeSkew = isPlaying ? round.skewLevel : skewLevel;
    const multipliers = getPayoutMultipliers(activeSkew);
    ladderLabelEl.textContent = `Adjusted Prize Ladder (Skew ${activeSkew})`;

    payoutLadderEl.querySelectorAll('.payout-row').forEach((li) => {
      const g = Number(li.dataset.guess);
      const mult = multipliers[g];
      const multSpan = li.querySelector('.payout-row__mult');
      const chipSpan = li.querySelector('.payout-row__chips');
      multSpan.textContent = `${mult.toFixed(2)}x`;
      chipSpan.textContent = formatChips(Math.round(stake * mult));

      li.classList.remove('is-current', 'is-won', 'is-passed');
      if (round) {
        if (round.status === 'won' && round.solvedOnGuess === g) {
          li.classList.add('is-won');
        } else if (round.status === 'playing' && round.guesses.length + 1 === g) {
          li.classList.add('is-current');
        } else if (g <= round.guesses.length) {
          li.classList.add('is-passed');
        }
      }
    });
  }

  function syncControls() {
    const isPlaying = Boolean(round && round.status === 'playing');
    const bal = bankroll.getBalance();
    if (!isPlaying && bal > 0 && wager > bal) {
      wager = bal;
    }

    skewSelectorEl.querySelectorAll('.skew-btn').forEach((btn) => {
      const lvl = Number(btn.dataset.level);
      btn.disabled = isPlaying;
      btn.classList.toggle('is-active', lvl === skewLevel);
    });
    skewDescEl.textContent = SKEW_LEVEL_CONFIG[skewLevel].description;

    chipRowEl.querySelectorAll('.chip-btn').forEach((btn) => {
      const val = Number(btn.dataset.wager);
      btn.disabled = isPlaying || val > bal;
      btn.classList.toggle('is-active', wager === val);
    });

    dealBtn.disabled = isPlaying || bal <= 0 || wager <= 0;
    if (isPlaying) {
      dealBtn.textContent = `Playing for ${formatChips(round.wager)} · Guess ${round.guesses.length + 1}/6`;
    } else if (bal <= 0) {
      dealBtn.textContent = 'No Chips — Click +$1k';
    } else {
      dealBtn.textContent = round
        ? `Play Next Word (${formatChips(wager)})`
        : `Deal Word (${formatChips(wager)})`;
    }
  }

  function updateHintBanner() {
    if (!round) {
      hintBannerEl.className = 'wordle-hint-banner';
      hintBannerEl.innerHTML = 'Select your <strong>Player Skew (3&ndash;5)</strong> and stake, then click <strong>Deal Word</strong>.';
      return;
    }

    if (round.status === 'won') {
      const net = round.payout - round.wager;
      const netStr = net >= 0 ? `+${formatChips(net)}` : formatChips(net);
      hintBannerEl.className = 'wordle-hint-banner is-win';
      hintBannerEl.innerHTML = `Solved <strong>${round.secret}</strong> on Guess ${round.solvedOnGuess}! Paid <strong>${formatChips(round.payout)}</strong> (${round.multiplier.toFixed(2)}x, ${netStr} net).`;
      return;
    }

    if (round.status === 'lost') {
      hintBannerEl.className = 'wordle-hint-banner is-loss';
      hintBannerEl.innerHTML = `Out of guesses! The word was <strong>${round.secret}</strong>.`;
      return;
    }

    hintBannerEl.className = 'wordle-hint-banner is-active';
    if (round.hint?.type === 'exact') {
      hintBannerEl.innerHTML = `VIP Skew 5 Perk: Position <strong>#${round.hint.index + 1}</strong> is locked as <span class="hint-chip hint-chip--green">${round.hint.letter}</span>`;
    } else if (round.hint?.type === 'present') {
      hintBannerEl.innerHTML = `High Roller Skew 4 Perk: Guaranteed letter <span class="hint-chip hint-chip--gold">${round.hint.letter}</span> is in the word.`;
    } else {
      hintBannerEl.innerHTML = `Skew 3 Active: Rare letters removed &amp; high-frequency English letters boosted.`;
    }
  }

  function startNewRound() {
    const bal = bankroll.getBalance();
    if (bal <= 0) return;
    if (wager > bal) wager = bal;
    if (!bankroll.placeBet(wager)) return;

    round = createWordleRound({ wager, skewLevel });
    currentInput = '';
    keyStates = Object.create(null);

    if (round.hint) {
      keyStates[round.hint.letter] = round.hint.type === 'exact' ? 'correct' : 'present';
    }

    sound.chipClick();
    updateHintBanner();
    syncControls();
    renderBoard();
  }

  function handleKeyInput(key) {
    if (!round || round.status !== 'playing') {
      if (key === 'ENTER' && !dealBtn.disabled) {
        startNewRound();
      }
      return;
    }

    if (key === 'BACK') {
      if (currentInput.length > 0) {
        currentInput = currentInput.slice(0, -1);
        sound.tileTap();
        renderBoard();
      }
      return;
    }

    if (key === 'ENTER') {
      if (currentInput.length < WORD_LENGTH) {
        shakeActiveRow();
        showToast('Type all 5 letters first', true);
        return;
      }

      const res = submitWordleGuess(round, currentInput);
      if (!res.ok) {
        shakeActiveRow();
        showToast(res.error, true);
        return;
      }

      // Update keyboard priorities
      for (let i = 0; i < WORD_LENGTH; i++) {
        const ch = res.guess[i];
        const st = res.states[i];
        if (!keyStates[ch] || KEY_PRIORITY[st] > KEY_PRIORITY[keyStates[ch]]) {
          keyStates[ch] = st;
        }
      }

      currentInput = '';
      sound.tileTap();

      if (round.status === 'won') {
        bankroll.settleRound('wordle', round.wager, round.payout, 'win');
        sound.winChime();
      } else if (round.status === 'lost') {
        bankroll.settleRound('wordle', round.wager, 0, 'loss');
        sound.loseTone();
      }

      updateHintBanner();
      syncControls();
      renderBoard();
      return;
    }

    if (/^[A-Z]$/.test(key) && currentInput.length < WORD_LENGTH) {
      currentInput += key;
      sound.tileTap();
      renderBoard();
    }
  }

  function onPhysicalKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleKeyInput('BACK');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleKeyInput('ENTER');
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      handleKeyInput(e.key.toUpperCase());
    }
  }

  skewSelectorEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.skew-btn');
    if (!btn || btn.disabled) return;
    skewLevel = Number(btn.dataset.level);
    sound.chipClick();
    syncControls();
    renderBoard();
  });

  chipRowEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn || btn.disabled) return;
    wager = Number(btn.dataset.wager);
    sound.chipClick();
    syncControls();
    renderBoard();
  });

  dealBtn.addEventListener('click', startNewRound);

  keyboardEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.kb-key');
    if (!btn) return;
    handleKeyInput(btn.dataset.key);
  });

  window.addEventListener('keydown', onPhysicalKeyDown);
  const unsubBankroll = bankroll.subscribe(() => {
    syncControls();
    renderBoard();
  });

  buildGrid();
  buildKeyboard();
  updateHintBanner();
  syncControls();
  renderBoard();

  return function cleanup() {
    window.removeEventListener('keydown', onPhysicalKeyDown);
    if (toastTimeout) clearTimeout(toastTimeout);
    unsubBankroll();
  };
}
