# Raw HTTP Recipes (curl)

Every example in this repo is TypeScript, but the Veltra API is just HTTP + a bearer token, so
you can use it from any language. These recipes show the raw calls with `curl` — translate
them into your language's HTTP client of choice.

Base URL: `https://veltradata.io`. Authentication: `Authorization: Bearer <YOUR_API_KEY>`
(get a key at [veltradata.io](https://veltradata.io)). The `/v1/...` and `/api/v1/...` paths
are equivalent; the short form is used below.

Set your key once for the snippets:

```bash
export VELTRA_API_KEY="your_key_here"
export WALLET="Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt"
```

## 1. Get a wallet's full history (streaming, the default)

The default response is **NDJSON** — one JSON object per line. Batches of trades arrive as
they're fetched, then a final line reports completion. `-N` disables curl's buffering so lines
appear as they stream.

```bash
curl -N "https://veltradata.io/v1/wallets/$WALLET/history" \
  -H "Authorization: Bearer $VELTRA_API_KEY"
```

```jsonc
{"trades":[{"signature":"5ea7...","side":"sell","token":"Dottie","tokenMint":"9xY2...pump","amountSol":4.305,"amount":152340.12,"dex":"Pump.fun","blockTime":"2026-07-24T05:40:48+00:00"}, ...],"cursor":"8kQ2..."}
{"trades":[ ...more as they're fetched... ],"cursor":"pW3n..."}
{"complete":true,"tradeCount":170608,"wallet":"Bi4r...YdLt","firstTrade":"2026-05-01T12:00:00+00:00"}
```

Read it line by line: accumulate each line's `trades`, and stop at the line that carries
`complete`. If a very large wallet ends with `"complete":false`, it's still indexing — reconnect
with `?cursor=` (recipe 3) to get the rest.

### Per-trade fields

| Field | Meaning |
| --- | --- |
| `signature` | Transaction signature |
| `side` | `"buy"` or `"sell"` |
| `token` | Token symbol |
| `tokenMint` | Token mint address (stable per-token key; symbols can collide) |
| `amountSol` | SOL value of the trade (native token amount on non-Solana chains); may be `null` |
| `amount` | Token quantity moved; may be `null` |
| `dex` | Where it executed |
| `blockTime` | ISO-8601 timestamp |

## 2. Get discrete pages instead of a stream

Pass `limit` to get ordinary single-JSON pages (newest first) rather than NDJSON:

```bash
curl "https://veltradata.io/v1/wallets/$WALLET/history?limit=100" \
  -H "Authorization: Bearer $VELTRA_API_KEY"
```

```jsonc
{
  "wallet": "Bi4r...YdLt",
  "complete": false,
  "tradeCount": 170608,
  "pageSize": 100,
  "totalPages": 1707,
  "trades": [ /* up to 100 trades */ ],
  "cursor": "8kQ2mZ3rV9...tLf0X"
}
```

## 3. Walk every page with the cursor

Send the `cursor` from one page back as `?cursor=` to get the next. Keep going until a response
has no `cursor` (which only happens when `"complete":true`). Treat the cursor as opaque — don't
parse or modify it.

```bash
# First page
curl "https://veltradata.io/v1/wallets/$WALLET/history?limit=100" \
  -H "Authorization: Bearer $VELTRA_API_KEY"

# Next page (paste the cursor you received)
curl "https://veltradata.io/v1/wallets/$WALLET/history?limit=100&cursor=8kQ2mZ3rV9...tLf0X" \
  -H "Authorization: Bearer $VELTRA_API_KEY"
```

Re-reading trades you already fetched via `cursor` does **not** bill them again.

## 4. Query a different chain

Add `?chain=<slug>`; it defaults to `sol`. The address is validated against that chain's
format (base58 for Solana, `0x...` for EVM chains, `T...` for Tron).

```bash
curl -N "https://veltradata.io/v1/wallets/0xYourWallet/history?chain=ethereum" \
  -H "Authorization: Bearer $VELTRA_API_KEY"
```

On non-Solana chains, `amountSol` carries the native token amount (ETH/BNB/TRX/...) rather
than SOL.

## 5. Estimate a wallet before fetching it (no auth)

Cheaply probe how big a wallet is — and get a few sample trades — before committing to a full
fetch. Takes an array of addresses (IP-rate-limited, no API key required):

```bash
curl -X POST "https://veltradata.io/v1/billing/estimate" \
  -H "Content-Type: application/json" \
  -d "{\"addresses\":[\"$WALLET\"]}"
```

```jsonc
{"addresses":[{"address":"Bi4r...YdLt","estimateType":"exact","estimatedTradeCount":170608,"estimatedSeconds":5,"sampleTrades":[ ... ]}]}
```

## 6. Handle errors and status codes

Errors come back as JSON with a nested `error` object:

```jsonc
{"error":{"code":"VALIDATION_ERROR","message":"Invalid Solana wallet address format","timestamp":"2026-07-24T05:46:10Z","requestId":"7736b68d-..."}}
```

| Status | Meaning | What to do |
| --- | --- | --- |
| `400` | Bad request (e.g. malformed address) | Fix the input; read `error.message` |
| `401` | Missing or invalid API key | Check the `Authorization` header |
| `402` | Plan quota exhausted | Upgrade or enable overage at veltradata.io |
| `429` | Rate limited | Back off and retry |

Read the numeric status from curl and branch on it:

```bash
code=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://veltradata.io/v1/wallets/$WALLET/history?limit=1" \
  -H "Authorization: Bearer $VELTRA_API_KEY")
echo "HTTP $code"
```

## 7. Useful jq one-liners

Count trades on the first page:

```bash
curl -s "https://veltradata.io/v1/wallets/$WALLET/history?limit=1000" \
  -H "Authorization: Bearer $VELTRA_API_KEY" | jq '.trades | length'
```

Total SOL spent on buys in a page:

```bash
curl -s "https://veltradata.io/v1/wallets/$WALLET/history?limit=1000" \
  -H "Authorization: Bearer $VELTRA_API_KEY" \
  | jq '[.trades[] | select(.side=="buy") | .amountSol // 0] | add'
```

Stream and pull just the fields you care about, live:

```bash
curl -sN "https://veltradata.io/v1/wallets/$WALLET/history" \
  -H "Authorization: Bearer $VELTRA_API_KEY" \
  | jq -c 'select(.trades) | .trades[] | {side, token, amountSol, dex}'
```
