import test from 'node:test';
import { AbiCoder, Interface, keccak256 } from 'ethers';
import {
  assert,
  WAD,
  accountIdOf,
  chain,
  deploy,
  deploySystem,
  expectCustomRevert,
  increaseTime,
  openAndFund,
  receipt,
} from './support.mjs';
import { deployHarness } from './harness.mjs';

async function makeUnhealthyAuction(s) {
  const victimId = await openAndFund(s, s.victim, 300n * 10n ** 6n);
  await receipt(s.router.connect(s.victim).executePortfolio(victimId, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  await receipt(s.feed.setAnswer(1_000n * 10n ** 8n));
  assert.ok(await s.clearing.accountEquity(victimId) < await s.clearing.accountMaintenance(victimId));
  await receipt(s.auction.start(victimId, 1));
  return victimId;
}

test('H-002 fee-on-transfer margin is overcredited and lets attacker drain another depositor backing', async () => {
  const s = await deploySystem();
  const victimId = await openAndFund(s, s.victim, 1_000n * 10n ** 6n);

  await receipt(s.token.setTransferFee(1_000));
  await receipt(s.vault.connect(s.trader).openAccount());
  const attackerId = await accountIdOf(s.trader);
  await receipt(s.token.mint(await s.trader.getAddress(), 1_000n * 10n ** 6n));
  await receipt(s.token.connect(s.trader).approve(await s.vault.getAddress(), 1_000n * 10n ** 6n));
  const tokenBefore = await s.token.balanceOf(await s.vault.getAddress());
  await receipt(s.vault.connect(s.trader).deposit(attackerId, 1_000n * 10n ** 6n));
  const tokenAfter = await s.token.balanceOf(await s.vault.getAddress());
  const actualReceiptWad = (tokenAfter - tokenBefore) * 10n ** 12n;
  const creditedWad = await s.vault.balanceOf(attackerId);
  assert.equal(actualReceiptWad, 900n * WAD);
  assert.equal(creditedWad, 1_000n * WAD);

  await receipt(s.token.setTransferFee(0));
  await receipt(s.clearing.connect(s.trader).withdrawMargin(attackerId, creditedWad, await s.trader.getAddress()));
  const remainingTokensWad = (await s.token.balanceOf(await s.vault.getAddress())) * 10n ** 12n;
  const victimClaim = await s.vault.balanceOf(victimId);
  assert.equal(remainingTokensWad, 900n * WAD);
  assert.equal(victimClaim, 1_000n * WAD);

  const control = await deploySystem();
  const controlId = await openAndFund(control, control.trader, 1_000n * 10n ** 6n);
  assert.equal(await control.vault.balanceOf(controlId), (await control.token.balanceOf(await control.vault.getAddress())) * 10n ** 12n);
  console.log(JSON.stringify({ hunterId: 'H-002', nominalCredit: `${creditedWad}`, actualReceipt: `${actualReceiptWad}`, victimClaim: `${victimClaim}`, remainingBacking: `${remainingTokensWad}`, control: 'no-fee credit equals receipt' }));
});

test('H-003 a frozen unhealthy account claims a delayed withdrawal directly from the vault', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 1_000n * 10n ** 6n);
  await receipt(s.vault.connect(s.trader).requestWithdrawal(id, 900n * WAD, await s.trader.getAddress()));
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  await receipt(s.feed.setAnswer(1_000n * 10n ** 8n));
  await increaseTime(s.eip1193, 61);
  await receipt(s.auction.start(id, 1));
  assert.equal(await s.clearing.frozen(id), true);
  assert.ok(await s.clearing.accountEquity(id) < await s.clearing.accountMaintenance(id));

  await expectCustomRevert(
    s.clearing.connect(s.trader).withdrawMargin(id, 900n * WAD, await s.trader.getAddress()),
    'routed negative control must enforce freeze/health',
  );
  const recipientBefore = await s.token.balanceOf(await s.trader.getAddress());
  await receipt(s.vault.connect(s.other).claimWithdrawal(id));
  const recipientDelta = await s.token.balanceOf(await s.trader.getAddress()) - recipientBefore;
  assert.equal(recipientDelta, 900n * 10n ** 6n);
  assert.equal(await s.vault.balanceOf(id), 100n * WAD);
  assert.equal(await s.clearing.frozen(id), true);
  console.log(JSON.stringify({ hunterId: 'H-003', frozenAtClaim: true, unhealthyAtClaim: true, tokensExtracted: `${recipientDelta}`, remainingMargin: `${await s.vault.balanceOf(id)}`, control: 'ClearingHouse withdrawal reverted' }));
});

test('H-004 withdrawal callback reuses one live request and transfers twice', async () => {
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
  const request = await vault.withdrawalRequests(id);
  assert.equal(request.amount, 0n);

  const controlToken = await deployHarness('ReentrantERC20.sol', 'ReentrantERC20', governor);
  const controlVault = await deploy('MarginVault', governor, [await governor.getAddress(), await controlToken.getAddress(), 1]);
  await receipt(controlVault.connect(trader).openAccount());
  await receipt(controlToken.mint(await trader.getAddress(), 300n * WAD));
  await receipt(controlToken.connect(trader).approve(await controlVault.getAddress(), 300n * WAD));
  await receipt(controlVault.connect(trader).deposit(id, 300n * WAD));
  await receipt(controlVault.connect(trader).requestWithdrawal(id, 100n * WAD, await trader.getAddress()));
  await increaseTime(eip1193, 2);
  const controlBefore = await controlToken.balanceOf(await trader.getAddress());
  await receipt(controlVault.connect(caller).claimWithdrawal(id));
  assert.equal(await controlToken.balanceOf(await trader.getAddress()) - controlBefore, 100n * WAD);
  console.log(JSON.stringify({ hunterId: 'H-004', requested: `${100n * WAD}`, receivedWithCallback: `${received}`, noCallbackControl: `${100n * WAD}` }));
});

test('H-021 slashed bond leaves aggregate reservation with no live bond record', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 10));
  await makeUnhealthyAuction(s);
  const bond = 100n * 10n ** 6n;
  await receipt(s.token.mint(await s.bidder.getAddress(), bond));
  await receipt(s.token.connect(s.bidder).approve(await s.insurance.getAddress(), bond));
  const digest = keccak256(new AbiCoder().encode(['string'], ['unrevealed']));
  await receipt(s.auction.connect(s.bidder).commit(1, 123n, digest, bond));
  const key = keccak256(new AbiCoder().encode(['uint256', 'address'], [1n, await s.bidder.getAddress()]));
  assert.equal(await s.insurance.reservedBond(key), 100n * WAD);
  assert.equal(await s.insurance.auctionReserved(), 100n * WAD);
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.slashUnrevealed(1, await s.bidder.getAddress()));
  assert.equal(await s.insurance.reservedBond(key), 0n);
  assert.equal(await s.insurance.auctionReserved(), 50n * WAD);
  assert.equal(await s.insurance.accruedProtocolValue(), 50n * WAD);
  console.log(JSON.stringify({ hunterId: 'H-021', liveBondSum: '0', aggregateReserved: `${50n * WAD}`, accruedSlash: `${50n * WAD}` }));
});

test('H-022 an insurance shareholder redeems a live bidder bond and makes its return fail', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 10));
  await makeUnhealthyAuction(s);
  const deposit = 1_000n * 10n ** 6n;
  await receipt(s.token.mint(await s.shareholder.getAddress(), deposit));
  await receipt(s.token.connect(s.shareholder).approve(await s.insurance.getAddress(), deposit));
  await receipt(s.insurance.connect(s.shareholder).deposit(deposit, await s.shareholder.getAddress()));
  const shares = await s.insurance.balanceOf(await s.shareholder.getAddress());

  await receipt(s.token.mint(await s.bidder.getAddress(), deposit));
  await receipt(s.token.connect(s.bidder).approve(await s.insurance.getAddress(), deposit));
  const digest = keccak256(new AbiCoder().encode(['string'], ['bond-consumption']));
  await receipt(s.auction.connect(s.bidder).commit(1, 123n, digest, deposit));
  assert.equal(await s.insurance.auctionReserved(), 1_000n * WAD);
  const before = await s.token.balanceOf(await s.shareholder.getAddress());
  await receipt(s.insurance.connect(s.shareholder).redeem(shares, await s.shareholder.getAddress()));
  const redeemed = await s.token.balanceOf(await s.shareholder.getAddress()) - before;
  assert.equal(redeemed, 2_000n * 10n ** 6n);
  assert.equal(await s.token.balanceOf(await s.insurance.getAddress()), 0n);
  await increaseTime(s.eip1193, 31);
  await expectCustomRevert(
    s.auction.slashUnrevealed(1, await s.bidder.getAddress()),
    'bond terminal action fails after reserved token consumption',
  );

  const control = await deploySystem();
  await receipt(control.token.mint(await control.shareholder.getAddress(), deposit));
  await receipt(control.token.connect(control.shareholder).approve(await control.insurance.getAddress(), deposit));
  await receipt(control.insurance.connect(control.shareholder).deposit(deposit, await control.shareholder.getAddress()));
  const controlShares = await control.insurance.balanceOf(await control.shareholder.getAddress());
  const controlBefore = await control.token.balanceOf(await control.shareholder.getAddress());
  await receipt(control.insurance.connect(control.shareholder).redeem(controlShares, await control.shareholder.getAddress()));
  assert.equal(await control.token.balanceOf(await control.shareholder.getAddress()) - controlBefore, deposit);
  console.log(JSON.stringify({ hunterId: 'H-022', shareholderDeposit: `${deposit}`, thirdPartyBond: `${deposit}`, redeemed: `${redeemed}`, bondTerminalControl: 'reverted after drain', noBondRedemption: `${deposit}` }));
});

test('H-023 trade fees create unbacked insurance NAV and block full redemption', async () => {
  const s = await deploySystem();
  const deposit = 1_000n * 10n ** 6n;
  await receipt(s.token.mint(await s.shareholder.getAddress(), deposit));
  await receipt(s.token.connect(s.shareholder).approve(await s.insurance.getAddress(), deposit));
  await receipt(s.insurance.connect(s.shareholder).deposit(deposit, await s.shareholder.getAddress()));
  const shares = await s.insurance.balanceOf(await s.shareholder.getAddress());
  const traderId = await openAndFund(s, s.trader, 100_000n * 10n ** 6n);
  const tokenBeforeFee = await s.token.balanceOf(await s.insurance.getAddress());
  await receipt(s.router.connect(s.trader).executePortfolio(traderId, [[1, 100n * WAD, 2_000n * WAD]], 2_000n * WAD, true));
  const tokenAfterFee = await s.token.balanceOf(await s.insurance.getAddress());
  const accrued = await s.insurance.accruedProtocolValue();
  assert.equal(tokenAfterFee, tokenBeforeFee, 'fee creates no insurance token receipt');
  assert.equal(accrued, 120n * WAD);
  assert.equal(await s.insurance.totalAssets(), 1_120n * WAD);
  await expectCustomRevert(
    s.insurance.connect(s.shareholder).redeem(shares, await s.shareholder.getAddress()),
    'full redemption promises phantom fee assets and fails',
  );

  const control = await deploySystem();
  await receipt(control.token.mint(await control.shareholder.getAddress(), deposit));
  await receipt(control.token.connect(control.shareholder).approve(await control.insurance.getAddress(), deposit));
  await receipt(control.insurance.connect(control.shareholder).deposit(deposit, await control.shareholder.getAddress()));
  const controlShares = await control.insurance.balanceOf(await control.shareholder.getAddress());
  await receipt(control.insurance.connect(control.shareholder).redeem(controlShares, await control.shareholder.getAddress()));
  console.log(JSON.stringify({ hunterId: 'H-023', feeAccruedWad: `${accrued}`, fundTokenDeltaNative: `${tokenAfterFee - tokenBeforeFee}`, promisedAssetsWad: `${await s.insurance.totalAssets()}`, actualAssetsWad: `${tokenAfterFee * 10n ** 12n}`, noFeeControl: 'full redemption passed' }));
});

test('H-024 venue return is treated as received wad without output precision or balance delta', async () => {
  const s = await deploySystem();
  const tokenOut = await deploy('MockERC20', s.governor, ['24 Decimal Output', 'O24', 24]);
  const input = 100n * 10n ** 6n;
  await receipt(s.token.mint(await s.insurance.getAddress(), input));
  await receipt(s.venue.setQuotedOutput(WAD));
  const actualOutBefore = await tokenOut.balanceOf(await s.insurance.getAddress());
  await receipt(s.insurance.rebalance(await tokenOut.getAddress(), input, WAD, '0x'));
  const actualOutAfter = await tokenOut.balanceOf(await s.insurance.getAddress());
  assert.equal(actualOutAfter - actualOutBefore, 0n, 'mock venue returns without transferring output');
  assert.equal(await s.insurance.accruedProtocolValue(), WAD, 'native return credited directly as wad');
  const normalizedIfReceived = WAD / 10n ** 6n;
  assert.equal(normalizedIfReceived, 10n ** 12n);

  const control = await deploySystem();
  await receipt(control.token.mint(await control.insurance.getAddress(), input));
  await receipt(control.venue.setQuotedOutput(WAD - 1n));
  await expectCustomRevert(
    control.insurance.rebalance(await tokenOut.getAddress(), input, WAD, '0x'),
    'raw-return one-unit-below minimum control reverts',
  );
  console.log(JSON.stringify({ hunterId: 'H-024', returnedNative: `${WAD}`, tokenOutDecimals: 24, actualReceivedNative: '0', creditedWad: `${WAD}`, normalizedReturnIfReceivedWad: `${normalizedIfReceived}`, belowRawMinControl: 'reverted' }));
});

test('H-025 fee-on-transfer auction bond reserve exceeds actual received collateral', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await makeUnhealthyAuction(s);
  const bond = 1_000n * 10n ** 6n;
  await receipt(s.token.mint(await s.bidder.getAddress(), bond));
  await receipt(s.token.connect(s.bidder).approve(await s.insurance.getAddress(), bond));
  await receipt(s.token.setTransferFee(1_000));
  const before = await s.token.balanceOf(await s.insurance.getAddress());
  const digest = keccak256(new AbiCoder().encode(['string'], ['fee-bond']));
  await receipt(s.auction.connect(s.bidder).commit(1, 123n, digest, bond));
  const receivedWad = (await s.token.balanceOf(await s.insurance.getAddress()) - before) * 10n ** 12n;
  assert.equal(receivedWad, 900n * WAD);
  assert.equal(await s.insurance.auctionReserved(), 1_000n * WAD);

  const control = await deploySystem();
  await receipt(control.clearing.setFees(0));
  await makeUnhealthyAuction(control);
  await receipt(control.token.mint(await control.bidder.getAddress(), bond));
  await receipt(control.token.connect(control.bidder).approve(await control.insurance.getAddress(), bond));
  const controlBefore = await control.token.balanceOf(await control.insurance.getAddress());
  await receipt(control.auction.connect(control.bidder).commit(1, 123n, digest, bond));
  assert.equal((await control.token.balanceOf(await control.insurance.getAddress()) - controlBefore) * 10n ** 12n, await control.insurance.auctionReserved());
  console.log(JSON.stringify({ hunterId: 'H-025', nominalReserve: `${await s.insurance.auctionReserved()}`, actualReceipt: `${receivedWad}`, noFeeControl: 'reserve equals receipt' }));
});
