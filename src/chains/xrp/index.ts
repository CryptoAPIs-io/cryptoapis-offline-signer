import type {
    XrpSignFromDetailsInput,
    XrpSignToolInput,
    XrpSignUnsignedHexInput,
} from "./schema.js";
import { XrpSignToolSchema } from "./schema.js";

export async function xrpSignFromDetails(
    input: XrpSignFromDetailsInput
): Promise<{ signedTransactionHex: string; signedTransactionHash: string }> {
    const { Wallet } = await import("xrpl");
    const wallet = Wallet.fromSeed(input.secret);
    const signed = wallet.sign(input.transaction as Parameters<typeof wallet.sign>[0]);
    return {
        signedTransactionHex: signed.tx_blob,
        signedTransactionHash: signed.hash,
    };
}

async function xrpSignUnsignedHex(
    input: XrpSignUnsignedHexInput
): Promise<{ signedTransactionHex: string; signedTransactionHash: string }> {
    const xrpl = await import("xrpl");
    const hex = input.unsignedTransactionHex.startsWith("0x") ? input.unsignedTransactionHex.slice(2) : input.unsignedTransactionHex;
    const txObj = xrpl.decode(hex) as Parameters<InstanceType<typeof xrpl.Wallet>["sign"]>[0];
    const wallet = xrpl.Wallet.fromSeed(input.secret);
    const signed = wallet.sign(txObj);
    return {
        signedTransactionHex: signed.tx_blob,
        signedTransactionHash: signed.hash,
    };
}
