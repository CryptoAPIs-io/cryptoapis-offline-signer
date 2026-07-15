# @cryptoapis-io/offline-signer

Offline, local transaction signing for **EVM, UTXO, Tron, XRP, Kaspa and Solana**.

Every signer takes a private key plus an unsigned transaction (or the fields to build one) and returns a signed payload. Nothing here makes a network call and nothing needs an API key — **the private key never leaves your process.**

It pairs with the [CryptoAPIs](https://cryptoapis.io) REST API for a fully non-custodial flow: the API prepares and broadcasts transactions, this library does the one thing that should stay on your side — signing.

```
1. POST /prepare-transactions/…             →  unsigned transaction
2. sign it here, offline, with your key     →  signed hex
3. POST /broadcast-transactions/{chain}/…   →  on-chain
```

- [Install](#install)
- [Quick start](#quick-start)
- [Supported chains](#supported-chains)
- [API](#api)
- [The non-custodial flow](#the-non-custodial-flow)
- [Security](#security)
- [Development](#development)
- [License](#license)

## Install

```bash
npm install @cryptoapis-io/offline-signer
```

Requires **Node.js ≥ 20**. The package is ESM-only and ships TypeScript types.

## Quick start

Import from a **per-chain subpath** so you only load the crypto libraries you actually need — signing EVM won't pull in the Bitcoin, Zcash or Solana stacks:

```ts
import { evmSignUnsignedHex } from "@cryptoapis-io/offline-signer/evm";

const { signedTransactionHex } = await evmSignUnsignedHex({
  action: "sign-unsigned-hex",
  blockchain: "base",
  network: "sepolia",
  privateKey: process.env.PRIVATE_KEY!,      // 0x-prefixed or bare hex
  unsignedTransactionHex: preparedTxHex,     // from POST /prepare-transactions
});

// → hand signedTransactionHex to POST /broadcast-transactions/base/sepolia
```

UTXO, signing a prepared transaction from the HD-wallet prepare endpoint:

```ts
import { utxoSignFromDetails } from "@cryptoapis-io/offline-signer/utxo";

const { signedTransactionHex } = utxoSignFromDetails({
  action: "sign-from-details",
  blockchain: "bitcoin",
  network: "mainnet",
  privateKeys: [wif],                 // one WIF per input, in input order
  preparedTransaction: preparedItem,  // data.item from the prepare-transaction response
});
```

A convenience root entry re-exports every signer as a lazy async wrapper, if you prefer one import site:

```ts
import { evmSignUnsignedHex, utxoSignFromDetails } from "@cryptoapis-io/offline-signer";
```

Each root export still dynamically imports its own chain on first call, so one chain's dependency never blocks the others.

## Supported chains

| Family | Blockchains | Subpath |
| --- | --- | --- |
| **EVM** | ethereum, ethereum-classic, binance-smart-chain, polygon, avalanche, arbitrum, base, optimism, tron (EVM) | `/evm` |
| **UTXO** | bitcoin, bitcoin-cash, litecoin, dogecoin, dash, zcash | `/utxo` |
| **Tron** | tron (native TRX / TRC) | `/tron` |
| **XRP** | xrp (Ripple) | `/xrp` |
| **Kaspa** | kaspa | `/kaspa` |
| **Solana** | solana (partial / fee-payer signing) | `/solana` |

Both `mainnet` and each chain's testnet are supported. EVM network names map to chain IDs internally (e.g. `base` + `sepolia` → 84532).

## API

Each function takes a discriminated-union input keyed by `action` and returns the signed payload. Full input types are exported alongside every signer.

### EVM — `@cryptoapis-io/offline-signer/evm`

| Function | Input `action` | Returns |
| --- | --- | --- |
| `evmSignUnsignedHex` | `"sign-unsigned-hex"` | `{ signedTransactionHex }` |
| `evmSignFromDetails` | `"sign-from-details"` | `{ signedTransactionHex }` |
| `evmSignTypedData` | `"sign-typed-data"` | `{ signature }` — EIP-712 (e.g. EIP-3009 gasless transfers) |
| `evmSign` | — | convenience wrapper over `evmSignUnsignedHex` |

### UTXO — `@cryptoapis-io/offline-signer/utxo`

| Function | Input `action` | Returns |
| --- | --- | --- |
| `utxoSignFromDetails` | `"sign-from-details"` | `{ signedTransactionHex }` |
| `utxoSignUnsignedHex` | `"sign-unsigned-hex"` | `{ signedTransactionHex }` |

Private keys are WIF, one per input, in the same order as the transaction inputs.

### Tron / XRP / Kaspa / Solana

| Subpath | Function | Returns |
| --- | --- | --- |
| `/tron` | `tronSignFromDetails` | signed transaction |
| `/xrp` | `xrpSignFromDetails` | `{ signedTransaction }` |
| `/kaspa` | `kaspaSignFromDetails` | `{ signedTransaction, transactionId }` |
| `/solana` | `svmPartialSign` | `{ transaction }` (base64, partially signed) |

### Metadata

`getChainIdForNetwork(blockchain, network)`, `BLOCKCHAIN_NETWORKS`, `EVM_BLOCKCHAINS`, `UTXO_BLOCKCHAINS` and the chain/network types are exported from the root and the relevant subpaths — no runtime chain dependencies are loaded to read them.

## The non-custodial flow

This library is deliberately the *only* piece that touches your private key. A typical CryptoAPIs integration:

1. **Prepare** — `POST /prepare-transactions/{evm|utxo}/{blockchain}/{network}/native-coins` returns an unsigned transaction with inputs, fee and change calculated for you. No key is sent.
2. **Sign** — pass that unsigned transaction to the matching signer here. It runs entirely in your process; no HTTP, no API key.
3. **Broadcast** — `POST /broadcast-transactions/{blockchain}/{network}` takes only the signed hex.

Because steps 1 and 3 never see a key and step 2 never leaves your machine, the wallet stays non-custodial end to end. See the guides for [accepting crypto payments](https://cryptoapis.io/guides/accept-crypto-payments) and [building a wallet](https://cryptoapis.io/guides/build-a-crypto-wallet).

## Security

- **Keys are parameters, never environment reads.** You pass the key in explicitly; the library never inspects `process.env`.
- **No network, no telemetry.** The signing code makes zero outbound calls.
- **Keep keys in a trusted environment.** Treat any process that holds a private key as sensitive: avoid logging inputs, and don't run untrusted code alongside it.

## Development

```bash
npm install
npm run build        # → dist/ (ESM + .d.ts)
npm run typecheck
npm run test:evm     # EVM signing correctness (recovers sender from signed tx)
npm run test:utxo    # signs across all six UTXO chains
```

## License

[MIT](./LICENSE) © Crypto APIs, Inc.
