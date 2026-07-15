# CLAUDE.md — @cryptoapis-io/offline-signer

Public, MIT-licensed library for **offline transaction signing** across EVM, UTXO, Tron, XRP, Kaspa and Solana. Signing only — no network, no API key, the private key stays in-process. Pairs with the CryptoAPIs REST API (prepare → **sign here** → broadcast).

## What this is (and is not)

- **Is:** pure signing cores extracted from `@cryptoapis-io/mcp-signer`, with the MCP server/CLI layer removed, packaged as a plain library for direct API integrations.
- **Is not:** an MCP server. That path stays `@cryptoapis-io/mcp-signer` (MCP is for AI agents). Keep the two in sync when a signing bug is fixed in one.

## Layout

```
src/
  index.ts            root barrel — lazy async wrappers (dynamic-imports each chain)
  evm.ts utxo.ts …    per-chain public subpath entries (@cryptoapis-io/offline-signer/<chain>)
  chains/<chain>/     the actual signing cores (index.ts + schema.ts + helpers)
  internal/
    blockchains.ts    vendored chain/network metadata + getChainIdForNetwork + zod enums
scripts/              tsx smoke tests (test-evm-sign, test-utxo-sign)
```

Public API is defined by the `exports` map in `package.json`: root `.` plus `/evm`, `/utxo`, `/tron`, `/xrp`, `/kaspa`, `/solana`.

## Conventions

- **ESM-only, NodeNext.** Relative imports MUST carry the `.js` extension (source is `.ts`, resolves post-build). Node ≥ 20.
- **Prefer subpath imports.** Each chain pulls heavy, chain-specific crypto libs; the subpaths keep a consumer from loading stacks they don't sign with. The root barrel is lazy for the same reason — never turn its wrappers into eager top-level imports.
- **Keys are parameters, never `process.env`.** No signer reads the environment for a key.
- **No `@cryptoapis-io/mcp-*` dependencies.** The chain metadata is vendored in `internal/blockchains.ts` on purpose; don't reintroduce a dependency on `mcp-shared`. If it drifts from the source of truth, re-vendor by copying, not by depending.
- **Untyped deps** (`bitcore-lib-cash`, `zcashcore-lib`) are declared in `src/chains/utxo/vendor-shims.d.ts`.

## Gotchas

- `zcashcore-lib` has an **undeclared runtime dependency on `blake2b`** — it is listed explicitly in `dependencies` for that reason. Do not remove it.
- Never hand-edit `package.json`/lockfile deps; change them through `npm` commands.

## Verify before publishing

```bash
npm run build && npm run typecheck
npm run test:evm     # recovers the sender from the signed tx; asserts it matches
npm run test:utxo    # signs across all six UTXO chains
```

Both smoke tests import from the **built `dist/`**, so run `build` first. They use throwaway keys and touch no network.
