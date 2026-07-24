/**
 * Feature extraction: turn a wallet's raw trade history into a small, normalized vector a
 * model can learn from. This is the real work of the example — the model itself is tiny; the
 * signal lives in how you summarize a wallet's behavior.
 *
 * Every feature is scaled to roughly 0..1 so no single one dominates the model just because
 * of its units, and so the numbers are readable when printed.
 */

import type { Trade } from './veltra.js'
import { computePnl } from './pnl.js'

/** The feature names, in a FIXED order. The model consumes vectors in this exact order. */
export const FEATURE_KEYS = [
  'winRate',
  'profitShare',
  'roi',
  'activity',
  'exitDiscipline',
  'avgSize',
] as const

export type FeatureName = (typeof FEATURE_KEYS)[number]
export type FeatureVector = Record<FeatureName, number>

/** Convert a feature object to the ordered number[] the model expects. */
export function toRow(f: FeatureVector): number[] {
  return FEATURE_KEYS.map((k) => f[k])
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export function extractFeatures(trades: Trade[]): FeatureVector {
  const pnl = computePnl(trades)

  // Realized winners vs losers (already computed by the FIFO engine).
  const winRate = pnl.winners + pnl.losers === 0 ? 0.5 : pnl.winners / (pnl.winners + pnl.losers)

  // Magnitude-weighted profitability: of all the SOL swung, how much was profit?
  let grossProfit = 0
  let grossLoss = 0
  for (const t of pnl.tokens) {
    if (t.realizedSol > 0) grossProfit += t.realizedSol
    else grossLoss += -t.realizedSol
  }
  const profitShare = grossProfit + grossLoss === 0 ? 0.5 : grossProfit / (grossProfit + grossLoss)

  // ROI proxy: realized SOL relative to SOL deployed into buys. Mapped from [-1, +3] to [0,1].
  let boughtSol = 0
  const sizes: number[] = []
  for (const t of trades) {
    if (t.amountSol === null) continue
    if (t.side === 'buy') boughtSol += t.amountSol
    sizes.push(Math.abs(t.amountSol))
  }
  const roiRaw = boughtSol === 0 ? 0 : pnl.totalRealizedSol / boughtSol
  const roi = clamp01((roiRaw + 1) / 4)

  // Activity: log-scaled trade count. ~10 trades -> 0.3, ~100 -> 0.57, ~3000 -> ~1.
  const tradeCount = trades.length
  const activity = clamp01(Math.log10(tradeCount + 1) / 3.5)

  // Exit discipline: share of tokens the wallet has actually sold (vs pure bag-holding).
  const exitDiscipline = pnl.tokens.length === 0 ? 0 : pnl.tokens.filter((t) => t.hasRealized).length / pnl.tokens.length

  // Typical position size (median SOL per trade), mapped from [0, 10 SOL] to [0, 1].
  const avgSize = clamp01(median(sizes) / 10)

  return { winRate, profitShare, roi, activity, exitDiscipline, avgSize }
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
