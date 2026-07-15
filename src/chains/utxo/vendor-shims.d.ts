/**
 * Ambient declarations for the UTXO signing libs that ship no TypeScript types.
 * These are BCH- and Zcash-specific forks used only inside bch-sign.ts / zcash-sign.ts;
 * the surface we use is narrow, so a permissive `any`-typed default export is enough.
 */
declare module "bitcore-lib-cash" {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bch: any;
    export default bch;
}

declare module "zcashcore-lib" {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zcashcore: any;
    export default zcashcore;
}
