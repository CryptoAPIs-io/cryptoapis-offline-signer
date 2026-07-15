import * as z from "zod";
import { XrpNetworkSchema } from "../../internal/blockchains.js";

/** XRP secret (base58 seed, e.g. s...). Never use env – pass as parameter only. */
const Secret = z.string().min(1).describe("XRP secret / seed (base58, e.g. s...)");

/** Sign from transaction details (unsigned transaction object). */
export const XrpSignFromDetailsSchema = z.object({
    action: z.literal("sign-from-details").describe("Build and sign from transaction object"),
    secret: Secret,
    transaction: z.record(z.unknown()).describe("Unsigned XRP transaction (JSON, e.g. TransactionType, Account, Destination, Amount, Fee, Sequence)"),
    network: XrpNetworkSchema.optional().describe("Network (mainnet or testnet); optional"),
});

/** Sign from raw unsigned transaction hex (XRPL serialized form). */
export const XrpSignUnsignedHexSchema = z.object({
    action: z.literal("sign-unsigned-hex").describe("Sign a pre-built unsigned transaction hex"),
    secret: Secret,
    unsignedTransactionHex: z.string().min(1).describe("Unsigned transaction hex (XRPL binary codec serialized)"),
    network: XrpNetworkSchema.optional().describe("Network (mainnet or testnet); optional"),
});

export const XrpSignToolSchema = z.discriminatedUnion("action", [
    XrpSignFromDetailsSchema,
    XrpSignUnsignedHexSchema,
]);

export type XrpSignToolInput = z.infer<typeof XrpSignToolSchema>;
export type XrpSignFromDetailsInput = z.infer<typeof XrpSignFromDetailsSchema>;
export type XrpSignUnsignedHexInput = z.infer<typeof XrpSignUnsignedHexSchema>;
