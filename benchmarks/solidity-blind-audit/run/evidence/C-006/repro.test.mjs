import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, expectRevert, makeChain, send } from "../../../test/support.mjs";

let artifacts;

before(async () => {
  artifacts = await compileAll();
});

async function setup() {
  const chain = await makeChain();
  const [guardian, attacker] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", guardian, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", guardian, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", guardian, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", guardian, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", guardian, [8, 100_000_000]);
  const oracle = await deploy(artifacts, "ReserveOracle", guardian, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", guardian, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await guardian.getAddress()
  ]);
  const attackerAddress = await attacker.getAddress();
  await send(stable.mint(await market.getAddress(), ether(10_000)));
  await send(asset.mint(attackerAddress, ether(1_000)));
  await send(asset.connect(attacker).approve(await vault.getAddress(), ether(1_000)));
  await send(vault.connect(attacker).deposit(ether(1_000), attackerAddress));
  await send(vault.connect(attacker).approve(await market.getAddress(), ether(1_000)));
  await send(market.connect(attacker).depositCollateral(ether(1_000), attackerAddress));
  return { guardian, attacker, attackerAddress, stable, market };
}

test("positive: ordinary borrower raises global collateral factor and extracts above configured limit", async () => {
  const { attacker, attackerAddress, stable, market } = await setup();
  const initialFactor = await market.collateralFactorBps();
  const initialLimit = await market.borrowLimit(attackerAddress);
  assert.equal(initialFactor, 7_500n);
  assert.equal(initialLimit, ether(750));
  await expectRevert(market.connect(attacker).borrow(ether(950), attackerAddress, "0x"));

  await send(market.connect(attacker).setCollateralFactor(9_500));
  const raisedLimit = await market.borrowLimit(attackerAddress);
  // Use a distinct calldata amount after the expected pre-change revert so the
  // Ganache/ethers estimate cache cannot reuse the stale failed estimation.
  await send(market.connect(attacker).borrow(ether(949), attackerAddress, "0x"));

  assert.equal(await market.collateralFactorBps(), 9_500n);
  assert.equal(raisedLimit, ether(950));
  assert.equal(await market.debt(attackerAddress), ether(949));
  assert.equal(await stable.balanceOf(attackerAddress), ether(949));
  assert((await market.debt(attackerAddress)) > initialLimit);
  console.log(JSON.stringify({ oracle: "C-006-positive", callerIsGuardian: false, initialFactor: String(initialFactor), factorAfter: String(await market.collateralFactorBps()), initialLimit: String(initialLimit), debtAfter: String(await market.debt(attackerAddress)), attackerStable: String(await stable.balanceOf(attackerAddress)) }));
});

test("negative: the same ordinary caller is rejected when lowering the parameter", async () => {
  const { attacker, market } = await setup();
  await expectRevert(market.connect(attacker).setCollateralFactor(7_000));
  assert.equal(await market.collateralFactorBps(), 7_500n);
  console.log(JSON.stringify({ oracle: "C-006-negative", unauthorizedDecreaseRejected: true, factorAfter: String(await market.collateralFactorBps()) }));
});
