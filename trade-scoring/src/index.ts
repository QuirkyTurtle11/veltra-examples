/**
 * Trade Scoring
 * -------------
 * Train a model on labeled wallets, then score any wallet 0..1 on how likely it is to be
 * "worth following" — based on features extracted from its Veltra trade history.
 *
 * Two modes:
 *   score <wallet>          Extract features, train on training-data.json, print the score.
 *   label <wallet> good|bad Fetch the wallet, extract features, and add it to the training
 *                           set with your judgment as the label. Grows the model.
 *
 * Run it:
 *   cp .env.example .env    # paste your VELTRA_API_KEY
 *   npm install
 *   npm start -- score <wallet-address>
 *   npm start -- label <wallet-address> good
 */

import 'dotenv/config'
import { Veltra, VeltraError, type Trade } from './veltra.js'
import { extractFeatures, FEATURE_KEYS, type FeatureVector } from './features.js'
import { WalletScorer } from './model.js'
import { appendTrainingExample, countRealExamples, loadTrainingData } from './dataset.js'

async function main() {
  const apiKey = process.env.VELTRA_API_KEY
  if (!apiKey) {
    console.error('Missing VELTRA_API_KEY. Copy .env.example to .env and paste your key.')
    console.error('Get a key at https://veltradata.io')
    process.exit(1)
  }

  const [mode, walletArg, labelArg] = process.argv.slice(2)
  const wallet = walletArg || process.env.WALLET
  if ((mode !== 'score' && mode !== 'label') || !wallet) {
    printUsage()
    process.exit(1)
  }

  const chain = process.env.CHAIN || 'solana'
  const veltra = new Veltra({ apiKey, baseUrl: process.env.VELTRA_BASE_URL })

  console.log(`Fetching ${wallet} on ${chain}...`)
  const history = await veltra.collectHistory(wallet, { chain })
  const features = extractFeatures(history.trades)

  if (mode === 'label') {
    await runLabel(wallet, labelArg, features)
    return
  }
  await runScore(wallet, features, history.trades)
}

async function runScore(wallet: string, features: FeatureVector, trades: Trade[]) {
  const data = await loadTrainingData()
  const scorer = WalletScorer.train(data)
  const score = scorer.score(features)

  console.log(`\nWallet score: ${(score * 100).toFixed(1)} / 100  ${verdict(score)}`)
  console.log(
    `(model trained on ${data.length} labeled wallets, ` +
      `${countRealExamples(data)} of them real — label more to improve it)\n`
  )

  console.log('Features driving the score')
  console.log('--------------------------')
  for (const key of FEATURE_KEYS) {
    console.log(`${bar(features[key])}  ${features[key].toFixed(2)}  ${key}`)
  }
  console.log(`\nBased on ${trades.length} trades.`)
  console.log('These features are the real work — the model just learns to weigh them. See features.ts.')
}

async function runLabel(wallet: string, labelArg: string | undefined, features: FeatureVector) {
  if (labelArg !== 'good' && labelArg !== 'bad') {
    console.error('Label must be "good" or "bad": npm start -- label <wallet> good')
    process.exit(1)
  }
  const label = labelArg === 'good' ? 1 : 0
  const total = await appendTrainingExample({ wallet, label, features })
  console.log(`\nAdded ${wallet} as "${labelArg}" (label ${label}). Training set now has ${total} wallets.`)
  console.log('Run `npm start -- score <wallet>` to score with the updated model.')
}

function verdict(score: number): string {
  if (score >= 0.75) return '(worth following)'
  if (score >= 0.5) return '(promising)'
  if (score >= 0.3) return '(mixed)'
  return '(skip)'
}

/** A tiny 0..1 text bar for readable feature output. */
function bar(value: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 20)
  return '[' + '#'.repeat(filled) + '-'.repeat(20 - filled) + ']'
}

function printUsage() {
  console.error('Usage:')
  console.error('  npm start -- score <wallet-address>')
  console.error('  npm start -- label <wallet-address> good|bad')
}

main().catch((err) => {
  if (err instanceof VeltraError) {
    console.error(`\nVeltra API error (${err.status}): ${err.message}`)
    if (err.status === 401) console.error('Check that VELTRA_API_KEY is set correctly.')
    if (err.status === 402) console.error('Your plan quota is exhausted. See https://veltradata.io')
  } else {
    console.error('\nUnexpected error:', err instanceof Error ? err.message : err)
  }
  process.exit(1)
})
