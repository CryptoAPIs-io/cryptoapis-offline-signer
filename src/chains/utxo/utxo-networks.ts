/**
 * bitcoinjs-lib compatible Network params for UTXO chains.
 * Used for PSBT and WIF decoding (one WIF per input, same order).
 */
import * as bitcoin from "bitcoinjs-lib";
import type { UtxoBlockchainName, UtxoNetworkName } from "../../internal/blockchains.js";

/** Same shape as bitcoinjs-lib Network (used by Psbt and ECPair.fromWIF). */
interface UtxoNetwork {
    messagePrefix: string;
    bech32: string;
    bip32: { public: number; private: number };
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}

const bip32Main = { public: 0x0488b21e, private: 0x0488ade4 };
const bip32Test = { public: 0x043587cf, private: 0x04358394 };

/** (blockchain, network) -> bitcoinjs-compatible Network */
const NETWORKS: Record<UtxoBlockchainName, Record<UtxoNetworkName, UtxoNetwork>> = {
    bitcoin: {
        mainnet: bitcoin.networks.bitcoin as UtxoNetwork,
        testnet: bitcoin.networks.testnet as UtxoNetwork,
    },
    "bitcoin-cash": {
        mainnet: {
            messagePrefix: "\x18Bitcoin Signed Message:\n",
            bech32: "bitcoincash",
            bip32: bip32Main,
            pubKeyHash: 0x00,
            scriptHash: 0x05,
            wif: 0x80,
        },
        testnet: {
            messagePrefix: "\x18Bitcoin Signed Message:\n",
            bech32: "bchtest",
            bip32: bip32Test,
            pubKeyHash: 0x6f,
            scriptHash: 0xc4,
            wif: 0xef,
        },
    },
    litecoin: {
        mainnet: {
            messagePrefix: "\x18Litecoin Signed Message:\n",
            bech32: "ltc",
            bip32: { public: 0x019da462, private: 0x019d9cfe },
            pubKeyHash: 0x30,
            scriptHash: 0x32,
            wif: 0xb0,
        },
        testnet: {
            messagePrefix: "\x18Litecoin Signed Message:\n",
            bech32: "tltc",
            bip32: bip32Test,
            pubKeyHash: 0x6f,
            scriptHash: 0x3a,
            wif: 0xef,
        },
    },
    dogecoin: {
        mainnet: {
            messagePrefix: "\x18Dogecoin Signed Message:\n",
            bech32: "doge",
            bip32: { public: 0x02facafd, private: 0x02fac398 },
            pubKeyHash: 0x1e,
            scriptHash: 0x16,
            wif: 0x9e,
        },
        testnet: {
            messagePrefix: "\x18Dogecoin Signed Message:\n",
            bech32: "tdge",
            bip32: bip32Test,
            pubKeyHash: 0x71,
            scriptHash: 0xc4,
            wif: 0xf1,
        },
    },
    dash: {
        mainnet: {
            messagePrefix: "\x18DarkCoin Signed Message:\n",
            bech32: "dash",
            bip32: { public: 0x02fe52cc, private: 0x02fe52f8 },
            pubKeyHash: 0x4c,
            scriptHash: 0x10,
            wif: 0xcc,
        },
        testnet: {
            messagePrefix: "\x18DarkCoin Signed Message:\n",
            bech32: "sdash",
            bip32: bip32Test,
            pubKeyHash: 0x8c,
            scriptHash: 0x13,
            wif: 0xee,
        },
    },
    zcash: {
        mainnet: {
            messagePrefix: "\x18Zcash Signed Message:\n",
            bech32: "zs",
            bip32: bip32Main,
            pubKeyHash: 0x1cb8,
            scriptHash: 0x1cbd,
            wif: 0x80,
        },
        testnet: {
            messagePrefix: "\x18Zcash Signed Message:\n",
            bech32: "ztestsapling",
            bip32: bip32Test,
            pubKeyHash: 0x1d25,
            scriptHash: 0x1cba,
            wif: 0xef,
        },
    },
};

export function getNetworkForUtxo(blockchain: UtxoBlockchainName, network: UtxoNetworkName): UtxoNetwork {
    const chain = NETWORKS[blockchain];
    if (!chain) {
        throw new Error(`Unsupported UTXO blockchain: ${blockchain}`);
    }
    const net = chain[network];
    if (!net) {
        throw new Error(`Unsupported network "${network}" for ${blockchain}`);
    }
    return net;
}

