/**
 * Zcash network upgrades from NU5 on: consensus branch IDs and activation heights.
 *
 * A transparent Zcash signature commits to the consensus branch ID of the block the
 * transaction is mined in (ZIP 244), and a v5 transaction also carries it in its header.
 * A transaction signed for one epoch is rejected in every other, so the branch ID must
 * follow the height the transaction will be mined at.
 *
 * Sources (all agree, checked 2026-10-27):
 *   - zebra v7.0.0: zebra-chain/src/parameters/network_upgrade.rs (CONSENSUS_BRANCH_IDS)
 *     and constants.rs (activation_heights::{mainnet,testnet})
 *   - librustzcash: components/zcash_protocol/src/consensus.rs
 *   - getblockchaininfo → upgrades on zebra 7.0.0 mainnet and testnet nodes
 *
 * Every new network upgrade needs a new row here, and a release, before it activates.
 */
import type { UtxoNetworkName } from "../../internal/blockchains.js";

interface ZcashNetworkUpgrade {
    readonly name: string;
    /** Same on mainnet and testnet. */
    readonly branchId: number;
    readonly activationHeight: Readonly<Record<UtxoNetworkName, number>>;
}

/** Ordered by activation height, ascending on both networks. */
const ZCASH_NETWORK_UPGRADES: readonly ZcashNetworkUpgrade[] = [
    { name: "NU5", branchId: 0xc2d6d0b4, activationHeight: { mainnet: 1_687_104, testnet: 1_842_420 } },
    { name: "NU6", branchId: 0xc8e71055, activationHeight: { mainnet: 2_726_400, testnet: 2_976_000 } },
    { name: "NU6.1", branchId: 0x4dec4df0, activationHeight: { mainnet: 3_146_400, testnet: 3_536_500 } },
    { name: "NU6.2", branchId: 0x5437f330, activationHeight: { mainnet: 3_364_600, testnet: 4_052_000 } },
    { name: "NU6.3", branchId: 0x37a5165b, activationHeight: { mainnet: 3_428_143, testnet: 4_134_000 } },
    { name: "NU7", branchId: 0x77190ad9, activationHeight: { mainnet: 3_543_405, testnet: 4_465_026 } },
];

/**
 * The consensus branch ID in effect at `height`: that of the last upgrade whose activation
 * height is at or below it. Pass the height the transaction will be mined in (chain tip + 1).
 *
 * @param {UtxoNetworkName} network mainnet|testnet
 * @param {number} height the target block height
 * @return {number} the consensus branch ID (uint32)
 * @throws for an unknown network, a height that is not a non-negative integer, or a height
 *   before NU5 (older epochs are not supported)
 */
export function zcashConsensusBranchIdForHeight(network: UtxoNetworkName, height: number): number {
    if (network !== "mainnet" && network !== "testnet") {
        throw new Error(`Unknown Zcash network: ${String(network)}`);
    }
    if (!Number.isSafeInteger(height) || height < 0) {
        throw new Error(`Zcash target height must be a non-negative integer, got ${String(height)}`);
    }

    let branchId: number | undefined;
    for (const upgrade of ZCASH_NETWORK_UPGRADES) {
        if (height < upgrade.activationHeight[network]) {
            break;
        }
        branchId = upgrade.branchId;
    }

    if (branchId === undefined) {
        const first = ZCASH_NETWORK_UPGRADES[0]!;
        throw new Error(
            `Zcash target height ${height} is below the ${first.name} activation height ` +
                `(${first.activationHeight[network]}) on ${network}; only ${first.name} and later are supported`,
        );
    }
    return branchId;
}
