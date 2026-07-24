/**
 * PnL Tracker
 * -----------
 * Fetch a wallet's complete trade history from Veltra and compute realized, FIFO
 * cost-basis profit and loss per token, plus an overall win rate.
 *
 * Realized PnL only: it accounts for tokens the wallet has sold, matched sells to buys
 * first-in-first-out. Open positions (tokens still held) are reported separately with their
 * cost basis, but their current market value is not part of the API, so unrealized PnL is
 * deliberately excluded rather than estimated.
 *
 * Run it:
 *   cp .env.example .env   # paste your VELTRA_API_KEY
 *   npm install
 *   npm start -- <wallet-address>
 */

import 'dotenv/config'
import { Veltra, VeltraError } from './veltra.js'
import { computePnl, type PnlSummary } from './pnl.js'

async function main() {
  const apiKey = process.env.VELTRA_API_KEY
  if (!apiKey) {
    console.error('Missing VELTRA_API_KEY. Copy .env.example to .env and paste your key.')
    console.error('Get a key at https://veltrabot.com')
    process.exit(1)
  }

  const wallet = process.argv[2] || process.env.WALLET
  if (!wallet) {
    console.error('Usage: npm start -- <wallet-address>')
    console.error('   or: set WALLET in your .env file')
    process.exit(1)
  }
  const chain = process.env.CHAIN || 'solana'

  const veltra = new Veltra({ apiKey, baseUrl: process.env.VELTRA_BASE_URL })

  console.log(`Computing PnL for ${wallet} on ${chain}...\n`)

  const history = await veltra.collectHistory(wallet, { chain })
  if (!history.complete) {
    console.log(
      'Note: this wallet is large and still indexing. PnL below is over the trades streamed\n' +
        'so far; run again in a moment for the complete picture.\n'
    )
  }

  const summary = computePnl(history.trades)
  printReport(summary)
}

function printReport(summary: PnlSummary) {
  const closed = summary.tokens.filter((t) => t.hasRealized)
  if (closed.length === 0) {
    console.log('No realized PnL: this wallet has no sells in the streamed history.')
    return
  }

  console.log('Realized PnL (FIFO cost basis)')
  console.log('------------------------------')
  console.log(`Total realized:   ${formatSigned(summary.totalRealizedSol)} SOL`)
  console.log(
    `Win rate:         ${(summary.winRate * 100).toFixed(1)}%  ` +
      `(${summary.winners} winners / ${summary.losers} losers)`
  )
  if (summary.skippedTrades > 0) {
    console.log(`Uncosted trades:  ${summary.skippedTrades} (missing amount or SOL value, ignored)`)
  }
  console.log()

  printTable('Top winners', closed.filter((t) => t.realizedSol > 0).slice(0, 10))
  printTable(
    'Top losers',
    closed
      .filter((t) => t.realizedSol <= 0)
      .sort((a, b) => a.realizedSol - b.realizedSol)
      .slice(0, 10)
  )

  printOpenPositions(summary)
}

function printTable(title: string, rows: PnlSummary['tokens']) {
  if (rows.length === 0) return
  console.log(title)
  console.log('-'.repeat(title.length))
  console.log(`${'Realized SOL'.padStart(14)}   Token`)
  for (const t of rows) {
    const flag = t.unmatchedSoldQty > 0 ? '  *' : ''
    console.log(`${formatSigned(t.realizedSol).padStart(14)}   ${t.token}${flag}`)
  }
  const hasUnmatched = rows.some((t) => t.unmatchedSoldQty > 0)
  if (hasUnmatched) {
    console.log('  * sold more than was bought in this history (airdrop, transfer, or partial history)')
  }
  console.log()
}

function printOpenPositions(summary: PnlSummary) {
  const open = summary.tokens
    .filter((t) => t.openQty > 0 && t.openCostSol > 0)
    .sort((a, b) => b.openCostSol - a.openCostSol)
    .slice(0, 10)
  if (open.length === 0) return

  console.log('Largest open positions (cost basis; current value not priced by the API)')
  console.log('------------------------------------------------------------------------')
  console.log(`${'Cost SOL'.padStart(10)}   Token`)
  for (const t of open) {
    console.log(`${t.openCostSol.toFixed(2).padStart(10)}   ${t.token}`)
  }
  console.log()
}

function formatSigned(n: number): string {
  const s = n.toFixed(2)
  return n > 0 ? `+${s}` : s
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
