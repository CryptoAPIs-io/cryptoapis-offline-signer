/**
 * Legacy (non-SegWit) UTXO signing via the raw `Transaction` + `hashForSignature`
 * path. bitcoinjs `Psbt` REJECTS a P2PKH/P2SH input supplied via `witnessUtxo`
 * ("has witnessUtxo but non-segwit script"), so legacy inputs — the norm for
 * Dogecoin/Dash and common for Bitcoin/Litecoin — must be signed the classic way.
 *
 * This needs ONLY the prevout `script` + `satoshis` per input (both provided by the
 * prepare-transaction API); it does NOT need the full previous-tx hex. Signs each
 * input with SIGHASH_ALL, so the signature commits to every output (locking change).
 */

import * as bitcoin from "bitcoinjs-lib";
import type { ECPairInterface } from "ecpair";

/** A resolved input to sign: prevout outpoint + its script/value + the signer. */
export interface LegacyInput {
    /** Previous output txid (big-endian hex, as displayed). */
    txId: string;
    /** Previous output index. */
    outputIndex: number;
    /** Previous output scriptPubKey (bytes). */
    script: Buffer;
    /** Previous output value in satoshis. */
    satoshis: number;
    /** The key that controls this input. */
    keyPair: ECPairInterface;
}

/** A resolved output: exactly one of {script, address} + value. */
export interface LegacyOutput {
    script?: Buffer;
    address?: string;
    satoshis: number;
    network: bitcoin.Network;
}

/**
 * Build + fully sign a legacy (P2PKH) transaction and return its raw hex.
 *
 * @param {Object} params inputs
 * @param {number} params.version the tx version
 * @param {number} [params.locktime] the tx locktime
 * @param {Array<LegacyInput>} params.inputs the inputs to spend + sign
 * @param {Array<LegacyOutput>} params.outputs the outputs to create
 * @return {{signedTransactionHex: string}} the fully-signed raw tx hex
 */
export function signLegacyTransaction(params: {
    version: number;
    locktime?: number;
    inputs: LegacyInput[];
    outputs: LegacyOutput[];
}): { signedTransactionHex: string } {
    const tx = new bitcoin.Transaction();
    tx.version = params.version;
    if (params.locktime != null) {
        tx.locktime = params.locktime;
    }

    // Add inputs. bitcoinjs stores the input hash internally-reversed (little-endian),
    // so a big-endian display txid must be reversed before adding.
    for (const inp of params.inputs) {
        const hash = Buffer.from(inp.txId, "hex").reverse();
        tx.addInput(hash, inp.outputIndex);
    }

    // Add outputs (script or address).
    for (const out of params.outputs) {
        const script = out.script
            ?? bitcoin.address.toOutputScript(out.address as string, out.network);
        tx.addOutput(script, BigInt(out.satoshis));
    }

    // Sign each input with SIGHASH_ALL over the prevout script.
    const hashType = bitcoin.Transaction.SIGHASH_ALL;
    for (let i = 0; i < params.inputs.length; i++) {
        const inp = params.inputs[i];
        if (!inp) {
            throw new Error(`Missing input at index ${i}`);
        }
        const sigHash = Buffer.from(tx.hashForSignature(i, inp.script, hashType));
        const signature = inp.keyPair.sign(sigHash);
        const scriptSig = bitcoin.script.compile([
            bitcoin.script.signature.encode(Buffer.from(signature), hashType),
            Buffer.from(inp.keyPair.publicKey),
        ]);
        tx.setInputScript(i, scriptSig);
    }

    return { signedTransactionHex: tx.toHex() };
}

/**
 * Decide whether a scriptPubKey is SegWit (v0 P2WPKH/P2WSH) — those go through PSBT
 * with `witnessUtxo`; everything else (P2PKH/P2SH) is legacy.
 *
 * @param {Buffer} script the prevout scriptPubKey
 * @return {boolean} true when the script is a native SegWit v0 program
 */
export function isSegwitScript(script: Buffer): boolean {
    // P2WPKH = OP_0 <20-byte>; P2WSH = OP_0 <32-byte>. First byte 0x00, then a push.
    if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
        return true;
    }
    if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
        return true;
    }
    return false;
}
