import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  compileAll,
  deploy,
  ether,
  expectRevert,
  makeChain,
  send
} from "../../test/support.mjs";

const actorSource = await readFile(
  new URL("../contracts/RegressionActors.sol", import.meta.url),
  "utf8"
);

let artifactsPromise;
function regressionArtifacts() {
  if (!artifactsPromise) {
    artifactsPromise = compileAll({
      additionalSources: {
        "regression/RegressionActors.sol": actorSource
      }
    });
  }
  return artifactsPromise;
}

async function deploySystem({ feedAnswer = 100_000_000, stableKind = "MockERC20", feeRecipient } = {}) {
  const artifacts = await regressionArtifacts();
  const chain = await makeChain();
  const [admin, provider, borrower, attacker, outsider] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stableArgs = stableKind === "RegressionFeeToken"
    ? ["Fee Dollar", "fUSD", 18, 1_000, feeRecipient ?? await borrower.getAddress()]
    : ["Aster Dollar", "aUSD", 18];
  const stable = await deploy(artifacts, stableKind, admin, stableArgs);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [
    await asset.getAddress(),
    await stable.getAddress()
  ]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, feedAnswer]);
  const oracle = await deploy(artifacts, "ReserveOracle", admin, [
    await feed.getAddress(),
    await pool.getAddress()
  ]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(),
    await vault.getAddress(),
    await oracle.getAddress(),
    await admin.getAddress()
  ]);
  return {
    artifacts,
    ...chain,
    admin,
    provider,
    borrower,
    attacker,
    outsider,
    asset,
    stable,
    vault,
    pool,
    feed,
    oracle,
    market
  };
}

async function seedVault(system, amount) {
  const providerAddress = await system.provider.getAddress();
  await send(system.asset.mint(providerAddress, amount));
  await send(system.asset.connect(system.provider).approve(await system.vault.getAddress(), amount));
  await send(system.vault.connect(system.provider).deposit(amount, providerAddress));
}

async function postBorrowerCollateral(system, amount) {
  const borrowerAddress = await system.borrower.getAddress();
  await send(system.asset.mint(borrowerAddress, amount));
  await send(system.asset.connect(system.borrower).approve(await system.vault.getAddress(), amount));
  await send(system.vault.connect(system.borrower).deposit(amount, borrowerAddress));
  const shares = await system.vault.balanceOf(borrowerAddress);
  await send(system.vault.connect(system.borrower).approve(await system.market.getAddress(), shares));
  await send(system.market.connect(system.borrower).depositCollateral(shares, borrowerAddress));
  return shares;
}

async function deployCompoundSystem(feedAnswer) {
  const system = await deploySystem({ feedAnswer });
  const providerAddress = await system.provider.getAddress();
  await send(system.asset.mint(providerAddress, ether(20_000)));
  await send(system.stable.mint(providerAddress, ether(10_000)));
  await send(system.asset.connect(system.provider).approve(await system.pool.getAddress(), ether(10_000)));
  await send(system.stable.connect(system.provider).approve(await system.pool.getAddress(), ether(10_000)));
  await send(system.pool.connect(system.provider).addLiquidity(ether(10_000), ether(10_000)));
  await send(system.asset.connect(system.provider).approve(await system.vault.getAddress(), ether(10_000)));
  await send(system.vault.connect(system.provider).deposit(ether(10_000), providerAddress));
  await send(system.stable.mint(await system.market.getAddress(), ether(1_000_000)));
  const lender = await deploy(system.artifacts, "RegressionFlashLender", system.admin, [5]);
  await send(system.stable.mint(await lender.getAddress(), ether(100_000)));
  const actor = await deploy(system.artifacts, "RegressionCompoundActor", system.attacker, [
    await system.asset.getAddress(),
    await system.stable.getAddress(),
    await system.vault.getAddress(),
    await system.pool.getAddress(),
    await system.market.getAddress(),
    await lender.getAddress()
  ]);
  await send(system.asset.mint(await actor.getAddress(), ether(1_000)));
  await send(actor.prepare(ether(1_000)));
  return { ...system, lender, actor };
}

describe("Aim workflow-v2 deep regressions", () => {
  test("composition: two mutable valuation rates close a flash-funded reserve drain", async () => {
    const system = await deployCompoundSystem(0);
    const marketBefore = await system.stable.balanceOf(await system.market.getAddress());
    await send(system.actor.run(ether(100_000), ether(8_000), ether(150_000)));
    const spotOnly = await system.actor.spotOnlyLimit();
    const combined = await system.actor.combinedLimit();
    const attackerStable = await system.stable.balanceOf(await system.actor.getAddress());
    const marketAfter = await system.stable.balanceOf(await system.market.getAddress());
    assert.ok(spotOnly < ether(100_050));
    assert.ok(combined >= ether(150_000));
    assert.equal(attackerStable, ether(49_950));
    assert.equal(marketBefore - marketAfter, ether(150_000));
    assert.equal(await system.market.debt(await system.actor.getAddress()), ether(150_000));
    console.log(JSON.stringify({ case: "composition-positive", spotOnly, combined, attackerStable, marketLoss: marketBefore - marketAfter }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

  test("composition control: a durable primary price blocks the same funded join", async () => {
    const system = await deployCompoundSystem(100_000_000);
    await expectRevert(system.actor.run(ether(100_000), ether(8_000), ether(150_000)));
    assert.equal(await system.market.debt(await system.actor.getAddress()), 0n);
    assert.equal(await system.stable.balanceOf(await system.actor.getAddress()), 0n);
  });

  test("consumer propagation: direct vault balance raises an existing collateral limit", async () => {
    const system = await deploySystem();
    await seedVault(system, ether(1_000));
    await postBorrowerCollateral(system, ether(100));
    const borrowerAddress = await system.borrower.getAddress();
    const before = await system.market.borrowLimit(borrowerAddress);
    await send(system.asset.mint(await system.attacker.getAddress(), ether(1_000)));
    await send(system.asset.connect(system.attacker).transfer(await system.vault.getAddress(), ether(1_000)));
    const after = await system.market.borrowLimit(borrowerAddress);
    assert.ok(after > before * 19n / 10n);
    console.log(JSON.stringify({ case: "consumer-positive", before, after }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

  test("consumer control: a transfer outside the vault leaves collateral value unchanged", async () => {
    const system = await deploySystem();
    await seedVault(system, ether(1_000));
    await postBorrowerCollateral(system, ether(100));
    const borrowerAddress = await system.borrower.getAddress();
    const before = await system.market.borrowLimit(borrowerAddress);
    await send(system.asset.mint(await system.attacker.getAddress(), ether(1_000)));
    await send(system.asset.connect(system.attacker).transfer(await system.outsider.getAddress(), ether(1_000)));
    assert.equal(await system.market.borrowLimit(borrowerAddress), before);
  });

  test("interleaving: callback exits collateral before pending debt is committed", async () => {
    const system = await deploySystem();
    await send(system.stable.mint(await system.market.getAddress(), ether(10_000)));
    const actor = await deploy(system.artifacts, "RegressionBorrowExitActor", system.attacker, [
      await system.asset.getAddress(),
      await system.vault.getAddress(),
      await system.market.getAddress()
    ]);
    await send(system.asset.mint(await actor.getAddress(), ether(1_000)));
    await send(actor.prepare(ether(1_000)));
    await send(actor.run(ether(500)));
    assert.equal(await system.market.localCollateral(await actor.getAddress()), 0n);
    assert.equal(await system.vault.balanceOf(await actor.getAddress()), ether(1_000));
    assert.equal(await system.market.debt(await actor.getAddress()), ether(500));
    assert.equal(await system.stable.balanceOf(await actor.getAddress()), ether(500));
  });

  test("interleaving control: omitting the callback preserves posted collateral", async () => {
    const system = await deploySystem();
    await send(system.stable.mint(await system.market.getAddress(), ether(10_000)));
    const actor = await deploy(system.artifacts, "RegressionBorrowExitActor", system.attacker, [
      await system.asset.getAddress(),
      await system.vault.getAddress(),
      await system.market.getAddress()
    ]);
    await send(system.asset.mint(await actor.getAddress(), ether(1_000)));
    await send(actor.prepare(ether(1_000)));
    await send(actor.runWithoutCallback(ether(500)));
    assert.equal(await system.market.localCollateral(await actor.getAddress()), ether(1_000));
    assert.equal(await system.vault.balanceOf(await actor.getAddress()), 0n);
    assert.equal(await system.market.debt(await actor.getAddress()), ether(500));
  });

  test("arithmetic boundary: a coarse unit withdrawal moves value while burning zero shares", async () => {
    const artifacts = await regressionArtifacts();
    const chain = await makeChain();
    const [admin, depositor, donor, outsider] = chain.signers;
    const token = await deploy(artifacts, "MockERC20", admin, ["Unit Asset", "UNIT", 0]);
    const vault = await deploy(artifacts, "AsterVault", admin, [await token.getAddress()]);
    await send(token.mint(await depositor.getAddress(), 100));
    await send(token.connect(depositor).approve(await vault.getAddress(), 100));
    await send(vault.connect(depositor).deposit(100, await depositor.getAddress()));
    await send(token.mint(await donor.getAddress(), 100));
    await send(token.connect(donor).transfer(await vault.getAddress(), 100));
    await send(vault.connect(outsider).withdraw(1, await outsider.getAddress(), await outsider.getAddress()));
    assert.equal(await vault.balanceOf(await outsider.getAddress()), 0n);
    assert.equal(await token.balanceOf(await outsider.getAddress()), 1n);
    assert.equal(await vault.totalSupply(), 100n);
  });

  test("arithmetic control: at a one-to-one rate the zero-share account cannot withdraw", async () => {
    const artifacts = await regressionArtifacts();
    const chain = await makeChain();
    const [admin, depositor, outsider] = chain.signers;
    const token = await deploy(artifacts, "MockERC20", admin, ["Unit Asset", "UNIT", 0]);
    const vault = await deploy(artifacts, "AsterVault", admin, [await token.getAddress()]);
    await send(token.mint(await depositor.getAddress(), 100));
    await send(token.connect(depositor).approve(await vault.getAddress(), 100));
    await send(vault.connect(depositor).deposit(100, await depositor.getAddress()));
    await expectRevert(vault.connect(outsider).withdraw(1, await outsider.getAddress(), await outsider.getAddress()));
    assert.equal(await token.balanceOf(await outsider.getAddress()), 0n);
  });

  test("external semantics: nominal fee-token deposits profit by diluting an incumbent", async () => {
    const artifacts = await regressionArtifacts();
    const chain = await makeChain();
    const [admin, incumbent, attacker] = chain.signers;
    const token = await deploy(artifacts, "RegressionFeeToken", admin, [
      "Fee Asset", "FEE", 18, 1_000, await attacker.getAddress()
    ]);
    const vault = await deploy(artifacts, "AsterVault", admin, [await token.getAddress()]);
    await send(token.mint(await incumbent.getAddress(), ether(1_000)));
    await send(token.connect(incumbent).approve(await vault.getAddress(), ether(1_000)));
    await send(vault.connect(incumbent).deposit(ether(1_000), await incumbent.getAddress()));
    const holderBefore = await vault.convertToAssets(await vault.balanceOf(await incumbent.getAddress()));
    await send(token.mint(await attacker.getAddress(), ether(100)));
    const attackerBefore = await token.balanceOf(await attacker.getAddress());
    await send(token.connect(attacker).approve(await vault.getAddress(), ether(100)));
    await send(vault.connect(attacker).deposit(ether(100), await attacker.getAddress()));
    const shares = await vault.balanceOf(await attacker.getAddress());
    await send(vault.connect(attacker).redeem(shares, await attacker.getAddress(), await attacker.getAddress()));
    const attackerAfter = await token.balanceOf(await attacker.getAddress());
    const holderAfter = await vault.convertToAssets(await vault.balanceOf(await incumbent.getAddress()));
    assert.ok(attackerAfter > attackerBefore);
    assert.ok(holderAfter < holderBefore);
    console.log(JSON.stringify({ case: "deposit-delta-positive", attackerBefore, attackerAfter, holderBefore, holderAfter }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

  test("external semantics control: exact-delta deposits preserve both parties", async () => {
    const artifacts = await regressionArtifacts();
    const chain = await makeChain();
    const [admin, incumbent, attacker] = chain.signers;
    const token = await deploy(artifacts, "MockERC20", admin, ["Asset", "AST", 18]);
    const vault = await deploy(artifacts, "AsterVault", admin, [await token.getAddress()]);
    await send(token.mint(await incumbent.getAddress(), ether(1_000)));
    await send(token.connect(incumbent).approve(await vault.getAddress(), ether(1_000)));
    await send(vault.connect(incumbent).deposit(ether(1_000), await incumbent.getAddress()));
    const holderBefore = await vault.convertToAssets(await vault.balanceOf(await incumbent.getAddress()));
    await send(token.mint(await attacker.getAddress(), ether(100)));
    const attackerBefore = await token.balanceOf(await attacker.getAddress());
    await send(token.connect(attacker).approve(await vault.getAddress(), ether(100)));
    await send(vault.connect(attacker).deposit(ether(100), await attacker.getAddress()));
    const shares = await vault.balanceOf(await attacker.getAddress());
    await send(vault.connect(attacker).redeem(shares, await attacker.getAddress(), await attacker.getAddress()));
    assert.equal(await token.balanceOf(await attacker.getAddress()), attackerBefore);
    assert.equal(await vault.convertToAssets(await vault.balanceOf(await incumbent.getAddress())), holderBefore);
  });

  test("external semantics: nominal repayment clears more debt than the market receives", async () => {
    const system = await deploySystem({ stableKind: "RegressionFeeToken" });
    await send(system.stable.mint(await system.market.getAddress(), ether(1_000)));
    await postBorrowerCollateral(system, ether(100));
    const marketStart = await system.stable.balanceOf(await system.market.getAddress());
    await send(system.market.connect(system.borrower).borrow(ether(50), await system.borrower.getAddress(), "0x"));
    await send(system.stable.connect(system.borrower).approve(await system.market.getAddress(), ether(50)));
    await send(system.market.connect(system.borrower).repay(await system.borrower.getAddress(), ether(50)));
    const marketEnd = await system.stable.balanceOf(await system.market.getAddress());
    assert.equal(await system.market.debt(await system.borrower.getAddress()), 0n);
    assert.equal(marketStart - marketEnd, ether(5));
    console.log(JSON.stringify({ case: "repay-delta-positive", marketStart, marketEnd, shortfall: marketStart - marketEnd }, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

  test("external semantics control: exact-delta repayment fully restores reserves", async () => {
    const system = await deploySystem();
    await send(system.stable.mint(await system.market.getAddress(), ether(1_000)));
    await postBorrowerCollateral(system, ether(100));
    const marketStart = await system.stable.balanceOf(await system.market.getAddress());
    await send(system.market.connect(system.borrower).borrow(ether(50), await system.borrower.getAddress(), "0x"));
    await send(system.stable.connect(system.borrower).approve(await system.market.getAddress(), ether(50)));
    await send(system.market.connect(system.borrower).repay(await system.borrower.getAddress(), ether(50)));
    assert.equal(await system.market.debt(await system.borrower.getAddress()), 0n);
    assert.equal(await system.stable.balanceOf(await system.market.getAddress()), marketStart);
  });
});
