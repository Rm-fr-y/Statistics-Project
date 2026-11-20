/**
 * Shared Casino Bankroll & Session Ledger
 * Persists virtual chip balance and per-game wagering telemetry to localStorage.
 */

const STORAGE_KEY = 'velvet_brass_casino_state_v1';
export const DEFAULT_BANKROLL = 1000;

function createEmptyStats() {
  return {
    jackpot: { rounds: 0, wins: 0, wagered: 0, returned: 0 },
    wordle: { rounds: 0, wins: 0, wagered: 0, returned: 0 },
    uno: { rounds: 0, wins: 0, pushes: 0, wagered: 0, returned: 0 },
  };
}

function loadState() {
  try {
    if (typeof localStorage === 'undefined') {
      return { balance: DEFAULT_BANKROLL, rebuys: 0, stats: createEmptyStats() };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { balance: DEFAULT_BANKROLL, rebuys: 0, stats: createEmptyStats() };
    }
    const parsed = JSON.parse(raw);
    const stats = createEmptyStats();
    for (const key of Object.keys(stats)) {
      if (parsed.stats && parsed.stats[key]) {
        stats[key] = { ...stats[key], ...parsed.stats[key] };
      }
    }
    return {
      balance: typeof parsed.balance === 'number' && Number.isFinite(parsed.balance)
        ? Math.max(0, Math.round(parsed.balance))
        : DEFAULT_BANKROLL,
      rebuys: typeof parsed.rebuys === 'number' ? parsed.rebuys : 0,
      stats,
    };
  } catch {
    return { balance: DEFAULT_BANKROLL, rebuys: 0, stats: createEmptyStats() };
  }
}

class BankrollStore {
  constructor() {
    this.state = loadState();
    this.listeners = new Set();
  }

  persist() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  emit() {
    for (const fn of this.listeners) {
      fn(this.getSnapshot());
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => this.listeners.delete(fn);
  }

  getSnapshot() {
    return {
      balance: this.state.balance,
      rebuys: this.state.rebuys,
      stats: structuredClone(this.state.stats),
    };
  }

  getBalance() {
    return this.state.balance;
  }

  canAfford(amount) {
    return amount > 0 && Number.isFinite(amount) && this.state.balance >= amount;
  }

  placeBet(amount) {
    const wager = Math.round(amount);
    if (wager <= 0 || wager > this.state.balance) {
      return false;
    }
    this.state.balance -= wager;
    this.persist();
    this.emit();
    return true;
  }

  settleRound(gameKey, wager, payout, outcome = 'loss') {
    const cleanWager = Math.round(wager);
    const cleanPayout = Math.max(0, Math.round(payout));
    this.state.balance += cleanPayout;

    const bucket = this.state.stats[gameKey];
    if (bucket) {
      bucket.rounds += 1;
      bucket.wagered += cleanWager;
      bucket.returned += cleanPayout;
      if (outcome === 'win') {
        bucket.wins += 1;
      } else if (outcome === 'push' && typeof bucket.pushes === 'number') {
        bucket.pushes += 1;
      }
    }

    this.persist();
    this.emit();
    return cleanPayout;
  }

  rebuy(amount = DEFAULT_BANKROLL) {
    this.state.balance += Math.round(amount);
    this.state.rebuys += 1;
    this.persist();
    this.emit();
  }

  resetAll() {
    this.state = {
      balance: DEFAULT_BANKROLL,
      rebuys: 0,
      stats: createEmptyStats(),
    };
    this.persist();
    this.emit();
  }
}

export const bankroll = new BankrollStore();

export function formatChips(amount) {
  const abs = Math.abs(Math.round(amount));
  const formatted = `$${abs.toLocaleString('en-US')}`;
  return amount < 0 ? `-${formatted}` : formatted;
}
