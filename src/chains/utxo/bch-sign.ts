/**
 * Bitcoin Cash signing. BCH uses `SIGHASH_ALL | SIGHASH_FORKID` with a BIP-143-style
 * sighash algorithm that stock bitcoinjs-lib does not produce (it rejects the 0x41
 * hashType). `bitcore-lib-cash` — the BCH fork of bitcore — handles the forkid sighash
 * natively, so BCH inputs are signed through it (mirroring the fleet's internal
 * BitcoinCashSigner). Needs only prevout script + satoshis per input.
 */

import bch from "bitcore-lib-cash";
import type { UtxoSignFromDetailsInput } from "./schema.js";

/** The prepared-transaction shape this module consumes (a subset). */
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
 * Build + fully sign a Bitcoin Cash transaction from a prepared-tx object.
 *
 * @param {UtxoSignFromDetailsInput} input the tool input (privateKeys, network)
 * @param {PreparedItem} item the prepared transaction (inputs/outputs)
 * @return {{signedTransactionHex: string}} the fully-signed raw tx hex
 */
export function signBchTransaction(
    input: UtxoSignFromDetailsInput,
    item: PreparedItem,
): { signedTransactionHex: string } {
    const inputs = item.inputs ?? [];
    const outputs = item.outputs ?? [];
    if (inputs.length === 0) {
        throw new Error("preparedTransaction has no inputs");
    }

    // bitcore-lib-cash uses its own network keying ("livenet"/"testnet").
    const bchNetwork = input.network === "mainnet" ? "livenet" : "testnet";

    // UTXOs to spend: bitcore expects { txId, outputIndex, script (hex), satoshis }.
    const utxos = inputs.map((inp) => ({
        txId: inp.transactionId ?? "",
        outputIndex: inp.outputIndex ?? 0,
        script: stripHex(inp.script ?? ""),
        satoshis: inp.satoshis ?? 0,
    }));

    // Every private key must decode against the BCH network.
    const privateKeys = input.privateKeys.map((wif) => new bch.PrivateKey(wif, bchNetwork));

    const tx = new (bch.Transaction as unknown as { new (): BchTx })();
    tx.from(utxos);

    for (const out of outputs) {
        if (out.script) {
            tx.addOutput(
                new bch.Transaction.Output({
                    satoshis: out.satoshis ?? 0,
                    script: bch.Script.fromHex(stripHex(out.script)),
                }),
            );
        } else if (out.address) {
            tx.to(out.address, out.satoshis ?? 0);
        } else {
            throw new Error("Output must have address or script");
        }
    }

    // bitcore exposes version + nLockTime as PROPERTIES (not chainable setters).
    if (item.version != null) {
        tx.version = item.version;
    }
    if (item.locktime != null) {
        tx.nLockTime = item.locktime;
    }

    tx.sign(privateKeys);
    if (!tx.isFullySigned()) {
        throw new Error("Bitcoin Cash transaction is not fully signed (check key order vs inputs)");
    }

    // Disable bitcore's client-side guards (dust / fee heuristics) — the prepared tx
    // already set amounts + fee; we only serialize the signed bytes.
    const hex = tx.serialize({
        disableIsFullySigned: false,
        disableDustOutputs: true,
        disableSmallFees: true,
        disableLargeFees: true,
    });
    return { signedTransactionHex: hex };
}

/** Minimal typing for the bitcore-lib-cash Transaction we use. */
interface BchTx {
    version: number;
    nLockTime: number;
    from(utxos: Array<{ txId: string; outputIndex: number; script: string; satoshis: number }>): BchTx;
    to(address: string, satoshis: number): BchTx;
    addOutput(output: unknown): BchTx;
    sign(keys: unknown): BchTx;
    isFullySigned(): boolean;
    serialize(opts: Record<string, boolean>): string;
}
