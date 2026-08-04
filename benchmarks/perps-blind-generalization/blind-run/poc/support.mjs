import assert from 'node:assert/strict';
import { chain, deploy, expectRevert, increaseTime, WAD } from '../../test/support.mjs';

export { assert, chain, deploy, expectRevert, increaseTime, WAD };

export function accountIdOf(signer, nonce = 1n) {
  return signer.getAddress().then((address) => (BigInt(address) << 96n) | nonce);
}

export async function receipt(promise) {
  return (await promise).wait();
}

export async function deploySystem({
  collateralDecimals = 6,
  feedDecimals = 8,
  initialPrice = 2_000n * 10n ** BigInt(feedDecimals),
  withdrawalDelay = 60,
  marketConfig = [true, 2, 1_000, 600, 800, 3_600, 5_000n * WAD, 100_000n * WAD],
  skipInitialObserve = false,
} = {}) {
  const context = await chain();
  const [governor, trader, other, bidder, victim, matcher, shareholder, keeper] = context.signers;
  const governorAddress = await governor.getAddress();
  const token = await deploy('MockERC20', governor, ['Margin USD', 'mUSD', collateralDecimals]);
  const feed = await deploy('MockPriceFeed', governor, [feedDecimals, initialPrice]);
  const catalog = await deploy('MarketCatalog', governor, [governorAddress]);
  const oracle = await deploy('OracleHub', governor, [governorAddress]);
  const funding = await deploy('FundingEngine', governor, [governorAddress, await oracle.getAddress()]);
  const vault = await deploy('MarginVault', governor, [governorAddress, await token.getAddress(), withdrawalDelay]);
  const clearing = await deploy('ClearingHouse', governor, [
    governorAddress,
    await catalog.getAddress(),
    await oracle.getAddress(),
    await funding.getAddress(),
    await vault.getAddress(),
  ]);
  const venue = await deploy('MockVenue', governor);
  const insurance = await deploy('InsuranceFund', governor, [governorAddress, await token.getAddress()]);
  const router = await deploy('ExecutionRouter', governor, [governorAddress, await clearing.getAddress()]);
  const auction = await deploy('LiquidationAuction', governor, [
    governorAddress,
    await clearing.getAddress(),
    await clearing.getAddress(),
    await catalog.getAddress(),
    await oracle.getAddress(),
    await insurance.getAddress(),
  ]);
  const settlement = await deploy('EpochSettlement', governor, [
    governorAddress,
    await oracle.getAddress(),
    await clearing.getAddress(),
  ]);

  await receipt(catalog.configureMarket(1, marketConfig));
  await receipt(oracle.configureFeed(1, await feed.getAddress(), 3_600, 2_000));
  if (!skipInitialObserve) await receipt(oracle.observe(1));
  await receipt(funding.configure(1, 60, 1_000_000_000_000n));
  await receipt(funding.setClearingHouse(await clearing.getAddress()));
  await receipt(vault.setController(await clearing.getAddress()));
  await receipt(insurance.configure(await clearing.getAddress(), await auction.getAddress(), await venue.getAddress()));
  await receipt(clearing.configureModules(
    await router.getAddress(),
    await auction.getAddress(),
    await settlement.getAddress(),
    await insurance.getAddress(),
  ));
  await receipt(oracle.setSettlementCoordinator(await settlement.getAddress()));

  return {
    ...context,
    governor,
    trader,
    other,
    bidder,
    victim,
    matcher,
    shareholder,
    keeper,
    token,
    feed,
    catalog,
    oracle,
    funding,
    vault,
    clearing,
    venue,
    insurance,
    router,
    auction,
    settlement,
  };
}

export async function openAndFund(system, signer, tokenAmount, nonce = 1n) {
  await receipt(system.vault.connect(signer).openAccount());
  const id = await accountIdOf(signer, nonce);
  await receipt(system.token.mint(await signer.getAddress(), tokenAmount));
  await receipt(system.token.connect(signer).approve(await system.vault.getAddress(), tokenAmount));
  await receipt(system.vault.connect(signer).deposit(id, tokenAmount));
  return id;
}

export async function addMarket(system, {
  id = 2,
  feedDecimals = 8,
  initialPrice = 2_000n * 10n ** BigInt(feedDecimals),
  config = [true, 2, 1_000, 600, 800, 3_600, 5_000n * WAD, 100_000n * WAD],
} = {}) {
  const feed = await deploy('MockPriceFeed', system.governor, [feedDecimals, initialPrice]);
  await receipt(system.catalog.configureMarket(id, config));
  await receipt(system.oracle.configureFeed(id, await feed.getAddress(), 3_600, 2_000));
  await receipt(system.oracle.observe(id));
  await receipt(system.funding.configure(id, 60, 1_000_000_000_000n));
  return feed;
}

export async function expectCustomRevert(promise, label = 'expected revert') {
  let failed = false;
  try {
    await promise;
  } catch {
    failed = true;
  }
  assert.equal(failed, true, label);
}
