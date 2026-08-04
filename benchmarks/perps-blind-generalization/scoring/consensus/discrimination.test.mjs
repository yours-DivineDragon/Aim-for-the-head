import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';
import { compile } from '../../scripts/compiler.mjs';

const benchmarkRoot = path.resolve(import.meta.dirname, '..', '..');
const WAD = 10n ** 18n;

function build(patches = []) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'perps-final-discrimination-'));
  fs.cpSync(path.join(benchmarkRoot, 'contracts'), temporaryRoot, { recursive: true });
  try {
    for (const patch of patches) {
      const filename = path.join(temporaryRoot, patch.file);
      const current = fs.readFileSync(filename, 'utf8');
      assert.equal(current.split(patch.from).length - 1, 1, `unique patch anchor for ${patch.file}`);
      fs.writeFileSync(filename, current.replace(patch.from, patch.to));
    }
    return compile({ sourceRoot: temporaryRoot }).artifacts;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function freshChain() {
  const eip1193 = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 31337, hardfork: 'shanghai' },
    wallet: { deterministic: true, totalAccounts: 8, defaultBalance: 10_000 },
  });
  const provider = new BrowserProvider(eip1193);
  const signers = await Promise.all(Array.from({ length: 8 }, (_, index) => provider.getSigner(index)));
  return { eip1193, provider, signers };
}

async function deploy(artifacts, name, signer, args = []) {
  const artifact = artifacts.get(name);
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function succeeds(action) {
  try {
    const value = await action();
    if (value?.wait) await value.wait();
    return true;
  } catch {
    return false;
  }
}

async function coreSystem(artifacts) {
  const chain = await freshChain();
  const [governor, trader] = chain.signers;
  const governorAddress = await governor.getAddress();
  const token = await deploy(artifacts, 'MockERC20', governor, ['Margin USD', 'mUSD', 6]);
  const feed = await deploy(artifacts, 'MockPriceFeed', governor, [8, 2_000n * 10n ** 8n]);
  const catalog = await deploy(artifacts, 'MarketCatalog', governor, [governorAddress]);
  const oracle = await deploy(artifacts, 'OracleHub', governor, [governorAddress]);
  const funding = await deploy(artifacts, 'FundingEngine', governor, [governorAddress, await oracle.getAddress()]);
  const vault = await deploy(artifacts, 'MarginVault', governor, [governorAddress, await token.getAddress(), 0]);
  const clearing = await deploy(artifacts, 'ClearingHouse', governor, [
    governorAddress,
    await catalog.getAddress(),
    await oracle.getAddress(),
    await funding.getAddress(),
    await vault.getAddress(),
  ]);
  const venue = await deploy(artifacts, 'MockVenue', governor);
  const insurance = await deploy(artifacts, 'InsuranceFund', governor, [governorAddress, await token.getAddress()]);
  const router = await deploy(artifacts, 'ExecutionRouter', governor, [governorAddress, await clearing.getAddress()]);
  await (await catalog.configureMarket(1, [true, 2, 100, 50, 800, 3_600, 5_000n * WAD, 100_000n * WAD])).wait();
  await (await oracle.configureFeed(1, await feed.getAddress(), 3_600, 0)).wait();
  await (await funding.configure(1, 10, 1_000_000_000_000n)).wait();
  await (await funding.setClearingHouse(await clearing.getAddress())).wait();
  await (await vault.setController(await clearing.getAddress())).wait();
  await (await insurance.configure(await clearing.getAddress(), governorAddress, await venue.getAddress())).wait();
  await (await clearing.configureModules(await router.getAddress(), governorAddress, governorAddress, await insurance.getAddress())).wait();
  await (await vault.connect(trader).openAccount()).wait();
  const accountId = (BigInt(await trader.getAddress()) << 96n) | 1n;
  await (await token.mint(await trader.getAddress(), 10_000n * 10n ** 6n)).wait();
  await (await token.connect(trader).approve(await vault.getAddress(), 10_000n * 10n ** 6n)).wait();
  await (await vault.connect(trader).deposit(accountId, 10_000n * 10n ** 6n)).wait();
  return { ...chain, governor, trader, token, feed, catalog, oracle, funding, vault, clearing, venue, insurance, router, accountId };
}

const floorPatch = [{
  file: 'FundingEngine.sol',
  from: 'payment = (base * (currentGrowth - previousGrowth)) / 1e18;',
  to: 'payment = SignedWadMath.mulWadDown(base, currentGrowth - previousGrowth);',
}];

const positiveCeilPatch = [{
  file: 'FundingEngine.sol',
  from: 'payment = (base * (currentGrowth - previousGrowth)) / 1e18;',
  to: `int256 product = base * (currentGrowth - previousGrowth);
        payment = product / 1e18;
        if (product > 0 && product % 1e18 != 0) payment += 1;`,
}];

const zeroSizePatch = [
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
];

test('MCB-006 and AFH-008 have opposite signed domains and non-interchangeable repairs', async () => {
  const original = build();
  const signedFloor = build(floorPatch);
  const positiveCeil = build(positiveCeilPatch);

  async function payments(artifacts) {
    const chain = await freshChain();
    const governor = chain.signers[0];
    const funding = await deploy(artifacts, 'FundingEngine', governor, [await governor.getAddress(), await governor.getAddress()]);
    const negativeProduct = (await funding.checkpointPosition(1, 1, 1))[0];
    const positiveProduct = (await funding.checkpointPosition(1, 1, -1))[0];
    return { negativeProduct, positiveProduct };
  }

  const vulnerable = await payments(original);
  const canonicalControl = await payments(signedFloor);
  const candidateControl = await payments(positiveCeil);
  assert.deepEqual(vulnerable, { negativeProduct: 0n, positiveProduct: 0n });
  assert.deepEqual(canonicalControl, { negativeProduct: -1n, positiveProduct: 0n });
  assert.deepEqual(candidateControl, { negativeProduct: 0n, positiveProduct: 1n });
  console.log(JSON.stringify({
    boundary: 'MCB-006-vs-AFH-008',
    vulnerable: { negativeProduct: '0', positiveProduct: '0' },
    canonicalSignedFloorControl: { negativeProduct: '-1', positiveProduct: '0' },
    candidatePositiveCeilControl: { negativeProduct: '0', positiveProduct: '1' },
    conclusion: 'different signed preconditions, different obligations, reciprocal non-fixing controls',
  }));
});

test('MCB-015 full chain is blocked by its zero-size control while AFH-012 close/reopen survives', async () => {
  const original = build();
  const canonicalControlArtifacts = build(zeroSizePatch);

  const vulnerable = await coreSystem(original);
  for (let index = 0; index < 5; index += 1) {
    await (await vulnerable.router.connect(vulnerable.trader).executePortfolio(
      vulnerable.accountId,
      [[1, 0, 2_000n * WAD]],
      2_000n * WAD,
      true,
      { gasLimit: 2_000_000 },
    )).wait();
  }
  assert.equal(await vulnerable.clearing.activeMarketCount(vulnerable.accountId), 5n);
  await (await vulnerable.router.connect(vulnerable.trader).executePortfolio(
    vulnerable.accountId,
    [[1, 5n * WAD, 2_000n * WAD]],
    2_000n * WAD,
    true,
    { gasLimit: 2_000_000 },
  )).wait();
  await (await vulnerable.feed.setAnswer(2_500n * 10n ** 8n, { gasLimit: 200_000 })).wait();
  const inflatedEquity = await vulnerable.clearing.accountEquity(vulnerable.accountId);
  const withdrew = await succeeds(() => vulnerable.clearing.connect(vulnerable.trader).withdrawMargin(
    vulnerable.accountId,
    9_000n * WAD,
    vulnerable.trader.getAddress(),
    { gasLimit: 2_000_000 },
  ));
  await (await vulnerable.feed.setAnswer(1_000n * 10n ** 8n, { gasLimit: 200_000 })).wait();
  const normalizedEquity = await vulnerable.clearing.accountEquity(vulnerable.accountId);
  assert.ok(inflatedEquity > 20_000n * WAD);
  assert.equal(withdrew, true);
  assert.ok(normalizedEquity < -20_000n * WAD);

  const canonicalControl = await coreSystem(canonicalControlArtifacts);
  const zeroAccepted = await succeeds(() => canonicalControl.router.connect(canonicalControl.trader).executePortfolio(
    canonicalControl.accountId,
    [[1, 0, 2_000n * WAD]],
    2_000n * WAD,
    true,
    { gasLimit: 2_000_000 },
  ));
  assert.equal(zeroAccepted, false);
  assert.equal(await canonicalControl.clearing.activeMarketCount(canonicalControl.accountId), 0n);

  const closeReopen = await coreSystem(canonicalControlArtifacts);
  await (await closeReopen.router.connect(closeReopen.trader).executePortfolio(closeReopen.accountId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true, { gasLimit: 2_000_000 })).wait();
  await (await closeReopen.router.connect(closeReopen.trader).executePortfolio(closeReopen.accountId, [[1, -WAD, 2_000n * WAD]], 2_000n * WAD, false, { gasLimit: 2_000_000 })).wait();
  await (await closeReopen.router.connect(closeReopen.trader).executePortfolio(closeReopen.accountId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true, { gasLimit: 2_000_000 })).wait();
  await (await closeReopen.feed.setAnswer(3_000n * 10n ** 8n, { gasLimit: 200_000 })).wait();
  const memberships = await closeReopen.clearing.activeMarketCount(closeReopen.accountId);
  const reportedEquity = await closeReopen.clearing.accountEquity(closeReopen.accountId);
  const uniquePositionEquity = (await closeReopen.vault.balanceOf(closeReopen.accountId))
    + (await closeReopen.clearing.cashBalance(closeReopen.accountId))
    + 1_000n * WAD;
  assert.equal(memberships, 2n);
  assert.equal(reportedEquity, uniquePositionEquity + 1_000n * WAD);

  console.log(JSON.stringify({
    boundary: 'MCB-015-vs-AFH-012',
    registeredVulnerable: {
      zeroMembershipsBeforeOpen: '5',
      inflatedEquity: `${inflatedEquity}`,
      withdrew9000Wad: withdrew,
      normalizedEquity: `${normalizedEquity}`,
    },
    registeredZeroSizeControl: { zeroAccepted, memberships: '0' },
    candidateRouteUnderRegisteredControl: {
      precondition: 'close/reopen, not repeated zero-size execution',
      memberships: `${memberships}`,
      duplicatedPnlWad: `${reportedEquity - uniquePositionEquity}`,
    },
    omittedBySubmission: ['zero-size setup', 'withdrawal through amplified health', 'price normalization', 'resulting deficit'],
    conclusion: 'one shared membership primitive only; registered end-to-end chain not demonstrated',
  }));
});
