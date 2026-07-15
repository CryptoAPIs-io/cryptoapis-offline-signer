/**
 * Minimal Tron Transaction protobuf (de)serialization without TronWeb.
 * Transaction has: field 1 = raw_data (message bytes), field 2 = repeated signature (bytes).
 * We only encode/decode these for signing and broadcast hex.
 */

const WIRE_LENGTH_DELIMITED = 2;
const TRX_FIELD_RAW = 1;
const TRX_FIELD_SIGNATURE = 2;

function hexToBytes(hex: string): Uint8Array {
    const h = hex.startsWith("0x") ? hex.slice(2) : hex;
    const len = h.length / 2;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesToHex(buf: Uint8Array): string {
    return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function writeVarint(buf: number[], val: number): void {
    while (val > 0x7f) {
        buf.push((val & 0x7f) | 0x80);
        val >>>= 7;
    }
    buf.push(val & 0x7f);
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; nextOffset: number } {
    let value = 0;
    let shift = 0;
    let i = offset;
    while (i < bytes.length) {
        const b = bytes[i++]!;
        value |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) return { value, nextOffset: i };
        shift += 7;
        if (shift > 35) throw new Error("Varint too long");
    }
    throw new Error("Varint truncated");
}

/** Parse unsigned/signed Transaction hex; returns raw_data bytes (for txID = sha256(raw_data)). */
export function parseTransactionRawDataHex(txHex: string): Uint8Array {
    const bytes = hexToBytes(txHex);
    let offset = 0;
    while (offset < bytes.length) {
        const { value: tag, nextOffset: afterTag } = readVarint(bytes, offset);
        offset = afterTag;
        const field = tag >>> 3;
        const wire = tag & 7;
        if (wire !== WIRE_LENGTH_DELIMITED) throw new Error("Unexpected wire type");
        const { value: len, nextOffset: afterLen } = readVarint(bytes, offset);
        offset = afterLen;
        if (field === TRX_FIELD_RAW) {
            return bytes.slice(offset, offset + len);
        }
        offset += len;
    }
    throw new Error("Transaction raw_data not found");
}

/** Encode signed Transaction: raw_data (as hex) + signature(s) (hex array) -> broadcast hex. */
export function encodeSignedTransaction(rawDataHex: string, signatures: string[]): string {
    const rawBytes = hexToBytes(rawDataHex);
    const buf: number[] = [];
    // Field 1: raw_data (length-delimited)
    buf.push((TRX_FIELD_RAW << 3) | WIRE_LENGTH_DELIMITED);
    writeVarint(buf, rawBytes.length);
    for (let i = 0; i < rawBytes.length; i++) buf.push(rawBytes[i]!);
    // Field 2: each signature
    for (const sigHex of signatures) {
        const sig = hexToBytes(sigHex.startsWith("0x") ? sigHex.slice(2) : sigHex);
        buf.push((TRX_FIELD_SIGNATURE << 3) | WIRE_LENGTH_DELIMITED);
        writeVarint(buf, sig.length);
        for (let i = 0; i < sig.length; i++) buf.push(sig[i]!);
    }
    return bytesToHex(new Uint8Array(buf));
}

