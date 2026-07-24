/**
 * Copy-trade backtest engine.
 *
 * Replays a leader wallet's trade history and simulates copying it with a finite bankroll:
 *   - When the leader BUYS a token, you buy a fixed SOL size too (if you have the cash).
 *   - When the leader SELLS, you sell the same FRACTION of your bag that they sold of theirs.
 *   - Every fill takes a slippage haircut, because a copier never gets the leader's exact
 *     price — you're reacting to their trade, not front-running it.
 *
 * It is a historical simulation, not live trading. It cannot model MEV, liquidity, failed
 * transactions, or the leader's private information — treat the result as an upper-ish bound
 * on a naive copy strategy, not a promise.
 *
 * Pure and network-free so the accounting is easy to test and to reuse.
 */

import type { Trade } from './veltra.js'

export interface BacktestConfig {
  /** Starting capital, in SOL. */
  bankrollSol: number
  /** SOL committed to each copied buy (capped by remaining bankroll). */
  positionSol: number
  /** Slippage per fill, in basis points (100 = 1%), applied against you on entry and exit. */
  slippageBps: number
}

export interface TokenResult {
  token: string
  tokenMint: string | null
  realizedSol: number
}

export interface BacktestResult {
  startBankrollSol: number
  /** Cash on hand at the end (after all copied sells). */
  endBankrollSol: number
  /** Realized cash PnL = endBankroll - startBankroll. Excludes still-held positions. */
  realizedPnlSol: number
  /** Realized PnL as a percent of the starting bankroll — your account's return on capital. */
  returnOnBankrollPct: number
  /** Total SOL spent opening copied positions. */
  deployedSol: number
  /** Cost basis of positions still open at the end (money still tied up, value unpriced). */
  openCostSol: number
  copiedBuys: number
  copiedSells: number
  /** Leader buys skipped because the bankroll was empty. */
  skippedBuysNoCash: number
  tokensTraded: number
  winners: number
  losers: number
  winRate: number
  /** Total SOL lost to slippage across all fills. */
  slippageCostSol: number
  /** Per-token realized PnL, most profitable first. */
  perToken: TokenResult[]
}

interface Position {
  token: string
  tokenMint: string | null
  /** Tokens you currently hold. */
  qty: number
  /** SOL cost basis of the held qty. */
  costSol: number
  /** The leader's current holding of this token, so you can copy their exit fraction. */
  leaderQty: number
  realizedSol: number
}

export function runBacktest(trades: Trade[], config: BacktestConfig): BacktestResult {
  const slip = config.slippageBps / 10_000
  let bankroll = config.bankrollSol
  let deployed = 0
  let slippageCost = 0
  let copiedBuys = 0
  let copiedSells = 0
  let skippedBuysNoCash = 0

  const positions = new Map<string, Position>()

  // Oldest-first: a backtest must replay in the order trades actually happened.
  const ordered = [...trades]
    .filter((t) => t.amount !== null && t.amountSol !== null && t.amount > 0 && t.amountSol > 0)
    .sort((a, b) => blockTimeMs(a) - blockTimeMs(b))

  for (const t of ordered) {
    const key = t.tokenMint ?? t.token
    const price = (t.amountSol as number) / (t.amount as number) // SOL per token
    let pos = positions.get(key)
    if (!pos) {
      pos = { token: t.token, tokenMint: t.tokenMint, qty: 0, costSol: 0, leaderQty: 0, realizedSol: 0 }
      positions.set(key, pos)
    }

    if (t.side === 'buy') {
      pos.leaderQty += t.amount as number

      const spend = Math.min(config.positionSol, bankroll)
      if (spend <= 0) {
        skippedBuysNoCash++
        continue
      }
      // You pay up: your effective buy price is worse by the slippage.
      const effectivePrice = price * (1 + slip)
      const tokensBought = spend / effectivePrice
      slippageCost += spend - tokensBought * price

      bankroll -= spend
      deployed += spend
      pos.qty += tokensBought
      pos.costSol += spend
      copiedBuys++
      continue
    }

    // Sell: copy the leader's exit as a fraction of their position.
    if (pos.qty <= 0 || pos.leaderQty <= 0) {
      pos.leaderQty = Math.max(0, pos.leaderQty - (t.amount as number))
      continue
    }
    const fraction = Math.min(1, (t.amount as number) / pos.leaderQty)
    const tokensSold = pos.qty * fraction
    const costRemoved = pos.costSol * fraction

    // You sell into the move: your effective sell price is worse by the slippage.
    const effectivePrice = price * (1 - slip)
    const proceeds = tokensSold * effectivePrice
    slippageCost += tokensSold * price - proceeds

    bankroll += proceeds
    pos.qty -= tokensSold
    pos.costSol -= costRemoved
    pos.realizedSol += proceeds - costRemoved
    pos.leaderQty = Math.max(0, pos.leaderQty - (t.amount as number))
    copiedSells++
  }

  const traded = [...positions.values()].filter((p) => p.costSol > 0 || p.realizedSol !== 0)
  const realizedTokens = traded.filter((p) => p.realizedSol !== 0)
  const winners = realizedTokens.filter((p) => p.realizedSol > 0).length
  const losers = realizedTokens.length - winners
  const openCostSol = [...positions.values()].reduce((acc, p) => acc + Math.max(0, p.costSol), 0)

  // Realized PnL = proceeds minus cost basis of what was actually sold, summed over tokens.
  // This is the standard definition, and it reconciles with the cash on hand:
  //   endBankroll = startBankroll + realizedPnl - openCost (capital still deployed).
  // Using the raw bankroll change instead would understate PnL by whatever is still held.
  const realizedPnlSol = [...positions.values()].reduce((acc, p) => acc + p.realizedSol, 0)

  const perToken = realizedTokens
    .map((p) => ({ token: p.token, tokenMint: p.tokenMint, realizedSol: p.realizedSol }))
    .sort((a, b) => b.realizedSol - a.realizedSol)

  return {
    startBankrollSol: config.bankrollSol,
    endBankrollSol: bankroll,
    realizedPnlSol,
    returnOnBankrollPct: (realizedPnlSol / config.bankrollSol) * 100,
    deployedSol: deployed,
    openCostSol,
    copiedBuys,
    copiedSells,
    skippedBuysNoCash,
    tokensTraded: traded.length,
    winners,
    losers,
    winRate: realizedTokens.length === 0 ? 0 : winners / realizedTokens.length,
    slippageCostSol: slippageCost,
    perToken,
  }
}

function blockTimeMs(t: Trade): number {
  if (!t.blockTime) return 0
  const ms = new Date(t.blockTime).getTime()
  return Number.isFinite(ms) ? ms : 0
}
