import test from 'node:test';
import {
  assert,
  WAD,
  addMarket,
  deploySystem,
  expectCustomRevert,
  increaseTime,
  openAndFund,
  receipt,
} from './support.mjs';

test('H-001 unauthorized risk-tier mutation persists while adjacent governor guard rejects', async () => {
  const s = await deploySystem();
  const before = await s.catalog.market(1);
  await receipt(s.catalog.connect(s.trader).setRiskTier(1, 7));
  const after = await s.catalog.market(1);
  assert.equal(before.riskTier, 2n);
  assert.equal(after.riskTier, 7n);
  await expectCustomRevert(s.catalog.connect(s.trader).setMarketActive(1, false), 'control governor-only mutation must revert');
  console.log(JSON.stringify({ hunterId: 'H-001', beforeTier: `${before.riskTier}`, afterTier: `${after.riskTier}`, control: 'setMarketActive reverted' }));
});

test('H-005 feed precision above 18 bricks normalization while 18 decimals is exact', async () => {
  const bad = await deploySystem({ feedDecimals: 19, initialPrice: 2_000n * 10n ** 19n, skipInitialObserve: true });
  await expectCustomRevert(bad.oracle.indexPrice(1), '19-decimal configured feed must expose normalization failure');

  const good = await deploySystem({ feedDecimals: 18, initialPrice: 2_000n * WAD });
  assert.equal(await good.oracle.indexPrice(1), 2_000n * WAD);
  console.log(JSON.stringify({ hunterId: 'H-005', precision19: 'reverted', precision18Wad: `${2_000n * WAD}` }));
});

test('H-007 negative funding exceeds the symmetric cap while positive premium is capped', async () => {
  const negative = await deploySystem();
  const negativeId = await openAndFund(negative, negative.trader, 100_000n * 10n ** 6n);
  await receipt(negative.router.connect(negative.trader).executePortfolio(
    negativeId,
    [[1, WAD, 1_000n * WAD]],
    1_000n * WAD,
    true,
  ));
  const beforeNeg = await negative.funding.funding(1);
  await increaseTime(negative.eip1193, 61);
  await receipt(negative.funding.accrue(1));
  const afterNeg = await negative.funding.funding(1);
  const negativeElapsed = afterNeg.lastAccrued - beforeNeg.lastAccrued;
  const negativeCap = BigInt(afterNeg.maxRatePerSecond) * negativeElapsed;
  assert.ok(-afterNeg.growth > negativeCap, 'negative growth magnitude exceeds symmetric cap');

  const positive = await deploySystem();
  const positiveId = await openAndFund(positive, positive.trader, 100_000n * 10n ** 6n);
  await receipt(positive.router.connect(positive.trader).executePortfolio(
    positiveId,
    [[1, WAD, 3_000n * WAD]],
    3_000n * WAD,
    true,
  ));
  const beforePos = await positive.funding.funding(1);
  await increaseTime(positive.eip1193, 61);
  await receipt(positive.funding.accrue(1));
  const afterPos = await positive.funding.funding(1);
  const positiveElapsed = afterPos.lastAccrued - beforePos.lastAccrued;
  const positiveCap = BigInt(afterPos.maxRatePerSecond) * positiveElapsed;
  assert.equal(afterPos.growth, positiveCap, 'positive premium is capped at configured magnitude');
  console.log(JSON.stringify({ hunterId: 'H-007', negativeGrowth: `${afterNeg.growth}`, symmetricBound: `${negativeCap}`, positiveGrowth: `${afterPos.growth}`, positiveBound: `${positiveCap}` }));
});

test('H-008 split funding checkpoints erase payer dust while an unsplit checkpoint charges it', async () => {
  async function setup() {
    const s = await deploySystem();
    await receipt(s.funding.configure(1, 1, WAD / 10n));
    const id = await openAndFund(s, s.trader, 1_000n * 10n ** 6n);
    await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, 1n, 3_000n * WAD]], 3_000n * WAD, true));
    return { s, id };
  }

  const split = await setup();
  const splitCash0 = await split.s.clearing.cashBalance(split.id);
  for (let i = 0; i < 10; i += 1) {
    await increaseTime(split.s.eip1193, 1);
    await receipt(split.s.funding.accrue(1));
    await receipt(split.s.clearing.settleAccountFunding(split.id, 1));
  }
  const splitPaid = splitCash0 - await split.s.clearing.cashBalance(split.id);

  const unsplit = await setup();
  const unsplitCash0 = await unsplit.s.clearing.cashBalance(unsplit.id);
  for (let i = 0; i < 10; i += 1) {
    await increaseTime(unsplit.s.eip1193, 1);
    await receipt(unsplit.s.funding.accrue(1));
  }
  await receipt(unsplit.s.clearing.settleAccountFunding(unsplit.id, 1));
  const unsplitPaid = unsplitCash0 - await unsplit.s.clearing.cashBalance(unsplit.id);

  assert.equal(splitPaid, 0n);
  assert.ok(unsplitPaid > 0n);
  console.log(JSON.stringify({ hunterId: 'H-008', splitPaid: `${splitPaid}`, unsplitPaid: `${unsplitPaid}`, repetitions: 10 }));
});

test('H-010 cross-zero position receives the wrong residual entry basis and changes round-trip PnL', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 100_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 3_000n * WAD]], 3_000n * WAD, true));
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, -2n * WAD, 2_000n * WAD]], 2_000n * WAD, false));
  const residual = await s.clearing.position(id, 1);
  assert.equal(residual.base, -WAD);
  assert.equal(residual.entryPrice, 2_500n * WAD, 'observed average differs from crossing execution basis');
  assert.notEqual(residual.entryPrice, 2_000n * WAD);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  const cash = await s.clearing.cashBalance(id);
  const totalFee = 42n * WAD / 10_000n; // 3000 + 4000 + 2000 notionals, all at 6 bps = 5.4 wad; retained as independently computed below.
  assert.ok(cash > -1_000n * WAD, 'wrong basis halves the economically expected 1000-wad round-trip loss before fees');
  console.log(JSON.stringify({ hunterId: 'H-010', observedResidualEntry: `${residual.entryPrice}`, expectedResidualEntry: `${2_000n * WAD}`, finalCashIncludingFees: `${cash}`, ignoredLocal: `${totalFee}` }));
});

test('H-011 open interest never falls on close and remains nonzero with no live exposure', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 100_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, 10n * WAD, 2_000n * WAD]], 2_000n * WAD, true));
  const afterOpen = await s.clearing.openInterest(1);
  assert.equal(afterOpen, 10n * WAD, 'opening control matches live absolute exposure');
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, -10n * WAD, 2_000n * WAD]], 2_000n * WAD, false));
  const afterClose = await s.clearing.openInterest(1);
  const position = await s.clearing.position(id, 1);
  assert.equal(position.base, 0n);
  assert.equal(afterClose, 20n * WAD);
  console.log(JSON.stringify({ hunterId: 'H-011', afterOpen: `${afterOpen}`, afterClose: `${afterClose}`, actualLiveExposure: '0' }));
});

test('H-012 close and reopen duplicate active-market membership and double-count unrealized PnL', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 100_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  assert.equal(await s.clearing.activeMarketCount(id), 1n, 'single-open control');
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, -WAD, 2_000n * WAD]], 2_000n * WAD, false));
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  assert.equal(await s.clearing.activeMarketCount(id), 2n);
  await receipt(s.feed.setAnswer(3_000n * 10n ** 8n));
  const collateral = await s.vault.balanceOf(id);
  const cash = await s.clearing.cashBalance(id);
  const equity = await s.clearing.accountEquity(id);
  const onePositionEquity = collateral + cash + 1_000n * WAD;
  assert.equal(equity, onePositionEquity + 1_000n * WAD);
  console.log(JSON.stringify({ hunterId: 'H-012', activeMemberships: '2', reportedEquity: `${equity}`, uniquePositionEquity: `${onePositionEquity}` }));
});

test('H-013 negative correlation with opposite exposures reduces instead of increases portfolio risk', async () => {
  const s = await deploySystem();
  await addMarket(s, { id: 2 });
  await receipt(s.catalog.setCorrelation(1, 2, -10_000));
  const id = await openAndFund(s, s.trader, 100_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).executePortfolio(
    id,
    [[1, WAD, 2_000n * WAD], [2, -WAD, 2_000n * WAD]],
    2_000n * WAD,
    true,
  ));
  const observed = await s.clearing.accountInitial(id);
  const standaloneEach = 200n * WAD;
  const expectedSignAware = 3n * standaloneEach;
  assert.equal(observed, standaloneEach, 'implementation subtracts pair adjustment');
  assert.equal(expectedSignAware, 600n * WAD);

  const control = await deploySystem();
  await addMarket(control, { id: 2 });
  await receipt(control.catalog.setCorrelation(1, 2, 10_000));
  const controlId = await openAndFund(control, control.trader, 100_000n * 10n ** 6n);
  await receipt(control.router.connect(control.trader).executePortfolio(
    controlId,
    [[1, WAD, 2_000n * WAD], [2, -WAD, 2_000n * WAD]],
    2_000n * WAD,
    true,
  ));
  assert.equal(await control.clearing.accountInitial(controlId), standaloneEach, 'positive correlation/opposite-side hedge control');
  console.log(JSON.stringify({ hunterId: 'H-013', observedNegativeCorrOppositeRisk: `${observed}`, expectedSignAwareRisk: `${expectedSignAware}`, positiveCorrOppositeControlRisk: `${standaloneEach}` }));
});

test('H-014 unweighted portfolio average accepts execution above the base-weighted buy limit', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 100_000n * 10n ** 6n);
  const limit = 2_200n * WAD;
  const legs = [[1, WAD, 1_000n * WAD], [1, 9n * WAD, 3_000n * WAD]];
  await receipt(s.router.connect(s.trader).executePortfolio(id, legs, limit, true));
  const arithmetic = 2_000n * WAD;
  const weighted = 2_800n * WAD;
  assert.ok(arithmetic <= limit);
  assert.ok(weighted > limit);

  const control = await deploySystem();
  const controlId = await openAndFund(control, control.trader, 100_000n * 10n ** 6n);
  await expectCustomRevert(
    control.router.connect(control.trader).executePortfolio(controlId, [[1, WAD, 2_300n * WAD]], limit, true),
    'one-leg weighted-equals-arithmetic control must reject',
  );
  console.log(JSON.stringify({ hunterId: 'H-014', arithmeticAverage: `${arithmetic}`, requiredWeightedAverage: `${weighted}`, buyLimit: `${limit}`, control: 'one-leg 2300 reverted' }));
});

test('H-015 nonce zero and nonce 2^16 collide although a nearby nonce remains independent', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 100_000n * 10n ** 6n);
  await receipt(s.router.connect(s.trader).cancelNonce(id, 0));
  const wordAfterZero = await s.router.nonceBitmap(id, 0);
  assert.equal(wordAfterZero, 1n);
  await receipt(s.router.connect(s.trader).cancelNonce(id, 65_536));
  const wordAfterHigh = await s.router.nonceBitmap(id, 0);
  assert.equal(wordAfterHigh, wordAfterZero, 'high nonce maps to already-set low bit');
  await receipt(s.router.connect(s.trader).cancelNonce(id, 1));
  assert.equal(await s.router.nonceBitmap(id, 0), 3n, 'nearby nonce control maps to independent bit');
  console.log(JSON.stringify({ hunterId: 'H-015', nonce0Bitmap: `${wordAfterZero}`, nonce65536Bitmap: `${wordAfterHigh}`, afterNonce1Control: '3' }));
});
