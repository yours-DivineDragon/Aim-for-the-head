import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const targetIndex = argv.indexOf('--target');
const target = path.resolve(targetIndex === -1 ? process.cwd() : argv[targetIndex + 1]);
const startIndex = argv.indexOf('--start');
const startAt = startIndex === -1 ? 0 : Number(argv[startIndex + 1]);
const bundle = path.resolve(import.meta.dirname, '..');
const requireFromTarget = createRequire(path.join(target, 'package.json'));
const ganache = requireFromTarget('ganache');
const { BrowserProvider, ContractFactory, keccak256, toUtf8Bytes } = requireFromTarget('ethers');
const { compile } = await import(pathToFileURL(path.join(target, 'scripts', 'compiler.mjs')));
const WAD = 10n ** 18n;

const PATCHES = [
  [{ file: 'MarketCatalog.sol', from: 'function setRiskTier(uint32 marketId, uint8 tier) external {', to: 'function setRiskTier(uint32 marketId, uint8 tier) external onlyGovernor {' }],
  [{
    file: 'MarginVault.sol',
    from: `uint256 tokenAmount = _fromWad(amount);\n        if (!collateralToken.transfer(recipient, tokenAmount)) revert TransferFailed();\n        balances[accountId] -= amount;\n        delete withdrawalRequests[accountId];`,
    to: `uint256 tokenAmount = _fromWad(amount);\n        balances[accountId] -= amount;\n        delete withdrawalRequests[accountId];\n        if (!collateralToken.transfer(recipient, tokenAmount)) revert TransferFailed();`,
  }],
  [{
    file: 'MarginVault.sol',
    from: `wadAmount = _toWad(tokenAmount);\n        if (!collateralToken.transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();\n        balances[accountId] += wadAmount;`,
    to: `uint256 balanceBefore = collateralToken.balanceOf(address(this));\n        if (!collateralToken.transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();\n        wadAmount = _toWad(collateralToken.balanceOf(address(this)) - balanceBefore);\n        balances[accountId] += wadAmount;`,
  }],
  [{
    file: 'OracleHub.sol',
    from: 'price = uint256(answer) * (10 ** (18 - precision));',
    to: 'price = precision <= 18 ? uint256(answer) * (10 ** (18 - precision)) : uint256(answer) / (10 ** (precision - 18));',
  }],
  [{
    file: 'FundingEngine.sol',
    from: 'if (rate > state.maxRatePerSecond) rate = state.maxRatePerSecond;',
    to: `if (rate > state.maxRatePerSecond) rate = state.maxRatePerSecond;\n        if (rate < -state.maxRatePerSecond) rate = -state.maxRatePerSecond;`,
  }],
  [{
    file: 'FundingEngine.sol',
    from: 'payment = (base * (currentGrowth - previousGrowth)) / 1e18;',
    to: 'payment = SignedWadMath.mulWadDown(base, currentGrowth - previousGrowth);',
  }],
  [{
    file: 'lib/PortfolioRisk.sol',
    from: 'if (opposite || correlation < 0) {',
    to: 'if (opposite == (correlation > 0)) {',
  }],
  [{
    file: 'ClearingHouse.sol',
    from: 'if ((newBase < 0) != (oldBase < 0)) position.entryPrice = uint128((uint256(position.entryPrice) + executionPrice) / 2);',
    to: 'if ((newBase < 0) != (oldBase < 0)) position.entryPrice = uint128(executionPrice);',
  }],
  [{
    file: 'ClearingHouse.sol',
    from: 'openInterest[marketId] += baseDelta.abs();',
    to: `uint256 oldExposure = oldBase.abs();\n        uint256 newExposure = newBase.abs();\n        if (newExposure >= oldExposure) openInterest[marketId] += newExposure - oldExposure;\n        else openInterest[marketId] -= oldExposure - newExposure;`,
  }],
  [
    { file: 'ExecutionRouter.sol', from: 'uint256 priceSum;', to: 'uint256 priceSum;\n        uint256 weightSum;' },
    {
      file: 'ExecutionRouter.sol',
      from: 'priceSum += legs[i].executionPrice;',
      to: `uint256 weight = int256(legs[i].baseDelta).abs();\n            priceSum += legs[i].executionPrice * weight;\n            weightSum += weight;`,
    },
    { file: 'ExecutionRouter.sol', from: 'uint256 averagePrice = priceSum / legs.length;', to: 'uint256 averagePrice = priceSum / weightSum;' },
  ],
  [{
    file: 'EpochSettlement.sol',
    from: 'if (block.timestamp < state.cutoff) revert NotReady();',
    to: `if (block.timestamp < state.cutoff) revert NotReady();\n        if (block.timestamp > state.cutoff + 1) revert NotReady();`,
  }],
  [{
    file: 'EpochSettlement.sol',
    from: `aggregatePnl += clearing.realizeSettlement(accountId, markets[m], price);\n                clearing.settleAccountFunding(accountId, markets[m]);`,
    to: `clearing.settleAccountFunding(accountId, markets[m]);\n                aggregatePnl += clearing.realizeSettlement(accountId, markets[m], price);`,
  }],
  [{
    file: 'LiquidationAuction.sol',
    from: 'if (auction.remainingBase != 0 && block.timestamp < auction.startedAt + auction.duration) revert InvalidAuction();',
    to: 'if (auction.remainingBase != 0) revert InvalidAuction();',
  }],
  [{ file: 'InsuranceFund.sol', from: 'auctionReserved -= returned;', to: 'auctionReserved -= amount;' }],
  [
    {
      file: 'ClearingHouse.sol',
      from: 'if (executionPrice == 0 || baseDelta > type(int128).max || baseDelta < type(int128).min) revert InvalidTrade();',
      to: 'if (executionPrice == 0 || baseDelta == 0 || baseDelta > type(int128).max || baseDelta < type(int128).min) revert InvalidTrade();',
    },
    {
      file: 'ClearingHouse.sol',
      from: 'if (oldBase == 0) {\n            activeMarkets[accountId].push(marketId);',
      to: 'if (oldBase == 0) {\n            if (baseDelta != 0) activeMarkets[accountId].push(marketId);',
    },
  ],
];

function prepareSources(patches = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-private-'));
  fs.cpSync(path.join(target, 'contracts'), directory, { recursive: true });
  fs.mkdirSync(path.join(directory, 'harness'));
  fs.copyFileSync(path.join(bundle, 'harness', 'PrivateHarnesses.sol'), path.join(directory, 'harness', 'PrivateHarnesses.sol'));
  for (const patch of patches) {
    const filename = path.join(directory, patch.file);
    const current = fs.readFileSync(filename, 'utf8');
    const occurrences = current.split(patch.from).length - 1;
    assert.equal(occurrences, 1, `patch anchor count for ${patch.file}`);
    fs.writeFileSync(filename, current.replace(patch.from, patch.to));
  }
  return directory;
}

function build(patches = []) {
  const sourceRoot = prepareSources(patches);
  try { return compile({ sourceRoot }).artifacts; }
  finally { fs.rmSync(sourceRoot, { recursive: true, force: true }); }
}

async function newChain() {
  const eip1193 = ganache.provider({
    logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' },
    wallet: { deterministic: true, totalAccounts: 8, defaultBalance: 10_000 },
  });
  const provider = new BrowserProvider(eip1193);
  const signers = await Promise.all(Array.from({ length: 8 }, (_, i) => provider.getSigner(i)));
  return { eip1193, provider, signers };
}

async function deploy(artifacts, name, signer, args = []) {
  const artifact = artifacts.get(name);
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function time(eip1193, seconds) {
  await eip1193.request({ method: 'evm_increaseTime', params: [seconds] });
  await eip1193.request({ method: 'evm_mine', params: [] });
}

async function succeeds(action) {
  try { const tx = await action(); if (tx?.wait) await tx.wait(); return true; } catch { return false; }
}

async function coreSystem(a, options = {}) {
  const c = await newChain();
  const [gov, trader, other] = c.signers;
  const token = await deploy(a, 'MockERC20', gov, ['Margin USD', 'mUSD', 6]);
  const feed = await deploy(a, 'MockPriceFeed', gov, [8, 2_000n * 10n ** 8n]);
  const catalog = await deploy(a, 'MarketCatalog', gov, [await gov.getAddress()]);
  const oracle = await deploy(a, 'OracleHub', gov, [await gov.getAddress()]);
  const funding = await deploy(a, 'FundingEngine', gov, [await gov.getAddress(), await oracle.getAddress()]);
  const vault = await deploy(a, 'MarginVault', gov, [await gov.getAddress(), await token.getAddress(), 0]);
  const clearing = await deploy(a, 'ClearingHouse', gov, [await gov.getAddress(), await catalog.getAddress(), await oracle.getAddress(), await funding.getAddress(), await vault.getAddress()]);
  const venue = await deploy(a, 'MockVenue', gov);
  const insurance = await deploy(a, 'InsuranceFund', gov, [await gov.getAddress(), await token.getAddress()]);
  const router = await deploy(a, 'ExecutionRouter', gov, [await gov.getAddress(), await clearing.getAddress()]);
  const initialBps = options.initialBps ?? 1_000;
  const maintenanceBps = options.maintenanceBps ?? 600;
  await (await catalog.configureMarket(1, [true, 2, initialBps, maintenanceBps, 800, 3_600, 5_000n * WAD, 100_000n * WAD])).wait();
  await (await oracle.configureFeed(1, await feed.getAddress(), 3_600, 0)).wait();
  await (await funding.configure(1, 10, 1_000_000_000_000n)).wait();
  await (await funding.setClearingHouse(await clearing.getAddress())).wait();
  await (await vault.setController(await clearing.getAddress())).wait();
  await (await insurance.configure(await clearing.getAddress(), await gov.getAddress(), await venue.getAddress())).wait();
  await (await clearing.configureModules(await router.getAddress(), await gov.getAddress(), await gov.getAddress(), await insurance.getAddress())).wait();
  await (await vault.connect(trader).openAccount()).wait();
  const accountId = (BigInt(await trader.getAddress()) << 96n) | 1n;
  const deposit = options.deposit ?? 50_000n;
  await (await token.mint(await trader.getAddress(), deposit * 10n ** 6n)).wait();
  await (await token.connect(trader).approve(await vault.getAddress(), deposit * 10n ** 6n)).wait();
  await (await vault.connect(trader).deposit(accountId, deposit * 10n ** 6n)).wait();
  return { ...c, gov, trader, other, token, feed, catalog, oracle, funding, vault, clearing, venue, insurance, router, accountId };
}

const scenarios = [
  async (a) => {
    const { signers } = await newChain(); const [gov, outsider] = signers;
    const catalog = await deploy(a, 'MarketCatalog', gov, [await gov.getAddress()]);
    await (await catalog.configureMarket(1, [true, 1, 1000, 600, 500, 3600, WAD, 100n * WAD])).wait();
    const ok = await succeeds(() => catalog.connect(outsider).setRiskTier(1, 6));
    return ok && await catalog.market(1).then((m) => m.riskTier === 6n);
  },
  async (a) => {
    const { eip1193, signers } = await newChain(); const [gov, trader] = signers;
    const token = await deploy(a, 'CallbackToken', gov, [18]);
    const vault = await deploy(a, 'MarginVault', gov, [await gov.getAddress(), await token.getAddress(), 0]);
    await (await vault.connect(trader).openAccount()).wait();
    const accountId = (BigInt(await trader.getAddress()) << 96n) | 1n;
    const observer = await deploy(a, 'WithdrawalObserver', gov, [await vault.getAddress(), accountId]);
    await (await token.mint(await trader.getAddress(), 100n * WAD)).wait();
    await (await token.connect(trader).approve(await vault.getAddress(), 100n * WAD)).wait();
    await (await vault.connect(trader).deposit(accountId, 100n * WAD)).wait();
    await (await vault.connect(trader).requestWithdrawal(accountId, 40n * WAD, await observer.getAddress())).wait();
    await time(eip1193, 1);
    await (await vault.claimWithdrawal(accountId, { gasLimit: 800_000 })).wait();
    return (await observer.observedBalance()) === 100n * WAD && (await observer.observedRequest()) === 40n * WAD;
  },
  async (a) => {
    const { signers } = await newChain(); const [gov, trader] = signers;
    const token = await deploy(a, 'MockERC20', gov, ['Fee Asset', 'FEE', 18]);
    const vault = await deploy(a, 'MarginVault', gov, [await gov.getAddress(), await token.getAddress(), 0]);
    await (await vault.connect(trader).openAccount()).wait();
    const accountId = (BigInt(await trader.getAddress()) << 96n) | 1n;
    await (await token.setTransferFee(1_000)).wait();
    await (await token.mint(await trader.getAddress(), 100n * WAD)).wait();
    await (await token.connect(trader).approve(await vault.getAddress(), 100n * WAD)).wait();
    await (await vault.connect(trader).deposit(accountId, 100n * WAD)).wait();
    return (await vault.balanceOf(accountId)) > (await token.balanceOf(await vault.getAddress()));
  },
  async (a) => {
    const { signers } = await newChain(); const [gov] = signers;
    const feed = await deploy(a, 'MockPriceFeed', gov, [20, 2_000n * 10n ** 20n]);
    const oracle = await deploy(a, 'OracleHub', gov, [await gov.getAddress()]);
    await (await oracle.configureFeed(1, await feed.getAddress(), 3600, 0)).wait();
    try { const value = await oracle.indexPrice(1); return value !== 2_000n * WAD; } catch { return true; }
  },
  async (a) => {
    const { eip1193, signers } = await newChain(); const [gov] = signers;
    const feed = await deploy(a, 'MockPriceFeed', gov, [8, 2_000n * 10n ** 8n]);
    const oracle = await deploy(a, 'OracleHub', gov, [await gov.getAddress()]);
    const funding = await deploy(a, 'FundingEngine', gov, [await gov.getAddress(), await oracle.getAddress()]);
    await (await oracle.configureFeed(1, await feed.getAddress(), 3600, 0)).wait();
    await (await funding.configure(1, 10, 1_000_000_000_000n)).wait();
    await (await funding.setClearingHouse(await gov.getAddress())).wait();
    await (await funding.updateMark(1, 100n * WAD)).wait();
    await time(eip1193, 11);
    await (await funding.accrue(1, { gasLimit: 500_000 })).wait();
    const state = await funding.funding(1);
    const magnitude = state.growth < 0n ? -state.growth : state.growth;
    return magnitude > 20n * 1_000_000_000_000n;
  },
  async (a) => {
    const { signers } = await newChain(); const [gov] = signers;
    const feed = await deploy(a, 'MockPriceFeed', gov, [8, 2_000n * 10n ** 8n]);
    const oracle = await deploy(a, 'OracleHub', gov, [await gov.getAddress()]);
    const funding = await deploy(a, 'FundingEngine', gov, [await gov.getAddress(), await oracle.getAddress()]);
    const result = await funding.checkpointPosition(1, 1, 1);
    return result[0] === 0n;
  },
  async (a) => {
    const { signers } = await newChain(); const [gov] = signers;
    const probe = await deploy(a, 'RiskProbe', gov);
    const legs = [[1, 1_000n * WAD, 1_000, 0], [2, -1_000n * WAD, 1_000, 0]];
    const required = await probe.requirement(legs, [-5_000]);
    return required < 200n * WAD;
  },
  async (a) => {
    const s = await coreSystem(a);
    await (await s.router.connect(s.trader).executePortfolio(s.accountId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true)).wait();
    await (await s.router.connect(s.trader).executePortfolio(s.accountId, [[1, -2n * WAD, 2_200n * WAD]], 2_200n * WAD, false)).wait();
    return (await s.clearing.position(s.accountId, 1)).entryPrice === 2_100n * WAD;
  },
  async (a) => {
    const s = await coreSystem(a);
    await (await s.router.connect(s.trader).executePortfolio(s.accountId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true)).wait();
    await (await s.router.connect(s.trader).executePortfolio(s.accountId, [[1, -WAD, 2_000n * WAD]], 2_000n * WAD, false)).wait();
    return (await s.clearing.openInterest(1)) === 2n * WAD;
  },
  async (a) => {
    const { signers } = await newChain(); const [gov, trader] = signers;
    const probe = await deploy(a, 'TradeClearingProbe', gov);
    const router = await deploy(a, 'ExecutionRouter', gov, [await gov.getAddress(), await probe.getAddress()]);
    const ok = await succeeds(() => router.connect(trader).executePortfolio(1, [[1, 100n * WAD, 3_000n * WAD], [2, WAD, 1_000n * WAD]], 2_000n * WAD, true));
    return ok;
  },
  async (a) => {
    const { eip1193, provider, signers } = await newChain(); const [gov] = signers;
    const feed = await deploy(a, 'MockPriceFeed', gov, [8, 2_000n * 10n ** 8n]);
    const oracle = await deploy(a, 'OracleHub', gov, [await gov.getAddress()]);
    const probe = await deploy(a, 'SettlementClearingProbe', gov);
    const epoch = await deploy(a, 'EpochSettlement', gov, [await gov.getAddress(), await oracle.getAddress(), await probe.getAddress()]);
    await (await oracle.configureFeed(1, await feed.getAddress(), 3600, 0)).wait();
    await (await oracle.setSettlementCoordinator(await epoch.getAddress())).wait();
    const now = (await provider.getBlock('latest')).timestamp;
    await (await epoch.schedule(now + 5, [1])).wait();
    await time(eip1193, 10);
    await (await feed.setAnswer(3_000n * 10n ** 8n)).wait();
    const ok = await succeeds(() => epoch.recordPrices(1, { gasLimit: 800_000 }));
    return ok && (await oracle.settlementPrice(1, 1)) === 3_000n * WAD;
  },
  async (a) => {
    const { eip1193, provider, signers } = await newChain(); const [gov] = signers;
    const feed = await deploy(a, 'MockPriceFeed', gov, [8, 2_000n * 10n ** 8n]);
    const oracle = await deploy(a, 'OracleHub', gov, [await gov.getAddress()]);
    const probe = await deploy(a, 'SettlementClearingProbe', gov);
    const epoch = await deploy(a, 'EpochSettlement', gov, [await gov.getAddress(), await oracle.getAddress(), await probe.getAddress()]);
    await (await oracle.configureFeed(1, await feed.getAddress(), 3600, 0)).wait();
    await (await oracle.setSettlementCoordinator(await epoch.getAddress())).wait();
    const now = (await provider.getBlock('latest')).timestamp;
    await (await epoch.schedule(now + 10, [1])).wait(); await time(eip1193, 11);
    await (await epoch.recordPrices(1, { gasLimit: 800_000 })).wait();
    await (await epoch.settleBatch(1, [123], { gasLimit: 1_000_000 })).wait();
    return await probe.orderViolation();
  },
  async (a) => {
    const { eip1193, signers } = await newChain(); const [gov] = signers;
    const token = await deploy(a, 'MockERC20', gov, ['Margin', 'M', 18]);
    const feed = await deploy(a, 'MockPriceFeed', gov, [8, 2_000n * 10n ** 8n]);
    const catalog = await deploy(a, 'MarketCatalog', gov, [await gov.getAddress()]);
    const oracle = await deploy(a, 'OracleHub', gov, [await gov.getAddress()]);
    const insurance = await deploy(a, 'InsuranceFund', gov, [await gov.getAddress(), await token.getAddress()]);
    const probe = await deploy(a, 'AuctionClearingProbe', gov);
    const auction = await deploy(a, 'LiquidationAuction', gov, [await gov.getAddress(), await probe.getAddress(), await probe.getAddress(), await catalog.getAddress(), await oracle.getAddress(), await insurance.getAddress()]);
    await (await catalog.configureMarket(1, [true, 1, 1000, 600, 500, 3600, WAD, 100n * WAD])).wait();
    await (await oracle.configureFeed(1, await feed.getAddress(), 3600, 0)).wait();
    await (await auction.start(123, 1)).wait(); await time(eip1193, 1801);
    const ok = await succeeds(() => auction.finalize(1, { gasLimit: 800_000 }));
    const state = await auction.auctions(1);
    return ok && state.remainingBase > 0n && !(await probe.frozen());
  },
  async (a) => {
    const { signers } = await newChain(); const [gov, bidder] = signers;
    const token = await deploy(a, 'MockERC20', gov, ['Margin', 'M', 18]);
    const fund = await deploy(a, 'InsuranceFund', gov, [await gov.getAddress(), await token.getAddress()]);
    const venue = await deploy(a, 'MockVenue', gov);
    await (await fund.configure(await gov.getAddress(), await gov.getAddress(), await venue.getAddress())).wait();
    await (await token.mint(await bidder.getAddress(), 100n * WAD)).wait();
    await (await token.connect(bidder).approve(await fund.getAddress(), 100n * WAD)).wait();
    const key = keccak256(toUtf8Bytes('bond'));
    await (await fund.reserveAuctionBond(key, await bidder.getAddress(), 100n * WAD)).wait();
    await (await fund.releaseAuctionBond(key, await bidder.getAddress(), 5_000)).wait();
    return (await fund.auctionReserved()) === 50n * WAD && (await fund.reservedBond(key)) === 0n;
  },
  async (a) => {
    const s = await coreSystem(a, { initialBps: 100, maintenanceBps: 50, deposit: 10_000n });
    for (let i = 0; i < 5; i++) {
      const ok = await succeeds(() => s.router.connect(s.trader).executePortfolio(s.accountId, [[1, 0, 2_000n * WAD]], 2_000n * WAD, true));
      if (!ok) return false;
    }
    await (await s.router.connect(s.trader).executePortfolio(s.accountId, [[1, 5n * WAD, 2_000n * WAD]], 2_000n * WAD, true)).wait();
    await (await s.feed.setAnswer(2_500n * 10n ** 8n, { gasLimit: 200_000 })).wait();
    const inflated = await s.clearing.accountEquity(s.accountId);
    const recipient = await s.trader.getAddress();
    const withdrew = await succeeds(() => s.clearing.connect(s.trader).withdrawMargin(s.accountId, 9_000n * WAD, recipient, { gasLimit: 2_000_000 }));
    await (await s.feed.setAnswer(1_000n * 10n ** 8n, { gasLimit: 200_000 })).wait();
    const finalEquity = await s.clearing.accountEquity(s.accountId);
    return inflated > 20_000n * WAD && withdrew && finalEquity < -20_000n * WAD;
  },
];

assert.equal(PATCHES.length, 15);
assert.equal(scenarios.length, 15);
const truth = JSON.parse(fs.readFileSync(path.join(bundle, 'truth', 'units.json'), 'utf8'));
assert.equal(truth.units.length, 15);
assert.equal(truth.units.reduce((sum, unit) => sum + unit.weight, 0), 100);

const original = build();
let reproductionPass = 0;
let controlPass = 0;
const results = [];
for (let i = startAt; i < scenarios.length; i++) {
  const reproduced = await scenarios[i](original);
  if (reproduced) reproductionPass++;
  const patched = build(PATCHES[i]);
  const stillReproduces = await scenarios[i](patched);
  const controlled = !stillReproduces;
  if (controlled) controlPass++;
  results.push({ unit: truth.units[i].id, reproduction: reproduced ? 'pass' : 'fail', control: controlled ? 'pass' : 'fail' });
  console.log(`${i + 1}/15 reproduction=${reproduced ? 'pass' : 'fail'} control=${controlled ? 'pass' : 'fail'}`);
}
console.log(JSON.stringify({ reproductionPass, controlPass, total: 15, results }, null, 2));
const expected = 15 - startAt;
if (reproductionPass !== expected || controlPass !== expected) process.exitCode = 1;
