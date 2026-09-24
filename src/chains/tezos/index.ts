import type { TezosExpected, TezosSignForgedOperationInput, TezosSignResult } from "./schema.js";

/** Generic-operation watermark: prepended to the forged bytes before hashing and signing. */
const GENERIC_OPERATION_WATERMARK = 0x03;

/** Operation kinds this signer will sign. Anything else (delegation, origination, …) is refused. */
const SIGNABLE_KINDS = new Set(["reveal", "transaction"]);

type Curve = "ed25519" | "secp256k1" | "p256";

type TezosKey = {
    curve: Curve;
    /** 32-byte secret: the ed25519 seed or the ECDSA scalar. */
    secret: Uint8Array;
    publicKey: string;
    address: string;
};

function stripHex(hex: string): string {
    return (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();
}

function toHex(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("hex");
}

/** Decode an edsk/spsk/p2sk secret key and derive its public key and tz1/tz2/tz3 address. */
async function loadKey(secretKey: string): Promise<TezosKey> {
    const { b58DecodeAndCheckPrefix, b58Encode, PrefixV2 } = await import("@taquito/utils");
    const { blake2b } = await import("@noble/hashes/blake2.js");
    const allowed = [PrefixV2.Ed25519Seed, PrefixV2.Ed25519SecretKey, PrefixV2.Secp256k1SecretKey, PrefixV2.P256SecretKey] as const;
    let decoded: Uint8Array;
    let prefix: (typeof allowed)[number];
    try {
        [decoded, prefix] = b58DecodeAndCheckPrefix(secretKey, allowed);
    } catch (err) {
        throw new Error(
            `Unsupported Tezos secret key: expected an unencrypted edsk…, spsk… or p2sk… key (${err instanceof Error ? err.message : String(err)})`,
        );
    }

    if (prefix === PrefixV2.Ed25519Seed || prefix === PrefixV2.Ed25519SecretKey) {
        const { ed25519 } = await import("@noble/curves/ed25519.js");
        // A 64-byte edsk is seed || public key; the seed is what signs.
        const seed = decoded.slice(0, 32);
        const pk = ed25519.getPublicKey(seed);
        return {
            curve: "ed25519",
            secret: seed,
            publicKey: b58Encode(pk, PrefixV2.Ed25519PublicKey),
            address: b58Encode(blake2b(pk, { dkLen: 20 }), PrefixV2.Ed25519PublicKeyHash),
        };
    }
    if (prefix === PrefixV2.Secp256k1SecretKey) {
        const { secp256k1 } = await import("@noble/curves/secp256k1.js");
        const pk = secp256k1.getPublicKey(decoded, true);
        return {
            curve: "secp256k1",
            secret: decoded,
            publicKey: b58Encode(pk, PrefixV2.Secp256k1PublicKey),
            address: b58Encode(blake2b(pk, { dkLen: 20 }), PrefixV2.Secp256k1PublicKeyHash),
        };
    }
    const { p256 } = await import("@noble/curves/nist.js");
    const pk = p256.getPublicKey(decoded, true);
    return {
        curve: "p256",
        secret: decoded,
        publicKey: b58Encode(pk, PrefixV2.P256PublicKey),
        address: b58Encode(blake2b(pk, { dkLen: 20 }), PrefixV2.P256PublicKeyHash),
    };
}

/**
 * Refuse to sign unless the decoded operation is exactly what the caller expects: only
 * reveal/transaction ops, all from the signer's own address, a reveal (if any) of the
 * signer's own key, and matching expected destination / amount / fee cap.
 */
function checkContents(contents: Array<Record<string, unknown>>, key: TezosKey, expected?: TezosExpected): void {
    if (contents.length === 0) {
        throw new Error("Refusing to sign: the forged operation has no contents");
    }
    let totalFee = 0n;
    for (const op of contents) {
        const kind = String(op.kind);
        if (!SIGNABLE_KINDS.has(kind)) {
            throw new Error(`Refusing to sign: operation kind "${kind}" is not supported (only reveal and transaction)`);
        }
        if (op.source !== key.address) {
            throw new Error(`Refusing to sign: ${kind} source ${String(op.source)} is not the signing key's address ${key.address}`);
        }
        if (kind === "reveal" && op.public_key !== key.publicKey) {
            throw new Error(`Refusing to sign: reveal publishes ${String(op.public_key)}, not the signing key's public key`);
        }
        totalFee += BigInt(String(op.fee ?? "0"));
    }

    if (!expected) return;
    const transfers = contents.filter((op) => op.kind === "transaction");
    if ((expected.destination !== undefined || expected.amount !== undefined) && transfers.length !== 1) {
        throw new Error(`Refusing to sign: expected exactly one transaction op, found ${transfers.length}`);
    }
    const tx = transfers[0];
    if (expected.destination !== undefined && tx && tx.destination !== expected.destination) {
        throw new Error(`Refusing to sign: destination is ${String(tx.destination)}, expected ${expected.destination}`);
    }
    if (expected.amount !== undefined && tx && String(tx.amount) !== expected.amount) {
        throw new Error(`Refusing to sign: amount is ${String(tx.amount)} mutez, expected ${expected.amount}`);
    }
    if (expected.maxFee !== undefined && totalFee > BigInt(expected.maxFee)) {
        throw new Error(`Refusing to sign: total fee ${totalFee} mutez exceeds maxFee ${expected.maxFee}`);
    }
}

async function signDigest(key: TezosKey, digest: Uint8Array): Promise<Uint8Array> {
    if (key.curve === "ed25519") {
        const { ed25519 } = await import("@noble/curves/ed25519.js");
        return ed25519.sign(digest, key.secret);
    }
    // The digest is already blake2b-256: prehash must be off (noble v2 defaults to sha256).
    // Low-S, 64-byte compact r||s is what Tezos accepts.
    const opts = { prehash: false, lowS: true, format: "compact" } as const;
    if (key.curve === "secp256k1") {
        const { secp256k1 } = await import("@noble/curves/secp256k1.js");
        return secp256k1.sign(digest, key.secret, opts);
    }
    const { p256 } = await import("@noble/curves/nist.js");
    return p256.sign(digest, key.secret, opts);
}

/**
 * Verify and sign a forged Tezos operation (e.g. prepare-transactions' `forgedOperation`).
 *
 * The bytes are decoded and re-forged; they must round-trip exactly, contain only
 * reveal/transaction ops from the key's own address, and match `expected` when given.
 * Then: signature = sign(blake2b256(0x03 || forged)) with the key's curve.
 */
export async function tezosSignForgedOperation(input: TezosSignForgedOperationInput): Promise<TezosSignResult> {
    const { LocalForger } = await import("@taquito/local-forging");
    const { b58Encode, PrefixV2 } = await import("@taquito/utils");
    const { blake2b } = await import("@noble/hashes/blake2.js");

    const forgedHex = stripHex(input.forgedOperation);
    const key = await loadKey(input.secretKey);

    const forger = new LocalForger();
    let parsed: { branch: string; contents: Array<Record<string, unknown>> };
    try {
        parsed = (await forger.parse(forgedHex)) as unknown as typeof parsed;
    } catch (err) {
        throw new Error(`Refusing to sign: forgedOperation is not a valid Tezos operation (${err instanceof Error ? err.message : String(err)})`);
    }
    const reforged = await forger.forge(parsed as never);
    if (reforged.toLowerCase() !== forgedHex) {
        throw new Error("Refusing to sign: forgedOperation does not re-forge to the same bytes (unparsed or non-canonical content)");
    }
    checkContents(parsed.contents, key, input.expected);

    const forgedBytes = Buffer.from(forgedHex, "hex");
    const watermarked = new Uint8Array(1 + forgedBytes.length);
    watermarked[0] = GENERIC_OPERATION_WATERMARK;
    watermarked.set(forgedBytes, 1);
    const signatureBytes = await signDigest(key, blake2b(watermarked, { dkLen: 32 }));

    const signaturePrefix = {
        ed25519: PrefixV2.Ed25519Signature,
        secp256k1: PrefixV2.Secp256k1Signature,
        p256: PrefixV2.P256Signature,
    }[key.curve];
    const signedBytes = Buffer.concat([forgedBytes, Buffer.from(signatureBytes)]);

    return {
        signature: b58Encode(signatureBytes, signaturePrefix),
        signatureHex: toHex(signatureBytes),
        signedOperation: toHex(signedBytes),
        operationHash: b58Encode(blake2b(signedBytes, { dkLen: 32 }), PrefixV2.OperationHash),
        address: key.address,
        publicKey: key.publicKey,
        contents: parsed.contents,
    };
}

/** Derive the address and public key of a Tezos secret key (no signing). */
export async function tezosKeyInfo(secretKey: string): Promise<{ address: string; publicKey: string; curve: Curve }> {
    const key = await loadKey(secretKey);
    return { address: key.address, publicKey: key.publicKey, curve: key.curve };
}
