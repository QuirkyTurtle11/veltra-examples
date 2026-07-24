# Trade Scoring (ML)

Train a real machine-learning model on labeled wallets, then score any wallet **0–100** on
how likely it is to be worth following — from features extracted out of its Veltra trade
history.

The model is a random forest (`ml-random-forest`). But the model is the easy part: the value
of this example is the **feature engineering** in `src/features.ts` that turns raw trades into
signal. Copy that, and plug in whatever model you like.

## What it demonstrates

- A complete, honest ML pipeline on real data: **features -> train -> score**
- Turning parsed trade history into a normalized feature vector (win rate, profit share,
  ROI, activity, exit discipline, position size)
- A growable, labeled dataset you own — not hardcoded magic numbers

## Run it

```bash
cp .env.example .env       # paste your VELTRA_API_KEY
npm install

# Score a wallet with the current model:
npm start -- score <wallet-address>

# Teach the model by labeling wallets you have an opinion on:
npm start -- label <wallet-address> good
npm start -- label <wallet-address> bad
```

Run the tests (no network, no key needed):

```bash
npm test
```

## Example output

```
Wallet score: 82.0 / 100  (worth following)
(model trained on 27 labeled wallets, 15 of them real - label more to improve it)

Features driving the score
--------------------------
[#############-------]  0.64  winRate
[##############------]  0.71  profitShare
[###########---------]  0.55  roi
[################----]  0.80  activity
[#################---]  0.86  exitDiscipline
[########------------]  0.40  avgSize

Based on 1284 trades.
```

## How it works, and how to make it yours

1. **Features** (`src/features.ts`): the wallet's history runs through the same FIFO PnL
   engine as the `pnl-tracker` example, then is summarized into six normalized (0–1)
   features. This is the part worth copying — it's where trade data becomes signal.
2. **Dataset** (`training-data.json`): labeled examples of "worth following" (1) vs not (0).
   It ships with a dozen **illustrative** rows (named `example-*`) so `score` works on a
   fresh clone. **Replace them with your own judgments** using `label` mode — the model is
   only as good as the wallets you teach it on.
3. **Model** (`src/model.ts`): a random forest learns to weigh the features and returns the
   probability that a wallet is worth following. That probability is the score.

### Why the seed data is fake, and why that's fine

There is no universal ground truth for "good wallet," so this example can't ship real labels.
It ships a small synthetic set purely so the tool runs, and gives you `label` mode to build a
real one from wallets *you* judge. Score quality tracks the quality of your labels — treat the
out-of-the-box number as a demo, not a verdict.

### Notes

- Needs at least 10 labeled wallets to train (a random forest can't bootstrap fewer, and a
  model built on a handful wouldn't generalize). The shipped set already clears this.
- Scoring depends on the `amount` and `tokenMint` fields the API returns per trade; those
  power the FIFO features. See the [pnl-tracker](../pnl-tracker) example for the accounting.

## License

MIT
