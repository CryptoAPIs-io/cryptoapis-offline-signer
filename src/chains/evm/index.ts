import { getChainIdForNetwork } from "../../internal/blockchains.js";
import { Transaction, Wallet, type TypedDataDomain, type TypedDataField } from "ethers";
import type { EvmSignFromDetailsInput, EvmSignToolInput, EvmSignTypedDataInput, EvmSignUnsignedHexInput } from "./schema.js";
import { EvmSignToolSchema } from "./schema.js";

function toBigInt(s: string): bigint {
    if (s.startsWith("0x") || s.startsWith("0X")) return BigInt(s);
    return BigInt(s);
}

/** Sign from unsigned tx hex. Exported for scripts; tool uses action "sign-unsigned-hex". */
export async function evmSign(input: {
    privateKey: string;
    unsignedTransactionHex: string;
    blockchain: EvmSignUnsignedHexInput["blockchain"];
    network: EvmSignUnsignedHexInput["network"];
}): Promise<{ signedTransactionHex: string }> {
    return evmSignUnsignedHex({
        action: "sign-unsigned-hex",
        privateKey: input.privateKey,
        blockchain: input.blockchain,
        network: input.network,
        unsignedTransactionHex: input.unsignedTransactionHex,
    });
}

export async function evmSignUnsignedHex(input: EvmSignUnsignedHexInput): Promise<{ signedTransactionHex: string }> {
    const hex = input.unsignedTransactionHex.startsWith("0x") ? input.unsignedTransactionHex : `0x${input.unsignedTransactionHex}`;
    const key = input.privateKey.startsWith("0x") ? input.privateKey : `0x${input.privateKey}`;
    const expectedChainId = BigInt(getChainIdForNetwork(input.blockchain, input.network));
    const unsignedTx = Transaction.from(hex);
    if (unsignedTx.chainId !== expectedChainId) {
        throw new Error(
            `Transaction chainId ${unsignedTx.chainId} does not match ${input.blockchain}/${input.network} (expected ${expectedChainId})`
        );
    }
    const wallet = new Wallet(key);
    const signedTx = await wallet.signTransaction(unsignedTx);
    const signedTransactionHex = signedTx.startsWith("0x") ? signedTx.slice(2) : signedTx;
    return { signedTransactionHex };
}

export async function evmSignFromDetails(input: EvmSignFromDetailsInput): Promise<{ signedTransactionHex: string }> {
    const key = input.privateKey.startsWith("0x") ? input.privateKey : `0x${input.privateKey}`;
    const wallet = new Wallet(key);
    const chainId = BigInt(getChainIdForNetwork(input.blockchain, input.network));
    const value = toBigInt(input.value);
    const to = input.toAddress && input.toAddress !== "" ? input.toAddress : undefined;
    const type = input.type ?? 0;
    const txLike: Parameters<typeof Transaction.from>[0] = {
        type,
        chainId,
        to,
        value,
        nonce: input.nonce,
        data: input.data ?? "0x",
        gasLimit: input.gasLimit != null ? toBigInt(input.gasLimit) : undefined,
    };
    if (type === 0) {
        if (input.gasPrice != null) txLike.gasPrice = toBigInt(input.gasPrice);
    } else {
        if (input.maxFeePerGas != null) txLike.maxFeePerGas = toBigInt(input.maxFeePerGas);
        if (input.maxPriorityFeePerGas != null) txLike.maxPriorityFeePerGas = toBigInt(input.maxPriorityFeePerGas);
    }
    const unsignedTx = Transaction.from(txLike);
    const signedTx = await wallet.signTransaction(unsignedTx);
    const signedTransactionHex = signedTx.startsWith("0x") ? signedTx.slice(2) : signedTx;
    return { signedTransactionHex };
}

/**
 * Sign an EIP-712 typed-data message (the x402 gasless path). Pass the
 * `{ domain, types, primaryType, message }` returned by the buyer's `/authorize`
 * (scheme `eip712`, an EIP-3009 `TransferWithAuthorization`). ethers derives the
 * domain separator + struct hash and returns the 65-byte signature the
 * facilitator's `/verify` recovers against `from`. No tx is built or broadcast.
 */
export async function evmSignTypedData(input: EvmSignTypedDataInput): Promise<{ signature: string }> {
    const key = input.privateKey.startsWith("0x") ? input.privateKey : `0x${input.privateKey}`;
    const wallet = new Wallet(key);
    // ethers signTypedData(domain, types, value) — the EIP712Domain entry must NOT
    // be in `types` (ethers adds it from `domain`); the /authorize payload omits it.
    const types = { ...input.types } as Record<string, TypedDataField[]>;
    delete types.EIP712Domain;
    const signature = await wallet.signTypedData(
        input.domain as TypedDataDomain,
        types,
        input.message as Record<string, unknown>
    );
    return { signature };
}
