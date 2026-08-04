import assert from 'node:assert/strict';
import test from 'node:test';
import { chain, deploy, expectRevert, increaseTime, WAD } from './support.mjs';

async function baseSystem() {
  const context = await chain();
  const [governor, trader, other] = context.signers;
  const token = await deploy('MockERC20', governor, ['Margin USD', 'mUSD', 6]);
  const feed = await deploy('MockPriceFeed', governor, [8, 2_000n * 10n ** 8n]);
  const catalog = await deploy('MarketCatalog', governor, [await governor.getAddress()]);
  const oracle = await deploy('OracleHub', governor, [await governor.getAddress()]);
  const funding = await deploy('FundingEngine', governor, [await governor.getAddress(), await oracle.getAddress()]);
  const vault = await deploy('MarginVault', governor, [await governor.getAddress(), await token.getAddress(), 60]);
  const clearing = await deploy('ClearingHouse', governor, [
    await governor.getAddress(), await catalog.getAddress(), await oracle.getAddress(), await funding.getAddress(), await vault.getAddress(),
  ]);
  const venue = await deploy('MockVenue', governor);
  const insurance = await deploy('InsuranceFund', governor, [await governor.getAddress(), await token.getAddress()]);
  const router = await deploy('ExecutionRouter', governor, [await governor.getAddress(), await clearing.getAddress()]);
  await (await catalog.configureMarket(1, [true, 2, 1_000, 600, 800, 3_600, 5_000n * WAD, 100_000n * WAD])).wait();
  await (await oracle.configureFeed(1, await feed.getAddress(), 3_600, 2_000)).wait();
  await (await oracle.observe(1)).wait();
  await (await funding.configure(1, 60, 1_000_000_000_000n)).wait();
  await (await funding.setClearingHouse(await clearing.getAddress())).wait();
  await (await vault.setController(await clearing.getAddress())).wait();
  await (await insurance.configure(await clearing.getAddress(), await governor.getAddress(), await venue.getAddress())).wait();
  await (await clearing.configureModules(await router.getAddress(), await governor.getAddress(), await governor.getAddress(), await insurance.getAddress())).wait();
  return { ...context, governor, trader, other, token, feed, catalog, oracle, funding, vault, clearing, venue, insurance, router };
}

test('governance configures markets, feeds, and funding parameters', async () => {
  const { catalog, oracle, funding } = await baseSystem();
  const market = await catalog.market(1);
  assert.equal(market.active, true);
  assert.equal(await oracle.indexPrice(1), 2_000n * WAD);
  const state = await funding.funding(1);
  assert.equal(state.interval, 60n);
});

test('a trader deposits collateral and opens a margined position', async () => {
  const { trader, token, vault, router, clearing } = await baseSystem();
  await (await vault.connect(trader).openAccount()).wait();
  const owner = BigInt(await trader.getAddress());
  const accountId = (owner << 96n) | 1n;
  await (await token.mint(await trader.getAddress(), 50_000n * 10n ** 6n)).wait();
  await (await token.connect(trader).approve(await vault.getAddress(), 50_000n * 10n ** 6n)).wait();
  await (await vault.connect(trader).deposit(accountId, 50_000n * 10n ** 6n)).wait();
  await (await router.connect(trader).executePortfolio(accountId, [[1, 2n * WAD, 2_000n * WAD]], 2_000n * WAD, true)).wait();
  const position = await clearing.position(accountId, 1);
  assert.equal(position.base, 2n * WAD);
  assert.equal(position.entryPrice, 2_000n * WAD);
  assert.ok((await clearing.accountEquity(accountId)) > 0n);
});

test('portfolio execution enforces the declared aggregate limit', async () => {
  const { trader, token, vault, router } = await baseSystem();
  await (await vault.connect(trader).openAccount()).wait();
  const accountId = (BigInt(await trader.getAddress()) << 96n) | 1n;
  await (await token.mint(await trader.getAddress(), 20_000n * 10n ** 6n)).wait();
  await (await token.connect(trader).approve(await vault.getAddress(), 20_000n * 10n ** 6n)).wait();
  await (await vault.connect(trader).deposit(accountId, 20_000n * 10n ** 6n)).wait();
  await expectRevert(router.connect(trader).executePortfolio(accountId, [[1, WAD, 2_100n * WAD]], 2_000n * WAD, true));
});

test('withdrawal requests respect their execution delay', async () => {
  const { eip1193, trader, token, vault } = await baseSystem();
  await (await vault.connect(trader).openAccount()).wait();
  const accountId = (BigInt(await trader.getAddress()) << 96n) | 1n;
  await (await token.mint(await trader.getAddress(), 1_000n * 10n ** 6n)).wait();
  await (await token.connect(trader).approve(await vault.getAddress(), 1_000n * 10n ** 6n)).wait();
  await (await vault.connect(trader).deposit(accountId, 1_000n * 10n ** 6n)).wait();
  await (await vault.connect(trader).requestWithdrawal(accountId, 100n * WAD, await trader.getAddress())).wait();
  await expectRevert(vault.connect(trader).claimWithdrawal(accountId));
  await increaseTime(eip1193, 61);
  await (await vault.connect(trader).claimWithdrawal(accountId, { gasLimit: 500_000 })).wait();
  assert.equal(await vault.balanceOf(accountId), 900n * WAD);
});

test('insurance shares track deposits and proportional redemptions', async () => {
  const { trader, token, insurance } = await baseSystem();
  await (await token.mint(await trader.getAddress(), 1_000n * 10n ** 6n)).wait();
  await (await token.connect(trader).approve(await insurance.getAddress(), 1_000n * 10n ** 6n)).wait();
  await (await insurance.connect(trader).deposit(1_000n * 10n ** 6n, await trader.getAddress())).wait();
  assert.equal(await insurance.balanceOf(await trader.getAddress()), 1_000n * WAD);
  await (await insurance.connect(trader).redeem(250n * WAD, await trader.getAddress())).wait();
  assert.equal(await insurance.balanceOf(await trader.getAddress()), 750n * WAD);
});
