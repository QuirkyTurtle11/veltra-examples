/**
 * Tests for feature extraction and the model pipeline. Run with: npm test
 * Uses Node's built-in test runner (via tsx) — no extra dependencies.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractFeatures, toRow, FEATURE_KEYS } from './features.js'
import { WalletScorer } from './model.js'
import type { Trade } from './veltra.js'

let seq = 0
function trade(p: Partial<Trade> & { side: 'buy' | 'sell'; amount: number; amountSol: number }): Trade {
  seq += 1
  return {
    signature: `sig${seq}`,
    token: p.token ?? 'TKN',
    tokenMint: p.tokenMint ?? 'mintTKN',
    dex: p.dex ?? 'Pump.fun',
    blockTime: p.blockTime ?? new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    ...p,
  }
}

test('every feature stays within 0..1', () => {
  const trades = [
    trade({ side: 'buy', amount: 100, amountSol: 5 }),
    trade({ side: 'sell', amount: 100, amountSol: 12 }),
    trade({ side: 'buy', tokenMint: 'm2', token: 'B', amount: 50, amountSol: 2 }),
  ]
  const f = extractFeatures(trades)
  for (const key of FEATURE_KEYS) {
    assert.ok(f[key] >= 0 && f[key] <= 1, `${key} out of range: ${f[key]}`)
  }
})

test('a profitable, disciplined wallet scores its features high', () => {
  // Buys then sells at a profit across several tokens, fully exiting each.
  const trades: Trade[] = []
  for (let i = 0; i < 8; i++) {
    trades.push(trade({ side: 'buy', tokenMint: `m${i}`, token: `T${i}`, amount: 100, amountSol: 2 }))
    trades.push(trade({ side: 'sell', tokenMint: `m${i}`, token: `T${i}`, amount: 100, amountSol: 4 }))
  }
  const f = extractFeatures(trades)
  assert.equal(f.winRate, 1) // every closed token profitable
  assert.ok(f.profitShare > 0.9)
  assert.equal(f.exitDiscipline, 1) // sold every token
})

test('a bag-holder that never sells has low exit discipline', () => {
  const trades = [
    trade({ side: 'buy', tokenMint: 'm1', token: 'A', amount: 100, amountSol: 2 }),
    trade({ side: 'buy', tokenMint: 'm2', token: 'B', amount: 100, amountSol: 2 }),
    trade({ side: 'buy', tokenMint: 'm3', token: 'C', amount: 100, amountSol: 2 }),
  ]
  const f = extractFeatures(trades)
  assert.equal(f.exitDiscipline, 0)
  assert.equal(f.winRate, 0.5) // no realized trades -> neutral
})

test('toRow preserves feature order', () => {
  const f = extractFeatures([
    trade({ side: 'buy', amount: 100, amountSol: 2 }),
    trade({ side: 'sell', amount: 100, amountSol: 3 }),
  ])
  const row = toRow(f)
  assert.equal(row.length, FEATURE_KEYS.length)
  assert.equal(row[0], f[FEATURE_KEYS[0]])
})

const GOOD = { winRate: 0.65, profitShare: 0.72, roi: 0.58, activity: 0.78, exitDiscipline: 0.85, avgSize: 0.4 }
const BAD = { winRate: 0.3, profitShare: 0.3, roi: 0.2, activity: 0.5, exitDiscipline: 0.3, avgSize: 0.15 }

/** A balanced training set with light jitter, sized above the model's minimum. */
function trainingSet(n = 12) {
  const rows = []
  for (let i = 0; i < n; i++) {
    const base = i % 2 === 0 ? GOOD : BAD
    const jittered = Object.fromEntries(
      Object.entries(base).map(([k, v]) => [k, v + (i / n - 0.5) * 0.04])
    ) as typeof GOOD
    rows.push({ label: (i % 2 === 0 ? 1 : 0) as 0 | 1, features: jittered })
  }
  return rows
}

test('model trains and separates a clearly good wallet from a clearly bad one', () => {
  const scorer = WalletScorer.train(trainingSet())
  assert.ok(scorer.score(GOOD) > scorer.score(BAD))
})

test('model refuses to train on too few examples', () => {
  assert.throws(() => WalletScorer.train(trainingSet(4)), /at least 10 labeled/)
})

test('model refuses to train without both labels', () => {
  const oneLabel = Array.from({ length: 12 }, () => ({ label: 1 as const, features: GOOD }))
  assert.throws(() => WalletScorer.train(oneLabel), /each label/)
})
