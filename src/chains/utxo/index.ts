import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import { getNetworkForUtxo } from "./utxo-networks.js";
import {
    signLegacyTransaction,
    isSegwitScript,
    type LegacyInput,
    type LegacyOutput,
} from "./legacy-sign.js";
import { signBchTransaction } from "./bch-sign.js";
import { signZcashTransaction } from "./zcash-sign.js";
import type {
    UtxoSignFromDetailsInput,
    UtxoSignToolInput,
    UtxoSignUnsignedHexInput,
} from "./schema.js";
import { UtxoSignToolSchema } from "./schema.js";

const ECPair = ECPairFactory(ecc);

/** Strip an optional 0x prefix and return the hex's bytes. */
function hexToBuffer(hex: string): Buffer {
    return Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex");
}

type PreparedInput = {
    address?: string;
    outputIndex?: number;
    satoshis?: number;
    script?: string;
    transactionId?: string;
};
type PreparedOutput = { address?: string; satoshis?: number; script?: string };
type PreparedItem = {
    inputs?: PreparedInput[];
    outputs?: PreparedOutput[];
    version?: number;
    locktime?: number;
};

function reverseBuffer(buf: Buffer): Buffer {
    return Buffer.from(buf.reverse());
}

export function runFromDetails(input: UtxoSignFromDetailsInput): { signedTransactionHex: string } {
    const item = input.preparedTransaction as PreparedItem;
    const inputs = item.inputs ?? [];
    const outputs = item.outputs ?? [];
    if (inputs.length !== input.privateKeys.length) {
        throw new Error(`Expected ${inputs.length} private keys for ${inputs.length} inputs, got ${input.privateKeys.length}`);
    }
    if (inputs.length === 0) {
        throw new Error("preparedTransaction has no inputs");
    }

    const version = item.version ?? 1;
    const locktime = item.locktime ?? undefined;

    // Bitcoin Cash and Zcash have their own tx/sighash formats (SIGHASH_FORKID and
    // Sapling versionGroupId/consensusBranchId respectively) that bitcoinjs cannot
    // produce — they are signed by dedicated modules.
    if (input.blockchain === "bitcoin-cash") {
        return signBchTransaction(input, item);
    }
    if (input.blockchain === "zcash") {
        return signZcashTransaction(input, item);
    }

    // Bitcoin / Litecoin / Dogecoin / Dash: classify each input's prevout script.
    // Legacy (P2PKH/P2SH) inputs MUST be signed via the raw-Transaction path
    // (bitcoinjs Psbt rejects a non-segwit script supplied as witnessUtxo); native
    // SegWit v0 inputs go through Psbt. A single wallet's UTXOs are uniform, so mixed
    // input types are rejected rather than silently mishandled.
    const network = getNetworkForUtxo(input.blockchain, input.network);
    const scripts = inputs.map((inp) => hexToBuffer(inp.script ?? ""));
    const anySegwit = scripts.some((s) => isSegwitScript(s));
    const anyLegacy = scripts.some((s) => !isSegwitScript(s));
    if (anySegwit && anyLegacy) {
        throw new Error("Mixed SegWit and legacy inputs are not supported in a single transaction");
    }

    if (anyLegacy) {
        return signLegacyFromDetails(input, item, network, version, locktime);
    }
    return signSegwitFromDetails(input, item, network, version, locktime);
}

/** Sign an all-legacy prepared tx via the raw-Transaction path. */
function signLegacyFromDetails(
    input: UtxoSignFromDetailsInput,
    item: PreparedItem,
    network: bitcoin.Network,
    version: number,
    locktime: number | undefined,
): { signedTransactionHex: string } {
    const inputs = item.inputs ?? [];
    const outputs = item.outputs ?? [];
    const legacyInputs: LegacyInput[] = inputs.map((inp, i) => {
        const wif = input.privateKeys[i];
        if (!wif) {
            throw new Error(`Missing private key at index ${i}`);
        }
        return {
            txId: inp.transactionId ?? "",
            outputIndex: inp.outputIndex ?? 0,
            script: hexToBuffer(inp.script ?? ""),
            satoshis: inp.satoshis ?? 0,
            keyPair: ECPair.fromWIF(wif, network),
        };
    });
    const legacyOutputs: LegacyOutput[] = outputs.map((out) => {
        if (out.script) {
            return { script: hexToBuffer(out.script), satoshis: out.satoshis ?? 0, network };
        }
        if (out.address) {
            return { address: out.address, satoshis: out.satoshis ?? 0, network };
        }
        throw new Error("Output must have address or script");
    });
    return signLegacyTransaction({
        version,
        locktime,
        inputs: legacyInputs,
        outputs: legacyOutputs,
    });
}

/** Sign an all-SegWit prepared tx via Psbt (witnessUtxo). */
function signSegwitFromDetails(
    input: UtxoSignFromDetailsInput,
    item: PreparedItem,
    network: bitcoin.Network,
    version: number,
    locktime: number | undefined,
): { signedTransactionHex: string } {
    const inputs = item.inputs ?? [];
    const outputs = item.outputs ?? [];
    const psbt = new bitcoin.Psbt({ network });

    for (const inp of inputs) {
        const txId = inp.transactionId ?? "";
        const hash = txId.length === 64 ? reverseBuffer(Buffer.from(txId, "hex")) : Buffer.from(txId, "hex").reverse();
        psbt.addInput({
            hash,
            index: inp.outputIndex ?? 0,
            witnessUtxo: { script: hexToBuffer(inp.script ?? ""), value: BigInt(inp.satoshis ?? 0) },
        });
    }

    for (const out of outputs) {
        const value = BigInt(out.satoshis ?? 0);
        if (out.script) {
            psbt.addOutput({ script: hexToBuffer(out.script), value });
        } else if (out.address) {
            psbt.addOutput({ address: out.address, value });
        } else {
            throw new Error("Output must have address or script");
        }
    }

    psbt.setVersion(version);
    if (locktime != null) psbt.setLocktime(locktime);

    for (let i = 0; i < input.privateKeys.length; i++) {
        const wif = input.privateKeys[i];
        if (!wif) throw new Error(`Missing private key at index ${i}`);
        psbt.signInput(i, ECPair.fromWIF(wif, network));
    }

    psbt.finalizeAllInputs();
    return { signedTransactionHex: psbt.extractTransaction().toHex() };
}

export function runUnsignedHex(input: UtxoSignUnsignedHexInput): { signedTransactionHex: string } {
    const hex = input.unsignedTransactionHex.startsWith("0x") ? input.unsignedTransactionHex.slice(2) : input.unsignedTransactionHex;
    const tx = bitcoin.Transaction.fromHex(hex);
    if (tx.ins.length !== input.privateKeys.length || tx.ins.length !== input.inputs.length) {
        throw new Error(
            `Input count mismatch: tx has ${tx.ins.length} inputs, got ${input.privateKeys.length} keys and ${input.inputs.length} input descriptors`
        );
    }

    const network = getNetworkForUtxo(input.blockchain, input.network);
    const psbt = new bitcoin.Psbt({ network });

    for (let i = 0; i < tx.ins.length; i++) {
        const inp = tx.ins[i];
        const meta = input.inputs[i];
        if (!inp || !meta) throw new Error(`Missing input or descriptor at index ${i}`);
        const script = Buffer.from(meta.script.startsWith("0x") ? meta.script.slice(2) : meta.script, "hex");
        psbt.addInput({
            hash: Buffer.from(inp.hash),
            index: inp.index,
            witnessUtxo: { script, value: BigInt(meta.satoshis) },
        });
    }

    for (const out of tx.outs) {
        psbt.addOutput({ script: Buffer.from(out.script), value: out.value });
    }

    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    for (let i = 0; i < input.privateKeys.length; i++) {
        const wif = input.privateKeys[i];
        if (!wif) throw new Error(`Missing private key at index ${i}`);
        const keyPair = ECPair.fromWIF(wif, network);
        psbt.signInput(i, keyPair);
    }

    psbt.finalizeAllInputs();
    const signedTx = psbt.extractTransaction();
    return { signedTransactionHex: signedTx.toHex() };
}
