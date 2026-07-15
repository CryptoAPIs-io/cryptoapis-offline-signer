import * as z from "zod";

/** Tron private key (hex). Never use env – pass as parameter only. */
const PrivateKeyHex = z.string().min(1).describe("Tron private key (hex, with or without 0x prefix)");

/** Sign from transaction details (unsigned transaction object, e.g. from Tron node or prepare). */
export const TronSignFromDetailsSchema = z.object({
    action: z.literal("sign-from-details").describe("Build and sign from transaction object"),
    privateKey: PrivateKeyHex,
    transaction: z.record(z.unknown()).describe("Unsigned transaction object to sign (JSON)"),
});

/** Sign from raw unsigned transaction hex. */
export const TronSignUnsignedHexSchema = z.object({
    action: z.literal("sign-unsigned-hex").describe("Sign a pre-built unsigned transaction hex"),
    privateKey: PrivateKeyHex,
    unsignedTransactionHex: z.string().min(1).describe("Unsigned raw transaction hex (Tron serialized form)"),
});

export const TronSignToolSchema = z.discriminatedUnion("action", [
    TronSignFromDetailsSchema,
    TronSignUnsignedHexSchema,
]);

export type TronSignToolInput = z.infer<typeof TronSignToolSchema>;
export type TronSignFromDetailsInput = z.infer<typeof TronSignFromDetailsSchema>;
export type TronSignUnsignedHexInput = z.infer<typeof TronSignUnsignedHexSchema>;