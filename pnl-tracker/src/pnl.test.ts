/**
 * Tests for the FIFO PnL accounting. Run with: npm test
 * Uses Node's built-in test runner (via tsx) so there are no extra dependencies.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePnl } from './pnl.js'
import type { Trade } from './veltra.js'

let seq = 0
/** Build a Trade with sensible defaults; `at` orders trades in time for FIFO. */
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

test('simple buy then sell realizes proceeds minus cost', () => {
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 1 }),
    trade({ side: 'sell', amount: 100, amountSol: 1.5 }),
  ]
  const s = computePnl(trades)
  assert.equal(round(s.totalRealizedSol), 0.5)
  assert.equal(s.winners, 1)
  assert.equal(s.losers, 0)
  assert.equal(s.winRate, 1)
  assert.equal(s.tokens[0].openQty, 0)
})

test('FIFO consumes the oldest lot first', () => {
  // Two buys at different prices, then sell exactly the first lot's size.
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 1 }), // costPerUnit 0.01
    trade({ side: 'buy', amount: 100, amountSol: 2 }), // costPerUnit 0.02
    trade({ side: 'sell', amount: 100, amountSol: 1.5 }),
  ]
  const s = computePnl(trades)
  const t = s.tokens[0]
  // Sold the 0.01 lot: cost 1.0, proceeds 1.5 => +0.5 realized.
  assert.equal(round(t.realizedSol), 0.5)
  // The 0.02 lot remains open: 100 units, cost basis 2.0.
  assert.equal(t.openQty, 100)
  assert.equal(round(t.openCostSol), 2)
})

test('a partial sell leaves the rest of the lot open', () => {
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 2 }), // costPerUnit 0.02
    trade({ side: 'sell', amount: 40, amountSol: 1 }), // cost 40*0.02=0.8, proceeds 1 => +0.2
  ]
  const s = computePnl(trades)
  const t = s.tokens[0]
  assert.equal(round(t.realizedSol), 0.2)
  assert.equal(t.openQty, 60)
  assert.equal(round(t.openCostSol), 1.2)
})

test('selling more than was bought flags unmatched quantity with zero cost basis', () => {
  const trades = [trade({ side: 'sell', amount: 50, amountSol: 0.5 })]
  const s = computePnl(trades)
  const t = s.tokens[0]
  assert.equal(t.unmatchedSoldQty, 50)
  assert.equal(round(t.realizedSol), 0.5) // pure gain, no cost basis in history
})

test('win rate is share of realized tokens that are profitable', () => {
  const trades = [
    // Winner token
    trade({ side: 'buy', tokenMint: 'mintA', token: 'A', amount: 100, amountSol: 1 }),
    trade({ side: 'sell', tokenMint: 'mintA', token: 'A', amount: 100, amountSol: 2 }),
    // Loser token
    trade({ side: 'buy', tokenMint: 'mintB', token: 'B', amount: 100, amountSol: 2 }),
    trade({ side: 'sell', tokenMint: 'mintB', token: 'B', amount: 100, amountSol: 1 }),
    // Open-only token (no sell) should not count toward win rate
    trade({ side: 'buy', tokenMint: 'mintC', token: 'C', amount: 100, amountSol: 1 }),
  ]
  const s = computePnl(trades)
  assert.equal(s.winners, 1)
  assert.equal(s.losers, 1)
  assert.equal(s.winRate, 0.5)
  assert.equal(round(s.totalRealizedSol), 0) // +1 and -1
})

test('trades missing amount or SOL value are skipped, not costed', () => {
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 1 }),
    { ...trade({ side: 'sell', amount: 0, amountSol: 0 }), amount: null } as Trade,
    { ...trade({ side: 'sell', amount: 50, amountSol: 0 }), amountSol: null } as Trade,
  ]
  const s = computePnl(trades)
  assert.equal(s.skippedTrades, 2)
  // Only the buy remains: no realized PnL, an open position.
  assert.equal(s.tokens[0].hasRealized, false)
  assert.equal(s.tokens[0].openQty, 100)
})

test('FIFO respects block time even if trades arrive newest-first', () => {
  // API returns newest-first; computePnl must sort to oldest-first internally.
  const older = trade({ side: 'buy', amount: 100, amountSol: 1, blockTime: '2026-01-01T00:00:00Z' })
  const newer = trade({ side: 'buy', amount: 100, amountSol: 3, blockTime: '2026-01-02T00:00:00Z' })
  const sell = trade({ side: 'sell', amount: 100, amountSol: 2, blockTime: '2026-01-03T00:00:00Z' })
  // Pass them newest-first, as the API would.
  const s = computePnl([sell, newer, older])
  // FIFO must sell the older 0.01 lot first: proceeds 2 - cost 1 = +1.
  assert.equal(round(s.tokens[0].realizedSol), 1)
})

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
