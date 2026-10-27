/**
 * Zcash (transparent / t-address, P2PKH) signing.
 *
 * Builds a **version 5** transaction (ZIP 225) and signs each input with the ZIP 244
 * signature digest (`zcash-zip244.ts`). v5 is valid from NU5 through NU7. v4 is rejected
 * from NU7 on (ZIP 2003), so the prepared transaction's `version` is ignored: the format is
 * the signer's choice, not the API's.
 *
 * The digest commits to the consensus branch ID of the block the transaction is mined in,
 * and a v5 transaction also carries it in its header. The caller must therefore name it,
 * either as `targetHeight` (chain tip + 1, mapped through the network-upgrade table) or as
 * an explicit `consensusBranchId`. There is no default: this library used to hard-code the
 * NU5 branch ID, which no node has accepted since NU6 activated.
 *
 * `@bitgo/utxo-lib` is used for WIF decoding, address → script and v5 serialization only.
 */

import * as utxolib from "@bitgo/utxo-lib";
import type { UtxoNetworkName } from "../../internal/blockchains.js";
import type { UtxoSignFromDetailsInput } from "./schema.js";
import { zcashConsensusBranchIdForHeight } from "./zcash-network-upgrades.js";
import {
    SIGHASH_ALL,
    TX_VERSION_5,
    TX_VERSION_5_GROUP_ID,
    zip244SignatureDigest,
    type Zip244TransparentInput,
    type Zip244TransparentOutput,
} from "./zcash-zip244.js";

/** Default nSequence (final); the prepared transaction does not carry one. */
const SEQUENCE_FINAL = 0xffffffff;
/** nExpiryHeight 0 disables expiry (ZIP 203). */
const NO_EXPIRY = 0;
const MAX_UINT32 = 0xffffffff;

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

function isUint32(n: unknown): n is number {
    return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_UINT32;
}

function isAmount(n: unknown): n is number {
    return Number.isSafeInteger(n) && (n as number) >= 0;
}

function hexBytes(hex: unknown, what: string): Buffer {
    const clean = typeof hex === "string" ? stripHex(hex) : "";
    if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
        throw new Error(`${what} must be a non-empty hex string`);
    }
    return Buffer.from(clean, "hex");
}

/**
 * The consensus branch ID to sign with: exactly one of `targetHeight` (resolved through the
 * network-upgrade table) or `consensusBranchId` (used as given, so a caller can sign for an
 * upgrade this release does not know yet). `null` counts as not given.
 *
 * @param {UtxoNetworkName} network mainnet|testnet
 * @param {{targetHeight?: number|null, consensusBranchId?: number|null}} params the caller's choice
 * @return {number} the consensus branch ID (uint32)
 */
export function resolveZcashConsensusBranchId(
    network: UtxoNetworkName,
    params: { targetHeight?: number | null; consensusBranchId?: number | null },
): number {
    const hasTargetHeight = params.targetHeight != null;
    const hasBranchId = params.consensusBranchId != null;

    if (hasTargetHeight && hasBranchId) {
        throw new Error("Pass either targetHeight or consensusBranchId for Zcash, not both");
    }
    if (hasBranchId) {
        const id = params.consensusBranchId;
        if (!isUint32(id) || id === 0) {
            throw new Error(`consensusBranchId must be an integer in 0x1..0xffffffff, got ${String(id)}`);
        }
        return id;
    }
    if (hasTargetHeight) {
        return zcashConsensusBranchIdForHeight(network, params.targetHeight as number);
    }
    throw new Error(
        "Zcash signing needs targetHeight (the height of the block the transaction will be mined in: " +
            "current chain tip + 1) or consensusBranchId (e.g. getblockchaininfo → consensus.nextblock). " +
            "There is no default: a wrong branch ID makes every signature invalid.",
    );
}

/** P2PKH scriptPubKey → its 20-byte pubkey hash, or null for any other script. */
function p2pkhHash(script: Buffer): Buffer | null {
    const isP2pkh =
        script.length === 25 &&
        script[0] === 0x76 && // OP_DUP
        script[1] === 0xa9 && // OP_HASH160
        script[2] === 0x14 && // push 20
        script[23] === 0x88 && // OP_EQUALVERIFY
        script[24] === 0xac; // OP_CHECKSIG
    return isP2pkh ? script.subarray(3, 23) : null;
}

function toZip244Input(inp: PreparedInput, i: number): Zip244TransparentInput {
    const txid = typeof inp.transactionId === "string" ? stripHex(inp.transactionId) : "";
    if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
        throw new Error(`Input ${i}: transactionId must be a 32-byte hex txid`);
    }
    if (!isUint32(inp.outputIndex)) {
        throw new Error(`Input ${i}: outputIndex must be a non-negative integer`);
    }
    if (!isAmount(inp.satoshis)) {
        throw new Error(`Input ${i}: satoshis must be a non-negative integer`);
    }
    const prevOutScript = hexBytes(inp.script, `Input ${i}: script`);
    if (!p2pkhHash(prevOutScript)) {
        throw new Error(`Input ${i}: only P2PKH (t-address) inputs can be signed; got script ${prevOutScript.toString("hex")}`);
    }
    return {
        hash: Buffer.from(txid, "hex").reverse(),
        index: inp.outputIndex,
        sequence: SEQUENCE_FINAL,
        prevOutScript,
        value: inp.satoshis,
    };
}

function toZip244Output(out: PreparedOutput, i: number, network: utxolib.Network): Zip244TransparentOutput {
    if (!isAmount(out.satoshis)) {
        throw new Error(`Output ${i}: satoshis must be a non-negative integer`);
    }
    if (out.script) {
        return { script: hexBytes(out.script, `Output ${i}: script`), value: out.satoshis };
    }
    if (out.address) {
        return { script: utxolib.address.toOutputScript(out.address, network), value: out.satoshis };
    }
    throw new Error("Output must have address or script");
}

/**
 * The ecpair network for WIF decoding. Zcash's real pubKeyHash/scriptHash are 2-byte
 * prefixes, but ecpair validates them as UInt8; dummy 1-byte values (unused when only
 * decoding a WIF) satisfy that check.
 *
 * @param {utxolib.Network} base the utxo-lib Zcash network
 * @return {Object} a bitcoinjs-style network for ECPair.fromWIF
 */
function ecpairNetworkFor(base: utxolib.Network): {
    messagePrefix: string;
    bip32: { public: number; private: number };
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
} {
    return {
        messagePrefix: base.messagePrefix,
        bip32: base.bip32,
        pubKeyHash: 0x00,
        scriptHash: 0x00,
        wif: base.wif,
    };
}

/**
 * Build + fully sign a transparent Zcash v5 transaction from a prepared-tx object.
 *
 * @param {UtxoSignFromDetailsInput} input the tool input (privateKeys, network, targetHeight | consensusBranchId)
 * @param {PreparedItem} item the prepared transaction (inputs/outputs/locktime)
 * @return {{signedTransactionHex: string}} the fully-signed raw tx hex
 */
export function signZcashTransaction(
    input: UtxoSignFromDetailsInput,
    item: PreparedItem,
): { signedTransactionHex: string } {
    const preparedInputs = item.inputs ?? [];
    const preparedOutputs = item.outputs ?? [];
    if (preparedInputs.length === 0) {
        throw new Error("preparedTransaction has no inputs");
    }
    if (preparedOutputs.length === 0) {
        // A transparent-only transaction without outputs is invalid (zebra: has_inputs_and_outputs).
        throw new Error("preparedTransaction has no outputs");
    }

    const consensusBranchId = resolveZcashConsensusBranchId(input.network, input);
    const network = input.network === "mainnet" ? utxolib.networks.zcash : utxolib.networks.zcashTest;
    const lockTime = item.locktime ?? 0;
    if (!isUint32(lockTime)) {
        throw new Error("preparedTransaction.locktime must be a uint32");
    }

    const unsigned = {
        consensusBranchId,
        lockTime,
        expiryHeight: NO_EXPIRY,
        inputs: preparedInputs.map(toZip244Input),
        outputs: preparedOutputs.map((out, i) => toZip244Output(out, i, network)),
    };

    const tx = new utxolib.bitgo.ZcashTransaction<number>(network);
    tx.version = TX_VERSION_5;
    tx.overwintered = 1;
    tx.versionGroupId = TX_VERSION_5_GROUP_ID;
    tx.consensusBranchId = consensusBranchId;
    tx.locktime = lockTime;
    tx.expiryHeight = NO_EXPIRY;
    for (const inp of unsigned.inputs) {
        tx.addInput(Buffer.from(inp.hash), inp.index, inp.sequence);
    }
    for (const out of unsigned.outputs) {
        tx.addOutput(Buffer.from(out.script), out.value);
    }

    const ecpairNetwork = ecpairNetworkFor(network);
    unsigned.inputs.forEach((inp, i) => {
        const wif = input.privateKeys[i];
        if (!wif) {
            throw new Error(`Missing private key at index ${i}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keyPair = (utxolib.ECPair as any).fromWIF(wif, ecpairNetwork);
        const publicKey = Buffer.from(keyPair.publicKey);
        if (!utxolib.crypto.hash160(publicKey).equals(p2pkhHash(Buffer.from(inp.prevOutScript))!)) {
            throw new Error(`Private key at index ${i} does not match the address of input ${i}`);
        }
        const digest = zip244SignatureDigest(unsigned, i);
        const signature = utxolib.script.signature.encode(Buffer.from(keyPair.sign(digest)), SIGHASH_ALL);
        tx.ins[i]!.script = utxolib.script.compile([signature, publicKey]);
    });

    return { signedTransactionHex: tx.toHex() };
}
