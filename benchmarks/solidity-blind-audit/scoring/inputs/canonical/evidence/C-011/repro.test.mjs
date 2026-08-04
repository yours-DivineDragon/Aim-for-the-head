import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, expectRevert, makeChain, send } from "../../../test/support.mjs";

let artifacts;

before(async () => {
  artifacts = await compileAll();
});

async function setup() {
  const chain = await makeChain();
  const [admin, attacker, victim] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const attackerAddress = await attacker.getAddress();
  const victimAddress = await victim.getAddress();
  await send(asset.mint(attackerAddress, ether(1_000) + 1n));
  await send(asset.mint(victimAddress, ether(1_000)));
  await send(asset.connect(attacker).approve(await vault.getAddress(), 1n));
  await send(asset.connect(victim).approve(await vault.getAddress(), ether(1_000)));
  return { attacker, victim, attackerAddress, victimAddress, asset, vault };
}

test("positive: recoverable first-share donation makes a victim deposit mint zero and revert", async () => {
  const context = await setup();
  const attackerStartingAssets = await context.asset.balanceOf(context.attackerAddress);
  const victimStartingAssets = await context.asset.balanceOf(context.victimAddress);

  await send(context.vault.connect(context.attacker).deposit(1n, context.attackerAddress));
  assert.equal(await context.vault.totalSupply(), 1n);
  await send(context.asset.connect(context.attacker).transfer(
    await context.vault.getAddress(), ether(1_000)
  ));
  assert.equal(await context.vault.convertToShares(ether(1_000)), 0n);

  await expectRevert(context.vault.connect(context.victim).deposit(
    ether(1_000), context.victimAddress
  ));
  assert.equal(await context.vault.balanceOf(context.victimAddress), 0n);
  assert.equal(await context.asset.balanceOf(context.victimAddress), victimStartingAssets);

  await send(context.vault.connect(context.attacker).redeem(
    1n, context.attackerAddress, context.attackerAddress
  ));
  assert.equal(await context.asset.balanceOf(context.attackerAddress), attackerStartingAssets);
  assert.equal(await context.vault.totalSupply(), 0n);
  console.log(JSON.stringify({ oracle: "C-011-positive", seedShare: "1", recoverableDonation: String(ether(1_000)), victimDeposit: String(victimStartingAssets), victimShares: "0", attackerAssetsAfterRecovery: String(await context.asset.balanceOf(context.attackerAddress)), capitalLoss: "0" }));
});

test("negative: without exchange-rate donation the same victim deposit succeeds", async () => {
  const context = await setup();
  await send(context.vault.connect(context.attacker).deposit(1n, context.attackerAddress));
  await send(context.vault.connect(context.victim).deposit(ether(1_000), context.victimAddress));
  assert.equal(await context.vault.balanceOf(context.victimAddress), ether(1_000));
  assert.equal(await context.asset.balanceOf(context.victimAddress), 0n);
  console.log(JSON.stringify({ oracle: "C-011-negative", donation: "0", victimDepositSucceeded: true, victimShares: String(await context.vault.balanceOf(context.victimAddress)) }));
});

