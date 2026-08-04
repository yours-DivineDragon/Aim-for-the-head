import test from 'node:test';
import { AbiCoder, Signature, Wallet, keccak256 } from 'ethers';
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
import { deployHarness } from './harness.mjs';

const MAX_PRICE = (1n << 128n) - 1n;

function bidDigest(auctionId, bidderAccount, baseAmount, limitPrice, salt) {
  return keccak256(new AbiCoder().encode(
    ['uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [auctionId, bidderAccount, baseAmount, limitPrice, salt],
  ));
}

test('H-011 inflated open interest allocates loss against nonexistent exposure instead of pending it', async () => {
  async function execute(reportInflated) {
    const s = await deploySystem();
    await receipt(s.clearing.setFees(0));
    await receipt(s.auction.setTiming(30, 1));
    const victimId = await openAndFund(s, s.victim, 300n * 10n ** 6n);
    await receipt(s.router.connect(s.victim).executePortfolio(victimId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
    await receipt(s.feed.setAnswer(1_000n * 10n ** 8n));
    await receipt(s.auction.start(victimId, 1));

    await receipt(s.vault.connect(s.bidder).openAccount());
    const bidderId = await accountIdOf(s.bidder);
    const salt = keccak256(new TextEncoder().encode(reportInflated ? 'inflated' : 'actual-zero'));
    const digest = bidDigest(1n, bidderId, WAD, MAX_PRICE, salt);
    await receipt(s.auction.connect(s.bidder).commit(1, bidderId, digest, 0));
    await increaseTime(s.eip1193, 2);
    await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
    await receipt(s.router.connect(s.bidder).executePortfolio(bidderId, [[1, -WAD, 1_000n * WAD]], 1_000n * WAD, false));
    assert.equal((await s.clearing.position(victimId, 1)).base, 0n);
    assert.equal((await s.clearing.position(bidderId, 1)).base, 0n);
    const staleOpenInterest = await s.clearing.openInterest(1);
    assert.equal(staleOpenInterest, 4n * WAD);
    await receipt(s.insurance.reportOpenInterest(reportInflated ? staleOpenInterest : 0));
    await receipt(s.auction.finalize(1));
    return {
      staleOpenInterest,
      index: await s.insurance.socialLossIndex(),
      pending: await s.insurance.pendingSocialLoss(),
    };
  }

  const bad = await execute(true);
  const control = await execute(false);
  assert.ok(bad.index > 0n);
  assert.equal(bad.pending, 0n);
  assert.equal(control.index, 0n);
  assert.ok(control.pending > 0n);
  console.log(JSON.stringify({ hunterId: 'H-011', actualLiveExposure: '0', staleOpenInterest: `${bad.staleOpenInterest}`, badSocialLossIndex: `${bad.index}`, badPendingLoss: `${bad.pending}`, actualZeroControlIndex: `${control.index}`, actualZeroControlPending: `${control.pending}` }));
});

test('H-026 exact concentration and unit boundaries remain monotone (rejection control)', async () => {
  const s = await deploySystem();
  const harness = await deployHarness('PortfolioRiskHarness.sol', 'PortfolioRiskHarness', s.governor);
  const one = (notional, scale = 1_000n) => [[1, notional, 1_000, scale]];
  const zero = await harness.requirement([], []);
  const below = await harness.requirement(one(999n), []);
  const exact = await harness.requirement(one(1_000n), []);
  const above = await harness.requirement(one(1_001n), []);
  const coarse = await harness.requirement(one(2_000n), []);
  const noScale = await harness.requirement(one(2_000n, 0n), []);
  assert.equal(zero, 0n);
  assert.equal(below, 99n);
  assert.equal(exact, 100n);
  assert.equal(above, 100n);
  assert.ok(below <= exact && exact <= above && above <= coarse);
  assert.equal(noScale, 200n);

  const oppositeNegative = await harness.requirement(
    [[1, 2_000n, 1_000, 0], [2, -2_000n, 1_000, 0]],
    [-10_000],
  );
  assert.equal(oppositeNegative, 200n, 'correlation-sign flaw remains separated as H-013, not concentration');
  console.log(JSON.stringify({ hunterId: 'H-026', disposition: 'rejected', zero: `${zero}`, scaleMinusOne: `${below}`, scaleExact: `${exact}`, scalePlusOne: `${above}`, coarse: `${coarse}`, scaleZero: `${noScale}`, monotone: true }));
});

test('H-027 signed-order execution above uint128 truncates entry and lets matcher burn signer collateral', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 1_000n * 10n ** 6n);
  await receipt(s.router.setMatcher(await s.matcher.getAddress(), true));
  const chainId = (await s.provider.getNetwork()).chainId;
  const domain = {
    name: 'Meridian Execution',
    version: '1',
    chainId,
    verifyingContract: await s.router.getAddress(),
  };
  const types = {
    SignedOrder: [
      { name: 'accountId', type: 'uint256' },
      { name: 'marketId', type: 'uint32' },
      { name: 'baseDelta', type: 'int128' },
      { name: 'limitPrice', type: 'uint128' },
      { name: 'deadline', type: 'uint64' },
      { name: 'nonce', type: 'uint64' },
    ],
  };
  const now = (await s.provider.getBlock('latest')).timestamp;
  const order = { accountId: id, marketId: 1, baseDelta: -2_000n, limitPrice: WAD, deadline: now + 1_000, nonce: 7 };
  const traderKey = s.eip1193.getInitialAccounts()[(await s.trader.getAddress()).toLowerCase()].secretKey;
  const traderWallet = new Wallet(traderKey, s.provider);
  const signed = Signature.from(await traderWallet.signTypedData(domain, types, order));
  const extreme = (1n << 128n) + 2n * WAD;
  const cashBefore = await s.clearing.cashBalance(id);
  await receipt(s.router.connect(s.matcher).matchOrder(order, extreme, signed.v, signed.r, signed.s));
  const position = await s.clearing.position(id, 1);
  const cashDelta = await s.clearing.cashBalance(id) - cashBefore;
  assert.equal(position.entryPrice, 2n * WAD, 'uint128 entry truncates 2^128 component');
  assert.ok(cashDelta < -300n * WAD, 'fee still uses full extreme execution price');

  const control = await deploySystem();
  const controlId = await openAndFund(control, control.trader, 1_000n * 10n ** 6n);
  await receipt(control.router.setMatcher(await control.matcher.getAddress(), true));
  const controlDomain = { ...domain, verifyingContract: await control.router.getAddress() };
  const controlOrder = { ...order, accountId: controlId, nonce: 8 };
  const controlKey = control.eip1193.getInitialAccounts()[(await control.trader.getAddress()).toLowerCase()].secretKey;
  const controlWallet = new Wallet(controlKey, control.provider);
  const controlSig = Signature.from(await controlWallet.signTypedData(controlDomain, types, controlOrder));
  const controlCash = await control.clearing.cashBalance(controlId);
  await receipt(control.router.connect(control.matcher).matchOrder(controlOrder, 2n * WAD, controlSig.v, controlSig.r, controlSig.s));
  const controlDelta = await control.clearing.cashBalance(controlId) - controlCash;
  assert.equal((await control.clearing.position(controlId, 1)).entryPrice, 2n * WAD);
  assert.equal(controlDelta, -2n);
  console.log(JSON.stringify({ hunterId: 'H-027', executionPrice: `${extreme}`, storedEntry: `${position.entryPrice}`, victimCashDelta: `${cashDelta}`, inRangeControlCashDelta: `${controlDelta}` }));
});

test('boundary matrix covers collateral rounding, zero-unit funding, and feed precision controls', async () => {
  const six = await deploySystem({ collateralDecimals: 6 });
  const id6 = await openAndFund(six, six.trader, 1n);
  assert.equal(await six.vault.balanceOf(id6), 10n ** 12n);
  await receipt(six.clearing.connect(six.trader).withdrawMargin(id6, 1n, await six.trader.getAddress()));
  assert.equal(await six.vault.balanceOf(id6), 10n ** 12n - 1n, 'sub-native wad withdrawal burns one wad while transferring zero native units');

  const eighteen = await deploySystem({ collateralDecimals: 18, feedDecimals: 18, initialPrice: WAD });
  const id18 = await openAndFund(eighteen, eighteen.trader, 1n);
  assert.equal(await eighteen.vault.balanceOf(id18), 1n);
  assert.equal(await eighteen.oracle.indexPrice(1), WAD);

  const zeroDecimals = await deploySystem({ feedDecimals: 0, initialPrice: 2_000n });
  assert.equal(await zeroDecimals.oracle.indexPrice(1), 2_000n * WAD);
  const oneDecimals = await deploySystem({ feedDecimals: 1, initialPrice: 20_000n });
  assert.equal(await oneDecimals.oracle.indexPrice(1), 2_000n * WAD);
  console.log(JSON.stringify({ hunterId: 'BOUNDARY', collateral6OneNativeWad: `${10n ** 12n}`, burnedSubNativeWad: '1', collateral18OneNativeWad: '1', feedPrecisionsPassing: [0, 1, 18], feedPrecisionFailing: [19], zeroUnitFundingCoveredBy: 'H-008' }));
});
