/**
 * Minimal Veltra API client.
 *
 * This is intentionally dependency-free and self-contained so you can copy this single file
 * into your own project. It wraps one endpoint:
 *
 *   GET /api/v1/wallets/:address/history
 *
 * which returns a wallet's COMPLETE buy/sell history. The endpoint streams NDJSON by default
 * (one call delivers the whole wallet, pushing trade batches as they are fetched), which is
 * what `collectHistory` and `streamHistory` below consume.
 */

/** A single buy or sell, exactly as the API returns it. */
export interface Trade {
  /** Transaction signature. */
  signature: string
  /** "buy" or "sell". */
  side: 'buy' | 'sell'
  /** Token symbol (e.g. "BONK"). */
  token: string
  /** Token mint address — a stable per-token key, since symbols can collide. */
  tokenMint: string | null
  /** SOL value of the trade, or null if it could not be determined. */
  amountSol: number | null
  /** Token quantity moved in this trade, or null if unknown. */
  amount: number | null
  /** DEX the trade executed on (e.g. "Raydium"). */
  dex: string
  /** ISO-8601 block time, or null if unknown. */
  blockTime: string | null
}

/** The terminal summary emitted once the whole history has streamed. */
export interface HistorySummary {
  wallet: string
  /**
   * true  = the full history was captured in this call.
   * false = the wallet is large and still indexing; call again later to get the rest.
   */
  complete: boolean
  /** Total number of trades for this wallet. */
  tradeCount: number
  /** ISO-8601 timestamp of the wallet's earliest trade, or null. */
  firstTrade: string | null
}

/** collectHistory returns the summary plus every trade streamed during the call. */
export interface CollectedHistory extends HistorySummary {
  trades: Trade[]
}

/** One discrete page from the `?limit=` pagination mode. */
export interface HistoryPage {
  wallet: string
  complete: boolean
  tradeCount: number
  /** The effective page size and total page count, so you can size a loop up front. */
  pageSize: number
  totalPages: number
  trades: Trade[]
  /** Present only when there are more pages; omitted at end-of-history (complete: true). */
  cursor?: string
}

export interface VeltraOptions {
  apiKey: string
  /** Defaults to https://veltrabot.com */
  baseUrl?: string
}

export interface HistoryOptions {
  /** Chain to query. Defaults to "solana". */
  chain?: string
  /** Resume a previously interrupted stream from its last cursor. */
  cursor?: string
}

export class VeltraError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'VeltraError'
  }
}

export class Veltra {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options: VeltraOptions) {
    if (!options.apiKey) {
      throw new Error('Veltra: apiKey is required. Get one at https://veltrabot.com')
    }
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? 'https://veltrabot.com').replace(/\/$/, '')
  }

  /**
   * Stream a wallet's complete history, yielding each trade as it arrives and returning the
   * terminal summary. Use this when you want to process trades incrementally (e.g. to show
   * progress on a huge wallet) rather than buffer them all in memory.
   */
  async *streamHistory(
    address: string,
    options: HistoryOptions = {}
  ): AsyncGenerator<Trade, HistorySummary, void> {
    const url = new URL(`${this.baseUrl}/api/v1/wallets/${address}/history`)
    if (options.chain) url.searchParams.set('chain', options.chain)
    if (options.cursor) url.searchParams.set('cursor', options.cursor)

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/x-ndjson',
      },
    })

    if (!res.ok || !res.body) {
      const detail = await safeErrorBody(res)
      throw new VeltraError(res.status, detail ?? `Request failed with status ${res.status}`)
    }

    let summary: HistorySummary | null = null

    for await (const line of readNdjsonLines(res.body)) {
      const record = JSON.parse(line) as StreamRecord
      if (Array.isArray(record.trades)) {
        for (const trade of record.trades) yield trade
      }
      // The terminal line carries `complete`; batch lines do not.
      if (typeof record.complete === 'boolean') {
        summary = {
          wallet: record.wallet ?? address,
          complete: record.complete,
          tradeCount: record.tradeCount ?? 0,
          firstTrade: record.firstTrade ?? null,
        }
      }
    }

    return (
      summary ?? { wallet: address, complete: false, tradeCount: 0, firstTrade: null }
    )
  }

  /**
   * Fetch a wallet's complete history and return every trade in one array, along with the
   * summary. Convenient for analysis where you want the whole dataset up front.
   */
  async collectHistory(address: string, options: HistoryOptions = {}): Promise<CollectedHistory> {
    const trades: Trade[] = []
    const iterator = this.streamHistory(address, options)
    let next = await iterator.next()
    while (!next.done) {
      trades.push(next.value)
      next = await iterator.next()
    }
    return { ...next.value, trades }
  }

  /**
   * Fetch a single discrete page instead of streaming. With no cursor you get the newest
   * `limit` trades (the response is ordinary JSON, not NDJSON); pass the returned `cursor`
   * back to walk older pages until `cursor` is absent. Handy for "just show me the latest
   * trades" and for polling a wallet for new activity.
   */
  async getPage(
    address: string,
    options: HistoryOptions & { limit?: number } = {}
  ): Promise<HistoryPage> {
    const url = new URL(`${this.baseUrl}/api/v1/wallets/${address}/history`)
    url.searchParams.set('limit', String(options.limit ?? 100))
    if (options.chain) url.searchParams.set('chain', options.chain)
    if (options.cursor) url.searchParams.set('cursor', options.cursor)

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      const detail = await safeErrorBody(res)
      throw new VeltraError(res.status, detail ?? `Request failed with status ${res.status}`)
    }
    return (await res.json()) as HistoryPage
  }
}

interface StreamRecord {
  trades?: Trade[]
  wallet?: string
  complete?: boolean
  tradeCount?: number
  firstTrade?: string | null
}

/** Split a byte stream into complete newline-delimited text lines, skipping blank ones. */
async function* readNdjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  // Node's ReadableStream is async-iterable at runtime; the cast keeps this portable across
  // TypeScript lib setups (DOM vs Node) that disagree on whether the type reflects that.
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) yield line
    }
  }
  const tail = buffer.trim()
  if (tail) yield tail
}

async function safeErrorBody(res: Response): Promise<string | null> {
  try {
    const text = await res.text()
    if (!text) return null
    try {
      // Veltra returns { error: { code, message, requestId } }. Other APIs use a flat
      // { error: "..." } or { message: "..." }, so handle all three shapes.
      const json = JSON.parse(text) as {
        error?: string | { message?: string; code?: string }
        message?: string
      }
      if (typeof json.error === 'object' && json.error) {
        return json.error.message ?? json.error.code ?? text
      }
      return json.error ?? json.message ?? text
    } catch {
      return text
    }
  } catch {
    return null
  }
}
