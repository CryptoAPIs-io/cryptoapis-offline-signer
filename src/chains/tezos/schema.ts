import * as z from "zod";

/** Tezos secret key (edsk… / spsk… / p2sk…). Never use env – pass as parameter only. */
const SecretKey = z
    .string()
    .min(1)
    .describe("Tezos secret key: edsk… (tz1, ed25519), spsk… (tz2, secp256k1) or p2sk… (tz3, P-256). Unencrypted only.");

/**
 * What the forged operation must contain. Every field given is checked against the decoded
 * bytes before signing; a mismatch refuses to sign. Pass the values you asked the API for
 * (e.g. from prepare-transactions), not values read back from the same response.
 */
export const TezosExpectedSchema = z
    .object({
        destination: z.string().optional().describe("Destination of the transaction op (tz…/KT1…); for token transfers, the token contract"),
        amount: z.string().regex(/^\d+$/).optional().describe("Amount of the transaction op in mutez (integer string)"),
        maxFee: z.string().regex(/^\d+$/).optional().describe("Upper bound for the total fee of all ops, in mutez (integer string)"),
    })
    .strict();

export const TezosSignForgedOperationSchema = z.object({
    action: z.literal("sign-forged-operation").describe("Verify and sign a forged Tezos operation (hex)"),
    secretKey: SecretKey,
    forgedOperation: z
        .string()
        .regex(/^(0x)?[0-9a-fA-F]+$/)
        .describe("Forged (binary-encoded, unsigned) operation hex, e.g. prepare-transactions' forgedOperation"),
    expected: TezosExpectedSchema.optional().describe("Fields the operation must match before it is signed"),
});

export const TezosSignToolSchema = z.discriminatedUnion("action", [TezosSignForgedOperationSchema]);

export type TezosSignToolInput = z.infer<typeof TezosSignToolSchema>;
export type TezosSignForgedOperationInput = Omit<z.infer<typeof TezosSignForgedOperationSchema>, "action">;
export type TezosExpected = z.infer<typeof TezosExpectedSchema>;

export type TezosSignResult = {
    /** Base58 signature: edsig… / spsig1… / p2sig… */
    signature: string;
    /** Raw 64-byte signature, hex. */
    signatureHex: string;
    /** forgedOperation + signature: the hex to broadcast. */
    signedOperation: string;
    /** Operation hash (o…), as the chain will report it. */
    operationHash: string;
    /** Signer address (tz1/tz2/tz3) derived from the key. */
    address: string;
    /** Signer public key (edpk/sppk/p2pk). */
    publicKey: string;
    /** The decoded operation that was signed. */
    contents: Array<Record<string, unknown>>;
};
