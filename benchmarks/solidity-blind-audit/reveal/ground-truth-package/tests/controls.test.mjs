import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  blockDeadline,
  deploy,
  deploySystem,
  ether,
  ethers,
  expectRevert,
  hiddenArtifacts,
  makeChain,
  malleate,
  scopedPayload,
  send
} from "./common.mjs";

describe("patched controls", () => {
  test("F-01 control rejects the compound path before credit is issued", async () => {
    const artifacts = await hiddenArtifacts();
    const chain = await makeChain();
    const [admin, provider, attacker] = chain.signers;
    const asset = await deploy(artifacts, "MockERC20", admin, ["Asset", "AST", 18]);
    const stable = await deploy(artifacts, "MockERC20", admin, ["Dollar", "USD", 18]);
    const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
    const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
    const feed = await deploy(artifacts, "MockFeed", admin, [8, 0]);
    const oracle = await deploy(artifacts, "StrictOracle", admin, [await feed.getAddress(), 3_600]);
    const market = await deploy(artifacts, "LendingMarket", admin, [
      await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await admin.getAddress()
    ]);
    await send(asset.mint(await provider.getAddress(), ether(20_000)));
    await send(stable.mint(await provider.getAddress(), ether(10_000)));
    await send(asset.connect(provider).approve(await pool.getAddress(), ether(10_000)));
    await send(stable.connect(provider).approve(await pool.getAddress(), ether(10_000)));
    await send(pool.connect(provider).addLiquidity(ether(10_000), ether(10_000)));
    await send(asset.connect(provider).approve(await vault.getAddress(), ether(10_000)));
    await send(vault.connect(provider).deposit(ether(10_000), await provider.getAddress()));
    await send(stable.mint(await market.getAddress(), ether(1_000_000)));
    const lender = await deploy(artifacts, "HiddenFlashLender", admin, [5]);
    await send(stable.mint(await lender.getAddress(), ether(100_000)));
    const actor = await deploy(artifacts, "CompoundPriceActor", attacker, [
      await asset.getAddress(), await stable.getAddress(), await vault.getAddress(),
      await pool.getAddress(), await market.getAddress(), await lender.getAddress()
    ]);
    await send(asset.mint(await actor.getAddress(), ether(1_000)));
    await send(actor.prepare(ether(1_000)));
    await expectRevert(actor.run(ether(100_000), ether(8_000), ether(150_000)));
    assert.equal(await market.debt(await actor.getAddress()), 0n);
  });

  test("F-02 control does not consume the mutable pool quote", async () => {
    const artifacts = await hiddenArtifacts();
    const { signers } = await makeChain();
    const [admin] = signers;
    const feed = await deploy(artifacts, "MockFeed", admin, [8, 0]);
    const oracle = await deploy(artifacts, "StrictOracle", admin, [await feed.getAddress(), 3_600]);
    await expectRevert(oracle.price());
  });

  test("F-03 control excludes unsolicited balances from the exchange rate", async () => {
    const artifacts = await hiddenArtifacts();
    const { signers } = await makeChain();
    const [admin, depositor, donor] = signers;
    const token = await deploy(artifacts, "MockERC20", admin, ["Asset", "AST", 18]);
    const vault = await deploy(artifacts, "ManagedVault", admin, [await token.getAddress()]);
    await send(token.mint(await depositor.getAddress(), ether(100)));
    await send(token.connect(depositor).approve(await vault.getAddress(), ether(100)));
    await send(vault.connect(depositor).deposit(ether(100), await depositor.getAddress()));
    const before = await vault.convertToAssets(ether(100));
    await send(token.mint(await donor.getAddress(), ether(100)));
    await send(token.connect(donor).transfer(await vault.getAddress(), ether(100)));
    assert.equal(await vault.convertToAssets(ether(100)), before);
    assert.equal(await vault.managedAssets(), ether(100));
  });

  test("F-04 control records debt before invoking the receiver", async () => {
    const system = await deploySystem();
    const market = await deploy(system.artifacts, "GuardedBorrowMarket", system.admin, [
      await system.stable.getAddress(), await system.vault.getAddress(), await system.oracle.getAddress()
    ]);
    await send(system.stable.mint(await market.getAddress(), ether(10_000)));
    const actor = await deploy(system.artifacts, "GuardedCallbackActor", system.attacker, [
      await system.asset.getAddress(), await system.vault.getAddress(), await market.getAddress()
    ]);
    await send(system.asset.mint(await actor.getAddress(), ether(1_000)));
    await send(actor.prepare(ether(1_000)));
    await expectRevert(actor.run(ether(500)));
    assert.equal(await market.debt(await actor.getAddress()), 0n);
    assert.equal(await market.localCollateral(await actor.getAddress()), ether(1_000));
  });

  test("F-05 control limits risk changes to the guardian", async () => {
    const artifacts = await hiddenArtifacts();
    const { signers } = await makeChain();
    const [guardian, outsider] = signers;
    const config = await deploy(artifacts, "GuardedRiskConfig", guardian, [await guardian.getAddress()]);
    await expectRevert(config.connect(outsider).setCollateralFactor(9_500));
    assert.equal(await config.collateralFactorBps(), 7_500n);
  });

  test("F-06 control rounds the share burn upward", async () => {
    const artifacts = await hiddenArtifacts();
    const { signers } = await makeChain();
    const [admin, depositor, donor, outsider] = signers;
    const token = await deploy(artifacts, "MockERC20", admin, ["Unit", "UNIT", 0]);
    const vault = await deploy(artifacts, "ManagedVault", admin, [await token.getAddress()]);
    await send(token.mint(await depositor.getAddress(), 100));
    await send(token.connect(depositor).approve(await vault.getAddress(), 100));
    await send(vault.connect(depositor).deposit(100, await depositor.getAddress()));
    await send(token.mint(await donor.getAddress(), 100));
    await send(token.connect(donor).transfer(await vault.getAddress(), 100));
    await expectRevert(vault.connect(outsider).withdraw(1, await outsider.getAddress(), await outsider.getAddress()));
    assert.equal(await token.balanceOf(await outsider.getAddress()), 0n);
  });

  test("F-07 control mints against the balance delta", async () => {
    const artifacts = await hiddenArtifacts();
    const { signers } = await makeChain();
    const [admin, depositor, attacker] = signers;
    const token = await deploy(artifacts, "HiddenFeeToken", admin, [
      "Fee Asset", "FEE", 18, 1_000, await attacker.getAddress()
    ]);
    const vault = await deploy(artifacts, "ManagedVault", admin, [await token.getAddress()]);
    await send(token.mint(await depositor.getAddress(), ether(1_000)));
    await send(token.connect(depositor).approve(await vault.getAddress(), ether(1_000)));
    await send(vault.connect(depositor).deposit(ether(1_000), await depositor.getAddress()));
    const holderBefore = await vault.convertToAssets(await vault.balanceOf(await depositor.getAddress()));
    await send(token.mint(await attacker.getAddress(), ether(100)));
    const attackerBefore = await token.balanceOf(await attacker.getAddress());
    await send(token.connect(attacker).approve(await vault.getAddress(), ether(100)));
    await send(vault.connect(attacker).deposit(ether(100), await attacker.getAddress()));
    const shares = await vault.balanceOf(await attacker.getAddress());
    await send(vault.connect(attacker).redeem(shares, await attacker.getAddress(), await attacker.getAddress()));
    const attackerAfter = await token.balanceOf(await attacker.getAddress());
    assert.ok(attackerAfter <= attackerBefore + 1n);
    assert.equal(await vault.convertToAssets(await vault.balanceOf(await depositor.getAddress())), holderBefore);
  });

  test("F-08 control binds an authorization to one router", async () => {
    const system = await deploySystem();
    const owner = system.borrower;
    const recipient = system.recipient;
    const ownerWallet = system.wallets[2];
    const first = await deploy(system.artifacts, "HardenedPermitRouter", system.admin);
    const second = await deploy(system.artifacts, "HardenedPermitRouter", system.admin);
    const amount = ether(10);
    const deadline = await blockDeadline(system.provider);
    const chainId = (await system.provider.getNetwork()).chainId;
    await send(system.stable.mint(await owner.getAddress(), amount * 2n));
    await send(system.stable.connect(owner).approve(await first.getAddress(), amount));
    await send(system.stable.connect(owner).approve(await second.getAddress(), amount));
    const payload = scopedPayload(
      chainId, await first.getAddress(), await first.TRANSFER_TYPEHASH(), await owner.getAddress(),
      await system.stable.getAddress(), amount, await recipient.getAddress(), 0, deadline
    );
    const signature = await ownerWallet.signMessage(ethers.getBytes(payload));
    await send(first.executeTransfer(
      await owner.getAddress(), await system.stable.getAddress(), amount, await recipient.getAddress(), deadline, signature
    ));
    await expectRevert(second.executeTransfer(
      await owner.getAddress(), await system.stable.getAddress(), amount, await recipient.getAddress(), deadline, signature
    ));
    assert.equal(await system.stable.balanceOf(await recipient.getAddress()), amount);
  });

  test("F-09 control binds the intended recipient", async () => {
    const system = await deploySystem();
    const owner = system.borrower;
    const ownerWallet = system.wallets[2];
    const router = await deploy(system.artifacts, "HardenedPermitRouter", system.admin);
    const amount = ether(10);
    const deadline = await blockDeadline(system.provider);
    const chainId = (await system.provider.getNetwork()).chainId;
    await send(system.stable.mint(await owner.getAddress(), amount));
    await send(system.stable.connect(owner).approve(await router.getAddress(), amount));
    const payload = scopedPayload(
      chainId, await router.getAddress(), await router.TRANSFER_TYPEHASH(), await owner.getAddress(),
      await system.stable.getAddress(), amount, await system.recipient.getAddress(), 0, deadline
    );
    const signature = await ownerWallet.signMessage(ethers.getBytes(payload));
    await expectRevert(router.connect(system.attacker).executeTransfer(
      await owner.getAddress(), await system.stable.getAddress(), amount,
      await system.attacker.getAddress(), deadline, signature
    ));
    assert.equal(await system.stable.balanceOf(await system.attacker.getAddress()), 0n);
  });

  test("F-10 control authenticates the configured remote gateway", async () => {
    const system = await deploySystem();
    const messenger = await deploy(system.artifacts, "MockMessenger", system.admin);
    const sink = await deploy(system.artifacts, "CreditSink", system.admin);
    const gateway = await deploy(system.artifacts, "GuardedBridgeGateway", system.admin, [
      await messenger.getAddress(), await sink.getAddress(), await system.admin.getAddress()
    ]);
    await send(gateway.configureRemote(10, "0x000000000000000000000000000000000000BEEF"));
    const message = gateway.interface.encodeFunctionData("finalizeCollateral", [
      10, 1, await system.attacker.getAddress(), 100
    ]);
    await expectRevert(messenger.relay(
      await gateway.getAddress(), 10, await system.attacker.getAddress(), message
    ));
    assert.equal(await sink.credit(await system.attacker.getAddress()), 0n);
  });

  test("F-11 control namespaces nonces by source chain", async () => {
    const system = await deploySystem();
    const messenger = await deploy(system.artifacts, "MockMessenger", system.admin);
    const sink = await deploy(system.artifacts, "CreditSink", system.admin);
    const gateway = await deploy(system.artifacts, "GuardedBridgeGateway", system.admin, [
      await messenger.getAddress(), await sink.getAddress(), await system.admin.getAddress()
    ]);
    const remoteA = "0x00000000000000000000000000000000000000A1";
    const remoteB = "0x00000000000000000000000000000000000000B2";
    await send(gateway.configureRemote(10, remoteA));
    await send(gateway.configureRemote(42_161, remoteB));
    const first = gateway.interface.encodeFunctionData("finalizeCollateral", [10, 7, await system.borrower.getAddress(), 11]);
    const second = gateway.interface.encodeFunctionData("finalizeCollateral", [42_161, 7, await system.borrower.getAddress(), 13]);
    await send(messenger.relay(await gateway.getAddress(), 10, remoteA, first));
    await send(messenger.relay(await gateway.getAddress(), 42_161, remoteB, second));
    assert.equal(await sink.credit(await system.borrower.getAddress()), 24n);
  });

  test("F-12 control permits initialization only once", async () => {
    const system = await deploySystem();
    const module = await deploy(system.artifacts, "GuardedStrategyModule", system.admin);
    await send(module.initialize(await system.admin.getAddress(), await system.borrower.getAddress()));
    await expectRevert(module.connect(system.attacker).initialize(
      await system.attacker.getAddress(), await system.attacker.getAddress()
    ));
    assert.equal(await module.operator(), await system.borrower.getAddress());
  });

  test("F-13 control rejects an expired report", async () => {
    const artifacts = await hiddenArtifacts();
    const { signers } = await makeChain();
    const [admin] = signers;
    const feed = await deploy(artifacts, "MockFeed", admin, [8, 100_000_000]);
    const oracle = await deploy(artifacts, "StrictOracle", admin, [await feed.getAddress(), 3_600]);
    await send(feed.setRound(10_000_000_000, 1));
    await expectRevert(oracle.price());
  });

  test("F-14 control reduces debt by the amount received", async () => {
    const artifacts = await hiddenArtifacts();
    const { signers } = await makeChain();
    const [admin, payer] = signers;
    const token = await deploy(artifacts, "HiddenFeeToken", admin, [
      "Fee Dollar", "fUSD", 18, 1_000, await payer.getAddress()
    ]);
    const repayer = await deploy(artifacts, "DeltaRepayer", admin, [await token.getAddress()]);
    await send(repayer.setDebt(await payer.getAddress(), ether(100)));
    await send(token.mint(await payer.getAddress(), ether(100)));
    await send(token.connect(payer).approve(await repayer.getAddress(), ether(100)));
    await send(repayer.connect(payer).repay(await payer.getAddress(), ether(100)));
    assert.equal(await repayer.debt(await payer.getAddress()), ether(10));
    assert.equal(await token.balanceOf(await repayer.getAddress()), ether(90));
  });

  test("F-15 control keys replay protection by the claim payload", async () => {
    const system = await deploySystem();
    const authority = system.wallets[0];
    const claimant = system.borrower;
    const distributor = await deploy(system.artifacts, "HardenedRewardsDistributor", system.admin, [
      await system.stable.getAddress(), await authority.getAddress()
    ]);
    await send(system.stable.mint(await distributor.getAddress(), ether(100)));
    const payload = await distributor.claimPayload(await claimant.getAddress(), ether(20), 9);
    const signature = await authority.signMessage(ethers.getBytes(payload));
    const alternate = malleate(signature);
    await send(distributor.claim(await claimant.getAddress(), ether(20), 9, signature));
    await expectRevert(distributor.claim(await claimant.getAddress(), ether(20), 9, alternate));
    assert.equal(await system.stable.balanceOf(await claimant.getAddress()), ether(20));
  });
});
