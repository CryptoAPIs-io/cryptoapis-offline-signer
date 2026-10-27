# CLAUDE.md — @cryptoapis-io/offline-signer

Public, MIT-licensed library for **offline transaction signing** across EVM, UTXO, Tron, XRP, Kaspa, Solana and Tezos. Signing only — no network, no API key, the private key stays in-process. Pairs with the CryptoAPIs REST API (prepare → **sign here** → broadcast).

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
scripts/              tsx tests (test-evm-sign, test-utxo-sign, test-zcash-sign, test-tezos-sign; fixtures/)
```

Public API is defined by the `exports` map in `package.json`: root `.` plus `/evm`, `/utxo`, `/tron`, `/xrp`, `/kaspa`, `/solana`, `/tezos`.

**Tezos** (`chains/tezos/`): signs a forged operation (e.g. prepare-transactions' `forgedOperation`) with `blake2b-256(0x03 ‖ forged)` on the key's curve via `@noble/curves` (ECDSA with `prehash: false` — noble v2 otherwise SHA-256s the input). It decodes and re-forges the bytes with `@taquito/local-forging` first and refuses anything but reveal/transaction ops from the key's own address. `scripts/test-tezos-sign.ts` asserts signatures are byte-identical to Taquito's `InMemorySigner` for all three curves.

## Conventions

- **ESM-only, NodeNext.** Relative imports MUST carry the `.js` extension (source is `.ts`, resolves post-build). Node ≥ 20.
- **Prefer subpath imports.** Each chain pulls heavy, chain-specific crypto libs; the subpaths keep a consumer from loading stacks they don't sign with. The root barrel is lazy for the same reason — never turn its wrappers into eager top-level imports.
- **Keys are parameters, never `process.env`.** No signer reads the environment for a key.
- **No `@cryptoapis-io/mcp-*` dependencies.** The chain metadata is vendored in `internal/blockchains.ts` on purpose; don't reintroduce a dependency on `mcp-shared`. If it drifts from the source of truth, re-vendor by copying, not by depending.
- **Untyped deps** (`bitcore-lib-cash`, `zcashcore-lib`) are declared in `src/chains/utxo/vendor-shims.d.ts`.

## Gotchas

- `zcashcore-lib` has an **undeclared runtime dependency on `blake2b`** — it is listed explicitly in `dependencies` for that reason. Do not remove it.
- **Zcash network upgrades need a release.** The signature commits to the consensus branch ID of the block the tx is mined in. `chains/utxo/zcash-network-upgrades.ts` maps a `targetHeight` to it (NU5..NU7, from zebra/librustzcash). Each new upgrade needs a row there, plus the boundary checks in `scripts/test-zcash-sign.ts`, before it activates. Callers can bridge the gap with an explicit `consensusBranchId`. Never reintroduce a default branch ID.
- **Zcash is signed as v5 with our own ZIP 244 digest** (`chains/utxo/zcash-zip244.ts`). NU7 rejects v4 (ZIP 2003). `@bitgo/utxo-lib`'s v5 digest follows a pre-final ZIP 244 draft (no hash_type, amounts or scriptPubKeys digests; txin fields out of order), and its signatures are invalid on-chain. utxo-lib is still used for WIF decoding, address → script and v5 serialization. The test checks the digest against signatures of v5 transactions mined on mainnet and testnet (`scripts/fixtures/zcash-v5-transparent.json`).
- Never hand-edit `package.json`/lockfile deps; change them through `npm` commands.
- **Taquito is pinned to `~23.1`**: 24+ require Node ≥ 22, this package supports Node 20. 23.1 already forges the protocol 022+ reveal (proof-presence byte after the public key); an older forger (≤ 21) produces reveals the node refuses to parse.
- **Regenerate the lockfile with npm 10** (`npx -y npm@10 install`), the version CI's Node 20 ships. npm 11 drops optional peers like `utf-8-validate` that npm 10's `npm ci` then reports as missing.

## Verify before publishing

```bash
npm run build && npm run typecheck
npm run test:evm     # recovers the sender from the signed tx; asserts it matches
npm run test:utxo    # signs across all six UTXO chains
npm run test:zcash   # branch ID by height (every NU boundary), ZIP 244 vs on-chain txs, refusals
npm run test:tezos   # tz1/tz2/tz3 vs Taquito, refusal checks
```

The tests import from the **built `dist/`**, so run `build` first. They use throwaway keys and touch no network.
