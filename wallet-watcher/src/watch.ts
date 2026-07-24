/**
 * Pure helpers for the watcher. Kept free of I/O so the "what counts as a new trade" logic is
 * easy to test.
 */

import type { Trade } from './veltra.js'

/**
 * Given the latest page of trades and the set of signatures we've already seen, return the
 * trades that are new, oldest-first (so alerts read in the order they happened). Does not
 * mutate `seen` — the caller decides when to record them.
 */
export function selectNewTrades(trades: Trade[], seen: Set<string>): Trade[] {
  return trades
    .filter((t) => !seen.has(t.signature))
    .sort((a, b) => blockTimeMs(a) - blockTimeMs(b))
}

/** A compact one-line description of a trade for console output or an alert message. */
export function formatTrade(t: Trade): string {
  const when = t.blockTime ? new Date(t.blockTime).toISOString().replace('T', ' ').slice(0, 19) : 'unknown time'
  const sol = t.amountSol === null ? '?' : t.amountSol.toFixed(3)
  const side = t.side.toUpperCase().padEnd(4)
  return `${when}  ${side} ${sol} SOL  ${t.token}  on ${t.dex}`
}

function blockTimeMs(t: Trade): number {
  if (!t.blockTime) return 0
  const ms = new Date(t.blockTime).getTime()
  return Number.isFinite(ms) ? ms : 0
}
