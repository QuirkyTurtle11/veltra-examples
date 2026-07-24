# Wallet Watcher

Watch a wallet and get alerted the moment it makes a new trade — in your terminal, or
forwarded to a Discord/Slack webhook.

Unlike the other examples (which look *backward* at a wallet's history), this one keeps
running and reacts to *new* activity.

## What it demonstrates

- Polling the Veltra API efficiently for new trades
- Diffing each check against what you've already seen, so you alert once per trade
- Optional webhook delivery (Discord/Slack incoming-webhook shape)

## Run it

```bash
cp .env.example .env       # paste your VELTRA_API_KEY
npm install
npm start -- <wallet-address>
```

Send alerts to Discord or Slack as well as the terminal:

```bash
ALERT_WEBHOOK_URL="https://discord.com/api/webhooks/..." npm start -- <wallet-address>
```

Run the tests (no network, no key needed):

```bash
npm test
```

## Example output

```
Watching Bi4r...YdLt on solana, checking every 30s.
The first check establishes a baseline; alerts start from the next new trade.

Baseline set: 50 recent trades known. Waiting for new activity...
NEW  2026-07-24 04:31:09  BUY  0.257 SOL  AO  on Pump.fun
NEW  2026-07-24 04:33:42  SELL 3.548 SOL  AO  on Pump.fun
```

## How it works, and why polling is fine here

The Veltra API is a **historical** trade-history API — there is no realtime push/websocket —
so this watcher polls. That is cheaper than it sounds:

- The API walks a wallet newest-first and **stops at the first trade it has already stored**,
  so re-checking an unchanged wallet is a single quick round trip.
- Billing is per *new* trade (a high-water mark), so repeatedly polling a quiet wallet does
  **not** re-bill trades you've already paid for.

Each check pulls the newest `WATCH_LIMIT` trades via the client's `getPage` method, compares
their signatures against an in-memory `seen` set (see `src/watch.ts`), and alerts on anything
new. The first check just establishes the baseline so you aren't flooded with the wallet's
back-history on startup.

### Settings

| Env var | Default | Meaning |
| --- | --- | --- |
| `POLL_INTERVAL_SECONDS` | 30 | How often to check |
| `WATCH_LIMIT` | 50 | How many recent trades to pull each check |
| `ALERT_WEBHOOK_URL` | (none) | Discord/Slack-compatible webhook to forward alerts to |

### Notes and limits

- `seen` is in-memory, so restarting re-baselines (it won't re-alert old trades, but it also
  won't catch trades made while it was down). For production, persist `seen` or track the last
  `blockTime`.
- Set `WATCH_LIMIT` comfortably above the most trades a wallet might make within one poll
  interval, or a very active wallet could out-trade a single page between checks.

## License

MIT
