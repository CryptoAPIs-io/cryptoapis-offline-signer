import * as z from "zod";

/**
 * Solana (SVM) signing for the x402 gasless path. The buyer service's `/authorize`
 * (scheme `svm-transaction`) returns a base64 UNSIGNED TransferChecked tx whose
 * feePayer is the facilitator; the buyer must **partial-sign it as the source
 * authority** and return the base64 tx (the feePayer slot stays unsigned — the
 * facilitator adds that at settle). This is a PARTIAL sign: it never requires all
 * signatures and does not broadcast.
 */
export const SvmSignTypedSchema = z.object({
    action: z.literal("partial-sign").describe("Partial-sign a base64 unsigned tx as the source authority (x402 svm-transaction)"),
    /** Base58 secret key (the 64-byte ed25519 secret, base58-encoded — the standard Solana keypair form). */
    secretKeyBase58: z.string().min(1).describe("Solana secret key, base58-encoded (the 64-byte keypair secret). Never from env — pass as parameter."),
    transaction: z.string().min(1).describe("Base64 unsigned tx from the buyer /authorize signingPayload.transaction"),
});

export const SvmSignToolSchema = z.discriminatedUnion("action", [
    SvmSignTypedSchema,
]);

export type SvmSignToolInput = z.infer<typeof SvmSignToolSchema>;
export type SvmSignPartialInput = z.infer<typeof SvmSignTypedSchema>;
