/**
 * FIFO cost-basis PnL, computed purely from a wallet's trade history.
 *
 * This module is deliberately free of any network or Veltra-specific code so the accounting
 * is easy to test and to lift into your own project. Feed it Trade[] and it returns a
 * per-token PnL breakdown.
 *
 * Method: for each token, walk trades oldest-first. Buys add "lots" (a quantity at a SOL
 * cost). Sells consume lots first-in-first-out, and realized PnL for the sell is
 * (SOL received) minus (SOL cost of the exact quantity sold). Whatever lots remain unsold at
 * the end are the wallet's open position — its cost basis is known, but its *current* value
 * is not (the trade-history API does not price live holdings), so unrealized PnL is left out
 * on purpose rather than guessed.
 */

import type { Trade } from './veltra.js'

export interface TokenPnl {
  token: string
  tokenMint: string | null
  /** Realized PnL in SOL: proceeds minus FIFO cost basis of everything sold. */
  realizedSol: number
  /** Total token quantity bought / sold across all history. */
  boughtQty: number
  soldQty: number
  /** Token quantity still held (bought minus sold, floored at 0). */
  openQty: number
  /** SOL cost basis of the still-held quantity (what the wallet paid for its open bag). */
  openCostSol: number
  /** Sold quantity that had no matching buy in the history (airdrops, transfers, or a
   *  history that starts mid-position). Their proceeds count as pure realized gain, but they
   *  are surfaced so you can see the accounting isn't clean. */
  unmatchedSoldQty: number
  /** True once the wallet has sold at least some of this token (a closed or partial exit). */
  hasRealized: boolean
}

export interface PnlSummary {
  tokens: TokenPnl[]
  /** Sum of realizedSol across every token. */
  totalRealizedSol: number
  /** Of tokens with any realized PnL, the share that were net profitable (0..1). */
  winRate: number
  /** Count of tokens with realized PnL > 0 and <= 0. */
  winners: number
  losers: number
  /** Trades ignored because amount or amountSol was null (can't be costed). */
  skippedTrades: number
}

interface Lot {
  qty: number
  /** SOL cost per single token unit for this lot. */
  costPerUnit: number
}

/** Group trades by token, run FIFO per token, and roll up a summary. */
export function computePnl(trades: Trade[]): PnlSummary {
  const byToken = new Map<string, Trade[]>()
  let skippedTrades = 0

  for (const t of trades) {
    // A trade needs both a quantity and a SOL value to be costed. Skip (and count) the rest.
    if (t.amount === null || t.amountSol === null || t.amount <= 0) {
      skippedTrades++
      continue
    }
    // Prefer the mint as the grouping key (symbols collide); fall back to the symbol.
    const key = t.tokenMint ?? t.token
    const list = byToken.get(key)
    if (list) list.push(t)
    else byToken.set(key, [t])
  }

  const tokens: TokenPnl[] = []
  for (const group of byToken.values()) {
    tokens.push(computeTokenPnl(group))
  }

  // Rank by realized PnL, most profitable first.
  tokens.sort((a, b) => b.realizedSol - a.realizedSol)

  const realized = tokens.filter((t) => t.hasRealized)
  const winners = realized.filter((t) => t.realizedSol > 0).length
  const losers = realized.length - winners
  const totalRealizedSol = tokens.reduce((acc, t) => acc + t.realizedSol, 0)
  const winRate = realized.length === 0 ? 0 : winners / realized.length

  return { tokens, totalRealizedSol, winRate, winners, losers, skippedTrades }
}

function computeTokenPnl(trades: Trade[]): TokenPnl {
  // Oldest first, so FIFO matches the order lots were actually acquired.
  const ordered = [...trades].sort((a, b) => blockTimeMs(a) - blockTimeMs(b))

  const lots: Lot[] = []
  let realizedSol = 0
  let boughtQty = 0
  let soldQty = 0
  let unmatchedSoldQty = 0
  let hasRealized = false

  for (const t of ordered) {
    const qty = t.amount as number
    const sol = t.amountSol as number

    if (t.side === 'buy') {
      boughtQty += qty
      lots.push({ qty, costPerUnit: sol / qty })
      continue
    }

    // Sell: consume lots FIFO to cost the exact quantity sold.
    hasRealized = true
    soldQty += qty
    let remaining = qty
    let costOfSold = 0

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0]
      const take = Math.min(remaining, lot.qty)
      costOfSold += take * lot.costPerUnit
      lot.qty -= take
      remaining -= take
      if (lot.qty <= 1e-12) lots.shift()
    }

    // Any quantity we couldn't match to a buy has no cost basis in this history; its share of
    // the proceeds counts as pure gain. Proceeds for the whole sell are just `sol`.
    if (remaining > 0) unmatchedSoldQty += remaining
    realizedSol += sol - costOfSold
  }

  const openQty = lots.reduce((acc, l) => acc + l.qty, 0)
  const openCostSol = lots.reduce((acc, l) => acc + l.qty * l.costPerUnit, 0)

  return {
    token: trades[0].token,
    tokenMint: trades[0].tokenMint,
    realizedSol,
    boughtQty,
    soldQty,
    openQty,
    openCostSol,
    unmatchedSoldQty,
    hasRealized,
  }
}

function blockTimeMs(t: Trade): number {
  if (!t.blockTime) return 0
  const ms = new Date(t.blockTime).getTime()
  return Number.isFinite(ms) ? ms : 0
}
