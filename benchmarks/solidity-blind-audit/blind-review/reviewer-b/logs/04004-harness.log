import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, ethers, expectRevert, makeChain, send } from "../../../test/support.mjs";

const secp256k1N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
let artifacts;

before(async () => {
  artifacts = await compileAll();
});

async function setup() {
  const chain = await makeChain();
  const [admin, authority, claimant, relayer] = chain.signers;
  const authorityWallet = chain.wallets[1];
  const token = await deploy(artifacts, "MockERC20", admin, ["Aster Reward", "ARW", 18]);
  const distributor = await deploy(artifacts, "RewardsDistributor", admin, [
    await token.getAddress(), await authority.getAddress()
  ]);
  await send(token.mint(await distributor.getAddress(), ether(100)));
  return { authorityWallet, claimant, relayer, token, distributor };
}

function malleate(signature) {
  const parsed = ethers.Signature.from(signature);
  const alternateS = secp256k1N - BigInt(parsed.s);
  const alternateV = parsed.v === 27 ? 28 : 27;
  return ethers.hexlify(ethers.concat([
    parsed.r,
    ethers.toBeHex(alternateS, 32),
    ethers.toBeHex(alternateV, 1)
  ]));
}

async function signedClaim(context, amount = ether(20), nonce = 7n) {
  const account = await context.claimant.getAddress();
  const payload = await context.distributor.claimPayload(account, amount, nonce);
  const signature = await context.authorityWallet.signMessage(ethers.getBytes(payload));
  return { account, payload, signature, alternate: malleate(signature), amount, nonce };
}

test("positive: high-s alternate encoding bypasses signature-byte replay tracking", async () => {
  const context = await setup();
  const claim = await signedClaim(context);
  assert.notEqual(claim.signature, claim.alternate);
  assert.notEqual(ethers.keccak256(claim.signature), ethers.keccak256(claim.alternate));

  await send(context.distributor.connect(context.relayer).claim(
    claim.account, claim.amount, claim.nonce, claim.signature
  ));
  await send(context.distributor.connect(context.relayer).claim(
    claim.account, claim.amount, claim.nonce, claim.alternate
  ));

  const paid = await context.token.balanceOf(claim.account);
  assert.equal(paid, claim.amount * 2n);
  assert.equal(await context.distributor.usedSignatures(ethers.keccak256(claim.signature)), true);
  assert.equal(await context.distributor.usedSignatures(ethers.keccak256(claim.alternate)), true);
  console.log(JSON.stringify({ oracle: "C-004-positive", samePayload: claim.payload, canonicalId: ethers.keccak256(claim.signature), alternateId: ethers.keccak256(claim.alternate), authorizedAmount: String(claim.amount), paid: String(paid) }));
});

test("negative: byte-identical replay is rejected and pays only once", async () => {
  const context = await setup();
  const claim = await signedClaim(context);
  await send(context.distributor.connect(context.relayer).claim(
    claim.account, claim.amount, claim.nonce, claim.signature
  ));
  await expectRevert(context.distributor.connect(context.relayer).claim(
    claim.account, claim.amount, claim.nonce, claim.signature
  ));
  const paid = await context.token.balanceOf(claim.account);
  assert.equal(paid, claim.amount);
  console.log(JSON.stringify({ oracle: "C-004-negative", identicalReplayRejected: true, authorizedAmount: String(claim.amount), paid: String(paid) }));
});

