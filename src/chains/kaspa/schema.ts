import * as z from "zod";

/** Kaspa private key (hex). Never use env – pass as parameter only. */
const PrivateKeyHex = z.string().min(1).describe("Kaspa private key (hex, 32 bytes, with or without 0x prefix)");

/**
 * Sign from a prepared transaction object (e.g. `data.item` from the Kaspa
 * prepare-transaction API). Kaspa is a UTXO/blockDAG chain (schnorr signatures via
 * kaspa-wasm, mainnet only). Each input carries its prevout script + sompi value.
 */
export const KaspaSignFromDetailsSchema = z.object({
    action: z.literal("sign-from-details").describe("Build and sign from a prepared Kaspa transaction object"),
    privateKeys: z.array(PrivateKeyHex).min(1).describe("Array of hex private keys, one per input (same order as prepared tx inputs)"),
    preparedTransaction: z.record(z.unknown()).describe("Prepared transaction object (data.item from the Kaspa prepare-transaction API)"),
});

export const KaspaSignToolSchema = z.discriminatedUnion("action", [
    KaspaSignFromDetailsSchema,
]);

export type KaspaSignToolInput = z.infer<typeof KaspaSignToolSchema>;
export type KaspaSignFromDetailsInput = z.infer<typeof KaspaSignFromDetailsSchema>;
