import * as z from "zod";
import { EvmBlockchainSchema, EvmNetworkSchema } from "../../internal/blockchains.js";

/** Private key as hex (with or without 0x). Never use env – pass as parameter only. */
const PrivateKeyHex = z.string().min(1).describe("EVM private key (hex, with or without 0x prefix)");

/** Sign from raw unsigned transaction hex (e.g. from prepare API). blockchain+network validate the tx chain. */
export const EvmSignUnsignedHexSchema = z.object({
    action: z.literal("sign-unsigned-hex").describe("Sign a pre-built unsigned transaction hex"),
    privateKey: PrivateKeyHex,
    blockchain: EvmBlockchainSchema.describe("Blockchain protocol (e.g. ethereum, polygon)"),
    network: EvmNetworkSchema.describe("Network name (e.g. mainnet, sepolia); must match tx chainId"),
    unsignedTransactionHex: z.string().min(1).describe("Unsigned raw transaction hex (from prepare or built locally)"),
});

/** Sign from detailed transaction fields (to, value, gas, fee, etc.). */
export const EvmSignFromDetailsSchema = z.object({
    action: z.literal("sign-from-details").describe("Build and sign from transaction details"),
    privateKey: PrivateKeyHex,
    blockchain: EvmBlockchainSchema.describe("Blockchain protocol (e.g. ethereum, polygon)"),
    network: EvmNetworkSchema.describe("Network name (e.g. mainnet, sepolia, amoy)"),
    toAddress: z.string().describe("Recipient address (empty string for contract creation)"),
    value: z.string().describe("Value in wei (hex or decimal string)"),
    nonce: z.number().int().min(0).optional(),
    gasLimit: z.string().optional().describe("Gas limit (hex or decimal string)"),
    gasPrice: z.string().optional().describe("Gas price in wei for legacy (type 0) tx"),
    maxFeePerGas: z.string().optional().describe("Max fee per gas for EIP-1559 (type 2) tx"),
    maxPriorityFeePerGas: z.string().optional().describe("Max priority fee per gas for EIP-1559 (type 2) tx"),
    data: z.string().optional().describe("Input data hex (e.g. contract call)"),
    type: z.union([z.literal(0), z.literal(2)]).optional().describe("0 = legacy, 2 = EIP-1559 (default 0)"),
});

/**
 * Sign an EIP-712 typed-data message (NOT a transaction) — the x402 gasless path.
 * The buyer service's `/authorize` returns `{ domain, types, primaryType, message }`
 * for the `eip712` scheme (an EIP-3009 `TransferWithAuthorization`); pass it here
 * verbatim and this signs it, producing the 65-byte signature the facilitator's
 * `/verify` recovers. No on-chain tx is built — the buyer authorizes off-chain and
 * the facilitator's gas wallet submits the actual transfer.
 */
export const EvmSignTypedDataSchema = z.object({
    action: z.literal("sign-typed-data").describe("Sign an EIP-712 typed-data message (e.g. x402 EIP-3009 TransferWithAuthorization)"),
    privateKey: PrivateKeyHex,
    domain: z.record(z.string(), z.unknown()).describe("EIP-712 domain (name, version, chainId, verifyingContract) — from the /authorize signingPayload"),
    types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() })))
        .describe("EIP-712 type definitions (e.g. { TransferWithAuthorization: [...] }); the EIP712Domain entry is added automatically, do NOT include it"),
    primaryType: z.string().min(1).describe("The primary type to sign (e.g. TransferWithAuthorization)"),
    message: z.record(z.string(), z.unknown()).describe("The typed-data message values — from the /authorize signingPayload"),
});

export const EvmSignToolSchema = z.discriminatedUnion("action", [
    EvmSignUnsignedHexSchema,
    EvmSignFromDetailsSchema,
    EvmSignTypedDataSchema,
]);

export type EvmSignToolInput = z.infer<typeof EvmSignToolSchema>;
export type EvmSignUnsignedHexInput = z.infer<typeof EvmSignUnsignedHexSchema>;
export type EvmSignFromDetailsInput = z.infer<typeof EvmSignFromDetailsSchema>;
export type EvmSignTypedDataInput = z.infer<typeof EvmSignTypedDataSchema>;

