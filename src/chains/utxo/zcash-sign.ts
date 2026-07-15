/**
 * Zcash (transparent / t-address) signing. Zcash uses the Overwinter/Sapling tx
 * format — a `versionGroupId` + `consensusBranchId` and a ZIP-243/244 sighash that
 * plain bitcoinjs-lib cannot produce. `@bitgo/utxo-lib`'s `ZcashTransactionBuilder`
 * (with `zcashcore-lib` for hashing/addresses) does, so Zcash inputs are signed
 * through it, mirroring the fleet's internal ZcashSigner.
 *
 * Scope: TRANSPARENT (t-addr, P2PKH/P2SH) only — which is exactly x402's scope
 * (shielded z-addresses are irrelevant to a transparent payment). Uses tx **version 4**
 * with the NU5 consensus branch id (governs both v4-post-NU5 and v5 sighash).
 */

import * as utxolib from "@bitgo/utxo-lib";
import bitcorejs from "zcashcore-lib";
import type { UtxoSignFromDetailsInput } from "./schema.js";

/** Sapling v4 constants (NU5). */
const TX_VERSION_4 = 4;
const TX_VERSION_4_GROUP_ID = 0x892f2085;
const CONSENSUS_BRANCH_ID_NU5 = 0xc2d6d0b4;

interface PreparedInput {
    transactionId?: string;
    outputIndex?: number;
    script?: string;
    satoshis?: number;
}
interface PreparedOutput {
    address?: string;
    satoshis?: number;
    script?: string;
}
interface PreparedItem {
    inputs?: PreparedInput[];
    outputs?: PreparedOutput[];
    version?: number;
    locktime?: number;
}

/** Strip an optional 0x prefix. */
function stripHex(hex: string): string {
    return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/**
 * The ecpair network for WIF decoding. Zcash's real pubKeyHash/scriptHash are 2-byte
 * prefixes, but ecpair validates them as UInt8; the internal signer uses dummy 1-byte
 * values (unused during signing) to satisfy that constraint.
 *
 * @param {string} network mainnet|testnet
 * @return {Object} a bitcoinjs-style network for ECPair.fromWIF
 */
function ecpairNetworkFor(network: string): {
    messagePrefix: string;
    bip32: { public: number; private: number };
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
} {
    const base = network === "mainnet" ? utxolib.networks.zcash : utxolib.networks.zcashTest;
    return {
        messagePrefix: base.messagePrefix,
        bip32: base.bip32,
        pubKeyHash: 0x00,
        scriptHash: 0x00,
        wif: base.wif,
    };
}

/**
 * Build + fully sign a Zcash (transparent) transaction from a prepared-tx object.
 *
 * @param {UtxoSignFromDetailsInput} input the tool input (privateKeys, network)
 * @param {PreparedItem} item the prepared transaction (inputs/outputs)
 * @return {{signedTransactionHex: string}} the fully-signed raw tx hex
 */
export function signZcashTransaction(
    input: UtxoSignFromDetailsInput,
    item: PreparedItem,
): { signedTransactionHex: string } {
    const inputs = item.inputs ?? [];
    const outputs = item.outputs ?? [];
    if (inputs.length === 0) {
        throw new Error("preparedTransaction has no inputs");
    }

    const network = input.network === "mainnet" ? utxolib.networks.zcash : utxolib.networks.zcashTest;
    const ecpairNet = ecpairNetworkFor(input.network);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txb = new (utxolib as any).bitgo.ZcashTransactionBuilder(network);
    txb.setVersion(TX_VERSION_4);
    txb.setVersionGroupId(TX_VERSION_4_GROUP_ID);
    txb.setConsensusBranchId(CONSENSUS_BRANCH_ID_NU5);
    if (item.locktime != null) {
        txb.setLockTime(item.locktime);
    }

    for (const inp of inputs) {
        txb.addInput(
            Buffer.from(inp.transactionId ?? "", "hex").reverse(),
            inp.outputIndex ?? 0,
            undefined,
            Buffer.from(stripHex(inp.script ?? ""), "hex"),
            inp.satoshis ?? 0,
        );
    }

    for (const out of outputs) {
        if (out.script) {
            txb.addOutput(Buffer.from(stripHex(out.script), "hex"), out.satoshis ?? 0);
        } else if (out.address) {
            txb.addOutput(out.address, out.satoshis ?? 0);
        } else {
            throw new Error("Output must have address or script");
        }
    }

    const sigType = bitcorejs.crypto.Signature.SIGHASH_ALL;
    for (let i = 0; i < inputs.length; i++) {
        const wif = input.privateKeys[i];
        if (!wif) {
            throw new Error(`Missing private key at index ${i}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signer = (utxolib.ECPair as any).fromWIF(wif, ecpairNet);
        txb.sign(i, signer, undefined, sigType, inputs[i]?.satoshis ?? 0);
    }

    const tx = txb.build();
    return { signedTransactionHex: tx.toHex() };
}
