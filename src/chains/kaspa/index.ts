/**
 * Kaspa transaction signing (local-only). Kaspa is a UTXO/blockDAG chain that signs
 * with schnorr via `kaspa-wasm` (NOT bitcoinjs). Given a prepared transaction (from the
 * Kaspa prepare-transaction API) + one hex private key per input, this reconstructs the
 * SignableTransaction (inputs carry their prevout script + sompi so the sighash can be
 * built), signs every input (SIGHASH_ALL), and returns the signed tx as JSON — the form
 * the Kaspa broadcast service `JSON.parse`s.
 *
 * Mirrors the fleet's internal KaspaSigner recipe.
 */

import kaspa from "kaspa-wasm";
import type { KaspaSignFromDetailsInput, KaspaSignToolInput } from "./schema.js";
import { KaspaSignToolSchema } from "./schema.js";

if (typeof kaspa.initConsolePanicHook === "function") {
    kaspa.initConsolePanicHook();
}

/** A prepared-tx input (subset consumed here). */
interface PreparedInput {
    address?: string;
    transactionId?: string;
    outputIndex?: number;
    sompi?: string | number;
    script?: string;
    scriptVersion?: number;
    blockDaaScore?: string | number;
    isCoinbase?: boolean;
}
/** A prepared-tx output. */
interface PreparedOutput {
    address?: string;
    sompi?: string | number;
    script?: string;
    scriptVersion?: number;
}
/** The prepared transaction shape. */
interface PreparedItem {
    inputs?: PreparedInput[];
    outputs?: PreparedOutput[];
    version?: number;
    lockTime?: string | number;
    subnetworkId?: string;
}

/** Strip an optional 0x prefix. */
function stripHex(hex: string): string {
    return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/**
 * Build + sign a Kaspa transaction from a prepared-tx object.
 *
 * @param {KaspaSignFromDetailsInput} input the tool input (privateKeys + preparedTransaction)
 * @return {{signedTransaction: string, transactionId: string}} the signed tx JSON + txid
 */
export function runFromDetails(input: KaspaSignFromDetailsInput): { signedTransaction: string; transactionId: string } {
    const item = input.preparedTransaction as PreparedItem;
    const inputs = item.inputs ?? [];
    const outputs = item.outputs ?? [];
    if (inputs.length === 0) {
        throw new Error("preparedTransaction has no inputs");
    }
    if (inputs.length !== input.privateKeys.length) {
        throw new Error(`Expected ${inputs.length} private keys for ${inputs.length} inputs, got ${input.privateKeys.length}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txInputs = inputs.map((i) => ({
        previousOutpoint: { transactionId: i.transactionId, index: i.outputIndex ?? 0 },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1,
    }));

    const txOutputs = outputs.map((o) => {
        if (!o.script) {
            throw new Error("prepared output is missing its scriptPublicKey");
        }
        return new kaspa.TransactionOutput(
            BigInt(o.sompi ?? 0),
            new kaspa.ScriptPublicKey(o.scriptVersion ?? 0, stripHex(o.script)),
        );
    });

    const tx = new kaspa.Transaction({
        version: item.version ?? 0,
        inputs: txInputs,
        outputs: txOutputs,
        lockTime: BigInt(item.lockTime ?? 0),
        subnetworkId: item.subnetworkId ?? "0".repeat(40),
        gas: 0n,
        payload: "",
    });

    // The UTXO entries carry each input's prevout amount + script — required to build
    // the per-input SIGHASH_ALL hash. Only amount + scriptPublicKey affect the signature.
    const entries = new kaspa.UtxoEntries(inputs.map((i) => ({
        address: i.address,
        outpoint: { transactionId: i.transactionId, index: i.outputIndex ?? 0 },
        utxoEntry: {
            amount: BigInt(i.sompi ?? 0),
            scriptPublicKey: new kaspa.ScriptPublicKey(i.scriptVersion ?? 0, stripHex(i.script ?? "")),
            blockDaaScore: BigInt(i.blockDaaScore ?? 0),
            isCoinbase: i.isCoinbase ?? false,
        },
    })));

    const mtx = new kaspa.SignableTransaction(tx, entries);
    const keys = input.privateKeys.map((k) => new kaspa.PrivateKey(stripHex(k)));
    const signed = kaspa.signTransaction(mtx, keys, true);

    return {
        transactionId: signed.tx.id,
        signedTransaction: JSON.stringify(
            signed.tx.toJSON(),
            (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        ),
    };
}
