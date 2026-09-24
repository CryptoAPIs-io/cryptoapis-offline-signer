/**
 * Tezos signing smoke test (no network). Imports the BUILT dist/, so run `npm run build` first.
 *
 * For tz1 (ed25519), tz2 (secp256k1) and tz3 (P-256) with fixed throwaway keys:
 *   - our address/public key match Taquito's InMemorySigner;
 *   - our signature over a forged reveal+transaction is byte-identical to Taquito's and
 *     verifies with Taquito's verifySignature;
 *   - the safety checks refuse: another source, wrong destination/amount, fee over maxFee,
 *     unsupported op kinds, trailing garbage, a reveal of a different key.
 */
import assert from "node:assert/strict";
import { InMemorySigner } from "@taquito/signer";
import { LocalForger } from "@taquito/local-forging";
import { b58Encode, PrefixV2, verifySignature } from "@taquito/utils";
import { tezosKeyInfo, tezosSignForgedOperation } from "../dist/tezos.js";

const BRANCH = "BLockGenesisGenesisGenesisGenesisGenesisf79b5d1CoW2";
const DEST = "tz1burnburnburnburnburnburnburjAYjjX";

const fixed = (n: number) => new Uint8Array(32).fill(n);
const KEYS = [
    { curve: "ed25519", sk: b58Encode(fixed(7), PrefixV2.Ed25519Seed) },
    { curve: "secp256k1", sk: b58Encode(fixed(9), PrefixV2.Secp256k1SecretKey) },
    { curve: "p256", sk: b58Encode(fixed(11), PrefixV2.P256SecretKey) },
];

const forger = new LocalForger();

async function forgeBatch(source: string, publicKey: string, over: Record<string, unknown> = {}) {
    return forger.forge({
        branch: BRANCH,
        contents: [
            { kind: "reveal", source, fee: "100", counter: "11", gas_limit: "1000", storage_limit: "0", public_key: publicKey },
            { kind: "transaction", source, fee: "400", counter: "12", gas_limit: "3000", storage_limit: "0", amount: "1000", destination: DEST, ...over },
        ],
    } as never);
}

async function refuses(p: Promise<unknown>, pattern: RegExp, label: string) {
    await assert.rejects(p, pattern, label);
    console.log(`    refuses: ${label}`);
}

let failures = 0;
for (const k of KEYS) {
    try {
        const taquito = await InMemorySigner.fromSecretKey(k.sk);
        const info = await tezosKeyInfo(k.sk);
        assert.equal(info.address, await taquito.publicKeyHash(), "address");
        assert.equal(info.publicKey, await taquito.publicKey(), "public key");

        const forged = await forgeBatch(info.address, info.publicKey);
        const ours = await tezosSignForgedOperation({
            secretKey: k.sk,
            forgedOperation: forged,
            expected: { destination: DEST, amount: "1000", maxFee: "500" },
        });
        const theirs = await taquito.sign(forged, new Uint8Array([3]));
        assert.equal(ours.signature, theirs.prefixSig, "signature must equal Taquito's");
        assert.equal(ours.signedOperation, theirs.sbytes, "signed bytes must equal Taquito's");
        assert.ok(verifySignature(`03${forged}`, info.publicKey, ours.signature), "Taquito verifies the signature");
        assert.match(ours.operationHash, /^o[1-9A-HJ-NP-Za-km-z]{50}$/, "operation hash format");
        console.log(`${k.curve}: ${info.address} signature matches Taquito, verifies`);

        const other = KEYS.find((x) => x !== k)!;
        const otherInfo = await tezosKeyInfo(other.sk);
        await refuses(tezosSignForgedOperation({ secretKey: other.sk, forgedOperation: forged }), /source .* is not the signing key/, "source is another address");
        await refuses(tezosSignForgedOperation({ secretKey: k.sk, forgedOperation: forged, expected: { destination: otherInfo.address } }), /destination/, "wrong destination");
        await refuses(tezosSignForgedOperation({ secretKey: k.sk, forgedOperation: forged, expected: { amount: "999" } }), /amount/, "wrong amount");
        await refuses(tezosSignForgedOperation({ secretKey: k.sk, forgedOperation: forged, expected: { maxFee: "499" } }), /maxFee/, "fee over maxFee");
        await refuses(tezosSignForgedOperation({ secretKey: k.sk, forgedOperation: `${forged}00` }), /re-forge|not a valid/, "trailing bytes");
        const badReveal = await forgeBatch(info.address, otherInfo.publicKey);
        await refuses(tezosSignForgedOperation({ secretKey: k.sk, forgedOperation: badReveal }), /reveal publishes/, "reveal of another key");
        const delegation = await forger.forge({
            branch: BRANCH,
            contents: [{ kind: "delegation", source: info.address, fee: "100", counter: "11", gas_limit: "1000", storage_limit: "0", delegate: DEST }],
        } as never);
        await refuses(tezosSignForgedOperation({ secretKey: k.sk, forgedOperation: delegation }), /not supported/, "delegation op");
    } catch (err) {
        failures += 1;
        console.error(`${k.curve}: FAILED`, err);
    }
}

await assert.rejects(tezosKeyInfo("edesk1notarealencryptedkey"), /Unsupported Tezos secret key/);
console.log("rejects encrypted / malformed keys");

if (failures > 0) {
    console.error(`${failures} curve(s) failed`);
    process.exit(1);
}
console.log("All Tezos signing checks passed.");
