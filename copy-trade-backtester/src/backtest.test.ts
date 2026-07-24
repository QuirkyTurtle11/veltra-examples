/**
 * Tests for the copy-trade backtest engine. Run with: npm test
 * Node's built-in test runner (via tsx) — no extra dependencies.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBacktest, type BacktestConfig } from './backtest.js'
import type { Trade } from './veltra.js'

let seq = 0
function trade(p: Partial<Trade> & { side: 'buy' | 'sell'; amount: number; amountSol: number }): Trade {
  seq += 1
  return {
    signature: `sig${seq}`,
    token: p.token ?? 'TKN',
    tokenMint: p.tokenMint ?? 'mintTKN',
    dex: 'Pump.fun',
    blockTime: p.blockTime ?? new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    ...p,
  }
}

const noSlip: BacktestConfig = { bankrollSol: 100, positionSol: 1, slippageBps: 0 }
const round = (n: number) => Math.round(n * 1e6) / 1e6

test('a profitable leader produces a profitable copy', () => {
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 1 }), // price 0.01
    trade({ side: 'sell', amount: 100, amountSol: 2 }), // price 0.02
  ]
  const r = runBacktest(trades, noSlip)
  assert.equal(round(r.realizedPnlSol), 1) // bought 100 for 1, sold 100 for 2
  assert.equal(r.copiedBuys, 1)
  assert.equal(r.copiedSells, 1)
  assert.equal(r.winners, 1)
  assert.equal(round(r.endBankrollSol), 101)
})

test('slippage reduces the copy PnL', () => {
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 1 }),
    trade({ side: 'sell', amount: 100, amountSol: 2 }),
  ]
  const clean = runBacktest(trades, noSlip)
  const withSlip = runBacktest(trades, { ...noSlip, slippageBps: 1000 }) // 10%
  assert.ok(withSlip.realizedPnlSol < clean.realizedPnlSol)
  assert.ok(withSlip.slippageCostSol > 0)
})

test('a partial exit realizes proportionally and leaves the rest held', () => {
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 1 }), // you buy 100, cost 1
    trade({ side: 'sell', amount: 50, amountSol: 1.5 }), // leader sells half at price 0.03
  ]
  const r = runBacktest(trades, noSlip)
  // You sell 50% of your bag: 50 tokens * 0.03 = 1.5 proceeds, cost removed 0.5 => +1.0.
  assert.equal(round(r.realizedPnlSol), 1)
  assert.equal(round(r.openCostSol), 0.5) // half still held at cost
})

test('buys are skipped when the bankroll is empty', () => {
  const trades = [
    trade({ side: 'buy', tokenMint: 'm1', token: 'A', amount: 100, amountSol: 1 }),
    trade({ side: 'buy', tokenMint: 'm2', token: 'B', amount: 100, amountSol: 1 }),
  ]
  const r = runBacktest(trades, { bankrollSol: 1, positionSol: 1, slippageBps: 0 })
  assert.equal(r.copiedBuys, 1)
  assert.equal(r.skippedBuysNoCash, 1)
})

test('a sell with no matching copied position is ignored, not a crash', () => {
  const r = runBacktest([trade({ side: 'sell', amount: 50, amountSol: 1 })], noSlip)
  assert.equal(r.copiedSells, 0)
  assert.equal(r.realizedPnlSol, 0)
})

test('trades are replayed oldest-first even when passed newest-first', () => {
  const buy = trade({ side: 'buy', amount: 100, amountSol: 1, blockTime: '2026-01-01T00:00:00Z' })
  const sell = trade({ side: 'sell', amount: 100, amountSol: 3, blockTime: '2026-01-02T00:00:00Z' })
  // Pass sell before buy, as the newest-first API would.
  const r = runBacktest([sell, buy], noSlip)
  assert.equal(round(r.realizedPnlSol), 2) // buy at 0.01, sell at 0.03
  assert.equal(r.copiedBuys, 1)
  assert.equal(r.copiedSells, 1)
})
