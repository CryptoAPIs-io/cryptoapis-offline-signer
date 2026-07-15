import * as z from "zod";
import { UtxoBlockchainSchema, UtxoNetworkSchema } from "../../internal/blockchains.js";

/** WIF private key. Never use env – pass as parameter only. */
const WifKey = z.string().min(1).describe("Private key in WIF format");

/** One input descriptor for signing (prevout script + value). */
const UtxoInputDescriptor = z.object({
    transactionId: z.string().min(1).describe("Previous output txid (hex)"),
    outputIndex: z.number().int().min(0).describe("Previous output index"),
    script: z.string().min(1).describe("Previous output scriptPubKey (hex, with or without 0x)"),
    satoshis: z.number().int().min(0).describe("Previous output value in satoshis"),
});

/** Sign from prepared transaction object (e.g. from HD wallet prepare-transaction API). */
export const UtxoSignFromDetailsSchema = z.object({
    action: z.literal("sign-from-details").describe("Build and sign from prepared transaction object"),
    blockchain: UtxoBlockchainSchema.describe("UTXO blockchain (bitcoin, bitcoin-cash, litecoin, dogecoin, dash, zcash)"),
    network: UtxoNetworkSchema.describe("Network (mainnet or testnet)"),
    privateKeys: z.array(WifKey).min(1).describe("Array of WIF private keys, one per input (same order as prepared tx inputs)"),
    preparedTransaction: z.record(z.unknown()).describe("Prepared transaction object (data.item from prepare-transaction API)"),
});

/** Sign from raw unsigned transaction hex (inputs metadata required for signing). */
export const UtxoSignUnsignedHexSchema = z.object({
    action: z.literal("sign-unsigned-hex").describe("Sign a pre-built unsigned transaction hex"),
    blockchain: UtxoBlockchainSchema.describe("UTXO blockchain (bitcoin, bitcoin-cash, litecoin, dogecoin, dash, zcash)"),
    network: UtxoNetworkSchema.describe("Network (mainnet or testnet)"),
    privateKeys: z.array(WifKey).min(1).describe("Array of WIF private keys, one per input (same order as tx inputs)"),
    unsignedTransactionHex: z.string().min(1).describe("Unsigned raw transaction hex"),
    inputs: z.array(UtxoInputDescriptor).min(1).describe("Per-input metadata (script, satoshis) for each tx input, same order"),
});

export const UtxoSignToolSchema = z.discriminatedUnion("action", [
    UtxoSignFromDetailsSchema,
    UtxoSignUnsignedHexSchema,
]);

export type UtxoSignToolInput = z.infer<typeof UtxoSignToolSchema>;
export type UtxoSignFromDetailsInput = z.infer<typeof UtxoSignFromDetailsSchema>;
export type UtxoSignUnsignedHexInput = z.infer<typeof UtxoSignUnsignedHexSchema>;
