/**
 * Wallet Watcher
 * --------------
 * Poll a wallet and get alerted the moment it makes a new trade. Optionally forward alerts to
 * a Discord/Slack-style webhook.
 *
 * The Veltra API is a historical trade-history API, not a realtime feed, so this is polling,
 * not push. That's fine and cheap here: the API walks newest-first and stops at the first
 * trade it has already stored, so re-checking an unchanged wallet is a single quick round trip
 * and doesn't re-bill trades you've already paid for.
 *
 * Run it:
 *   cp .env.example .env          # paste your VELTRA_API_KEY
 *   npm install
 *   npm start -- <wallet-address>
 *
 * Options (env or .env):
 *   POLL_INTERVAL_SECONDS=30      how often to check
 *   WATCH_LIMIT=50                how many recent trades to pull each check
 *   ALERT_WEBHOOK_URL=...         optional Discord/Slack-compatible webhook for alerts
 */

import 'dotenv/config'
import { Veltra, VeltraError, type Trade } from './veltra.js'
import { selectNewTrades, formatTrade } from './watch.js'

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
    process.exit(1)
  }

  const chain = process.env.CHAIN || 'solana'
  const intervalMs = Math.max(5, num(process.env.POLL_INTERVAL_SECONDS, 30)) * 1000
  const limit = num(process.env.WATCH_LIMIT, 50)
  const webhookUrl = process.env.ALERT_WEBHOOK_URL

  const veltra = new Veltra({ apiKey, baseUrl: process.env.VELTRA_BASE_URL })
  const seen = new Set<string>()
  let baselined = false

  console.log(`Watching ${wallet} on ${chain}, checking every ${intervalMs / 1000}s.`)
  console.log('The first check establishes a baseline; alerts start from the next new trade.\n')

  // Stop cleanly on Ctrl-C.
  let running = true
  process.on('SIGINT', () => {
    running = false
    console.log('\nStopping watcher.')
    process.exit(0)
  })

  while (running) {
    try {
      const page = await veltra.getPage(wallet, { chain, limit })
      const fresh = selectNewTrades(page.trades, seen)
      for (const t of page.trades) seen.add(t.signature)

      if (!baselined) {
        baselined = true
        console.log(`Baseline set: ${page.trades.length} recent trades known. Waiting for new activity...`)
      } else if (fresh.length > 0) {
        for (const t of fresh) {
          console.log(`NEW  ${formatTrade(t)}`)
        }
        if (webhookUrl) await sendWebhook(webhookUrl, wallet, fresh)
      }
    } catch (err) {
      // A watcher must survive transient errors and keep going.
      reportPollError(err)
    }
    await sleep(intervalMs)
  }
}

async function sendWebhook(url: string, wallet: string, trades: Trade[]) {
  const lines = trades.map(formatTrade).join('\n')
  const content = `Wallet ${wallet} made ${trades.length} new trade(s):\n${lines}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // { content } is the shape Discord and Slack incoming webhooks both accept.
      body: JSON.stringify({ content }),
    })
    if (!res.ok) console.error(`Webhook returned ${res.status}`)
  } catch (err) {
    console.error('Webhook failed:', err instanceof Error ? err.message : err)
  }
}

function reportPollError(err: unknown) {
  if (err instanceof VeltraError) {
    if (err.status === 401) {
      console.error('Veltra API error 401: invalid API key. Stopping.')
      process.exit(1)
    }
    console.error(`Veltra API error ${err.status}: ${err.message} (will retry)`)
  } else {
    console.error('Poll failed (will retry):', err instanceof Error ? err.message : err)
  }
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
