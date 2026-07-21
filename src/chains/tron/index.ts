import { createHash } from "crypto";
import { createRequire } from "module";
import type {
    TronSignFromDetailsInput,
    TronSignToolInput,
    TronSignUnsignedHexInput,
} from "./schema.js";
import { TronSignToolSchema } from "./schema.js";
import { encodeSignedTransaction, parseTransactionRawDataHex } from "./tron-protobuf.js";

const require = createRequire(import.meta.url);

/** Sign Tron rawDataHex with private key (secp256k1). Node crypto + elliptic (cryptoapis blockchain-signer-lib style). Returns 65-byte hex: r(32) + s(32) + recovery(1). */
function signTronRawDataHex(rawDataHex: string, privateKeyHex: string): string {
    const EC = require("elliptic").ec;
    const ec = new EC("secp256k1");
    const keyHex = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
    const hash = createHash("sha256").update(Buffer.from(rawDataHex, "hex")).digest("hex");
    const key = ec.keyFromPrivate(keyHex, "hex");
    const sig = key.sign(hash, { canonical: true });
    const rHex = sig.r.toString("hex").length % 2 ? "0" + sig.r.toString("hex") : sig.r.toString("hex");
    const sHex = sig.s.toString("hex").length % 2 ? "0" + sig.s.toString("hex") : sig.s.toString("hex");
    const recoveryParam = sig.recoveryParam ?? 0;
    return rHex.padStart(64, "0") + sHex.padStart(64, "0") + recoveryParam.toString(16);
}

/**
 * The structured TronWeb signed-transaction object — the shape broadcast /
 * on-chain consumers (and the x402 facilitator's Tron `parsePayload`) require:
 * `{txID, raw_data_hex, raw_data, signature[]}`. Returned ADDITIVELY alongside
 * the opaque `signedTransactionHex` so existing consumers are unaffected.
 */
export type TronSignedTransaction = {
    txID: string;
    raw_data_hex: string;
    raw_data?: unknown;
    signature: string[];
    visible?: boolean;
};

export function tronSignFromDetails(input: TronSignFromDetailsInput): {
    signedTransactionHex: string;
    signedTransaction: TronSignedTransaction;
} {
    const key = input.privateKey.startsWith("0x") ? input.privateKey.slice(2) : input.privateKey;
    const tx = input.transaction as {
        raw_data_hex?: string; rawDataHex?: string; raw_data?: unknown; txID?: string; visible?: boolean;
    };
    const rawDataHex = tx.raw_data_hex ?? tx.rawDataHex;
    if (!rawDataHex) {
        throw new Error("Transaction must include raw_data_hex (or rawDataHex) for signing");
    }
    const rawHex = rawDataHex.startsWith("0x") ? rawDataHex.slice(2) : rawDataHex;
    const signature = signTronRawDataHex(rawHex, key);
    const signedTransactionHex = encodeSignedTransaction(rawHex, [signature]);
    // TronWeb txID = sha256(raw_data bytes); prefer the caller-supplied txID when present.
    const txID = tx.txID ?? createHash("sha256").update(Buffer.from(rawHex, "hex")).digest("hex");
    const signedTransaction: TronSignedTransaction = {
        txID: txID,
        raw_data_hex: rawHex,
        signature: [signature],
        ...(tx.raw_data !== undefined ? { raw_data: tx.raw_data } : {}),
        ...(tx.visible !== undefined ? { visible: tx.visible } : {}),
    };
    return {
        signedTransactionHex: signedTransactionHex,
        signedTransaction: signedTransaction,
    };
}

export function tronSignUnsignedHex(input: TronSignUnsignedHexInput): { signedTransactionHex: string } {
    const hex = input.unsignedTransactionHex.startsWith("0x") ? input.unsignedTransactionHex.slice(2) : input.unsignedTransactionHex;
    const key = input.privateKey.startsWith("0x") ? input.privateKey.slice(2) : input.privateKey;
    const rawDataBytes = parseTransactionRawDataHex(hex);
    const txIDHex = createHash("sha256").update(rawDataBytes).digest("hex");
    const EC = require("elliptic").ec;
    const ec = new EC("secp256k1");
    const keyObj = ec.keyFromPrivate(key.replace(/^0x/, ""), "hex");
    const sig = keyObj.sign(txIDHex, { canonical: true });
    const rHex = sig.r.toString("hex").length % 2 ? "0" + sig.r.toString("hex") : sig.r.toString("hex");
    const sHex = sig.s.toString("hex").length % 2 ? "0" + sig.s.toString("hex") : sig.s.toString("hex");
    const recoveryParam = sig.recoveryParam ?? 0;
    const sigHex = rHex.padStart(64, "0") + sHex.padStart(64, "0") + recoveryParam.toString(16);
    const rawDataHex = Buffer.from(rawDataBytes).toString("hex");
    const signedTransactionHex = encodeSignedTransaction(rawDataHex, [sigHex]);
    return { signedTransactionHex };
}
