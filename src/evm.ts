/** EVM offline signing — ethereum, bsc, polygon, avalanche, arbitrum, base, optimism, tron (EVM). */
export { evmSign, evmSignUnsignedHex, evmSignFromDetails, evmSignTypedData } from "./chains/evm/index.js";
export type { EvmSignUnsignedHexInput, EvmSignFromDetailsInput, EvmSignTypedDataInput } from "./chains/evm/schema.js";
export { getChainIdForNetwork, EVM_BLOCKCHAINS } from "./internal/blockchains.js";
export type { EvmBlockchainName, EvmNetworkName } from "./internal/blockchains.js";
