import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  blockDeadline,
  compileAll,
  deploy,
  ether,
  ethers,
  makeChain,
  send
} from "./support.mjs";

let artifacts;

before(async () => {
  artifacts = await compileAll();
});

async function deployCreditSystem() {
  const chain = await makeChain();
  const [admin, liquidityProvider, borrower] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, 100_000_000]);
  const oracle = await deploy(artifacts, "ReserveOracle", admin, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(),
    await vault.getAddress(),
    await oracle.getAddress(),
    await admin.getAddress()
  ]);

  await send(asset.mint(await liquidityProvider.getAddress(), ether(20_000)));
  await send(stable.mint(await liquidityProvider.getAddress(), ether(20_000)));
  await send(asset.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(stable.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(pool.connect(liquidityProvider).addLiquidity(ether(10_000), ether(10_000)));
  await send(stable.mint(await market.getAddress(), ether(1_000_000)));
  return { ...chain, admin, liquidityProvider, borrower, asset, stable, vault, pool, feed, oracle, market };
}

describe("Aster Credit", () => {
  test("vault deposits and redemptions preserve proportional ownership", async () => {
    const { borrower, asset, vault } = await deployCreditSystem();
    const borrowerAddress = await borrower.getAddress();
    await send(asset.mint(borrowerAddress, ether(250)));
    await send(asset.connect(borrower).approve(await vault.getAddress(), ether(250)));
    await send(vault.connect(borrower).deposit(ether(250), borrowerAddress));
    assert.equal(await vault.balanceOf(borrowerAddress), ether(250));
    await send(vault.connect(borrower).redeem(ether(50), borrowerAddress, borrowerAddress));
    assert.equal(await asset.balanceOf(borrowerAddress), ether(50));
    assert.equal(await vault.totalAssets(), ether(200));
  });

  test("collateral supports borrowing and repayment", async () => {
    const { borrower, asset, stable, vault, market } = await deployCreditSystem();
    const borrowerAddress = await borrower.getAddress();
    await send(asset.mint(borrowerAddress, ether(1_000)));
    await send(asset.connect(borrower).approve(await vault.getAddress(), ether(1_000)));
    await send(vault.connect(borrower).deposit(ether(1_000), borrowerAddress));
    await send(vault.connect(borrower).approve(await market.getAddress(), ether(1_000)));
    await send(market.connect(borrower).depositCollateral(ether(1_000), borrowerAddress));
    await send(market.connect(borrower).borrow(ether(500), borrowerAddress, "0x"));
    assert.equal(await market.debt(borrowerAddress), ether(500));
    await send(stable.connect(borrower).approve(await market.getAddress(), ether(200)));
    await send(market.connect(borrower).repay(borrowerAddress, ether(200)));
    assert.equal(await market.debt(borrowerAddress), ether(300));
  });

  test("oracle reports normalized primary prices", async () => {
    const { oracle } = await deployCreditSystem();
    assert.equal(await oracle.price(), ether(1));
  });

  test("signed transfers advance their owner nonce", async () => {
    const { provider, signers, wallets, stable } = await deployCreditSystem();
    const [, owner, recipient, relayer] = signers;
    const ownerWallet = wallets[1];
    const router = await deploy(artifacts, "PermitRouter", signers[0]);
    const amount = ether(25);
    const deadline = await blockDeadline(provider);
    await send(stable.mint(await owner.getAddress(), amount));
    await send(stable.connect(owner).approve(await router.getAddress(), amount));
    const typeHash = await router.TRANSFER_TYPEHASH();
    const payload = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
      [typeHash, await owner.getAddress(), await stable.getAddress(), amount, 0, deadline]
    ));
    const signature = await ownerWallet.signMessage(ethers.getBytes(payload));
    await send(router.connect(relayer).executeTransfer(
      await owner.getAddress(), await stable.getAddress(), amount, await recipient.getAddress(), deadline, signature
    ));
    assert.equal(await stable.balanceOf(await recipient.getAddress()), amount);
    assert.equal(await router.nonces(await owner.getAddress()), 1n);
  });

  test("bridge messages credit remote collateral", async () => {
    const { admin, borrower, market } = await deployCreditSystem();
    const messenger = await deploy(artifacts, "MockMessenger", admin);
    const gateway = await deploy(artifacts, "BridgeGateway", admin, [
      await messenger.getAddress(), await market.getAddress(), await admin.getAddress()
    ]);
    const remote = "0x000000000000000000000000000000000000BEEF";
    await send(gateway.configureRemote(10, remote));
    await send(market.setBridge(await gateway.getAddress()));
    const message = gateway.interface.encodeFunctionData("finalizeCollateral", [
      10, 41, await borrower.getAddress(), ether(125)
    ]);
    await send(messenger.relay(await gateway.getAddress(), 10, remote, message));
    assert.equal(await market.bridgeCollateral(await borrower.getAddress()), ether(125));
  });

  test("reward claims and strategy operations complete", async () => {
    const { provider, signers, wallets, stable } = await deployCreditSystem();
    const [admin, operator, claimant] = signers;
    const authority = wallets[0];
    const distributor = await deploy(artifacts, "RewardsDistributor", admin, [
      await stable.getAddress(), await authority.getAddress()
    ]);
    await send(stable.mint(await distributor.getAddress(), ether(1_000)));
    const payload = await distributor.claimPayload(await claimant.getAddress(), ether(20), 7);
    const signature = await authority.signMessage(ethers.getBytes(payload));
    await send(distributor.connect(claimant).claim(await claimant.getAddress(), ether(20), 7, signature));
    assert.equal(await stable.balanceOf(await claimant.getAddress()), ether(20));

    const module = await deploy(artifacts, "StrategyModule", admin);
    await send(module.initialize(await admin.getAddress(), await operator.getAddress()));
    await send(stable.mint(await module.getAddress(), ether(10)));
    const operatorBalance = await stable.balanceOf(await operator.getAddress());
    await send(module.connect(operator).sweep(await stable.getAddress(), await operator.getAddress(), ether(10)));
    assert.equal(await stable.balanceOf(await operator.getAddress()), operatorBalance + ether(10));
    assert.equal((await provider.getNetwork()).chainId, 31_337n);
  });
});
