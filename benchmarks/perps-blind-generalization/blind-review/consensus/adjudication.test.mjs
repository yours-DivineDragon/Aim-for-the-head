import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { AbiCoder, ContractFactory, Interface, keccak256 } from 'ethers';
import {
  WAD,
  accountIdOf,
  chain,
  deploy,
  deploySystem,
  expectCustomRevert,
  increaseTime,
  openAndFund,
  receipt,
} from '../../blind-run/poc/support.mjs';
import { deployHarness } from '../../blind-run/poc/harness.mjs';

const consensusRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(consensusRoot, '..', '..');
const MAX_PRICE = (1n << 128n) - 1n;

function bidDigest(auctionId, bidderAccount, baseAmount, limitPrice, salt) {
  return keccak256(new AbiCoder().encode(
    ['uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [auctionId, bidderAccount, baseAmount, limitPrice, salt],
  ));
}

function source(relative) {
  return fs.readFileSync(path.join(targetRoot, relative), 'utf8');
}

function compileConsensusVenue() {
  const key = 'blind-review/consensus/ConsensusVenue.sol';
  const input = {
    language: 'Solidity',
    sources: { [key]: { content: fs.readFileSync(path.join(consensusRoot, 'ConsensusVenue.sol'), 'utf8') } },
    settings: {
      optimizer: { enabled: true, runs: 300 },
      viaIR: true,
      evmVersion: 'shanghai',
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((item) => item.severity === 'error');
  assert.deepEqual(errors, [], errors.map((item) => item.formattedMessage).join('\n'));
  const artifact = output.contracts[key].ConsensusVenue;
  return { abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` };
}

async function deployConsensusVenue(signer, token, amount) {
  const artifact = compileConsensusVenue();
  const instance = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(token, amount);
  await instance.waitForDeployment();
  return instance;
}

async function unhealthyLong(s, signer = s.victim) {
  const accountId = await openAndFund(s, signer, 300n * 10n ** 6n);
  await receipt(s.router.connect(signer).executePortfolio(
    accountId,
    [[1, WAD, 2_000n * WAD]],
    2_000n * WAD,
    true,
  ));
  await receipt(s.feed.setAnswer(1_000n * 10n ** 8n, { gasLimit: 200_000n }));
  assert.ok(await s.clearing.accountEquity(accountId) < await s.clearing.accountMaintenance(accountId));
  return accountId;
}

test('C-002 nominal receipt is one multi-sink root, not a multi-primitive composition', async () => {
  const s = await deploySystem();
  await receipt(s.token.setTransferFee(1_000));
  await receipt(s.vault.connect(s.trader).openAccount());
  const marginId = await accountIdOf(s.trader);
  const nominal = 1_000n * 10n ** 6n;
  await receipt(s.token.mint(await s.trader.getAddress(), nominal * 3n));
  await receipt(s.token.connect(s.trader).approve(await s.vault.getAddress(), nominal));
  const vaultBefore = await s.token.balanceOf(await s.vault.getAddress());
  await receipt(s.vault.connect(s.trader).deposit(marginId, nominal));
  const vaultReceipt = await s.token.balanceOf(await s.vault.getAddress()) - vaultBefore;
  assert.equal(vaultReceipt, 900n * 10n ** 6n);
  assert.equal(await s.vault.balanceOf(marginId), 1_000n * WAD);

  await receipt(s.token.connect(s.trader).approve(await s.insurance.getAddress(), nominal));
  const fundBefore = await s.token.balanceOf(await s.insurance.getAddress());
  await receipt(s.insurance.connect(s.trader).deposit(nominal, await s.trader.getAddress()));
  const fundReceipt = await s.token.balanceOf(await s.insurance.getAddress()) - fundBefore;
  assert.equal(fundReceipt, 900n * 10n ** 6n);
  assert.equal(await s.insurance.balanceOf(await s.trader.getAddress()), 1_000n * WAD);

  const { signers } = await chain();
  const [governor, payer] = signers;
  const token = await deploy('MockERC20', governor, ['Bond', 'BND', 6]);
  const insurance = await deploy('InsuranceFund', governor, [await governor.getAddress(), await token.getAddress()]);
  await receipt(insurance.configure(await governor.getAddress(), await governor.getAddress(), await governor.getAddress()));
  await receipt(token.mint(await payer.getAddress(), nominal));
  await receipt(token.setTransferFee(1_000));
  await receipt(token.connect(payer).approve(await insurance.getAddress(), nominal));
  await receipt(insurance.reserveAuctionBond(keccak256(new TextEncoder().encode('receipt')), await payer.getAddress(), nominal));
  assert.equal(await token.balanceOf(await insurance.getAddress()), 900n * 10n ** 6n);
  assert.equal(await insurance.auctionReserved(), 1_000n * WAD);

  console.log(JSON.stringify({
    adjudicationId: 'C-002',
    nominalWad: `${1_000n * WAD}`,
    marginReceiptNative: `${vaultReceipt}`,
    insuranceReceiptNative: `${fundReceipt}`,
    bondReceiptNative: `${900n * 10n ** 6n}`,
    root: 'same requested-amount-without-balance-delta mechanism at three sinks',
  }));
});

test('C-004 callback reuse is standalone and does not require unhealthy/frozen state', async () => {
  const { eip1193, signers } = await chain();
  const [governor, trader, caller] = signers;
  const token = await deployHarness('ReentrantERC20.sol', 'ReentrantERC20', governor);
  const vault = await deploy('MarginVault', governor, [await governor.getAddress(), await token.getAddress(), 1]);
  await receipt(vault.connect(trader).openAccount());
  const id = await accountIdOf(trader);
  await receipt(token.mint(await trader.getAddress(), 300n * WAD));
  await receipt(token.connect(trader).approve(await vault.getAddress(), 300n * WAD));
  await receipt(vault.connect(trader).deposit(id, 300n * WAD));
  await receipt(vault.connect(trader).requestWithdrawal(id, 100n * WAD, await trader.getAddress()));
  await increaseTime(eip1193, 2);
  const iface = new Interface(['function claimWithdrawal(uint256 accountId)']);
  await receipt(token.setOneShotHook(await vault.getAddress(), iface.encodeFunctionData('claimWithdrawal', [id])));
  const before = await token.balanceOf(await trader.getAddress());
  await receipt(vault.connect(caller).claimWithdrawal(id));
  const received = await token.balanceOf(await trader.getAddress()) - before;
  assert.equal(received, 200n * WAD);
  assert.equal(await vault.balanceOf(id), 100n * WAD);
  console.log(JSON.stringify({
    adjudicationId: 'C-004',
    clearingHouseConfigured: false,
    frozenStateRequired: false,
    requestWad: `${100n * WAD}`,
    receivedWad: `${received}`,
  }));
});

test('C-011 stale OI divergence stops at a manually reported, unconsumed loss index', () => {
  const clearing = source('contracts/ClearingHouse.sol');
  const insurance = source('contracts/InsuranceFund.sol');
  const allContracts = fs.readdirSync(path.join(targetRoot, 'contracts'), { withFileTypes: true })
    .flatMap((entry) => entry.isFile() && entry.name.endsWith('.sol')
      ? [source(`contracts/${entry.name}`)]
      : []);
  assert.match(clearing, /openInterest\[marketId\] \+= baseDelta\.abs\(\)/);
  assert.doesNotMatch(clearing, /reportOpenInterest\(/);
  assert.match(insurance, /function reportOpenInterest\(uint256 nextOpenInterest\) external/);
  const occurrences = allContracts.join('\n').match(/socialLossIndex/g) ?? [];
  assert.equal(occurrences.length, 3, 'declaration and two writes only; no downstream position consumer');
  console.log(JSON.stringify({
    adjudicationId: 'C-011',
    automaticOiPropagation: false,
    socialLossIndexOccurrences: occurrences.length,
    downstreamCollectionConsumer: false,
    severityClosure: 'medium',
  }));
});

test('C-017 composed chain records solvency loss but has no Critical asset/profit closure', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 1));
  const distressedId = await unhealthyLong(s);
  await receipt(s.auction.start(distressedId, 1));
  await receipt(s.vault.connect(s.bidder).openAccount());
  const bidderId = await accountIdOf(s.bidder);
  const salt = keccak256(new TextEncoder().encode('consensus-zero-capital'));
  const digest = bidDigest(1n, bidderId, WAD, MAX_PRICE, salt);
  const bidderTokensBefore = await s.token.balanceOf(await s.bidder.getAddress());
  const fundTokensBefore = await s.token.balanceOf(await s.insurance.getAddress());
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));
  await increaseTime(s.eip1193, 29);
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
  assert.ok(await s.clearing.accountEquity(bidderId) < await s.clearing.accountInitial(bidderId));
  await receipt(s.feed.setAnswer(900n * 10n ** 8n, { gasLimit: 200_000n }));
  await receipt(s.auction.start(bidderId, 1));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(2));
  const bidderEquity = await s.clearing.accountEquity(bidderId);
  const pendingLoss = await s.insurance.pendingSocialLoss();
  const residual = (await s.clearing.position(bidderId, 1)).base;
  assert.ok(bidderEquity < 0n);
  assert.ok(pendingLoss > 0n);
  assert.equal(residual, WAD);
  assert.equal(await s.token.balanceOf(await s.bidder.getAddress()), bidderTokensBefore);
  assert.equal(await s.token.balanceOf(await s.insurance.getAddress()), fundTokensBefore);
  console.log(JSON.stringify({
    adjudicationId: 'C-017',
    pendingSocialLossWad: `${pendingLoss}`,
    residualBase: `${residual}`,
    bidderEquityWad: `${bidderEquity}`,
    attackerTokenProfitNative: '0',
    fundTokenDeltaNative: '0',
    finalSeverity: 'high',
  }));
});

test('C-019 post-final reveal depends on residual finalization while root remains distinct', () => {
  const auction = source('contracts/LiquidationAuction.sol');
  const finalize = auction.slice(auction.indexOf('function finalize('), auction.indexOf('function slashUnrevealed('));
  const reveal = auction.slice(auction.indexOf('function reveal('), auction.indexOf('function finalize('));
  assert.match(finalize, /remainingBase != 0 && block\.timestamp < auction\.startedAt \+ auction\.duration/);
  assert.doesNotMatch(reveal, /auction\.finalized/);
  assert.match(reveal, /baseAmount > auction\.remainingBase/);
  console.log(JSON.stringify({
    adjudicationId: 'C-019',
    residualFinalizePrimitive: 'AFH-018',
    independentRoot: 'reveal omits finalized and expiry checks',
    fullFillLeavesRevealableQuantity: false,
  }));
});

test('C-020 settlement/reveal contradiction occurs while auction is not finalized', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(60, 1));
  const id = await unhealthyLong(s);
  await receipt(s.auction.start(id, 1));
  const bidderId = await openAndFund(s, s.bidder, 10_000n * 10n ** 6n);
  const salt = keccak256(new TextEncoder().encode('consensus-live-auction'));
  const digest = bidDigest(1n, bidderId, WAD, MAX_PRICE, salt);
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));
  const now = (await s.provider.getBlock('latest')).timestamp;
  await receipt(s.settlement.schedule(now + 2, [1]));
  await increaseTime(s.eip1193, 3);
  await receipt(s.settlement.recordPrices(1));
  await receipt(s.settlement.settleBatch(1, [id]));
  assert.equal((await s.auction.auctions(1)).finalized, false);
  assert.equal(await s.settlement.accountSettled(1, id), true);
  assert.equal(await s.clearing.frozen(id), false);
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
  const reopened = await s.clearing.position(id, 1);
  assert.equal(reopened.base, -WAD);
  assert.equal((await s.auction.auctions(1)).finalized, false);
  console.log(JSON.stringify({
    adjudicationId: 'C-020',
    auctionFinalizedDuringSequence: false,
    settledMarker: true,
    reopenedBase: `${reopened.base}`,
    requiresAfh019PostFinalRoot: false,
  }));
});

test('C-021 slash residue blocks deficit coverage; redemption failure comes from NAV double count', async () => {
  const { signers } = await chain();
  const [governor, bidder, shareholder] = signers;
  const token = await deploy('MockERC20', governor, ['Collateral', 'COL', 18]);
  const insurance = await deploy('InsuranceFund', governor, [await governor.getAddress(), await token.getAddress()]);
  await receipt(insurance.configure(await governor.getAddress(), await governor.getAddress(), await governor.getAddress()));
  const key = keccak256(new TextEncoder().encode('slash'));
  await receipt(token.mint(await bidder.getAddress(), 100n * WAD));
  await receipt(token.connect(bidder).approve(await insurance.getAddress(), 100n * WAD));
  await receipt(insurance.reserveAuctionBond(key, await bidder.getAddress(), 100n * WAD));
  await receipt(insurance.releaseAuctionBond(key, await bidder.getAddress(), 5_000));
  assert.equal(await insurance.reservedBond(key), 0n);
  assert.equal(await insurance.auctionReserved(), 50n * WAD);
  assert.equal(await insurance.accruedProtocolValue(), 50n * WAD);
  assert.equal(await token.balanceOf(await insurance.getAddress()), 50n * WAD);
  assert.equal(await insurance.totalAssets(), 100n * WAD);
  assert.equal(await insurance.coverDeficit.staticCall(7n, 1n), 0n, 'phantom reserve blocks coverage');

  await receipt(token.mint(await shareholder.getAddress(), 50n * WAD));
  await receipt(token.connect(shareholder).approve(await insurance.getAddress(), 50n * WAD));
  await receipt(insurance.connect(shareholder).deposit(50n * WAD, await shareholder.getAddress()));
  const shares = await insurance.balanceOf(await shareholder.getAddress());
  await expectCustomRevert(
    insurance.connect(shareholder).redeem(shares, await shareholder.getAddress()),
    'redemption promises balance plus already-held slash value',
  );
  console.log(JSON.stringify({
    adjudicationId: 'C-021',
    liveBondWad: '0',
    phantomReservedWad: `${50n * WAD}`,
    coverageAvailableWad: '0',
    liquidWad: `${100n * WAD}`,
    promisedAssetsWad: `${150n * WAD}`,
    redemptionReservationCheck: false,
    verdict: 'confirmed_narrowed',
  }));
});

test('C-022 live-bond theft needs no slash-accounting primitive', async () => {
  const { signers } = await chain();
  const [governor, bidder, shareholder] = signers;
  const token = await deploy('MockERC20', governor, ['Collateral', 'COL', 18]);
  const insurance = await deploy('InsuranceFund', governor, [await governor.getAddress(), await token.getAddress()]);
  await receipt(insurance.configure(await governor.getAddress(), await governor.getAddress(), await governor.getAddress()));
  await receipt(token.mint(await shareholder.getAddress(), 100n * WAD));
  await receipt(token.connect(shareholder).approve(await insurance.getAddress(), 100n * WAD));
  await receipt(insurance.connect(shareholder).deposit(100n * WAD, await shareholder.getAddress()));
  const shares = await insurance.balanceOf(await shareholder.getAddress());
  const key = keccak256(new TextEncoder().encode('live-bond'));
  await receipt(token.mint(await bidder.getAddress(), 100n * WAD));
  await receipt(token.connect(bidder).approve(await insurance.getAddress(), 100n * WAD));
  await receipt(insurance.reserveAuctionBond(key, await bidder.getAddress(), 100n * WAD));
  assert.equal(await insurance.accruedProtocolValue(), 0n, 'no slashing occurred');
  const before = await token.balanceOf(await shareholder.getAddress());
  await receipt(insurance.connect(shareholder).redeem(shares, await shareholder.getAddress()));
  const received = await token.balanceOf(await shareholder.getAddress()) - before;
  assert.equal(received, 200n * WAD);
  assert.equal(await insurance.reservedBond(key), 100n * WAD);
  assert.equal(await token.balanceOf(await insurance.getAddress()), 0n);
  console.log(JSON.stringify({
    adjudicationId: 'C-022',
    slashingUsed: false,
    shareholderDepositWad: `${100n * WAD}`,
    liveBidderBondWad: `${100n * WAD}`,
    shareholderReceivedWad: `${received}`,
    requiresAfh021: false,
  }));
});

test('C-024 honest 24-decimal output still bypasses the wad minimum', async () => {
  const s = await deploySystem();
  const output = await deploy('MockERC20', s.governor, ['Output24', 'O24', 24]);
  const nativeOut = WAD;
  const normalizedWad = nativeOut / 10n ** 6n;
  const venue = await deployConsensusVenue(s.governor, await output.getAddress(), nativeOut);
  await receipt(output.mint(await venue.getAddress(), nativeOut));
  await receipt(s.insurance.configure(await s.clearing.getAddress(), await s.auction.getAddress(), await venue.getAddress()));
  const amountIn = 100n * 10n ** 6n;
  await receipt(s.token.mint(await s.insurance.getAddress(), amountIn));
  await receipt(s.insurance.rebalance(await output.getAddress(), amountIn, WAD, '0x'));
  assert.equal(await output.balanceOf(await s.insurance.getAddress()), nativeOut);
  assert.equal(normalizedWad, 10n ** 12n);
  assert.ok(normalizedWad < WAD);
  assert.equal(await s.insurance.accruedProtocolValue(), WAD);
  console.log(JSON.stringify({
    adjudicationId: 'C-024',
    venueTransferredOutput: true,
    outputDecimals: 24,
    rawReturnNative: `${nativeOut}`,
    actualNormalizedWad: `${normalizedWad}`,
    acceptedMinWad: `${WAD}`,
  }));
});

test('C-OVERLAP shared components and impact shapes are not duplicate root causes', () => {
  const oracle = source('contracts/OracleHub.sol');
  const settlement = source('contracts/EpochSettlement.sol');
  const router = source('contracts/ExecutionRouter.sol');
  const auction = source('contracts/LiquidationAuction.sol');
  const insurance = source('contracts/InsuranceFund.sol');
  assert.match(oracle, /10 \*\* \(18 - precision\)/);
  assert.match(settlement, /oracle\.recordSettlement\(markets\[i\], epoch\)/);
  assert.match(router, /uint8 word = uint8\(nonce >> 8\)/);
  assert.match(router, /priceSum \+= legs\[i\]\.executionPrice/);
  assert.match(auction, /clearing\.onAuctionFill\(bid\.bidderAccount/);
  assert.match(insurance, /auctionReserved -= returned/);
  assert.match(insurance, /accruedProtocolValue \+= wadAmount/);
  assert.match(insurance, /amountOut = venue\.swapExactInput/);
  console.log(JSON.stringify({
    adjudicationId: 'C-OVERLAP',
    distinctPairs: [
      ['AFH-005', 'AFH-006'],
      ['AFH-014', 'AFH-015'],
      ['AFH-016', 'AFH-017'],
      ['AFH-021', 'AFH-022'],
      ['AFH-023', 'AFH-024'],
      ['AFH-023', 'AFH-025'],
    ],
    duplicatePairs: [],
  }));
});
