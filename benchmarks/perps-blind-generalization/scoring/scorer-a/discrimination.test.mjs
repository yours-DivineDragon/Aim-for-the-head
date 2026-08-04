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

function patchedBuild(replacements) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scorer-a-discrimination-'));
  fs.cpSync(path.join(benchmarkRoot, 'contracts'), temporaryRoot, { recursive: true });
  try {
    for (const replacement of replacements) {
      const filename = path.join(temporaryRoot, replacement.file);
      const current = fs.readFileSync(filename, 'utf8');
      assert.equal(current.split(replacement.from).length - 1, 1, `patch anchor ${replacement.file}`);
      fs.writeFileSync(filename, current.replace(replacement.from, replacement.to));
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
  const signers = await Promise.all(Array.from({ length: 8 }, (_, i) => provider.getSigner(i)));
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
  await (await token.mint(await trader.getAddress(), 50_000n * 10n ** 6n)).wait();
  await (await token.connect(trader).approve(await vault.getAddress(), 50_000n * 10n ** 6n)).wait();
  await (await vault.connect(trader).deposit(accountId, 50_000n * 10n ** 6n)).wait();
  return { ...chain, governor, trader, feed, clearing, router, accountId };
}

test('factor boundary MCB-006: canonical negative-floor repair does not repair AFH-008 positive dust', async () => {
  const originals = compile().artifacts;
  const patched = patchedBuild([{
    file: 'FundingEngine.sol',
    from: 'payment = (base * (currentGrowth - previousGrowth)) / 1e18;',
    to: 'payment = SignedWadMath.mulWadDown(base, currentGrowth - previousGrowth);',
  }]);
  const originalChain = await freshChain();
  const patchedChain = await freshChain();
  const originalFunding = await deploy(originals, 'FundingEngine', originalChain.signers[0], [await originalChain.signers[0].getAddress(), await originalChain.signers[0].getAddress()]);
  const patchedFunding = await deploy(patched, 'FundingEngine', patchedChain.signers[0], [await patchedChain.signers[0].getAddress(), await patchedChain.signers[0].getAddress()]);

  const originalNegative = (await originalFunding.checkpointPosition(1, 1, 1))[0];
  const patchedNegative = (await patchedFunding.checkpointPosition(1, 1, 1))[0];
  const originalPositive = (await originalFunding.checkpointPosition(1, 1, -1))[0];
  const patchedPositive = (await patchedFunding.checkpointPosition(1, 1, -1))[0];
  assert.equal(originalNegative, 0n);
  assert.equal(patchedNegative, -1n);
  assert.equal(originalPositive, 0n);
  assert.equal(patchedPositive, 0n);
  console.log(JSON.stringify({
    boundary: 'MCB-006/AFH-008',
    originalNegative: `${originalNegative}`,
    canonicalControlNegative: `${patchedNegative}`,
    originalPositive: `${originalPositive}`,
    canonicalControlPositive: `${patchedPositive}`,
    factor: 0.3,
  }));
});

test('factor boundary MCB-015: canonical zero-size guard blocks the critical route but AFH-012 close/reopen fragment survives', async () => {
  const originals = compile().artifacts;
  const patches = [
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
  const patched = patchedBuild(patches);

  const originalSystem = await coreSystem(originals);
  const originalZeroAccepted = await succeeds(() => originalSystem.router.connect(originalSystem.trader).executePortfolio(
    originalSystem.accountId,
    [[1, 0, 2_000n * WAD]],
    2_000n * WAD,
    true,
  ));
  assert.equal(originalZeroAccepted, true);
  assert.equal(await originalSystem.clearing.activeMarketCount(originalSystem.accountId), 1n);

  const patchedZero = await coreSystem(patched);
  const patchedZeroAccepted = await succeeds(() => patchedZero.router.connect(patchedZero.trader).executePortfolio(
    patchedZero.accountId,
    [[1, 0, 2_000n * WAD]],
    2_000n * WAD,
    true,
  ));
  assert.equal(patchedZeroAccepted, false);
  assert.equal(await patchedZero.clearing.activeMarketCount(patchedZero.accountId), 0n);

  const patchedReopen = await coreSystem(patched);
  await (await patchedReopen.router.connect(patchedReopen.trader).executePortfolio(patchedReopen.accountId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true)).wait();
  await (await patchedReopen.router.connect(patchedReopen.trader).executePortfolio(patchedReopen.accountId, [[1, -WAD, 2_000n * WAD]], 2_000n * WAD, false)).wait();
  await (await patchedReopen.router.connect(patchedReopen.trader).executePortfolio(patchedReopen.accountId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true)).wait();
  const closeReopenMemberships = await patchedReopen.clearing.activeMarketCount(patchedReopen.accountId);
  assert.equal(closeReopenMemberships, 2n);
  console.log(JSON.stringify({
    boundary: 'MCB-015/AFH-012',
    originalZeroAccepted,
    canonicalControlZeroAccepted: patchedZeroAccepted,
    canonicalControlCloseReopenMemberships: `${closeReopenMemberships}`,
    missingSubmittedSteps: ['zero-size materialization', 'withdrawal', 'post-normalization deficit'],
    factor: 0.6,
  }));
});
