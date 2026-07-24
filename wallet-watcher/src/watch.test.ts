/**
 * Tests for the watcher's new-trade detection. Run with: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectNewTrades, formatTrade } from './watch.js'
import type { Trade } from './veltra.js'

function trade(signature: string, blockTime: string): Trade {
  return {
    signature,
    side: 'buy',
    token: 'TKN',
    tokenMint: 'mintTKN',
    amountSol: 1.234,
    amount: 1000,
    dex: 'Pump.fun',
    blockTime,
  }
}

test('only unseen signatures are returned as new', () => {
  const seen = new Set(['a', 'b'])
  const trades = [trade('a', '2026-01-01T00:00:00Z'), trade('c', '2026-01-02T00:00:00Z')]
  const fresh = selectNewTrades(trades, seen)
  assert.equal(fresh.length, 1)
  assert.equal(fresh[0].signature, 'c')
})

test('new trades come back oldest-first', () => {
  const trades = [
    trade('newer', '2026-01-03T00:00:00Z'),
    trade('older', '2026-01-01T00:00:00Z'),
  ]
  const fresh = selectNewTrades(trades, new Set())
  assert.deepEqual(fresh.map((t) => t.signature), ['older', 'newer'])
})

test('an unchanged wallet yields nothing new', () => {
  const trades = [trade('a', '2026-01-01T00:00:00Z'), trade('b', '2026-01-02T00:00:00Z')]
  const seen = new Set(trades.map((t) => t.signature))
  assert.equal(selectNewTrades(trades, seen).length, 0)
})

test('formatTrade produces a compact one-liner', () => {
  const line = formatTrade(trade('a', '2026-01-01T12:34:56Z'))
  assert.match(line, /BUY/)
  assert.match(line, /TKN/)
  assert.match(line, /Pump\.fun/)
})
