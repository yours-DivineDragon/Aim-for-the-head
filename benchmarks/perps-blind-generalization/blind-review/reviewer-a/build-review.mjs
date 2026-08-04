import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const reviewRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(reviewRoot, '..', '..');
const shaFile = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const submission = readJson(path.join(targetRoot, 'blind-run', 'submission.json'));
const inventory = readJson(path.join(targetRoot, 'blind-run', 'HASH_INVENTORY.json'));
const manifest = readJson(path.join(targetRoot, 'SOURCE_MANIFEST.json'));
const executionLog = readJson(path.join(reviewRoot, 'execution-log.json'));
const manifestHashes = Object.fromEntries(manifest.entries.map((entry) => [entry.path, entry.sha256]));
const evidenceHashes = Object.fromEntries(inventory.files
  .filter((entry) => /^blind-run\/evidence\/AFH-\d{3}\.json$/.test(entry.path))
  .map((entry) => [path.basename(entry.path, '.json'), entry.sha256]));

const judgments = {
  'AFH-001': {
    status: 'confirmed_exact', severity: 'low', confidence: 'high', source: ['contracts/MarketCatalog.sol:64-68'],
    facts: ['An untrusted EOA changed riskTier 2 to 7.', 'The adjacent governor-only market-active setter rejected the same caller.', 'No target consumer reads riskTier.'],
    scope: 'Persistent unauthorized configuration mutation only; no demonstrated value or authority consumer in this revision.',
    overlap: 'authorization-config', composition: { role: 'standalone', members: [] },
    rationale: 'The omitted modifier and caller reachability are exact, and Low appropriately reflects the absent consumer.',
  },
  'AFH-002': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/MarginVault.sol:88-93', 'contracts/InsuranceFund.sol:83-93', 'contracts/InsuranceFund.sol:138-145'],
    facts: ['A nominal 1000 margin deposit credited 1000 wad after only 900 wad arrived.', 'With the output fee disabled, the credited account withdrew 1000 and left a victim 100 short of backing.', 'Reviewer test RA-002 separately observed 900 wad receipt minting 1000 insurance shares; the bond occurrence was also reproduced.'],
    scope: 'One receipt-delta root cause across margin deposits, share deposits, and auction bonds; direct third-party backing loss closes High impact on the margin path.',
    overlap: 'nominal-transfer-receipt', composition: { role: 'multi-sink-root-cause', members: [] },
    rationale: 'The three occurrences share one fix and are correctly consolidated rather than counted separately.',
  },
  'AFH-003': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/MarginVault.sol:96-124', 'contracts/ClearingHouse.sol:174-179'],
    facts: ['A request created while healthy remained executable after the account became unhealthy and auction-frozen.', 'The direct vault claim transferred 900 native units while the ClearingHouse route rejected the same withdrawal.', 'Stable reviewer test RA-003 used explicit gas headroom and closed the same final state.'],
    scope: 'The public delayed claim route bypasses both current health and freeze checks and removes collateral needed by liquidation.',
    overlap: 'withdrawal-state-machine', composition: { role: 'standalone; compatible', members: ['AFH-004'] },
    rationale: 'The specification explicitly requires production routing to apply clearing health policy, and the bypass is fully executable.',
  },
  'AFH-004': {
    status: 'confirmed_exact', severity: 'medium', confidence: 'high', source: ['contracts/MarginVault.sol:113-123'],
    facts: ['The transfer occurs before balance debit and request deletion.', 'A one-shot token callback reused one 100 request and transferred/debited 200.', 'The no-callback control transferred exactly 100.'],
    scope: 'Single-request authorization is reusable during callback, bounded by account balance; it can amplify AFH-003 but does not exceed an independently requestable full balance.',
    overlap: 'withdrawal-state-machine', composition: { role: 'compatible primitive', members: ['AFH-003'] },
    rationale: 'Distinct checks-effects-interactions root cause; Medium avoids double-counting AFH-003 maximum extraction.',
  },
  'AFH-005': {
    status: 'confirmed_exact', severity: 'medium', confidence: 'high', source: ['contracts/OracleHub.sol:48-54', 'contracts/OracleHub.sol:90-99'],
    facts: ['Configuration accepts a feed declaring 19 decimals.', 'The 18 - precision subtraction underflows and all price reads revert.', 'An 18-decimal control normalized exactly.'],
    scope: 'Supported-interface precision mismatch bricks price consumers for the configured market; no price corruption or asset extraction is claimed.',
    overlap: 'oracle-semantics', composition: { role: 'standalone', members: [] },
    rationale: 'The public specification covers any declared precision and no allowlist excludes greater-than-18 feeds.',
  },
  'AFH-006': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/EpochSettlement.sol:67-75', 'contracts/OracleHub.sol:75-83'],
    facts: ['A 2100 cutoff round was followed by a 3000 post-cutoff round.', 'Permissionless recording immutably stored 3000.', 'Without the later round, the same flow stored 2100.'],
    scope: 'Caller timing selects a later latest round and permanently shifts dated PnL, deficits, and insurance inputs.',
    overlap: 'oracle-semantics', composition: { role: 'standalone', members: [] },
    rationale: 'The observed round is not cutoff-bound, directly violating the stated epoch-price promise.',
  },
  'AFH-007': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/FundingEngine.sol:64-76'],
    facts: ['Negative growth exceeded the symmetric bound by more than 8000 times while the positive mirror clamped.', 'Reviewer RA-007 separated the global mark writer from the funded long.', 'The excess credit unlocked 40 collateral tokens that the symmetric bound could not unlock.'],
    scope: 'Attacker-influenced mark sets an uncapped negative rate; the resulting cash credit changes health and executable withdrawals.',
    overlap: 'funding-accounting', composition: { role: 'standalone', members: [] },
    rationale: 'The independent downstream withdrawal closes the High economic consequence beyond the hunter growth-only oracle.',
  },
  'AFH-008': {
    status: 'confirmed_exact', severity: 'low', confidence: 'high', source: ['contracts/FundingEngine.sol:83-90', 'contracts/ClearingHouse.sol:165-171'],
    facts: ['Ten split checkpoints paid zero.', 'The same accumulated growth paid one wei when checkpointed once.', 'No profitable amplification was demonstrated.'],
    scope: 'Repeatable conservation drift at sub-wad boundaries, with only one wei observed and nonzero transaction cost.',
    overlap: 'funding-accounting', composition: { role: 'standalone', members: [] },
    rationale: 'The split-invariance violation is exact and the Low severity is appropriately bounded.',
  },
  'AFH-009': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/EpochSettlement.sol:78-95', 'contracts/ClearingHouse.sol:165-197'],
    facts: ['Settlement realizes and zeroes base before calling the funding checkpoint.', 'The normal batch omitted the final payment.', 'Checkpoint-first control included the payment before settlement PnL.'],
    scope: 'Every nonzero dated position can omit its last accrued funding transfer, changing cash, health, and deficit resolution.',
    overlap: 'funding-accounting', composition: { role: 'standalone', members: [] },
    rationale: 'Ordering and downstream cash delta are directly discriminated; the omitted amount can be material over elapsed time and size.',
  },
  'AFH-010': {
    status: 'confirmed_exact', severity: 'medium', confidence: 'high', source: ['contracts/ClearingHouse.sol:136-151'],
    facts: ['A 1-long at 3000 crossed to 1-short at 2000.', 'Residual entry was 2500 rather than crossing price 2000.', 'Closing at 2000 omitted roughly 500 of the correct round-trip loss before fees.'],
    scope: 'Cross-zero position basis corrupts realized/unrealized PnL and health; no direct token extraction was required for Medium.',
    overlap: 'position-accounting', composition: { role: 'standalone', members: ['AFH-012'] },
    rationale: 'The formula is contrary to the explicit residual-basis invariant and the closed round trip distinguishes it.',
  },
  'AFH-011': {
    status: 'confirmed_narrowed', severity: 'medium', confidence: 'high', source: ['contracts/ClearingHouse.sol:153-160', 'contracts/ClearingHouse.sol:182-197', 'contracts/InsuranceFund.sol:112-135'],
    facts: ['After all bases closed, reported ClearingHouse open interest remained 4 wad.', 'Authorized reporting placed 775.8 uncovered loss into the index; reporting zero placed it in pending loss.', 'Neither socialLossIndex nor pendingSocialLoss has a current target consumer that realizes different asset or claimant deltas.'],
    scope: 'Exact OI and loss-bucket accounting corruption; the submitted claim that loss cannot be recovered by a future population is not executable in this revision.',
    overlap: 'open-interest-loss-allocation', composition: { role: 'composed accounting path', members: ['AFH-017'] },
    rationale: 'High is not supported without a consumer of the divergent buckets; retain the distinct root cause at Medium.',
  },
  'AFH-012': {
    status: 'confirmed_exact', severity: 'medium', confidence: 'high', source: ['contracts/ClearingHouse.sol:136-138', 'contracts/ClearingHouse.sol:208-252'],
    facts: ['Closing and reopening pushed the same market twice.', 'A later 1000 unrealized gain was counted twice in equity.', 'A single-open control produced one membership and one PnL term.'],
    scope: 'Persistent duplicate membership distorts equity and risk and grows view cost; submitted Medium does not assume an unproved token drain.',
    overlap: 'position-accounting', composition: { role: 'standalone', members: ['AFH-010'] },
    rationale: 'The list invariant and consumer effect are directly reproduced.',
  },
  'AFH-013': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/lib/PortfolioRisk.sol:32-44'],
    facts: ['Negative correlation plus opposite exposure selected the subtract branch.', 'Observed initial requirement was 200 versus sign-aware 600.', 'Positive-correlation opposite exposure correctly produced the 200 hedge control.'],
    scope: 'A supported correlation/sign quadrant undercharges initial and maintenance risk and permits materially excess leverage.',
    overlap: 'portfolio-risk', composition: { role: 'standalone', members: [] },
    rationale: 'Both sign inputs must determine covariance direction; the threefold margin delta closes a material risk-authority failure.',
  },
  'AFH-014': {
    status: 'confirmed_exact', severity: 'medium', confidence: 'high', source: ['contracts/ExecutionRouter.sol:73-82'],
    facts: ['Buys of 1 at 1000 and 9 at 3000 passed a 2200 limit.', 'Arithmetic mean was 2000 while required base-weighted price was 2800.', 'A one-leg 2300 control reverted.'],
    scope: 'Portfolio/delegate price protection is bypassed for unequal sizes; the same API also has one direction flag for all leg signs.',
    overlap: 'execution-protection', composition: { role: 'standalone', members: [] },
    rationale: 'The weighted promise is explicit and the accepted portfolio violates it materially.',
  },
  'AFH-015': {
    status: 'confirmed_exact', severity: 'low', confidence: 'high', source: ['contracts/ExecutionRouter.sol:85-106'],
    facts: ['Nonce 0 and nonce 65536 map to the same stored word and bit.', 'Nonce 1 maps to a distinct bit.', 'The collision blocks independent orders but does not enable replay or unauthorized value movement.'],
    scope: 'Upper 48 nonce bits alias, causing owner/order availability loss only.',
    overlap: 'execution-protection', composition: { role: 'standalone', members: [] },
    rationale: 'The uint8 word truncation is exact and Low correctly excludes theft.',
  },
  'AFH-016': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/LiquidationAuction.sol:115-142', 'contracts/ClearingHouse.sol:116-120'],
    facts: ['Commitment binds an arbitrary bidderAccount without ownership or delegation proof.', 'Reveal forced +1 base into an unrelated funded account.', 'The same attacker could not trade into that account through the ordinary router.'],
    scope: 'An untrusted bidder acquires authority to impose position, PnL, margin, liquidation, and settlement obligations on any account ID.',
    overlap: 'auction-bidder-authority', composition: { role: 'standalone', members: ['AFH-017'] },
    rationale: 'The privileged callback bypasses the normal account-authorization boundary and closes High authority impact.',
  },
  'AFH-017': {
    status: 'confirmed_narrowed', severity: 'high', confidence: 'high', source: ['contracts/LiquidationAuction.sol:115-152', 'contracts/ClearingHouse.sol:116-120', 'contracts/InsuranceFund.sol:121-135'],
    facts: ['A zero-bond empty bidder received a lot while below initial margin.', 'After an adverse move, residual finalization recorded 81.8 social loss with the base still live.', 'Reviewer RA-017 repeated finalization without a new price/equity delta and doubled pending accounting from 81.8 to 163.6.'],
    scope: 'Missing bidder health/bond closure creates zero-capital tail risk and can charge insurance/social-loss accounting; the Critical claim lacks attacker token profit or an executable consumer of repeated uncovered-loss accounting.',
    overlap: 'auction-terminal-composition', composition: { role: 'composition', members: ['AFH-018'] },
    rationale: 'The chain is real and High, but Critical economic/authority closure is not shown; AFH-018 must not be counted again as an independent escalation inside this composition.',
  },
  'AFH-018': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/LiquidationAuction.sol:145-152'],
    facts: ['A timed-out no-fill auction finalized with remainingBase and live position both equal to 1 wad.', 'The distressed account was unfrozen and deficit resolution ran.', 'A fully filled control finalized with both values zero.'],
    scope: 'Terminal transition abandons residual risk yet unfreezes and invokes the insurance waterfall.',
    overlap: 'auction-terminal-composition', composition: { role: 'base primitive', members: ['AFH-017', 'AFH-019', 'AFH-020'] },
    rationale: 'This is the distinct missing-backstop root; downstream compositions depend on it and should not inflate its standalone count.',
  },
  'AFH-019': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/LiquidationAuction.sol:125-152'],
    facts: ['A bid committed before timeout remained unrevealed when the auction finalized.', 'Reveal after finalized changed distressed base 1 to 0 and remaining base 1 to 0.', 'A new post-finalization commitment reverted.'],
    scope: 'A pending commitment mutates positions after deficit resolution and unfreeze, with no second reconciliation.',
    overlap: 'auction-terminal-composition', composition: { role: 'dependent primitive', members: ['AFH-018', 'AFH-020'] },
    rationale: 'The missing terminal-state check is distinct from AFH-018, although reachability requires AFH-018 residual finalization.',
  },
  'AFH-020': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/ClearingHouse.sol:97-100', 'contracts/EpochSettlement.sol:78-95', 'contracts/LiquidationAuction.sol:125-142'],
    facts: ['Settlement cleared the boolean freeze while an auction and commitment remained live.', 'The account was marked settled with base zero.', 'Late reveal then reopened base -1 while the settled marker stayed true; settlement-only control stayed zero.'],
    scope: 'Independent lifecycle locks collapse into one boolean and stale auction authority violates immutable epoch completion.',
    overlap: 'auction-terminal-composition', composition: { role: 'composition', members: ['AFH-019'] },
    rationale: 'The one-process sequence proves a distinct cross-lifecycle finality failure without treating its AFH-019 member as another root.',
  },
  'AFH-021': {
    status: 'confirmed_exact', severity: 'medium', confidence: 'high', source: ['contracts/InsuranceFund.sol:147-158'],
    facts: ['Resolving a 100 bond at 50% slash deleted the per-key record.', 'auctionReserved remained 50 although live bond sum was zero.', 'The slashed 50 was also added to accruedProtocolValue.'],
    scope: 'Phantom reservation permanently reduces reported spendable coverage/redemption liquidity; theft is separately AFH-022.',
    overlap: 'insurance-reserves', composition: { role: 'standalone', members: ['AFH-022'] },
    rationale: 'Aggregate/per-record reconciliation failure is exact and distinct from reserve-inclusive redemption.',
  },
  'AFH-022': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/InsuranceFund.sol:83-105', 'contracts/InsuranceFund.sol:172-174'],
    facts: ['A shareholder deposited 1000, then a third party reserved a 1000 bond.', 'Burning the shareholder shares redeemed 2000 and emptied the fund.', 'Bond terminal action then reverted; no-bond control redeemed 1000.'],
    scope: 'Reserve-inclusive NAV and uncapped redemption let shareholders steal live bidder bonds.',
    overlap: 'insurance-reserves', composition: { role: 'share/bond composition', members: ['AFH-021'] },
    rationale: 'Direct third-party token loss and terminal liveness failure close High impact.',
  },
  'AFH-023': {
    status: 'confirmed_exact', severity: 'medium', confidence: 'high', source: ['contracts/ClearingHouse.sol:157-160', 'contracts/InsuranceFund.sol:107-110', 'contracts/InsuranceFund.sol:172-174'],
    facts: ['A trade debited 120 wad fee from account cash.', 'Insurance token balance did not increase while accruedProtocolValue increased by 120.', 'A 1000-share full redemption then promised 1120 and reverted; no-fee control redeemed.'],
    scope: 'Uncollectible fee receivable inflates NAV and blocks/misprices shares; no fee recipient token extraction is shown.',
    overlap: 'phantom-insurance-value', composition: { role: 'standalone', members: ['AFH-024', 'AFH-025'] },
    rationale: 'The missing collection path and redemption consequence are exact; Medium is properly bounded.',
  },
  'AFH-024': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/InsuranceFund.sol:160-169'],
    facts: ['The hunter mock returned 1e18 native units without transfer and the fund credited 1e18 wad.', 'Reviewer RA-024 used an honest venue that transferred 1e18 units of a 24-decimal token.', 'The received output normalized to only 1e12 wad yet still passed a 1e18-wad minimum.'],
    scope: 'Raw return is neither balance-delta validated nor output-decimal normalized before minimum enforcement and NAV recognition; insurance input can be lost for materially insufficient output.',
    overlap: 'phantom-insurance-value', composition: { role: 'standalone', members: ['AFH-023'] },
    rationale: 'The honest-effect variant proves normalization independently of the no-transfer mock and closes High asset loss.',
  },
  'AFH-025': {
    status: 'confirmed_exact', severity: 'high', confidence: 'high', source: ['contracts/ExecutionRouter.sol:85-99', 'contracts/ClearingHouse.sol:129-160'],
    facts: ['A valid signed sell accepted executionPrice 2^128 + 2e18.', 'Stored entry truncated to 2e18 while fee used the full price and debited 408.338840305126156158 wad.', 'The in-range 2e18 control stored the same basis but charged only 2 wei.'],
    scope: 'An untrusted allowlisted matcher can consume a valid nonce, destroy favorable basis, and burn a material portion of signer-accessible collateral; matcher profit is not claimed.',
    overlap: 'execution-cast-boundary', composition: { role: 'standalone; fee side-effect overlaps', members: ['AFH-023'] },
    rationale: 'The unchecked narrowing creates a cross-consumer semantic split and closes High victim authority/value impact.',
  },
};

const candidates = submission.candidates.map((candidate) => {
  const judgment = judgments[candidate.id];
  if (!judgment) throw new Error(`missing judgment ${candidate.id}`);
  const successful = executionLog.records.find((record) => record.label.startsWith(`candidate-${candidate.id}-`) && record.exitCode === 0);
  if (!successful) throw new Error(`missing successful fresh reproduction ${candidate.id}`);
  const evidencePath = `blind-run/evidence/${candidate.id}.json`;
  return {
    id: candidate.id,
    input: {
      title: candidate.canonical_title,
      submittedSeverity: candidate.severity,
      submittedConfidence: candidate.confidence,
      submittedRootCause: candidate.root_cause,
      evidence: { path: evidencePath, sha256: evidenceHashes[candidate.id] },
    },
    verdict: judgment.status,
    proposedSeverity: judgment.severity,
    confidence: judgment.confidence,
    independentlyObservedFacts: judgment.facts,
    reproduction: {
      command: `node blind-run/run-case.mjs ${candidate.id} --verify-only`,
      freshStateAndProcess: true,
      result: 'pass',
      executionLogRecord: successful.sequence,
      outputSha256: successful.combinedSha256,
      control: candidate.reproduction.control,
      controlExecution: 'embedded in the selected fresh-process test; pass',
      sourceFileHashes: judgment.source.map((reference) => {
        const file = reference.split(':')[0];
        return { reference, sha256: manifestHashes[file] };
      }),
    },
    rootCauseAndImpactScope: judgment.scope,
    overlapGroup: judgment.overlap,
    composition: judgment.composition,
    rationale: judgment.rationale,
  };
});

const statusTotals = {};
const severityTotals = {};
for (const candidate of candidates) {
  statusTotals[candidate.verdict] = (statusTotals[candidate.verdict] ?? 0) + 1;
  severityTotals[candidate.proposedSeverity] = (severityTotals[candidate.proposedSeverity] ?? 0) + 1;
}

const review = {
  schemaVersion: 1,
  reviewType: 'independent-blind-solidity-review',
  reviewer: 'A',
  target: {
    path: 'benchmarks/perps-blind-generalization',
    revision: '158651792f770f5e827c1f0c363ea91f916cb1b8',
    submissionRevision: '31ea4b7367a42fb1d87d486e945e54361a8d0ca3',
    sourceManifestPath: 'SOURCE_MANIFEST.json',
    sourceManifestSha256: shaFile(path.join(targetRoot, 'SOURCE_MANIFEST.json')),
    sourceManifestAggregateSha256: manifest.aggregateSha256,
    frozenSubmissionSha256: inventory.root_hashes.submission,
    frozenReportSha256: inventory.root_hashes.report,
    frozenEvidenceChainSha256: inventory.root_hashes.evidence_canonical_chain,
  },
  verdictVocabulary: ['confirmed_exact', 'confirmed_narrowed', 'duplicate_of', 'unsupported', 'invalid'],
  severityVocabulary: ['critical', 'high', 'medium', 'low', 'informational'],
  totals: { inputs: candidates.length, verdicts: statusTotals, proposedSeverity: severityTotals },
  execution: {
    log: 'blind-review/reviewer-a/execution-log.json',
    logSha256: shaFile(path.join(reviewRoot, 'execution-log.json')),
    ordinaryTests: { passed: 5, failed: 0 },
    candidateFreshReruns: { candidatesPassed: 25, candidatesFailed: 0, testExecutions: 26, embeddedControls: 26 },
    independentDiscriminatingTests: { passed: 5, failed: 0, ids: ['RA-002', 'RA-003', 'RA-007', 'RA-017', 'RA-024'] },
  },
  candidates,
  duplicateGroups: [],
  overlapGroups: {
    'withdrawal-state-machine': ['AFH-003', 'AFH-004'],
    'oracle-semantics': ['AFH-005', 'AFH-006'],
    'funding-accounting': ['AFH-007', 'AFH-008', 'AFH-009'],
    'position-accounting': ['AFH-010', 'AFH-012'],
    'execution-protection': ['AFH-014', 'AFH-015'],
    'auction-terminal-composition': ['AFH-017', 'AFH-018', 'AFH-019', 'AFH-020'],
    'insurance-reserves': ['AFH-021', 'AFH-022'],
    'phantom-insurance-value': ['AFH-023', 'AFH-024'],
  },
  compositionAccounting: {
    countedRootCauses: 25,
    duplicateCount: 0,
    rules: [
      'AFH-017 is narrowed to its missing bidder-health/bond closure and lists AFH-018 as a member; AFH-018 is not treated as a second Critical escalation.',
      'AFH-019 remains a distinct missing terminal-state check but its reachability depends on AFH-018 residual finalization.',
      'AFH-020 is a one-process cross-lifecycle composition using AFH-019 plus a shared boolean freeze; its composition membership is explicit.',
      'AFH-004 is distinct reentrancy but does not increase maximum AFH-003 extraction beyond the separately authorizable account balance.',
    ],
  },
  hunterProcessConcerns: [
    'The supplied AFH-003 and AFH-011 paths intermittently reverted at MockPriceFeed.setAnswer because of an exact client gas estimate; fresh-process retries passed. RA-003 with explicit gas headroom passed deterministically, so this is a harness flake rather than a candidate contradiction.',
    'The hunter report calls every submitted candidate fully gated, but AFH-011 High impact stops at divergent unconsumed loss buckets, and AFH-017 Critical stops without attacker token profit or another executable repeated-loss consumer.',
    'After reviewer work areas existed, the hunter submission checker continued to pass schema, evidence, manifest, seal, ordinary suite, terminal state, and hash inventory, but failed its hunter-only git-scope rule. One diagnostic printed names of unrelated reviewer paths; Reviewer A did not open those files, inspect their contents, or communicate with another reviewer.',
  ],
  limitations: [
    'No sealed/private ground truth, decryption material, prior Solidity benchmark, or other reviewer work product was used.',
    'No patched target was created; negative controls change the claimed condition or use a safe runtime comparator.',
    'No full branch/line coverage or formal proof was available; judgments rely on source traces, deterministic Ganache executions, and exact final-state oracles.',
    'Severity is an internal technical proposal, not external disclosure or human program adjudication.',
  ],
  reviewerDiscoveredIssues: [],
};

fs.writeFileSync(path.join(reviewRoot, 'review.json'), `${JSON.stringify(review, null, 2)}\n`);
