/**
 * Copy-Trade Backtester
 * ---------------------
 * "If I had copied this wallet, what would I have made?" Replays a leader wallet's Veltra
 * trade history and simulates copying it with a finite bankroll, a fixed position size, and
 * slippage on every fill.
 *
 * It is a historical simulation, not a prediction and not live trading. See backtest.ts for
 * exactly what it does and does not model.
 *
 * Run it:
 *   cp .env.example .env    # paste your VELTRA_API_KEY
 *   npm install
 *   npm start -- <leader-wallet-address>
 *
 * Tune the simulation with env vars (or edit .env):
 *   BANKROLL_SOL=100 POSITION_SOL=1 SLIPPAGE_BPS=100 npm start -- <wallet>
 */

import 'dotenv/config'
import { Veltra, VeltraError } from './veltra.js'
import { computePnl } from './pnl.js'
import { runBacktest, type BacktestConfig, type BacktestResult } from './backtest.js'

async function main() {
  const apiKey = process.env.VELTRA_API_KEY
  if (!apiKey) {
    console.error('Missing VELTRA_API_KEY. Copy .env.example to .env and paste your key.')
    console.error('Get a key at https://veltrabot.com')
    process.exit(1)
  }

  const wallet = process.argv[2] || process.env.WALLET
  if (!wallet) {
    console.error('Usage: npm start -- <leader-wallet-address>')
    process.exit(1)
  }
  const chain = process.env.CHAIN || 'solana'

  const config: BacktestConfig = {
    bankrollSol: num(process.env.BANKROLL_SOL, 100),
    positionSol: num(process.env.POSITION_SOL, 1),
    slippageBps: num(process.env.SLIPPAGE_BPS, 100),
  }

  const veltra = new Veltra({ apiKey, baseUrl: process.env.VELTRA_BASE_URL })

  console.log(`Backtesting a copy of ${wallet} on ${chain}...\n`)
  const history = await veltra.collectHistory(wallet, { chain })
  if (!history.complete) {
    console.log('Note: wallet still indexing; backtest covers the trades streamed so far.\n')
  }

  const result = runBacktest(history.trades, config)
  const leader = computePnl(history.trades)

  printReport(result, config, leader.totalRealizedSol, leader.winRate)
}

function printReport(
  r: BacktestResult,
  config: BacktestConfig,
  leaderRealizedSol: number,
  leaderWinRate: number
) {
  console.log('Simulation settings')
  console.log('-------------------')
  console.log(`Bankroll:        ${config.bankrollSol} SOL`)
  console.log(`Per-trade size:  ${config.positionSol} SOL`)
  console.log(`Slippage:        ${(config.slippageBps / 100).toFixed(2)}% per fill\n`)

  if (r.copiedBuys === 0) {
    console.log('No copyable buys in this history (missing amounts, or nothing to copy).')
    return
  }

  const sign = r.realizedPnlSol >= 0 ? '+' : ''
  console.log('Your copy result')
  console.log('----------------')
  console.log(`Realized PnL:    ${sign}${r.realizedPnlSol.toFixed(2)} SOL  (${sign}${r.returnOnDeployedPct.toFixed(1)}% on deployed capital)`)
  console.log(`End bankroll:    ${r.endBankrollSol.toFixed(2)} SOL  (started ${r.startBankrollSol})`)
  console.log(`Deployed:        ${r.deployedSol.toFixed(2)} SOL across ${r.copiedBuys} buys, ${r.copiedSells} sells`)
  console.log(`Still held:      ${r.openCostSol.toFixed(2)} SOL at cost (open positions, value not priced by the API)`)
  console.log(`Win rate:        ${(r.winRate * 100).toFixed(1)}%  (${r.winners} winners / ${r.losers} losers, ${r.tokensTraded} tokens)`)
  console.log(`Slippage cost:   ${r.slippageCostSol.toFixed(2)} SOL lost to fills`)
  if (r.skippedBuysNoCash > 0) {
    console.log(`Missed buys:     ${r.skippedBuysNoCash} (bankroll was empty — raise BANKROLL_SOL to copy more)`)
  }
  console.log()

  console.log('For reference: the leader itself')
  console.log('--------------------------------')
  console.log(`Leader realized PnL: ${leaderRealizedSol >= 0 ? '+' : ''}${leaderRealizedSol.toFixed(2)} SOL (in their own size), win rate ${(leaderWinRate * 100).toFixed(1)}%`)
  console.log('(Your copy differs because of your fixed size, finite bankroll, and slippage.)\n')

  printTokens('Top contributing tokens', r.perToken.slice(0, 5))
  printTokens('Worst tokens', r.perToken.slice(-5).reverse().filter((t) => t.realizedSol < 0))
}

function printTokens(title: string, rows: BacktestResult['perToken']) {
  if (rows.length === 0) return
  console.log(title)
  console.log('-'.repeat(title.length))
  for (const t of rows) {
    const sign = t.realizedSol >= 0 ? '+' : ''
    console.log(`  ${(sign + t.realizedSol.toFixed(2)).padStart(9)} SOL  ${t.token}`)
  }
  console.log()
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

main().catch((err) => {
  if (err instanceof VeltraError) {
    console.error(`\nVeltra API error (${err.status}): ${err.message}`)
    if (err.status === 401) console.error('Check that VELTRA_API_KEY is set correctly.')
    if (err.status === 402) console.error('Your plan quota is exhausted. See https://veltrabot.com')
  } else {
    console.error('\nUnexpected error:', err instanceof Error ? err.message : err)
  }
  process.exit(1)
})
