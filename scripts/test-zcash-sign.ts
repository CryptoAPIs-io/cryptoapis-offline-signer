/**
 * Zcash signing tests (no network). Imports the BUILT dist/, so run `npm run build` first.
 *
 *   1. Network-upgrade table: every boundary (activation - 1 / activation) on mainnet and
 *      testnet, checked against a literal copy of the published values, so a typo in the
 *      table fails here.
 *   2. ZIP 244 digest vs the real chain: signatures in v5 transactions mined on mainnet
 *      (NU6.3) and testnet (NU6.1, NU6.2) verify against our digest; each header's branch ID
 *      matches the table at the block's height; utxo-lib's v5 serialization round-trips.
 *   3. utxoSignFromDetails for zcash: a v5 transaction whose branch ID follows targetHeight
 *      (NU7 - 1 / NU7 on both networks, and every activation height) or an explicit
 *      consensusBranchId, every signature verifies; plus the refusals.
 *
 *   npm run test:zcash
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as utxolib from "@bitgo/utxo-lib";
import * as ecc from "tiny-secp256k1";
import { utxoSignFromDetails, utxoSignUnsignedHex, zcashConsensusBranchIdForHeight } from "../dist/utxo.js";
import { zip244SignatureDigest, type Zip244TransparentTransaction } from "../dist/chains/utxo/zcash-zip244.js";

type Net = "mainnet" | "testnet";

// Name, branch ID, mainnet activation, testnet activation. Sources: zebra v7.0.0
// (network_upgrade.rs, constants.rs), librustzcash zcash_protocol consensus.rs, and
// getblockchaininfo on zebra 7.0.0 mainnet + testnet nodes (2026-10-27).
const UPGRADES = [
    ["NU5", 0xc2d6d0b4, 1_687_104, 1_842_420],
    ["NU6", 0xc8e71055, 2_726_400, 2_976_000],
    ["NU6.1", 0x4dec4df0, 3_146_400, 3_536_500],
    ["NU6.2", 0x5437f330, 3_364_600, 4_052_000],
    ["NU6.3", 0x37a5165b, 3_428_143, 4_134_000],
    ["NU7", 0x77190ad9, 3_543_405, 4_465_026],
] as const;
const NU6_3 = 0x37a5165b;
const NU7 = 0x77190ad9;
const NU7_HEIGHT: Record<Net, number> = { mainnet: 3_543_405, testnet: 4_465_026 };
const activation = (row: (typeof UPGRADES)[number], net: Net) => (net === "mainnet" ? row[2] : row[3]);
const hex8 = (n: number) => `0x${n.toString(16).padStart(8, "0")}`;

let passed = 0;
let failed = 0;
function check(label: string, fn: () => void): void {
    try {
        fn();
        passed += 1;
        console.log(`  ✅ ${label}`);
    } catch (err) {
        failed += 1;
        console.log(`  ❌ ${label}: ${(err as Error).message}`);
    }
}

const NETWORK: Record<Net, utxolib.Network> = { mainnet: utxolib.networks.zcash, testnet: utxolib.networks.zcashTest };

/** A parsed v5 transaction plus the outputs it spends, as the ZIP 244 digest needs it. */
function zip244View(tx: utxolib.bitgo.ZcashTransaction<number>, prevouts: { script: Buffer; value: number }[]): Zip244TransparentTransaction {
    return {
        consensusBranchId: tx.consensusBranchId,
        lockTime: tx.locktime,
        expiryHeight: tx.expiryHeight,
        inputs: tx.ins.map((inp, i) => ({
            hash: inp.hash,
            index: inp.index,
            sequence: inp.sequence,
            prevOutScript: prevouts[i]!.script,
            value: prevouts[i]!.value,
        })),
        outputs: tx.outs.map((out) => ({ script: out.script, value: out.value })),
    };
}

/** True when every input's P2PKH signature verifies against our digest of `view`. */
function allSignaturesVerify(tx: utxolib.bitgo.ZcashTransaction<number>, view: Zip244TransparentTransaction): boolean {
    return tx.ins.every((inp, i) => {
        const [sigWithType, publicKey] = utxolib.script.decompile(inp.script) as [Buffer, Buffer];
        assert.equal(sigWithType[sigWithType.length - 1], 0x01, `input ${i} hash type is SIGHASH_ALL`);
        const { signature } = utxolib.script.signature.decode(sigWithType);
        return ecc.verify(zip244SignatureDigest(view, i), publicKey, signature);
    });
}

const parse = (hex: string, net: Net) =>
    utxolib.bitgo.ZcashTransaction.fromBuffer(Buffer.from(hex, "hex"), false, "number", NETWORK[net]);

// ── 1. Network-upgrade table ───────────────────────────────────────────────────
console.log("Network-upgrade table");
for (const net of ["mainnet", "testnet"] as const) {
    UPGRADES.forEach((row, k) => {
        const [name, branchId] = row;
        const height = activation(row, net);
        check(`${net} ${name} at activation ${height} → ${hex8(branchId)}`, () => {
            assert.equal(zcashConsensusBranchIdForHeight(net, height), branchId);
        });
        if (k === 0) {
            check(`${net} ${name} activation - 1 (${height - 1}) throws: before NU5`, () => {
                assert.throws(() => zcashConsensusBranchIdForHeight(net, height - 1), /below the NU5 activation height/);
            });
        } else {
            const previous = UPGRADES[k - 1]!;
            check(`${net} ${name} activation - 1 (${height - 1}) → ${previous[0]} ${hex8(previous[1])}`, () => {
                assert.equal(zcashConsensusBranchIdForHeight(net, height - 1), previous[1]);
            });
        }
    });
    check(`${net} NU7 - 1 (${NU7_HEIGHT[net] - 1}) → NU6.3 0x37a5165b, NU7 (${NU7_HEIGHT[net]}) → 0x77190ad9`, () => {
        assert.equal(zcashConsensusBranchIdForHeight(net, NU7_HEIGHT[net] - 1), NU6_3);
        assert.equal(zcashConsensusBranchIdForHeight(net, NU7_HEIGHT[net]), NU7);
    });
    check(`${net} far-future height → NU7 (the last known upgrade)`, () => {
        assert.equal(zcashConsensusBranchIdForHeight(net, 2 ** 31), NU7);
    });
}
for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3543405", null]) {
    check(`height ${String(bad)} (${typeof bad}) throws`, () => {
        assert.throws(() => zcashConsensusBranchIdForHeight("mainnet", bad as never), /non-negative integer/);
    });
}
check("unknown network throws", () => {
    assert.throws(() => zcashConsensusBranchIdForHeight("regtest" as never, 3_543_405), /Unknown Zcash network/);
});

// ── 2. ZIP 244 digest vs transactions mined on-chain ───────────────────────────
console.log("ZIP 244 digest vs v5 transactions mined on-chain");
interface ChainFixture {
    network: Net;
    height: number;
    txid: string;
    hex: string;
    prevouts: { script: string; satoshis: number }[];
}
const { transactions: fixtures } = JSON.parse(
    readFileSync(new URL("./fixtures/zcash-v5-transparent.json", import.meta.url), "utf8"),
) as { transactions: ChainFixture[] };
assert.ok(fixtures.length >= 5, "fixtures loaded");
for (const f of fixtures) {
    const label = `${f.network} ${f.txid.slice(0, 12)}… (height ${f.height}, ${f.prevouts.length} input(s))`;
    check(`${label}: header branch ID = table at its height; v5 round-trips; txid matches`, () => {
        const tx = parse(f.hex, f.network);
        assert.equal(tx.version, 5);
        assert.equal(tx.consensusBranchId, zcashConsensusBranchIdForHeight(f.network, f.height));
        assert.equal(tx.toHex(), f.hex);
        assert.equal(tx.getId(), f.txid);
    });
    check(`${label}: every on-chain signature verifies against our ZIP 244 digest`, () => {
        const tx = parse(f.hex, f.network);
        const prevouts = f.prevouts.map((p) => ({ script: Buffer.from(p.script, "hex"), value: p.satoshis }));
        assert.ok(allSignaturesVerify(tx, zip244View(tx, prevouts)));
    });
    check(`${label}: utxo-lib's own v5 digest does NOT verify (why zcash-zip244.ts exists)`, () => {
        const tx = parse(f.hex, f.network);
        const [sigWithType, publicKey] = utxolib.script.decompile(tx.ins[0]!.script) as [Buffer, Buffer];
        const { signature } = utxolib.script.signature.decode(sigWithType);
        const theirs = tx.hashForSignatureByNetwork(0, Buffer.from(f.prevouts[0]!.script, "hex"), f.prevouts[0]!.satoshis, 0x01);
        assert.equal(ecc.verify(theirs, publicKey, signature), false, "utxo-lib's ZIP 244 digest now verifies — zcash-zip244.ts may be replaceable");
    });
}

// ── 3. utxoSignFromDetails (zcash) ─────────────────────────────────────────────
console.log("utxoSignFromDetails (zcash)");
const PRIVATE_KEYS = [Buffer.alloc(32, 7), Buffer.alloc(32, 9)];

function keysFor(net: Net) {
    const base = NETWORK[net];
    // ecpair checks pubKeyHash/scriptHash as UInt8; Zcash's are 2 bytes and unused for WIFs.
    const ecpairNet = { messagePrefix: base.messagePrefix, bip32: base.bip32, pubKeyHash: 0, scriptHash: 0, wif: base.wif };
    return PRIVATE_KEYS.map((d) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kp = (utxolib.ECPair as any).fromPrivateKey(d, { network: ecpairNet });
        const pkh = utxolib.crypto.hash160(Buffer.from(kp.publicKey));
        const script = Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), pkh, Buffer.from([0x88, 0xac])]);
        return { wif: kp.toWIF() as string, script, address: utxolib.address.fromOutputScript(script, base) };
    });
}

/** Two inputs (one per key) → an address output, an OP_RETURN and a script (change) output. */
function preparedFor(net: Net) {
    const [k1, k2] = keysFor(net) as [ReturnType<typeof keysFor>[number], ReturnType<typeof keysFor>[number]];
    const preparedTransaction = {
        version: 4, // what the prepare API returns today; ignored — zcash is always signed as v5
        locktime: 100,
        inputs: [
            { transactionId: "aa".repeat(32), outputIndex: 0, script: k1.script.toString("hex"), satoshis: 150_000 },
            { transactionId: "bb".repeat(32), outputIndex: 3, script: `0x${k2.script.toString("hex")}`, satoshis: 70_000 },
        ],
        outputs: [
            { address: k2.address, satoshis: 100_000 },
            { script: "6a04deadbeef", satoshis: 0 },
            { script: k1.script.toString("hex"), satoshis: 105_000 },
        ],
    };
    const prevouts = [
        { script: k1.script, value: 150_000 },
        { script: k2.script, value: 70_000 },
    ];
    return { preparedTransaction, prevouts, wifs: [k1.wif, k2.wif] };
}

function sign(net: Net, extra: Record<string, unknown>, over: Partial<ReturnType<typeof preparedFor>> = {}) {
    const p = { ...preparedFor(net), ...over };
    return utxoSignFromDetails({
        action: "sign-from-details",
        blockchain: "zcash",
        network: net,
        privateKeys: p.wifs,
        preparedTransaction: p.preparedTransaction,
        ...extra,
    } as never).signedTransactionHex;
}

/** Signed hex → v5 with `branchId` in its header, signatures valid for it and only for it. */
function assertSignedFor(hex: string, net: Net, branchId: number): void {
    const { prevouts } = preparedFor(net);
    const tx = parse(hex, net);
    assert.equal(tx.version, 5, "version 5");
    assert.equal(tx.versionGroupId, 0x26a7270a, "v5 version group ID");
    assert.equal(tx.consensusBranchId, branchId, "header branch ID");
    assert.equal(tx.locktime, 100, "locktime carried over");
    assert.equal(tx.expiryHeight, 0, "no expiry");
    assert.equal(tx.ins.length, 2);
    assert.equal(tx.outs.length, 3);
    const view = zip244View(tx, prevouts);
    assert.ok(allSignaturesVerify(tx, view), "signatures verify for the header's branch");
    const other = branchId === NU7 ? NU6_3 : NU7;
    assert.ok(!allSignaturesVerify(tx, { ...view, consensusBranchId: other }), "signatures must not verify for another branch");
}

for (const net of ["mainnet", "testnet"] as const) {
    const nu7 = NU7_HEIGHT[net];
    check(`${net} targetHeight NU7 - 1 (${nu7 - 1}) → v5, branch 0x37a5165b, signatures verify`, () => {
        assertSignedFor(sign(net, { targetHeight: nu7 - 1 }), net, NU6_3);
    });
    check(`${net} targetHeight NU7 (${nu7}) → v5, branch 0x77190ad9, signatures verify`, () => {
        const hex = sign(net, { targetHeight: nu7 });
        assertSignedFor(hex, net, NU7);
        assert.ok(hex.includes("d90a1977"), "branch ID serialized little-endian");
    });
    check(`${net} explicit consensusBranchId 0x77190ad9 signs the same bytes as targetHeight NU7`, () => {
        assert.equal(sign(net, { consensusBranchId: NU7 }), sign(net, { targetHeight: nu7 }));
    });
    check(`${net} explicit consensusBranchId outside the table (0x12345678) is used as given`, () => {
        assert.equal(parse(sign(net, { consensusBranchId: 0x12345678 }), net).consensusBranchId, 0x12345678);
    });
    check(`${net} every activation height reaches the signed header`, () => {
        for (const row of UPGRADES) {
            assert.equal(parse(sign(net, { targetHeight: activation(row, net) }), net).consensusBranchId, row[1], row[0]);
        }
    });
    check(`${net} null targetHeight with a consensusBranchId counts as not given`, () => {
        assert.equal(parse(sign(net, { targetHeight: null, consensusBranchId: NU7 }), net).consensusBranchId, NU7);
    });
}

const refuses = (label: string, fn: () => unknown, pattern: RegExp) =>
    check(`refuses: ${label}`, () => assert.throws(fn, pattern));

refuses("zcash with neither targetHeight nor consensusBranchId", () => sign("testnet", {}), /needs targetHeight .* or consensusBranchId/);
refuses("zcash with null targetHeight and null consensusBranchId", () => sign("testnet", { targetHeight: null, consensusBranchId: null }), /needs targetHeight/);
refuses("both targetHeight and consensusBranchId", () => sign("testnet", { targetHeight: 4_465_026, consensusBranchId: NU7 }), /not both/);
for (const bad of [0, -1, 2 ** 32, 1.5, "77190ad9"]) {
    refuses(`consensusBranchId ${JSON.stringify(bad)}`, () => sign("testnet", { consensusBranchId: bad }), /consensusBranchId must be an integer/);
}
refuses("targetHeight below NU5", () => sign("testnet", { targetHeight: 1_842_419 }), /below the NU5 activation height/);
refuses("targetHeight -1", () => sign("testnet", { targetHeight: -1 }), /non-negative integer/);
refuses("targetHeight as a string", () => sign("testnet", { targetHeight: "4465026" }), /non-negative integer/);
refuses("a key that does not own its input", () => {
    const p = preparedFor("testnet");
    return sign("testnet", { targetHeight: 4_465_026 }, { wifs: [p.wifs[1]!, p.wifs[0]!] });
}, /does not match the address of input 0/);
refuses("a mainnet WIF on testnet", () => sign("testnet", { targetHeight: 4_465_026 }, { wifs: preparedFor("mainnet").wifs }), /network/i);
refuses("an output address of the other network", () => {
    const p = preparedFor("testnet");
    const outputs = [{ address: keysFor("mainnet")[0]!.address, satoshis: 1000 }];
    return sign("testnet", { targetHeight: 4_465_026 }, { preparedTransaction: { ...p.preparedTransaction, outputs } });
}, /no matching Script/);
refuses("a P2SH input", () => {
    const p = preparedFor("testnet");
    const inputs = [{ ...p.preparedTransaction.inputs[0]!, script: `a914${"11".repeat(20)}87` }, p.preparedTransaction.inputs[1]!];
    return sign("testnet", { targetHeight: 4_465_026 }, { preparedTransaction: { ...p.preparedTransaction, inputs } });
}, /only P2PKH/);
refuses("a malformed transactionId", () => {
    const p = preparedFor("testnet");
    const inputs = [{ ...p.preparedTransaction.inputs[0]!, transactionId: "abc" }, p.preparedTransaction.inputs[1]!];
    return sign("testnet", { targetHeight: 4_465_026 }, { preparedTransaction: { ...p.preparedTransaction, inputs } });
}, /transactionId must be a 32-byte hex txid/);
refuses("an input without satoshis", () => {
    const p = preparedFor("testnet");
    const { satoshis: _drop, ...noValue } = p.preparedTransaction.inputs[0]!;
    const inputs = [noValue, p.preparedTransaction.inputs[1]!];
    return sign("testnet", { targetHeight: 4_465_026 }, { preparedTransaction: { ...p.preparedTransaction, inputs } as never });
}, /satoshis must be a non-negative integer/);
refuses("a transaction without outputs", () => {
    const p = preparedFor("testnet");
    return sign("testnet", { targetHeight: 4_465_026 }, { preparedTransaction: { ...p.preparedTransaction, outputs: [] } });
}, /has no outputs/);
refuses("targetHeight on bitcoin", () => utxoSignFromDetails({
    action: "sign-from-details",
    blockchain: "bitcoin",
    network: "testnet",
    privateKeys: ["x"],
    preparedTransaction: { inputs: [{}] },
    targetHeight: 100,
}), /apply to zcash only/);
refuses("consensusBranchId on dogecoin", () => utxoSignFromDetails({
    action: "sign-from-details",
    blockchain: "dogecoin",
    network: "testnet",
    privateKeys: ["x"],
    preparedTransaction: { inputs: [{}] },
    consensusBranchId: NU7,
}), /apply to zcash only/);
refuses("sign-unsigned-hex for zcash", () => utxoSignUnsignedHex({
    action: "sign-unsigned-hex",
    blockchain: "zcash",
    network: "testnet",
    privateKeys: ["x"],
    unsignedTransactionHex: "00",
    inputs: [{ transactionId: "aa".repeat(32), outputIndex: 0, script: "00", satoshis: 1 }],
}), /does not support zcash; use sign-from-details/);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
}
console.log("✅ All Zcash signing checks passed.");
