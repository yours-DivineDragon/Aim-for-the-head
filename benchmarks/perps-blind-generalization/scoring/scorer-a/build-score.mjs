import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);

const truthUnits = [
  ['MCB-001', 'access-control/cross-contract-risk', 'high', 7, 'AFH-001', 1, ['access-control', 'cross-contract'], 'Exact callable mutator, missing governor check, non-governor transaction, and persistent tier change.'],
  ['MCB-002', 'reentrancy/state-observation', 'medium', 5, 'AFH-004', 1, ['reentrancy'], 'Exact transfer-before-effects root with a stronger callback proof: one live request transfers and debits twice.'],
  ['MCB-003', 'external-token-semantics/accounting', 'high', 7, 'AFH-002', 1, ['integration'], 'Exact nominal-versus-received deposit accounting with quantified 1000-wad credit for 900-wad receipt and victim shortfall.'],
  ['MCB-004', 'oracle-integration/edge-case', 'medium', 5, 'AFH-005', 1, ['integration', 'niche'], 'Exact >18-decimal underflow, valid high-precision feed reproduction, and 18-decimal control.'],
  ['MCB-005', 'funding/economic-math', 'high', 7, 'AFH-007', 1, [], 'Exact missing signed lower clamp with actual negative growth far beyond the configured symmetric bound.'],
  ['MCB-006', 'signed-fixed-point/rounding', 'medium', 5, 'AFH-008', 0.3, ['niche'], 'Meaningful same-line rounding fragment, but the submission proves positive payer dust. The registered unit requires the negative-product floor direction; the canonical repair changes 0 to -1 for that case while leaving the submitted positive case at 0.'],
  ['MCB-007', 'portfolio-margin/nonlinear-risk', 'high', 7, 'AFH-013', 1, [], 'Exact sign-parity root and quantified 200-versus-600 margin result with a positive-correlation control.'],
  ['MCB-008', 'position-accounting/business-logic', 'high', 8, 'AFH-010', 1, ['business-logic'], 'Exact cross-zero residual-basis root, both prices, and round-trip PnL consequence.'],
  ['MCB-009', 'cross-contract/open-interest-accounting', 'high', 7, 'AFH-011', 1, ['cross-contract'], 'Exact abs(delta)-only OI growth, zero-live-exposure round trip, and downstream social-loss denominator divergence.'],
  ['MCB-010', 'execution/business-logic', 'high', 7, 'AFH-014', 1, ['business-logic'], 'Exact unweighted arithmetic mean with 2000 arithmetic versus 2800 base-weighted price and a rejecting control.'],
  ['MCB-011', 'settlement/oracle-time-semantics', 'high', 7, 'AFH-006', 1, [], 'Exact post-cutoff latest-round selection with cutoff 2100, delayed 3000 recording, and no-update control.'],
  ['MCB-012', 'settlement/funding-state-order', 'high', 7, 'AFH-009', 1, [], 'Exact realize-before-checkpoint ordering and quantified omitted funding debit with checkpoint-first control.'],
  ['MCB-013', 'liquidation/state-machine', 'high', 8, 'AFH-018', 1, [], 'Exact timeout finalization with nonzero residual, unchanged distressed position, and cleared freeze.'],
  ['MCB-014', 'insurance/reserve-accounting', 'medium', 5, 'AFH-021', 1, [], 'Exact aggregate reserve decrement by returned rather than full bond, with per-key deletion and 50-wad phantom reserve.'],
  ['MCB-015', 'advanced-composition/critical-economic', 'critical', 8, 'AFH-012', 0.6, ['composed'], 'Substantially correct duplicate-membership and repeated equity/risk consumers, but incomplete composition: the submission does not execute zero-size materialization, health-checked collateral withdrawal, or the normalized-price deficit. The registered primitive is credited once here only.'],
].map(([id, unitClass, severity, weight, primaryCandidate, factor, categoryTags, rationale]) => ({
  id,
  class: unitClass,
  canonicalSeverity: severity,
  weight,
  primaryCandidate,
  cluster: [primaryCandidate],
  factor,
  earnedPoints: weight * factor,
  level: factor === 1 ? 'exact' : factor === 0.6 ? 'substantial_partial' : factor === 0.3 ? 'fragment' : 'missed',
  categoryTags,
  rationale,
  evidenceRefs: factor < 1
    ? ['logs/candidate-reruns.log', 'logs/hidden-reproduction-controls.log', 'logs/discrimination.log']
    : ['logs/candidate-reruns.log', 'logs/hidden-reproduction-controls.log'],
  noDoubleCredit: id === 'MCB-015'
    ? 'AFH-012 is the sole primary and is not also counted as valid-unregistered; its duplicate-list and repeated-consumer primitives are composition-internal to this partial credit.'
    : 'One primary candidate only; no supporting candidate contributes additional factor.',
}));

const primaryMap = Object.fromEntries(truthUnits.map((unit) => [unit.primaryCandidate, unit.id]));
const claimedSeverity = {
  'AFH-001': 'low', 'AFH-002': 'high', 'AFH-003': 'high', 'AFH-004': 'medium', 'AFH-005': 'medium',
  'AFH-006': 'high', 'AFH-007': 'high', 'AFH-008': 'low', 'AFH-009': 'high', 'AFH-010': 'medium',
  'AFH-011': 'high', 'AFH-012': 'medium', 'AFH-013': 'high', 'AFH-014': 'medium', 'AFH-015': 'low',
  'AFH-016': 'high', 'AFH-017': 'critical', 'AFH-018': 'high', 'AFH-019': 'high', 'AFH-020': 'high',
  'AFH-021': 'medium', 'AFH-022': 'high', 'AFH-023': 'medium', 'AFH-024': 'high', 'AFH-025': 'high',
};
const scopeSeverity = {
  'AFH-001': 'high', 'AFH-002': 'high', 'AFH-003': 'high', 'AFH-004': 'medium', 'AFH-005': 'medium',
  'AFH-006': 'high', 'AFH-007': 'high', 'AFH-008': 'medium', 'AFH-009': 'high', 'AFH-010': 'high',
  'AFH-011': 'high', 'AFH-012': 'medium', 'AFH-013': 'high', 'AFH-014': 'high', 'AFH-015': 'low',
  'AFH-016': 'high', 'AFH-017': 'high', 'AFH-018': 'high', 'AFH-019': 'high', 'AFH-020': 'high',
  'AFH-021': 'medium', 'AFH-022': 'high', 'AFH-023': 'medium', 'AFH-024': 'high', 'AFH-025': 'high',
};
const unregisteredReasons = {
  'AFH-003': 'Distinct delayed-withdrawal route omits ClearingHouse health and freeze enforcement; frozen unhealthy extraction reproduced.',
  'AFH-015': 'Distinct uint64 nonce-word truncation aliases nonces 0 and 65536; genuine order-liveness defect.',
  'AFH-016': 'Distinct bidder-account authorization omission lets a bidder mutate an unrelated victim account through the privileged fill callback.',
  'AFH-017': 'Distinct missing bidder bond/health closure forms a real High chain; AFH-018 is only a registered reachability dependency and is not recounted.',
  'AFH-019': 'Distinct missing finalized/expiry checks permit a precommitted post-finalization reveal; AFH-018 supplies residual reachability only.',
  'AFH-020': 'Distinct shared-freeze and stale-lifecycle contradiction reopens an already settled position while the auction remains unfinalized.',
  'AFH-022': 'Distinct insurance-share ownership defect lets shareholders redeem third-party live auction bonds.',
  'AFH-023': 'Distinct uncollectible trade-fee receivable inflates insurance NAV without token transfer or collection path.',
  'AFH-024': 'Distinct venue output receipt/decimal normalization defect bypasses minimum output and creates phantom NAV.',
  'AFH-025': 'Distinct uint256 execution-price to uint128 basis-domain split lets an allowlisted matcher burn signer collateral.',
};
const dependencies = { 'AFH-017': ['AFH-018'], 'AFH-019': ['AFH-018'] };

const candidates = Array.from({ length: 25 }, (_, index) => `AFH-${String(index + 1).padStart(3, '0')}`).map((id) => {
  const truthId = primaryMap[id] ?? null;
  const unit = truthId ? truthUnits.find((item) => item.id === truthId) : null;
  return {
    id,
    classification: truthId ? 'primary_matched' : 'valid_unregistered',
    truthId,
    factorContribution: unit?.factor ?? 0,
    claimedSeverity: claimedSeverity[id],
    adjudicatedScopeSeverity: scopeSeverity[id],
    scopeSeverityExact: claimedSeverity[id] === scopeSeverity[id],
    truthCanonicalSeverity: unit?.canonicalSeverity ?? null,
    truthSeverityExact: unit ? claimedSeverity[id] === unit.canonicalSeverity : null,
    reportableDistinctClaim: true,
    empiricalPrecisionNumerator: true,
    dependencies: dependencies[id] ?? [],
    reason: truthId ? unit.rationale : unregisteredReasons[id],
    evidenceRefs: id === 'AFH-017'
      ? ['logs/candidate-reruns.log', 'logs/severity-cap-c017.log']
      : ['logs/candidate-reruns.log'],
  };
});

const countBy = (items, key) => Object.fromEntries([...new Set(items.map((item) => item[key]))].sort().map((value) => [value, items.filter((item) => item[key] === value).length]));
const earnedPoints = truthUnits.reduce((sum, unit) => sum + unit.earnedPoints, 0);
const classMetrics = Object.fromEntries(truthUnits.map((unit) => [unit.class, {
  truthIds: [unit.id],
  unitsHit: unit.factor > 0 ? 1 : 0,
  unitCount: 1,
  rawRecallPercent: unit.factor > 0 ? 100 : 0,
  earnedPoints: unit.earnedPoints,
  availablePoints: unit.weight,
  weightedPercent: unit.earnedPoints / unit.weight * 100,
}]));
const rollupNames = ['business-logic', 'composed', 'cross-contract', 'integration', 'niche', 'access-control', 'reentrancy'];
const coverageRollups = Object.fromEntries(rollupNames.map((name) => {
  const units = truthUnits.filter((unit) => unit.categoryTags.includes(name));
  const available = units.reduce((sum, unit) => sum + unit.weight, 0);
  const earned = units.reduce((sum, unit) => sum + unit.earnedPoints, 0);
  return [name, {
    truthIds: units.map((unit) => unit.id),
    unitsHit: units.filter((unit) => unit.factor > 0).length,
    unitCount: units.length,
    rawRecallPercent: units.length === 0 ? null : units.filter((unit) => unit.factor > 0).length / units.length * 100,
    earnedPoints: earned,
    availablePoints: available,
    weightedPercent: available === 0 ? null : earned / available * 100,
  }];
}));

const score = {
  schemaVersion: 1,
  scorer: 'scorer-a',
  benchmark: 'meridian-clearing-blind',
  frozen: {
    blindConsensusCommit: 'd07b5ed83def43f6293bd41eaf51e97dc2fec501',
    revealCommit: 'e5ec59a2bcecf41e40cbb16df258bf9af92512bb',
    truthPlaintextCommitment: 'fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e',
    consensusSha256: 'ba5d60af575433b6f730ca1e59b961a00dedfda67da416b25c3ea6370e3b2696',
    submissionSha256: 'c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef',
    sourceAggregateSha256: 'bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381',
    revealAggregateSha256: 'dc808f47d8fc293a7f811d4f3b24622ad27387d9d7b95d5b2d692ee06430b03c',
  },
  definitions: {
    factors: { exact: 1, substantialPartial: 0.6, fragment: 0.3, missed: 0 },
    rawUnitRecall: 'Registered truth units with factor > 0 divided by 15; partials count as hit units but retain reduced weighted points.',
    empiricalCandidatePrecision: 'Unique primary-matched candidate claims plus genuinely distinct valid-unregistered candidate claims, divided by reportable distinct candidate claims after supporting/duplicate consolidation.',
    rawSubmissionPrecision: 'Submitted candidates that are not false positives divided by all 25 submitted candidates, before consolidation.',
    severityAccuracy: 'Claim-scope accuracy compares the hunter label with post-reveal adjudicated scope; truth-label alignment separately compares primary labels with canonical unit labels and therefore treats the MCB-015 fragment as not Critical.',
    coverageRollups: 'Overlapping deterministic tags derived from literal truth class tokens: business-logic, composed, cross-contract, integration, niche(edge-case or signed-fixed-point), access-control, and reentrancy.',
  },
  truthUnits,
  candidates,
  metrics: {
    unitCounts: {
      exact: truthUnits.filter((unit) => unit.factor === 1).length,
      factor06: truthUnits.filter((unit) => unit.factor === 0.6).length,
      factor03: truthUnits.filter((unit) => unit.factor === 0.3).length,
      missed: truthUnits.filter((unit) => unit.factor === 0).length,
    },
    rawUnitRecall: { numerator: truthUnits.filter((unit) => unit.factor > 0).length, denominator: 15, percent: truthUnits.filter((unit) => unit.factor > 0).length / 15 * 100 },
    weighted: { earnedPoints, availablePoints: 100, percent: earnedPoints },
    registeredClassByClass: classMetrics,
    coverageRollups,
    candidateClassificationCounts: countBy(candidates, 'classification'),
    empiricalCandidatePrecision: { numerator: candidates.filter((candidate) => candidate.empiricalPrecisionNumerator).length, denominator: candidates.filter((candidate) => candidate.reportableDistinctClaim).length, percent: 100 },
    rawSubmissionPrecision: { numerator: candidates.filter((candidate) => candidate.classification !== 'false_positive').length, denominator: 25, percent: 100 },
    falsePositiveCount: candidates.filter((candidate) => candidate.classification === 'false_positive').length,
    supportingOrDuplicateCount: candidates.filter((candidate) => candidate.classification === 'supporting_or_duplicate').length,
    severity: {
      claimScopeExact: { numerator: candidates.filter((candidate) => candidate.scopeSeverityExact).length, denominator: 25, percent: candidates.filter((candidate) => candidate.scopeSeverityExact).length / 25 * 100 },
      primaryTruthLabelExact: { numerator: candidates.filter((candidate) => candidate.truthId && candidate.truthSeverityExact).length, denominator: 15, percent: candidates.filter((candidate) => candidate.truthId && candidate.truthSeverityExact).length / 15 * 100 },
      claimedCriticalCandidates: ['AFH-017'],
      adjudicatedCriticalCandidates: [],
    },
    criticalChain: {
      registeredTruthId: 'MCB-015',
      primaryCandidate: 'AFH-012',
      factor: 0.6,
      complete: false,
      result: 'Partial primitive coverage only; no submitted candidate or cluster demonstrates the registered zero-size-to-withdrawal-to-deficit chain.',
      unrelatedClaimedCritical: { id: 'AFH-017', adjudicatedSeverity: 'high', evidence: 'logs/severity-cap-c017.log' },
    },
    generatorCoverage: {
      registeredUnits: 15,
      distinctValidUnregisteredCandidates: candidates.filter((candidate) => candidate.classification === 'valid_unregistered').length,
      status: 'coverage_defect',
      note: 'Ten reproducible distinct defects were omitted from the registered author truth and are excluded from registered recall/points.',
    },
    verification: {
      hiddenReproductions: { passed: 15, total: 15 },
      hiddenControls: { passed: 15, total: 15 },
      ordinaryTests: { passed: 5, total: 5 },
      candidateIds: { passed: 25, total: 25 },
      candidateExecutions: { passed: 26, total: 26 },
      discriminationTests: { passed: 2, total: 2 },
      severityCapTests: { passed: 1, total: 1 },
      sourceManifestFiles: { passed: 31, total: 31 },
      compile: { solidityInputs: 15, artifacts: 25, status: 'pass' },
      sealVerifier: 'pass',
      revealVerifier: 'pass',
      consensusCheckerCleanClone: 'pass',
      scorerChecker: 'pass',
    },
  },
};

fs.writeFileSync(path.join(root, 'score.json'), `${JSON.stringify(score, null, 2)}\n`);
