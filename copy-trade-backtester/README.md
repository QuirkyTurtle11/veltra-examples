# Copy-Trade Backtester

"If I had copied this wallet, what would I have made?" Point it at a leader wallet and it
replays that wallet's entire Veltra trade history, simulating a copy strategy with a finite
bankroll, a fixed position size, and slippage on every fill.

## What it demonstrates

- Replaying a wallet's real trade history as an event stream
- A faithful copy-trade simulation: scale in on the leader's buys, scale out on their sells
- Modeling the things that make copy-trading hard in practice — **limited bankroll** and
  **slippage** — instead of assuming perfect fills

## Run it

```bash
cp .env.example .env       # paste your VELTRA_API_KEY
npm install
npm start -- <leader-wallet-address>
```

Tune the simulation (defaults shown):

```bash
BANKROLL_SOL=100 POSITION_SOL=1 SLIPPAGE_BPS=100 npm start -- <leader-wallet-address>
```

- `BANKROLL_SOL` — starting capital
- `POSITION_SOL` — SOL committed per copied buy
- `SLIPPAGE_BPS` — slippage per fill in basis points (100 = 1%)

Run the tests (no network, no key needed):

```bash
npm test
```

## Example output

```
Simulation settings
-------------------
Bankroll:        100 SOL
Per-trade size:  1 SOL
Slippage:        1.00% per fill

Your copy result
----------------
Realized PnL:    +18.44 SOL  (+18% on your 100 SOL bankroll)
End bankroll:    108.90 SOL  (started 100)
Deployed:        83.40 SOL across 120 buys, 96 sells
Still held:      9.54 SOL at cost (open positions, value not priced by the API)
Win rate:        54.2%  (65 winners / 55 losers, 120 tokens)
Slippage cost:   3.11 SOL lost to fills
```

## How the simulation works

The engine (`src/backtest.ts`) is pure and network-free. It replays the leader's trades
oldest-first:

- **Leader buys** a token -> you buy too, committing `POSITION_SOL` (if the bankroll allows),
  at the leader's price plus slippage. Ran out of cash? The buy is skipped and counted.
- **Leader sells** -> you sell the *same fraction* of your bag that they sold of theirs, at
  their price minus slippage, realizing PnL.

Realized PnL is proceeds minus the cost basis of what you sold, summed over tokens. It
reconciles with the cash on hand: `endBankroll = startBankroll + realizedPnl - openCost`,
where `openCost` is the capital still tied up in positions you're holding at the end. Those
open positions are reported at cost because the trade-history API does not price live
holdings — the same honest boundary as the `pnl-tracker` example.

### What it does NOT model (read this before trusting a number)

This is a historical simulation, not a promise of future results, and not live trading. It
does not model MEV, liquidity or price impact from your own size, failed transactions, gas,
or the fact that a real copier reacts *after* the leader (slippage is a crude stand-in for
that lag). Treat the output as a rough, optimistic-leaning estimate of a naive copy strategy
— useful for comparing wallets, not for sizing real capital.

## License

MIT
