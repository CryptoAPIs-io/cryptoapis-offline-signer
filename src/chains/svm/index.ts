import { Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { SvmSignPartialInput, SvmSignToolInput } from "./schema.js";
import { SvmSignToolSchema } from "./schema.js";

/**
 * Partial-sign the buyer's SVM x402 payment tx. Deserializes the base64 UNSIGNED
 * TransferChecked tx from `/authorize`, adds ONLY the source-authority (buyer)
 * signature, and re-serializes to base64 — the feePayer slot stays unsigned (the
 * facilitator signs that at settle). Non-custodial: the buyer's key never leaves
 * the client; the facilitator can't move the buyer's tokens, only sponsor the fee.
 *
 * @param input the base58 secret key + the base64 unsigned tx
 * @return the base64 partially-signed tx to return to /authorize's caller
 */
export function svmPartialSign(input: SvmSignPartialInput): { transaction: string } {
    const secret = bs58.decode(input.secretKeyBase58);
    const keypair = Keypair.fromSecretKey(secret);
    const tx = Transaction.from(Buffer.from(input.transaction, "base64"));
    // partialSign adds this signer's signature without requiring the others
    // (the feePayer slot is filled by the facilitator).
    tx.partialSign(keypair);
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return { transaction: Buffer.from(serialized).toString("base64") };
}
