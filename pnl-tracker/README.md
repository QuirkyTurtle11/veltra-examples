# PnL Tracker

Compute a wallet's **realized profit and loss** — per token and overall — with a proper FIFO
cost basis, plus a win rate. Point it at any wallet and see what it actually made.

## What it demonstrates

- Pulling a wallet's complete history in one call (`collectHistory`)
- Real **FIFO cost-basis accounting** using the `amount` (token quantity) and `amountSol`
  (SOL value) fields the API returns for every trade
- Separating **realized** PnL (closed/partial exits) from **open positions**, and being
  honest about what the data can and cannot tell you

## Run it

```bash
cp .env.example .env       # paste your VELTRA_API_KEY
npm install
npm start -- <wallet-address>
```

Run the accounting tests (no network, no API key needed):

```bash
npm test
```

## Example output

```
Computing PnL for Bi4r...YdLt on solana...

Realized PnL (FIFO cost basis)
------------------------------
Total realized:   +182.44 SOL
Win rate:         58.3%  (140 winners / 100 losers)
Uncosted trades:  12 (missing amount or SOL value, ignored)

Top winners
-----------
  Realized SOL   Token
       +47.47   Elonius
       +26.60   GELATO
   ...

Top losers
----------
  Realized SOL   Token
        -7.38   SPESH
        -3.28   FRED
   ...

Largest open positions (cost basis; current value not priced by the API)
------------------------------------------------------------------------
  Cost SOL   Token
      4.12   DUCK
   ...
```

## How the accounting works

`src/pnl.ts` is a pure, dependency-free module (easy to test, easy to copy). For each token
it walks trades oldest-first and keeps a queue of buy **lots** (a quantity at a SOL cost).
Each sell consumes lots **first-in-first-out** and realizes `proceeds - cost_of_that_quantity`.

### What "realized" means here, precisely

- **Realized PnL** counts only tokens the wallet has sold. Matching is FIFO on real token
  quantities, so it is true cost-basis accounting, not a rough SOL-in/SOL-out estimate.
- **Open positions** (tokens still held) are reported with their **cost basis**, but their
  *current market value is not part of the trade-history API*. So unrealized PnL is left out
  on purpose rather than guessed. If you want mark-to-market, price the `openQty` yourself
  with a quote source.
- **Unmatched sells** (a token sold in larger quantity than it was ever bought — an airdrop,
  a transfer in, or a history that starts mid-position) are flagged with `*`. Their proceeds
  count as pure gain because there is no cost basis for them in the history.
- **Win rate** is the share of *realized* tokens (ones with at least one sell) whose realized
  PnL is positive. Tokens the wallet only ever bought don't count for or against it.

The `amount` and `tokenMint` fields this relies on are part of every trade the API returns;
see the [API docs](https://veltradata.io/docs). Grouping is keyed on `tokenMint` (symbols can
collide) and falls back to the symbol when a mint is absent.

## License

MIT
