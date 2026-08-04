import test from 'node:test';
import { AbiCoder, keccak256 } from 'ethers';
import {
  assert,
  WAD,
  accountIdOf,
  deploySystem,
  expectCustomRevert,
  increaseTime,
  openAndFund,
  receipt,
} from './support.mjs';

const MAX_PRICE = (1n << 128n) - 1n;

function bidDigest(auctionId, bidderAccount, baseAmount, limitPrice, salt) {
  return keccak256(new AbiCoder().encode(
    ['uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [auctionId, bidderAccount, baseAmount, limitPrice, salt],
  ));
}

async function unhealthyLong(s, signer = s.victim) {
  const id = await openAndFund(s, signer, 300n * 10n ** 6n);
  await receipt(s.router.connect(signer).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  // Use explicit headroom so the reproduction is not coupled to a client's
  // occasionally exact (and therefore brittle) gas estimate for this state write.
  await receipt(s.feed.setAnswer(1_000n * 10n ** 8n, { gasLimit: 200_000n }));
  assert.ok(await s.clearing.accountEquity(id) < await s.clearing.accountMaintenance(id));
  return id;
}

test('H-006 settlement records a post-cutoff latest round instead of the cutoff price', async () => {
  const s = await deploySystem();
  const now = (await s.provider.getBlock('latest')).timestamp;
  const cutoff = BigInt(now + 100);
  await receipt(s.settlement.schedule(cutoff, [1]));
  await receipt(s.feed.setRound(2_100n * 10n ** 8n, cutoff, 2));
  await increaseTime(s.eip1193, 101);
  const postCutoffTimestamp = BigInt((await s.provider.getBlock('latest')).timestamp);
  await receipt(s.feed.setRound(3_000n * 10n ** 8n, postCutoffTimestamp, 3));
  await receipt(s.settlement.recordPrices(1));
  const recorded = await s.oracle.settlementPrice(1, 1);
  assert.equal(recorded, 3_000n * WAD);
  assert.notEqual(recorded, 2_100n * WAD);

  const control = await deploySystem();
  const controlNow = (await control.provider.getBlock('latest')).timestamp;
  const controlCutoff = BigInt(controlNow + 10);
  await receipt(control.settlement.schedule(controlCutoff, [1]));
  await receipt(control.feed.setRound(2_100n * 10n ** 8n, controlCutoff, 2));
  await increaseTime(control.eip1193, 11);
  await receipt(control.settlement.recordPrices(1));
  assert.equal(await control.oracle.settlementPrice(1, 1), 2_100n * WAD);
  console.log(JSON.stringify({ hunterId: 'H-006', cutoffPrice: `${2_100n * WAD}`, recordedPostCutoffPrice: `${recorded}`, controlNoPostCutoffUpdate: `${2_100n * WAD}` }));
});

test('H-009 epoch realization zeros base before funding and omits the final payment', async () => {
  async function setup() {
    const s = await deploySystem();
    await receipt(s.funding.configure(1, 1, WAD));
    const id = await openAndFund(s, s.trader, 10_000n * 10n ** 6n);
    await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 3_000n * WAD]], 3_000n * WAD, true));
    const now = (await s.provider.getBlock('latest')).timestamp;
    await receipt(s.settlement.schedule(now + 2, [1]));
    await increaseTime(s.eip1193, 3);
    await receipt(s.funding.accrue(1));
    await receipt(s.settlement.recordPrices(1));
    return { s, id };
  }

  const omitted = await setup();
  const growth = await omitted.s.funding.growth(1);
  assert.ok(growth > 0n);
  const cashBefore = await omitted.s.clearing.cashBalance(omitted.id);
  await receipt(omitted.s.settlement.settleBatch(1, [omitted.id]));
  const cashAfter = await omitted.s.clearing.cashBalance(omitted.id);
  const expectedFundingPayment = growth;
  const realizedOnly = -1_000n * WAD;
  assert.equal(cashAfter - cashBefore, realizedOnly, 'no funding debit survives zeroed base');

  const control = await setup();
  const controlGrowth = await control.s.funding.growth(1);
  const controlCashBefore = await control.s.clearing.cashBalance(control.id);
  await receipt(control.s.clearing.settleAccountFunding(control.id, 1));
  await receipt(control.s.settlement.settleBatch(1, [control.id]));
  const controlDelta = await control.s.clearing.cashBalance(control.id) - controlCashBefore;
  assert.equal(controlDelta, -1_000n * WAD - controlGrowth);
  console.log(JSON.stringify({ hunterId: 'H-009', growth: `${growth}`, omittedFlowCashDelta: `${cashAfter - cashBefore}`, requiredFundingDebit: `${expectedFundingPayment}`, checkpointFirstControlDelta: `${controlDelta}` }));
});

test('H-016 bidder forces a liquidation position into an unrelated victim account', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 1));
  const distressedId = await unhealthyLong(s);
  await receipt(s.auction.start(distressedId, 1));
  const targetId = await openAndFund(s, s.other, 10_000n * 10n ** 6n);
  const salt = keccak256(new TextEncoder().encode('forced-target'));
  const digest = bidDigest(1n, targetId, WAD, MAX_PRICE, salt);
  await receipt(s.auction.connect(s.bidder).commit(1, targetId, digest, 0));
  await increaseTime(s.eip1193, 2);
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
  const forced = await s.clearing.position(targetId, 1);
  assert.equal(forced.base, WAD);
  assert.notEqual(BigInt(await s.bidder.getAddress()), targetId >> 96n);
  assert.equal(await s.vault.delegateFor(targetId), '0x0000000000000000000000000000000000000000');

  const control = await deploySystem();
  await receipt(control.clearing.setFees(0));
  const controlTarget = await openAndFund(control, control.other, 10_000n * 10n ** 6n);
  await expectCustomRevert(
    control.router.connect(control.bidder).executePortfolio(controlTarget, [[1, WAD, 1_000n * WAD]], 1_000n * WAD, true),
    'ordinary trade into unrelated account rejects',
  );
  console.log(JSON.stringify({ hunterId: 'H-016', forcedAccount: `${targetId}`, attackerIsOwner: false, attackerIsDelegate: false, forcedBase: `${forced.base}`, ordinaryTradeControl: 'reverted' }));
});

test('H-017 zero-bond fill bypasses bidder health and composes into a costless socialized deficit', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 1));
  const distressedId = await unhealthyLong(s);
  await receipt(s.auction.start(distressedId, 1));
  await receipt(s.vault.connect(s.bidder).openAccount());
  const bidderId = await accountIdOf(s.bidder);
  const salt = keccak256(new TextEncoder().encode('zero-capital'));
  const digest = bidDigest(1n, bidderId, WAD, MAX_PRICE, salt);
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));
  await increaseTime(s.eip1193, 29);
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
  const bidderEquity = await s.clearing.accountEquity(bidderId);
  const bidderInitial = await s.clearing.accountInitial(bidderId);
  assert.ok(bidderEquity < bidderInitial, 'auction bypasses initial-margin postcondition');
  assert.equal(await s.insurance.auctionReserved(), 0n);

  await receipt(s.feed.setAnswer(900n * 10n ** 8n));
  assert.ok(await s.clearing.accountEquity(bidderId) < 0n);
  await receipt(s.auction.start(bidderId, 1));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(2));
  const pendingLoss = await s.insurance.pendingSocialLoss();
  assert.ok(pendingLoss > 0n);
  assert.equal((await s.clearing.position(bidderId, 1)).base, WAD, 'residual exposure remains after deficit allocation');

  const control = await deploySystem();
  await receipt(control.vault.connect(control.bidder).openAccount());
  const controlId = await accountIdOf(control.bidder);
  await expectCustomRevert(
    control.router.connect(control.bidder).executePortfolio(controlId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true),
    'ordinary zero-margin position opening rejects',
  );
  console.log(JSON.stringify({ hunterId: 'H-017', bond: '0', bidderEquityAfterFill: `${bidderEquity}`, bidderInitial: `${bidderInitial}`, finalPendingSocialLoss: `${pendingLoss}`, finalResidualBase: `${WAD}`, ordinaryTradeControl: 'reverted' }));
});

test('H-018 timed-out auction finalizes and unfreezes with its entire residual untouched', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 1));
  const id = await unhealthyLong(s);
  await receipt(s.auction.start(id, 1));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(1));
  const auction = await s.auction.auctions(1);
  const position = await s.clearing.position(id, 1);
  assert.equal(auction.remainingBase, WAD);
  assert.equal(position.base, WAD);
  assert.equal(await s.clearing.frozen(id), false);

  const control = await deploySystem();
  await receipt(control.clearing.setFees(0));
  await receipt(control.auction.setTiming(30, 1));
  const controlId = await unhealthyLong(control);
  await receipt(control.auction.start(controlId, 1));
  const bidderId = await openAndFund(control, control.bidder, 10_000n * 10n ** 6n);
  const salt = keccak256(new TextEncoder().encode('full-fill'));
  const digest = bidDigest(1n, bidderId, WAD, MAX_PRICE, salt);
  await receipt(control.auction.connect(control.bidder).commit(1, bidderId, digest, 0));
  await increaseTime(control.eip1193, 2);
  await receipt(control.auction.connect(control.bidder).reveal(1, WAD, MAX_PRICE, salt));
  await receipt(control.auction.finalize(1));
  assert.equal((await control.auction.auctions(1)).remainingBase, 0n);
  assert.equal((await control.clearing.position(controlId, 1)).base, 0n);
  console.log(JSON.stringify({ hunterId: 'H-018', timedOutResidual: `${auction.remainingBase}`, livePositionAfterFinalize: `${position.base}`, frozenAfterFinalize: false, fullyFilledControlResidual: '0' }));
});

test('H-019 a precommitted bid mutates positions after the auction was finalized', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 1));
  const id = await unhealthyLong(s);
  await receipt(s.auction.start(id, 1));
  const bidderId = await openAndFund(s, s.bidder, 10_000n * 10n ** 6n);
  const salt = keccak256(new TextEncoder().encode('late-reveal'));
  const digest = bidDigest(1n, bidderId, WAD, MAX_PRICE, salt);
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(1));
  const before = await s.clearing.position(id, 1);
  assert.equal((await s.auction.auctions(1)).finalized, true);
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
  const after = await s.clearing.position(id, 1);
  assert.equal(before.base, WAD);
  assert.equal(after.base, 0n);
  assert.equal((await s.auction.auctions(1)).remainingBase, 0n);

  await expectCustomRevert(
    s.auction.connect(s.other).commit(1, bidderId, keccak256(new TextEncoder().encode('new')), 0),
    'new commitment after finalization is rejected control',
  );
  console.log(JSON.stringify({ hunterId: 'H-019', finalizedBeforeReveal: true, baseBeforeLateReveal: `${before.base}`, baseAfterLateReveal: `${after.base}`, newCommitControl: 'reverted' }));
});

test('H-020 epoch completion clears an auction freeze and a later reveal reopens a settled position', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(60, 1));
  const id = await unhealthyLong(s);
  await receipt(s.auction.start(id, 1));
  assert.equal(await s.clearing.frozen(id), true);

  const bidderId = await openAndFund(s, s.bidder, 10_000n * 10n ** 6n);
  const salt = keccak256(new TextEncoder().encode('cross-lifecycle'));
  const digest = bidDigest(1n, bidderId, WAD, MAX_PRICE, salt);
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));

  const now = (await s.provider.getBlock('latest')).timestamp;
  await receipt(s.settlement.schedule(now + 2, [1]));
  await increaseTime(s.eip1193, 3);
  await receipt(s.settlement.recordPrices(1));
  await receipt(s.settlement.settleBatch(1, [id]));
  assert.equal(await s.settlement.accountSettled(1, id), true);
  assert.equal(await s.clearing.frozen(id), false, 'settlement clears active auction freeze');
  assert.equal((await s.clearing.position(id, 1)).base, 0n);
  assert.equal((await s.auction.auctions(1)).remainingBase, WAD);

  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
  const reopened = await s.clearing.position(id, 1);
  assert.equal(reopened.base, -WAD, 'stale auction delta reopens already-settled account in opposite direction');
  assert.equal(await s.settlement.accountSettled(1, id), true);

  const control = await deploySystem();
  const controlId = await openAndFund(control, control.trader, 10_000n * 10n ** 6n);
  await receipt(control.router.connect(control.trader).executePortfolio(controlId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  const controlNow = (await control.provider.getBlock('latest')).timestamp;
  await receipt(control.settlement.schedule(controlNow + 2, [1]));
  await increaseTime(control.eip1193, 3);
  await receipt(control.settlement.recordPrices(1));
  await receipt(control.settlement.settleBatch(1, [controlId]));
  assert.equal((await control.clearing.position(controlId, 1)).base, 0n, 'settlement-only control remains closed');
  console.log(JSON.stringify({ hunterId: 'H-020', settledMarker: true, auctionResidualAtSettlement: `${WAD}`, frozenAfterSettlement: false, postSettlementLateRevealBase: `${reopened.base}`, noAuctionControlBase: '0' }));
});
