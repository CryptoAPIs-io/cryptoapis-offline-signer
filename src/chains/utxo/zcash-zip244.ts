/**
 * ZIP 244 signature digest for a fully transparent Zcash v5 transaction, SIGHASH_ALL only.
 * https://zips.z.cash/zip-0244#signature-digest
 *
 * Why not `@bitgo/utxo-lib`: its `hashZip0244` follows a pre-final draft of ZIP 244. Its
 * transparent signature digest omits `hash_type` and the amounts and scriptPubKeys digests,
 * and hashes the input's scriptPubKey before its value, so the v5 signatures it produces are
 * invalid on the network. scripts/test-zcash-sign.ts checks this module against signatures
 * of v5 transactions mined on mainnet and testnet. utxo-lib still serializes the v5
 * transaction; that part round-trips the same on-chain transactions byte for byte.
 *
 * The sapling and orchard digests are those of empty bundles, so this applies only to
 * transactions without shielded components (all this library builds).
 */
import { blake2b } from "@noble/hashes/blake2.js";

export const SIGHASH_ALL = 0x01;
export const TX_VERSION_5 = 5;
export const TX_VERSION_5_GROUP_ID = 0x26a7270a;

export interface Zip244TransparentInput {
    /** Previous txid in internal byte order (the reverse of the displayed hex). */
    readonly hash: Uint8Array;
    readonly index: number;
    readonly sequence: number;
    /** scriptPubKey of the output being spent. */
    readonly prevOutScript: Uint8Array;
    /** Value of the output being spent, in zatoshis. */
    readonly value: number;
}

export interface Zip244TransparentOutput {
    readonly script: Uint8Array;
    readonly value: number;
}

export interface Zip244TransparentTransaction {
    readonly consensusBranchId: number;
    readonly lockTime: number;
    readonly expiryHeight: number;
    readonly inputs: readonly Zip244TransparentInput[];
    readonly outputs: readonly Zip244TransparentOutput[];
}

function blake2b256(personalization: Uint8Array, ...parts: Uint8Array[]): Buffer {
    return Buffer.from(blake2b(Buffer.concat(parts), { dkLen: 32, personalization }));
}

function tag(text: string): Buffer {
    return Buffer.from(text, "latin1");
}

function u32le(n: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(n);
    return buf;
}

function i64le(n: number): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(BigInt(n));
    return buf;
}

function compactSize(n: number): Buffer {
    if (n < 0xfd) return Buffer.from([n]);
    if (n <= 0xffff) {
        const buf = Buffer.alloc(3);
        buf[0] = 0xfd;
        buf.writeUInt16LE(n, 1);
        return buf;
    }
    const buf = Buffer.alloc(5);
    buf[0] = 0xfe;
    buf.writeUInt32LE(n, 1);
    return buf;
}

function varSlice(bytes: Uint8Array): Buffer {
    return Buffer.concat([compactSize(bytes.length), bytes]);
}

/** T.1 header_digest. */
function headerDigest(tx: Zip244TransparentTransaction): Buffer {
    const header = (TX_VERSION_5 | 0x80000000) >>> 0; // fOverwintered | nVersion
    return blake2b256(
        tag("ZTxIdHeadersHash"),
        u32le(header),
        u32le(TX_VERSION_5_GROUP_ID),
        u32le(tx.consensusBranchId),
        u32le(tx.lockTime),
        u32le(tx.expiryHeight),
    );
}

/** S.2 transparent_sig_digest for SIGHASH_ALL. */
function transparentSigDigest(tx: Zip244TransparentTransaction, inputIndex: number): Buffer {
    const { inputs, outputs } = tx;
    const input = inputs[inputIndex]!;
    const prevouts = blake2b256(tag("ZTxIdPrevoutHash"), ...inputs.flatMap((i) => [i.hash, u32le(i.index)]));
    const amounts = blake2b256(tag("ZTxTrAmountsHash"), ...inputs.map((i) => i64le(i.value)));
    const scriptPubKeys = blake2b256(tag("ZTxTrScriptsHash"), ...inputs.map((i) => varSlice(i.prevOutScript)));
    const sequences = blake2b256(tag("ZTxIdSequencHash"), ...inputs.map((i) => u32le(i.sequence)));
    const outputsDigest = blake2b256(tag("ZTxIdOutputsHash"), ...outputs.flatMap((o) => [i64le(o.value), varSlice(o.script)]));
    const txin = blake2b256(
        tag("Zcash___TxInHash"),
        input.hash,
        u32le(input.index),
        i64le(input.value),
        varSlice(input.prevOutScript),
        u32le(input.sequence),
    );
    return blake2b256(
        tag("ZTxIdTranspaHash"),
        Buffer.from([SIGHASH_ALL]),
        prevouts,
        amounts,
        scriptPubKeys,
        sequences,
        outputsDigest,
        txin,
    );
}

/**
 * The 32-byte digest a transparent input of a v5 transaction signs with SIGHASH_ALL.
 *
 * @param {Zip244TransparentTransaction} tx the transaction (no shielded components)
 * @param {number} inputIndex the input being signed
 * @return {Buffer} the signature digest
 */
export function zip244SignatureDigest(tx: Zip244TransparentTransaction, inputIndex: number): Buffer {
    if (!Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= tx.inputs.length) {
        throw new Error(`Input index ${inputIndex} is out of range (${tx.inputs.length} inputs)`);
    }
    const saplingDigest = blake2b256(tag("ZTxIdSaplingHash"));
    const orchardDigest = blake2b256(tag("ZTxIdOrchardHash"));
    return blake2b256(
        Buffer.concat([tag("ZcashTxHash_"), u32le(tx.consensusBranchId)]),
        headerDigest(tx),
        transparentSigDigest(tx, inputIndex),
        saplingDigest,
        orchardDigest,
    );
}
