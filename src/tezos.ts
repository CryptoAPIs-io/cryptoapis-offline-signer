/** Tezos offline signing (tz1 ed25519, tz2 secp256k1, tz3 P-256). */
export { tezosKeyInfo, tezosSignForgedOperation } from "./chains/tezos/index.js";
export type { TezosExpected, TezosSignForgedOperationInput, TezosSignResult } from "./chains/tezos/schema.js";
