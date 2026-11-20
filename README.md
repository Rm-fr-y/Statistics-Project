# Velvet & Brass Casino

A zero-build, vanilla HTML, CSS, and modular JavaScript casino web application featuring a **Home Screen lobby**, shared persistent virtual chip bankroll, procedural Web Audio SFX, and three games engineered with distinct, mathematically verified long-run probabilities.

## Games & Statistical Models

### 1. Jackpot Throw — House Edge (~ −8% Optimal EV)
- **Gameplay**: The dealer launches a jackpot ball across the table using real 2D projectile physics (`g = 9.81 m/s²` + quadratic air drag + ball spin). Press **`Spacebar`** to catch the ball inside the brass catch ring for a **2x payout**.
- **Non-Uniform House Skew**: When timed inside the catch zone (`|e| ≤ 0.35`), an additive/subtractive perturbation `Δ` is sampled from a **zero-inflated bimodal Beta-lobe mixture** (`src/games/jackpot/skew.js`):
  - **38% Exact Zero (`Δ = 0`)**: Completely unaffected — a well-timed catch lands cleanly for 2x.
  - **8% Tight Inner Triangular Jitter**: Organic micro-variance; dead-center timing still wins cleanly.
  - **54% Left / Right `Beta(2, 5)` Rim Lobes**: Nudges the ball slightly left or right onto the brass rim so it bounces out.
- **Long-Run Result**: Dead-center timing is strictly optimal at **46.0% win rate** on a 2x payout (**−8.0% EV**, house favored in the long run).

### 2. Casino Wordle — Player Edge (+EV)
- **Gameplay**: 5-letter, 6-guess Wordle with a tiered **guess-based prize ladder** (`5.0x` on Guess 1 down to `0.60x` on Guess 6).
- **Adjusted Letter Rates & `3–5` Skew Variable**: Secret words are sampled using English letter-frequency friendliness weights (excluding rare letters like `Q, Z, X, J, V, K`) controlled by the selectable **`skewLevel` (`3`, `4`, or `5`)**:
  - **Level 3 (Lucky Letters)**: Frequency-weighted common letters, rare letters removed.
  - **Level 4 (High Roller)**: Unique-letter common pool + 1 guaranteed present-letter hint.
  - **Level 5 (VIP Player Edge)**: Ultra-common core words + 1 revealed green starting letter.
- **Long-Run Result**: Verified **> 100% RTP (positive player EV)** across all three skew levels (`3`, `4`, and `5`).

### 3. Fair Casino Uno — Long-Run Fair (50/50, ~100% RTP)
- **Gameplay**: 1v1 Uno against a **zero-peeking House Dealer AI** (strictly sanitized public game state) for even-money **2x payouts**.
- **Adjusted Fairness Rules**:
  1. Unbiased **50/50 opening coin flip** determines first mover each round.
  2. Clean number-card opening discard & no Turn-1 `Wild +4`.
  3. **Consecutive Skip Cap (Max 1)** prevents 1v1 Skip/Reverse action lockouts.
  4. Symmetric **`+2` stacking** and **Draw-1-and-Play**.
  5. Fair deadlock tiebreaker (lowest hand points wins; exact tie = Push returning 1x stake).
- **Long-Run Result**: Verified **50.0% ± 2.0% win rate (~100% RTP)** over thousands of simulated matches.

## Running Locally

Serve the directory over HTTP (any static file server works):

```bash
npm start
# or
python3 -m http.server 3000
```

Then open `http://localhost:3000` in your browser.

## Verification & Monte Carlo Tests

Run the built-in Node test suite (zero dependencies required):

```bash
npm test
```
