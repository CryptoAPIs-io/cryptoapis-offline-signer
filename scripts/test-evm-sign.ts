/**
 * EVM signing correctness smoke test — imports from the PUBLIC built API.
 *
 * Builds an unsigned Base Sepolia (EIP-1559) tx, signs it offline with a known
 * throwaway key, then RECOVERS the sender from the signed tx and asserts it
 * matches the key's address. This proves the signature is cryptographically
 * valid, not merely that the call returned a string. No funds, no network.
 *
 *   npm run test:evm
 */
import { Transaction, Wallet, computeAddress } from "ethers";
import { evmSignUnsignedHex, getChainIdForNetwork } from "../dist/index.js";

// Throwaway key — DO NOT fund. Public, for test only.
const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

async function main() {
    const chainId = BigInt(getChainIdForNetwork("base", "sepolia"));
    const expectedFrom = computeAddress(PRIVATE_KEY);

    const unsigned = Transaction.from({
        type: 2,
        chainId,
        nonce: 0,
        to: "0x0000000000000000000000000000000000000002",
        value: 0n,
        gasLimit: 21000n,
        maxFeePerGas: 30n * 10n ** 9n,
        maxPriorityFeePerGas: 1n * 10n ** 9n,
    });
    const unsignedHex = unsigned.unsignedSerialized.replace(/^0x/, "");

    const { signedTransactionHex } = await evmSignUnsignedHex({
        action: "sign-unsigned-hex",
        privateKey: PRIVATE_KEY,
        blockchain: "base",
        network: "sepolia",
        unsignedTransactionHex: unsignedHex,
    });

    const parsed = Transaction.from("0x" + signedTransactionHex);
    console.log("chainId          :", chainId.toString());
    console.log("expected from    :", expectedFrom);
    console.log("recovered from   :", parsed.from);
    console.log("signature present:", parsed.signature != null);

    if (parsed.from?.toLowerCase() !== expectedFrom.toLowerCase()) {
        throw new Error(`Recovered sender ${parsed.from} != expected ${expectedFrom}`);
    }
    if (parsed.chainId !== chainId) {
        throw new Error(`chainId mismatch: ${parsed.chainId} != ${chainId}`);
    }
    // Sanity: ethers Wallet produces the same signed hex.
    const ref = (await new Wallet(PRIVATE_KEY).signTransaction(unsigned)).replace(/^0x/, "");
    if (ref !== signedTransactionHex) {
        throw new Error("Signed hex differs from ethers reference signing");
    }
    console.log("\n✅ EVM offline signing verified — recovered sender matches, valid signature, matches ethers reference.");
}

main().catch((e) => {
    console.error("❌", e);
    process.exit(1);
});
