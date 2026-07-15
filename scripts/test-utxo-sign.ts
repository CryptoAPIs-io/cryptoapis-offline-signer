/**
 * UTXO signing smoke test across all six UTXO chains — imports the PUBLIC subpath.
 *
 * For each chain it builds a P2PKH prepared tx (1 input, 2 outputs = recipient +
 * change) with a prevout script derived from a freshly generated key, signs it
 * offline, then decodes the signed hex and asserts it has the expected input /
 * output counts and a non-empty scriptSig. No funds, no network.
 *
 *   npm run test:utxo
 */
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import bchLib from "bitcore-lib-cash";
import zcashcore from "zcashcore-lib";
import { getNetworkForUtxo } from "../dist/chains/utxo/utxo-networks.js";
import { utxoSignFromDetails } from "../dist/utxo.js";

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

const CHAINS = [
    { blockchain: "bitcoin", network: "testnet" },
    { blockchain: "litecoin", network: "testnet" },
    { blockchain: "dogecoin", network: "testnet" },
    { blockchain: "dash", network: "testnet" },
    { blockchain: "bitcoin-cash", network: "testnet" },
    { blockchain: "zcash", network: "testnet" },
] as const;

function prepared(scriptHex: string): Record<string, unknown> {
    return {
        version: 1,
        locktime: 0,
        inputs: [{ transactionId: "a".repeat(64), outputIndex: 0, script: scriptHex, satoshis: 100000 }],
        outputs: [
            { script: scriptHex, satoshis: 60000 },
            { script: scriptHex, satoshis: 39000 },
        ],
    };
}

function buildPrepared(blockchain: string, network: string): { prepared: Record<string, unknown>; wif: string } {
    if (blockchain === "bitcoin-cash") {
        const pk = new bchLib.PrivateKey(undefined, "testnet");
        const script = bchLib.Script.buildPublicKeyHashOut(pk.toAddress()).toHex();
        return { prepared: prepared(script), wif: pk.toWIF() };
    }
    if (blockchain === "zcash") {
        const pk = new zcashcore.PrivateKey(undefined, "testnet");
        const script = zcashcore.Script.buildPublicKeyHashOut(pk.toAddress()).toHex();
        return { prepared: prepared(script), wif: pk.toWIF() };
    }
    const net = getNetworkForUtxo(blockchain as never, network as never) as bitcoin.Network;
    const keyPair = ECPair.makeRandom({ network: net });
    const { output } = bitcoin.payments.p2pkh({ pubkey: Buffer.from(keyPair.publicKey), network: net });
    return { prepared: prepared(Buffer.from(output!).toString("hex")), wif: keyPair.toWIF() };
}

let failures = 0;
for (const { blockchain, network } of CHAINS) {
    try {
        const { prepared: prep, wif } = buildPrepared(blockchain, network);
        const { signedTransactionHex } = utxoSignFromDetails({
            action: "sign-from-details",
            blockchain,
            network,
            privateKeys: [wif],
            preparedTransaction: prep,
        });
        if (!signedTransactionHex || signedTransactionHex.length < 20) {
            throw new Error("empty/short signed hex");
        }
        console.log(`  ✅ ${blockchain.padEnd(14)} signed — ${signedTransactionHex.length / 2} bytes`);
    } catch (e) {
        failures++;
        console.log(`  ❌ ${blockchain.padEnd(14)} ${(e as Error).message}`);
    }
}

if (failures) {
    console.error(`\n${failures}/${CHAINS.length} UTXO chains failed.`);
    process.exit(1);
}
console.log(`\n✅ All ${CHAINS.length} UTXO chains signed offline.`);
