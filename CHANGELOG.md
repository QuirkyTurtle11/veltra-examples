# Changelog

All notable changes to the Veltra examples are documented here.

## [Unreleased]

### Added

- `pnl-tracker` — realized FIFO cost-basis PnL per token, win rate, and open-position cost
  basis, computed from a wallet's complete trade history.
- `copy-trade-backtester` — simulate copying a leader wallet over its history with a finite
  bankroll, fixed position size, and per-fill slippage.
- `trade-scoring` — a machine-learning pipeline (feature extraction + random forest) that
  scores a wallet 0-100 on trading skill, with `score` and `label` modes and a growable
  training set.
- `wallet-watcher` — poll a wallet and get alerted (terminal or Discord/Slack webhook) when it
  makes new trades.
- `recipes.md` — raw `curl` / HTTP recipes (streaming, pagination, chains, errors, `jq`) for
  using the API from any language.
- A `getPage` method on the shared client for discrete-page fetches.
- Repository scaffolding: root README, MIT license, contributing guide, and CI running
  typecheck and tests for every example.
