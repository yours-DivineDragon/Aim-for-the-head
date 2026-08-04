import test from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, keccak256 } from 'ethers';
import { chain, deploy, increaseTime, WAD } from '../../test/support.mjs';

async function receipt(promise) {
  return (await promise).wait();
}

async function accountIdOf(signer, nonce = 1n) {
  return (BigInt(await signer.getAddress()) << 96n) | nonce;
}

async function deploySystem() {
  const context = await chain();
  const [governor, trader, other, bidder, victim, matcher, shareholder] = context.signers;
  const governorAddress = await governor.getAddress();
  const token = await deploy('MockERC20', governor, ['Margin USD', 'mUSD', 6]);
  const feed = await deploy('MockPriceFeed', governor, [8, 2_000n * 10n ** 8n]);
  const catalog = await deploy('MarketCatalog', governor, [governorAddress]);
  const oracle = await deploy('OracleHub', governor, [governorAddress]);
  const funding = await deploy('FundingEngine', governor, [governorAddress, await oracle.getAddress()]);
  const vault = await deploy('MarginVault', governor, [governorAddress, await token.getAddress(), 60]);
  const clearing = await deploy('ClearingHouse', governor, [governorAddress, await catalog.getAddress(), await oracle.getAddress(), await funding.getAddress(), await vault.getAddress()]);
  const venue = await deploy('MockVenue', governor);
  const insurance = await deploy('InsuranceFund', governor, [governorAddress, await token.getAddress()]);
  const router = await deploy('ExecutionRouter', governor, [governorAddress, await clearing.getAddress()]);
  const auction = await deploy('LiquidationAuction', governor, [governorAddress, await clearing.getAddress(), await clearing.getAddress(), await catalog.getAddress(), await oracle.getAddress(), await insurance.getAddress()]);
  const settlement = await deploy('EpochSettlement', governor, [governorAddress, await oracle.getAddress(), await clearing.getAddress()]);
  await receipt(catalog.configureMarket(1, [true, 2, 1_000, 600, 800, 3_600, 5_000n * WAD, 100_000n * WAD]));
  await receipt(oracle.configureFeed(1, await feed.getAddress(), 3_600, 2_000));
  await receipt(oracle.observe(1));
  await receipt(funding.configure(1, 60, 1_000_000_000_000n));
  await receipt(funding.setClearingHouse(await clearing.getAddress()));
  await receipt(vault.setController(await clearing.getAddress()));
  await receipt(insurance.configure(await clearing.getAddress(), await auction.getAddress(), await venue.getAddress()));
  await receipt(clearing.configureModules(await router.getAddress(), await auction.getAddress(), await settlement.getAddress(), await insurance.getAddress()));
  await receipt(oracle.setSettlementCoordinator(await settlement.getAddress()));
  await receipt(clearing.setFees(0));
  return { ...context, governor, trader, other, bidder, victim, matcher, shareholder, token, feed, catalog, oracle, funding, vault, clearing, venue, insurance, router, auction, settlement };
}

async function openAndFund(system, signer, nativeAmount, nonce = 1n) {
  await receipt(system.vault.connect(signer).openAccount());
  const accountId = await accountIdOf(signer, nonce);
  await receipt(system.token.mint(await signer.getAddress(), nativeAmount));
  await receipt(system.token.connect(signer).approve(await system.vault.getAddress(), nativeAmount));
  await receipt(system.vault.connect(signer).deposit(accountId, nativeAmount));
  return accountId;
}

function bidDigest(auctionId, bidderAccount, baseAmount, limitPrice, salt) {
  return keccak256(new AbiCoder().encode(
    ['uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [auctionId, bidderAccount, baseAmount, limitPrice, salt],
  ));
}

async function unhealthyLong(system, signer = system.victim) {
  const accountId = await openAndFund(system, signer, 300n * 10n ** 6n);
  await receipt(system.router.connect(signer).executePortfolio(accountId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  await receipt(system.feed.setAnswer(1_000n * 10n ** 8n, { gasLimit: 200_000n }));
  assert.ok(await system.clearing.accountEquity(accountId) < await system.clearing.accountMaintenance(accountId));
  return accountId;
}

test('independent AFH-011 propagation boundary: OI never auto-reports and social-loss index has no position consumer', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 10_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  assert.equal(await s.clearing.openInterest(1), WAD);
  assert.equal(await s.insurance.reportedOpenInterest(), 0n, 'trading does not propagate OI to the fund');
  await receipt(s.insurance.reportOpenInterest(await s.clearing.openInterest(1)));
  assert.equal(await s.insurance.reportedOpenInterest(), WAD, 'trusted governor can manually propagate the stale source');
  console.log(JSON.stringify({ reviewerCase: 'B-011', clearingOI: `${await s.clearing.openInterest(1)}`, initiallyReportedOI: '0', manualReporter: 'governor', sourceConsumer: 'InsuranceFund.coverDeficit', lossIndexPositionConsumerCount: 0 }));
});

test('independent AFH-002 insurance deposit variant transfers existing shareholder value', async () => {
  const s = await deploySystem();
  const native = 1_000n * 10n ** 6n;
  await receipt(s.token.mint(await s.shareholder.getAddress(), native));
  await receipt(s.token.connect(s.shareholder).approve(await s.insurance.getAddress(), native));
  await receipt(s.insurance.connect(s.shareholder).deposit(native, await s.shareholder.getAddress()));
  await receipt(s.token.setTransferFee(1_000));
  await receipt(s.token.mint(await s.trader.getAddress(), native));
  await receipt(s.token.connect(s.trader).approve(await s.insurance.getAddress(), native));
  const fundBefore = await s.token.balanceOf(await s.insurance.getAddress());
  await receipt(s.insurance.connect(s.trader).deposit(native, await s.trader.getAddress()));
  const receiptWad = (await s.token.balanceOf(await s.insurance.getAddress()) - fundBefore) * 10n ** 12n;
  const attackerShares = await s.insurance.balanceOf(await s.trader.getAddress());
  await receipt(s.token.setTransferFee(0));
  const attackerBefore = await s.token.balanceOf(await s.trader.getAddress());
  await receipt(s.insurance.connect(s.trader).redeem(attackerShares, await s.trader.getAddress()));
  const attackerRedemption = await s.token.balanceOf(await s.trader.getAddress()) - attackerBefore;
  const remainingBacking = await s.token.balanceOf(await s.insurance.getAddress());
  assert.equal(receiptWad, 900n * WAD);
  assert.equal(attackerShares, 1_000n * WAD);
  assert.equal(attackerRedemption, 950n * 10n ** 6n);
  assert.equal(remainingBacking, 950n * 10n ** 6n);
  console.log(JSON.stringify({ reviewerCase: 'B-002-INSURANCE', actualReceiptWad: `${receiptWad}`, nominalShares: `${attackerShares}`, attackerRedemptionNative: `${attackerRedemption}`, existingShareholderRemainingBackingNative: `${remainingBacking}`, valueShiftNative: `${50n * 10n ** 6n}` }));
});

test('independent AFH-006 delayed record changes realized dated-market PnL by 900 wad', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 10_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  const now = (await s.provider.getBlock('latest')).timestamp;
  const cutoff = BigInt(now + 10);
  await receipt(s.settlement.schedule(cutoff, [1]));
  await receipt(s.feed.setRound(2_100n * 10n ** 8n, cutoff, 2));
  await increaseTime(s.eip1193, 11);
  const postCutoff = BigInt((await s.provider.getBlock('latest')).timestamp);
  await receipt(s.feed.setRound(3_000n * 10n ** 8n, postCutoff, 3));
  await receipt(s.settlement.recordPrices(1));
  const cashBefore = await s.clearing.cashBalance(id);
  await receipt(s.settlement.settleBatch(1, [id]));
  const realized = await s.clearing.cashBalance(id) - cashBefore;
  assert.equal(realized, 1_000n * WAD);
  assert.equal(realized - 100n * WAD, 900n * WAD, 'caller-time price shifts PnL from cutoff outcome');
  console.log(JSON.stringify({ reviewerCase: 'B-006', cutoffPnlWad: `${100n * WAD}`, callerTimePnlWad: `${realized}`, permanentPnlShiftWad: `${900n * WAD}` }));
});

test('independent AFH-007 uncapped negative growth reaches cash and exceeds the symmetric credit bound', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 10_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 1_000n * WAD]], 1_000n * WAD, true));
  const before = await s.funding.funding(1);
  await increaseTime(s.eip1193, 61);
  await receipt(s.funding.accrue(1));
  const after = await s.funding.funding(1);
  const elapsed = after.lastAccrued - before.lastAccrued;
  const symmetricBound = BigInt(after.maxRatePerSecond) * elapsed;
  const cashBefore = await s.clearing.cashBalance(id);
  await receipt(s.clearing.settleAccountFunding(id, 1));
  const cashCredit = await s.clearing.cashBalance(id) - cashBefore;
  assert.equal(cashCredit, -after.growth);
  assert.ok(cashCredit > symmetricBound);
  console.log(JSON.stringify({ reviewerCase: 'B-007', negativeGrowth: `${after.growth}`, cashCreditWad: `${cashCredit}`, symmetricCashCreditBoundWad: `${symmetricBound}` }));
});

test('independent AFH-013 wrong correlation quadrant admits an account below correct initial margin', async () => {
  const s = await deploySystem();
  const secondFeed = await deploy('MockPriceFeed', s.governor, [8, 2_000n * 10n ** 8n]);
  await receipt(s.catalog.configureMarket(2, [true, 2, 1_000, 600, 800, 3_600, 5_000n * WAD, 100_000n * WAD]));
  await receipt(s.oracle.configureFeed(2, await secondFeed.getAddress(), 3_600, 2_000));
  await receipt(s.oracle.observe(2));
  await receipt(s.funding.configure(2, 60, 1_000_000_000_000n));
  await receipt(s.catalog.setCorrelation(1, 2, -10_000));
  const id = await openAndFund(s, s.trader, 300n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD], [2, -WAD, 2_000n * WAD]], 2_000n * WAD, true));
  const observed = await s.clearing.accountInitial(id);
  const correct = 600n * WAD;
  const equity = await s.clearing.accountEquity(id);
  assert.equal(observed, 200n * WAD);
  assert.ok(equity >= observed && equity < correct);
  console.log(JSON.stringify({ reviewerCase: 'B-013', accountEquityWad: `${equity}`, observedInitialWad: `${observed}`, signCorrectInitialWad: `${correct}`, invalidLeverageAdmitted: true }));
});

test('independent AFH-017 closure: zero-capital chain creates recorded loss but no attacker token profit', async () => {
  const s = await deploySystem();
  await receipt(s.auction.setTiming(30, 1));
  const distressedId = await unhealthyLong(s);
  await receipt(s.auction.start(distressedId, 1));
  await receipt(s.vault.connect(s.bidder).openAccount());
  const bidderId = await accountIdOf(s.bidder);
  const bidderTokenBefore = await s.token.balanceOf(await s.bidder.getAddress());
  const fundTokenBefore = await s.token.balanceOf(await s.insurance.getAddress());
  const salt = keccak256(new TextEncoder().encode('reviewer-b-zero-capital'));
  const digest = bidDigest(1n, bidderId, WAD, (1n << 128n) - 1n, salt);
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));
  await increaseTime(s.eip1193, 29);
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, (1n << 128n) - 1n, salt));
  const equityAfterFill = await s.clearing.accountEquity(bidderId);
  const initialAfterFill = await s.clearing.accountInitial(bidderId);
  await receipt(s.feed.setAnswer(900n * 10n ** 8n));
  await receipt(s.auction.start(bidderId, 1));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(2));
  const pending = await s.insurance.pendingSocialLoss();
  const finalEquity = await s.clearing.accountEquity(bidderId);
  assert.ok(equityAfterFill < initialAfterFill);
  assert.ok(pending > 0n);
  assert.ok(finalEquity < 0n, 'uncovered amount is recorded but not credited to the account');
  assert.equal(await s.token.balanceOf(await s.bidder.getAddress()), bidderTokenBefore);
  assert.equal(await s.token.balanceOf(await s.insurance.getAddress()), fundTokenBefore);
  console.log(JSON.stringify({ reviewerCase: 'B-017', bidderEquityAfterFill: `${equityAfterFill}`, bidderInitial: `${initialAfterFill}`, finalBidderEquity: `${finalEquity}`, pendingSocialLoss: `${pending}`, attackerTokenProfitNative: '0', fundTokenDeltaNative: '0', residualBase: `${(await s.clearing.position(bidderId, 1)).base}` }));
});

test('independent AFH-019 closure: late reveal changes deficit after terminal loss snapshot', async () => {
  const s = await deploySystem();
  await receipt(s.auction.setTiming(30, 1));
  const distressedId = await unhealthyLong(s);
  await receipt(s.auction.start(distressedId, 1));
  const bidderId = await openAndFund(s, s.bidder, 10_000n * 10n ** 6n);
  const salt = keccak256(new TextEncoder().encode('reviewer-b-late-reveal'));
  const digest = bidDigest(1n, bidderId, WAD, (1n << 128n) - 1n, salt);
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(1));
  const equityAtFinalize = await s.clearing.accountEquity(distressedId);
  const pendingAtFinalize = await s.insurance.pendingSocialLoss();
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, (1n << 128n) - 1n, salt));
  const equityAfterLateReveal = await s.clearing.accountEquity(distressedId);
  const pendingAfterLateReveal = await s.insurance.pendingSocialLoss();
  assert.ok(equityAfterLateReveal < equityAtFinalize);
  assert.equal(pendingAfterLateReveal, pendingAtFinalize, 'terminal deficit reconciliation is not repeated');
  console.log(JSON.stringify({ reviewerCase: 'B-019', equityAtFinalize: `${equityAtFinalize}`, pendingAtFinalize: `${pendingAtFinalize}`, equityAfterLateReveal: `${equityAfterLateReveal}`, pendingAfterLateReveal: `${pendingAfterLateReveal}`, unrecordedDeficitIncrease: `${equityAtFinalize - equityAfterLateReveal}` }));
});

test('independent AFH-021 slash both strands reserve and double-counts liquid slashed value in NAV', async () => {
  const s = await deploySystem();
  await receipt(s.auction.setTiming(30, 1));
  const distressedId = await unhealthyLong(s);
  await receipt(s.auction.start(distressedId, 1));
  const bond = 100n * 10n ** 6n;
  await receipt(s.token.mint(await s.bidder.getAddress(), bond));
  await receipt(s.token.connect(s.bidder).approve(await s.insurance.getAddress(), bond));
  const digest = keccak256(new TextEncoder().encode('reviewer-b-unrevealed'));
  await receipt(s.auction.connect(s.bidder).commit(1, 0, digest, bond));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.slashUnrevealed(1, await s.bidder.getAddress()));
  const liquidWad = (await s.token.balanceOf(await s.insurance.getAddress())) * 10n ** 12n;
  const assets = await s.insurance.totalAssets();
  assert.equal(liquidWad, 50n * WAD);
  assert.equal(await s.insurance.auctionReserved(), 50n * WAD);
  assert.equal(await s.insurance.accruedProtocolValue(), 50n * WAD);
  assert.equal(assets, 100n * WAD);
  console.log(JSON.stringify({ reviewerCase: 'B-021', liveBondSumWad: '0', liquidBalanceWad: `${liquidWad}`, phantomReserveWad: `${await s.insurance.auctionReserved()}`, accruedProtocolValueWad: `${await s.insurance.accruedProtocolValue()}`, reportedAssetsWad: `${assets}`, liquidNavOverstatementWad: `${assets - liquidWad}` }));
});

test('reviewer-discovered RD-001: sub-native withdrawal debits wad while transferring zero native units', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 1n);
  const tokenBefore = await s.token.balanceOf(await s.trader.getAddress());
  const balanceBefore = await s.vault.balanceOf(id);
  await receipt(s.clearing.connect(s.trader).withdrawMargin(id, 1n, await s.trader.getAddress()));
  const tokenDelta = await s.token.balanceOf(await s.trader.getAddress()) - tokenBefore;
  const ledgerDebit = balanceBefore - await s.vault.balanceOf(id);
  assert.equal(tokenDelta, 0n);
  assert.equal(ledgerDebit, 1n);
  console.log(JSON.stringify({ reviewerCase: 'RD-001', collateralDecimals: 6, requestedWad: '1', tokenReceivedNative: `${tokenDelta}`, ledgerDebitWad: `${ledgerDebit}`, impactBoundary: 'authorized caller loses sub-native dust only' }));
});
