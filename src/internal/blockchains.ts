import * as z from "zod";

/**
 * Global blockchain → network mapping for CryptoAPIs.
 * This is the source of truth for valid blockchain/network combinations.
 */
export const BLOCKCHAIN_NETWORKS = {
    // EVM blockchains
    ethereum: ["mainnet", "sepolia"],
    "ethereum-classic": ["mainnet", "mordor"],
    "binance-smart-chain": ["mainnet", "testnet"],
    polygon: ["mainnet", "amoy"],
    tron: ["mainnet", "nile"],
    avalanche: ["mainnet", "fuji"],
    arbitrum: ["mainnet", "sepolia"],
    base: ["mainnet", "sepolia"],
    optimism: ["mainnet", "sepolia"],

    // UTXO blockchains
    bitcoin: ["mainnet", "testnet"],
    "bitcoin-cash": ["mainnet", "testnet"],
    litecoin: ["mainnet", "testnet"],
    dogecoin: ["mainnet", "testnet"],
    dash: ["mainnet", "testnet"],
    zcash: ["mainnet", "testnet"],
} as const;

export type BlockchainName = keyof typeof BLOCKCHAIN_NETWORKS;
export type NetworkName = (typeof BLOCKCHAIN_NETWORKS)[BlockchainName][number];

/** EVM-only blockchains (subset of BLOCKCHAIN_NETWORKS). */
export const EVM_BLOCKCHAINS = [
    "ethereum",
    "ethereum-classic",
    "binance-smart-chain",
    "polygon",
    "avalanche",
    "arbitrum",
    "base",
    "optimism",
    "tron",
] as const;

export type EvmBlockchainName = (typeof EVM_BLOCKCHAINS)[number];

/** Network names used by EVM blockchains (union of all EVM network arrays). */
export const EVM_NETWORKS = ["mainnet", "sepolia", "mordor", "testnet", "nile", "amoy", "fuji"] as const;

export type EvmNetworkName = (typeof EVM_NETWORKS)[number];

/**
 * EVM chain ID per (blockchain, network). Used by signer and any tool that needs chainId from human-readable names.
 */
export const EVM_NETWORK_CHAIN_IDS: Record<EvmBlockchainName, Partial<Record<EvmNetworkName, number>>> = {
    ethereum: { mainnet: 1, sepolia: 11155111 },
    "ethereum-classic": { mainnet: 61, mordor: 63 },
    "binance-smart-chain": { mainnet: 56, testnet: 97 },
    polygon: { mainnet: 137, amoy: 80002 },
    avalanche: { mainnet: 43114, fuji: 43113 },
    arbitrum: { mainnet: 42161, sepolia: 421614 },
    base: { mainnet: 8453, sepolia: 84532 },
    optimism: { mainnet: 10, sepolia: 11155420 },
    tron: { mainnet: 728126428, nile: 201910292 },
};

export function getChainIdForNetwork(blockchain: EvmBlockchainName, network: EvmNetworkName): number {
    const chain = EVM_NETWORK_CHAIN_IDS[blockchain];
    if (!chain) {
        throw new Error(`Unsupported EVM blockchain: ${blockchain}. Supported: ${EVM_BLOCKCHAINS.join(", ")}`);
    }
    const chainId = chain[network];
    if (chainId == null) {
        throw new Error(
            `Unsupported network "${network}" for ${blockchain}. Supported: ${Object.keys(chain).join(", ")}`
        );
    }
    return chainId;
}

/** Zod enums for tools that need blockchain/network validation (e.g. mcp-signer). */
export const EvmBlockchainSchema = z.enum(EVM_BLOCKCHAINS);
export const EvmNetworkSchema = z.enum(EVM_NETWORKS);

/** UTXO-only blockchains (subset of BLOCKCHAIN_NETWORKS). */
export const UTXO_BLOCKCHAINS = [
    "bitcoin",
    "bitcoin-cash",
    "litecoin",
    "dogecoin",
    "dash",
    "zcash",
] as const;

export type UtxoBlockchainName = (typeof UTXO_BLOCKCHAINS)[number];

/** Network names used by UTXO blockchains. */
export const UTXO_NETWORKS = ["mainnet", "testnet"] as const;

export type UtxoNetworkName = (typeof UTXO_NETWORKS)[number];

/** Zod enums for UTXO tools (e.g. mcp-signer utxo_sign). */
export const UtxoBlockchainSchema = z.enum(UTXO_BLOCKCHAINS);
export const UtxoNetworkSchema = z.enum(UTXO_NETWORKS);

/** XRP (Ripple) network names. */
export const XRP_NETWORKS = ["mainnet", "testnet"] as const;

export type XrpNetworkName = (typeof XRP_NETWORKS)[number];

export const XrpNetworkSchema = z.enum(XRP_NETWORKS);

/**
 * Formatted description of blockchain → network mapping for tool descriptions.
 */
export const BLOCKCHAIN_NETWORK_DESCRIPTION = `Blockchain → Networks:
• ethereum: mainnet, sepolia
• ethereum-classic: mainnet, mordor
• binance-smart-chain: mainnet, testnet
• polygon: mainnet, amoy
• tron: mainnet, nile
• avalanche (C-Chain): mainnet, fuji
• arbitrum: mainnet, sepolia
• base: mainnet, sepolia
• optimism: mainnet, sepolia
• bitcoin: mainnet, testnet
• bitcoin-cash: mainnet, testnet
• litecoin: mainnet, testnet
• dogecoin: mainnet, testnet
• dash: mainnet, testnet
• zcash: mainnet, testnet`;

/**
 * EVM-only blockchain → network description.
 */
export const EVM_BLOCKCHAIN_NETWORK_DESCRIPTION = `Blockchain → Networks:
• ethereum: mainnet, sepolia
• ethereum-classic: mainnet, mordor
• binance-smart-chain: mainnet, testnet
• polygon: mainnet, amoy
• tron: mainnet, nile
• avalanche (C-Chain): mainnet, fuji
• arbitrum: mainnet, sepolia
• base: mainnet, sepolia
• optimism: mainnet, sepolia`;

/**
 * UTXO-only blockchain → network description.
 */
export const UTXO_BLOCKCHAIN_NETWORK_DESCRIPTION = `Blockchain → Networks:
• bitcoin: mainnet, testnet
• bitcoin-cash: mainnet, testnet
• litecoin: mainnet, testnet
• dogecoin: mainnet, testnet
• dash: mainnet, testnet
• zcash: mainnet, testnet`;

