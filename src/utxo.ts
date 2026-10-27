/** UTXO offline signing — bitcoin, bitcoin-cash, litecoin, dogecoin, dash, zcash. */
export { runFromDetails as utxoSignFromDetails, runUnsignedHex as utxoSignUnsignedHex } from "./chains/utxo/index.js";
export type { UtxoSignFromDetailsInput, UtxoSignUnsignedHexInput } from "./chains/utxo/schema.js";
// The bitcoinjs-lib `Network` params per chain — useful to callers that build/verify UTXO
// transactions or derive addresses for a specific chain (e.g. picking the right key/address version).
export { getNetworkForUtxo } from "./chains/utxo/utxo-networks.js";
// The Zcash consensus branch ID that utxoSignFromDetails uses for a given targetHeight — lets a
// caller check which network upgrade a transaction will be signed for.
export { zcashConsensusBranchIdForHeight } from "./chains/utxo/zcash-network-upgrades.js";
export { UTXO_BLOCKCHAINS } from "./internal/blockchains.js";
export type { UtxoBlockchainName, UtxoNetworkName } from "./internal/blockchains.js";
