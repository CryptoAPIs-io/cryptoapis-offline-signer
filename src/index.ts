/**
 * @cryptoapis-io/offline-signer
 *
 * Local, offline transaction signing for EVM, UTXO, Tron, XRP, Kaspa and Solana.
 * Every signer takes a private key plus an unsigned transaction (or the fields
 * to build one) and returns a signed payload. Nothing here makes a network call
 * and nothing needs an API key — the private key never leaves the process.
 *
 * Typical flow with the CryptoAPIs REST API:
 *   1. POST /prepare-transactions/...             → unsigned transaction
 *   2. sign it here, offline, with your key       → signed hex
 *   3. POST /broadcast-transactions/{chain}/{net} → on-chain
 *
 * ── Importing ──────────────────────────────────────────────────────────────
 * Prefer a per-chain subpath so you only load the crypto libraries you need
 * (e.g. signing EVM won't pull in the Bitcoin/Zcash/Solana stacks):
 *
 *   import { evmSignUnsignedHex } from "@cryptoapis-io/offline-signer/evm";
 *   import { utxoSignFromDetails } from "@cryptoapis-io/offline-signer/utxo";
 *
 * This root entry re-exports every signer as a lazy async wrapper — convenient,
 * but each still dynamically imports its own chain on first call, so a single
 * chain's dependency problem never breaks the others.
 */
import type {
    EvmSignUnsignedHexInput,
    EvmSignFromDetailsInput,
    EvmSignTypedDataInput,
} from "./chains/evm/schema.js";
import type { UtxoSignFromDetailsInput, UtxoSignUnsignedHexInput } from "./chains/utxo/schema.js";
import type { TronSignFromDetailsInput } from "./chains/tron/schema.js";
import type { XrpSignFromDetailsInput, XrpSignUnsignedHexInput } from "./chains/xrp/schema.js";
import type { KaspaSignFromDetailsInput } from "./chains/kaspa/schema.js";
import type { SvmSignPartialInput } from "./chains/svm/schema.js";

// ---- EVM ----
export async function evmSignUnsignedHex(input: EvmSignUnsignedHexInput) {
    return (await import("./chains/evm/index.js")).evmSignUnsignedHex(input);
}
export async function evmSignFromDetails(input: EvmSignFromDetailsInput) {
    return (await import("./chains/evm/index.js")).evmSignFromDetails(input);
}
export async function evmSignTypedData(input: EvmSignTypedDataInput) {
    return (await import("./chains/evm/index.js")).evmSignTypedData(input);
}

// ---- UTXO ----
export async function utxoSignFromDetails(input: UtxoSignFromDetailsInput) {
    return (await import("./chains/utxo/index.js")).runFromDetails(input);
}
export async function utxoSignUnsignedHex(input: UtxoSignUnsignedHexInput) {
    return (await import("./chains/utxo/index.js")).runUnsignedHex(input);
}

// ---- Tron ----
export async function tronSignFromDetails(input: TronSignFromDetailsInput) {
    return (await import("./chains/tron/index.js")).tronSignFromDetails(input);
}

// ---- XRP ----
export async function xrpSignFromDetails(input: XrpSignFromDetailsInput) {
    return (await import("./chains/xrp/index.js")).xrpSignFromDetails(input);
}
export async function xrpSignUnsignedHex(input: XrpSignUnsignedHexInput) {
    return (await import("./chains/xrp/index.js")).xrpSignUnsignedHex(input);
}

// ---- Kaspa ----
export async function kaspaSignFromDetails(input: KaspaSignFromDetailsInput) {
    return (await import("./chains/kaspa/index.js")).runFromDetails(input);
}

// ---- Solana (SVM) ----
export async function svmPartialSign(input: SvmSignPartialInput) {
    return (await import("./chains/svm/index.js")).svmPartialSign(input);
}

// ---- Types & supported-chain metadata (no runtime chain deps) ----
export type {
    EvmSignUnsignedHexInput,
    EvmSignFromDetailsInput,
    EvmSignTypedDataInput,
} from "./chains/evm/schema.js";
export type { UtxoSignFromDetailsInput, UtxoSignUnsignedHexInput } from "./chains/utxo/schema.js";
export type { TronSignFromDetailsInput } from "./chains/tron/schema.js";
export type { TronSignedTransaction } from "./chains/tron/index.js";
export type { XrpSignFromDetailsInput, XrpSignUnsignedHexInput } from "./chains/xrp/schema.js";
export type { KaspaSignFromDetailsInput } from "./chains/kaspa/schema.js";
export type { SvmSignPartialInput } from "./chains/svm/schema.js";

export {
    BLOCKCHAIN_NETWORKS,
    EVM_BLOCKCHAINS,
    UTXO_BLOCKCHAINS,
    getChainIdForNetwork,
} from "./internal/blockchains.js";
export type {
    BlockchainName,
    NetworkName,
    EvmBlockchainName,
    EvmNetworkName,
    UtxoBlockchainName,
    UtxoNetworkName,
    XrpNetworkName,
} from "./internal/blockchains.js";
