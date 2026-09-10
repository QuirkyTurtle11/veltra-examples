# Veltra Examples

Complete, runnable examples showing how to build real applications on top of the
[Veltra](https://veltradata.io) wallet trade-history API.

Every example answers one question: **"How do I accomplish this common on-chain task with Veltra?"**
Each one is a self-contained folder you can copy straight into your own project.

## The one primitive

Veltra gives you a wallet's **complete** buy/sell trade history — not capped at a few
thousand rows — from one endpoint:

```
GET https://veltradata.io/api/v1/wallets/:address/history
Authorization: Bearer <YOUR_API_KEY>
```

Each trade comes back as:

```jsonc
{
  "signature": "5xR...",   // the transaction signature
  "side": "buy",           // "buy" | "sell"
  "token": "BONK",         // token symbol
  "tokenMint": "DezX...",  // token mint address (stable per-token key)
  "amountSol": 1.42,       // SOL value of the trade (null if unknown)
  "amount": 91234.5,       // token quantity moved (null if unknown)
  "dex": "Raydium",        // where it executed
  "blockTime": "2026-01-04T12:03:11.000Z"
}
```

That single stream of "who bought/sold what, for how much SOL, where, and when" is enough
to build wallet analytics, PnL tracking, copy-trading intelligence, sniper detection, and
trade-scoring models. Each example below shows one of those.

https://github.com/user-attachments/assets/09dd7492-86b4-46ab-a33a-d4d1ca3497b5

## Examples

| Example | What it does | Level |
| --- | --- | --- |
| [pnl-tracker](./pnl-tracker) | Realized FIFO cost-basis PnL per token, win rate, and open positions | Beginner |
| [wallet-watcher](./wallet-watcher) | Poll a wallet and get alerted (terminal or webhook) when it makes new trades | Beginner |
| [copy-trade-backtester](./copy-trade-backtester) | Simulate copying any wallet over its history, with bankroll and slippage | Intermediate |
| [trade-scoring](./trade-scoring) | Train an ML model on labeled wallets, then score any wallet 0-100 on trading skill | Intermediate |

Each example follows the same shape: one folder, `npm install && npm start`.

**Not using JavaScript?** The API is just HTTP + a bearer token. See
[recipes.md](./recipes.md) for copy-paste `curl` commands (streaming, pagination, chains,
errors, `jq` one-liners) you can translate into any language, or the
[OpenAPI spec](./openapi.yaml) to generate a client or import into Postman/Insomnia.

## Running any example

Every example runs the same way:

```bash
cd pnl-tracker
cp .env.example .env                 # then paste your Veltra API key
npm install
npm start -- <wallet-address>
```

Get an API key by signing up at [veltradata.io](https://veltradata.io) — the free trial is
enough to run every example here.

**Prerequisites:** Node.js 18+ to run an example; Node.js 20+ to run the test suites (they use
Node's built-in test runner). No global installs — each example manages its own dependencies.

## Design principles

- **One folder, one problem.** Copy the folder you need; ignore the rest.
- **No shared build.** Each example has its own `package.json` and its own `src/veltra.ts`
  client, so you can drop any single folder into a production project unchanged.
- **Real work, not re-display.** The API already returns cleanly parsed trades, so every
  example does something *on top of* that data — cost-basis accounting, a copy-trade
  simulation, a trained model — rather than just reformatting the response.
- **Honest boundaries.** Veltra is a *historical* trade-history API — not real-time, not
  execution. Examples that resemble trading tools (copy-trading) are **backtests over
  history**, and say plainly what they do and do not model. No example sends transactions.

## Repository

- **Tests:** each example ships a test suite (`npm test`) for its core logic; CI runs
  typecheck + tests for all of them on every push.
- **License:** [MIT](./LICENSE).
- **Contributing:** see [CONTRIBUTING.md](./CONTRIBUTING.md).
