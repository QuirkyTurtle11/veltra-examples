# Contributing

Thanks for your interest in improving the Veltra examples.

## Repository shape

Each example is an **independent folder** with its own `package.json` and its own copy of
`src/veltra.ts`. This is deliberate: a developer should be able to copy a single folder into
their own project and have it work, with no shared build step or workspace tooling.

That means a little duplication (the `veltra.ts` client, and the shared `pnl.ts` accounting
engine, are copied into each example). If you change one of these shared files, **copy the
change into every example** so they stay identical. CI does not enforce this yet, so please
check by hand.

## Adding an example

An example earns its place only if it does real work *on top of* the trade-history data — not
if it just re-displays what the API already returns cleanly. Before opening a PR, be able to
answer: "what does this compute that the API doesn't already hand you?"

Each new example should have:

- Its own folder with `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `README.md`
- A copied `src/veltra.ts` (keep it identical to the others)
- A `start` script (`tsx src/index.ts`), a `typecheck` script, and — where there's real logic
  worth locking down — a `test` script using Node's built-in test runner
- An entry in the root `README.md` table
- An entry in the CI matrix in `.github/workflows/ci.yml`

## Local checks

```bash
cd <example>
npm install
npm run typecheck
npm test        # where the example has tests
```

## Prerequisites

- Node.js 18+ to run an example (`npm start`)
- Node.js 20+ to run the test suites (they use Node's built-in test runner)

## Style

- No emojis in code, logs, or user-facing output
- Favor clean, readable code over clever abstractions — these are meant to be copied
- Keep secrets out of source: the API key comes from `.env`, which is gitignored
