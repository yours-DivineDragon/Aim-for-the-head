import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const consensusRoot = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(consensusRoot, '..', '..', '..', '..');
const targetRevision = '158651792f770f5e827c1f0c363ea91f916cb1b8';
const hunterRevision = '31ea4b7';
const reviewRevision = 'c1e2b8c';
const targetPrefix = 'benchmarks/perps-blind-generalization';

const expectedInputs = {
  hunterSubmissionSha256: 'c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef',
  reviewerAReviewSha256: '41bc03cc09b9ac715134a7ff580ba7a77ad92b86617aafb035feece548b15de2',
  reviewerBReviewSha256: '1dc57d5a89c4ab71b5e22d2885abcc30ea363c6cc4754d068e53fcfedf775607',
  targetManifestAggregateSha256: 'bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381',
};

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function gitShow(revision, relative) {
  return execFileSync('git', ['show', `${revision}:${relative}`], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });
}

function loadInput(revision, relative, expected) {
  const raw = gitShow(revision, relative);
  if (sha256(raw) !== expected) throw new Error(`input hash mismatch: ${relative}`);
  return JSON.parse(raw);
}

const hunter = loadInput(
  hunterRevision,
  `${targetPrefix}/blind-run/submission.json`,
  expectedInputs.hunterSubmissionSha256,
);
const reviewerA = loadInput(
  reviewRevision,
  `${targetPrefix}/blind-review/reviewer-a/review.json`,
  expectedInputs.reviewerAReviewSha256,
);
const reviewerB = loadInput(
  reviewRevision,
  `${targetPrefix}/blind-review/reviewer-b/review.json`,
  expectedInputs.reviewerBReviewSha256,
);
const manifest = JSON.parse(gitShow(targetRevision, `${targetPrefix}/SOURCE_MANIFEST.json`));
if (manifest.aggregateSha256 !== expectedInputs.targetManifestAggregateSha256) throw new Error('target manifest aggregate mismatch');
const reruns = JSON.parse(fs.readFileSync(path.join(consensusRoot, 'rerun-summary.json'), 'utf8'));

const finalClassifications = {
  'AFH-011': 'confirmed_narrowed',
  'AFH-017': 'confirmed_narrowed',
  'AFH-021': 'confirmed_narrowed',
};
const finalSeverities = {
  'AFH-001': 'low', 'AFH-002': 'high', 'AFH-003': 'high', 'AFH-004': 'medium', 'AFH-005': 'medium',
  'AFH-006': 'high', 'AFH-007': 'high', 'AFH-008': 'low', 'AFH-009': 'high', 'AFH-010': 'medium',
  'AFH-011': 'medium', 'AFH-012': 'medium', 'AFH-013': 'high', 'AFH-014': 'medium', 'AFH-015': 'low',
  'AFH-016': 'high', 'AFH-017': 'high', 'AFH-018': 'high', 'AFH-019': 'high', 'AFH-020': 'high',
  'AFH-021': 'medium', 'AFH-022': 'high', 'AFH-023': 'medium', 'AFH-024': 'high', 'AFH-025': 'high',
};
const overlapById = {
  'AFH-003': 'OG-WITHDRAWAL', 'AFH-004': 'OG-WITHDRAWAL',
  'AFH-007': 'OG-FUNDING', 'AFH-008': 'OG-FUNDING', 'AFH-009': 'OG-FUNDING',
  'AFH-010': 'OG-POSITION-LEDGER', 'AFH-011': 'OG-POSITION-LEDGER', 'AFH-012': 'OG-POSITION-LEDGER',
  'AFH-016': 'OG-AUCTION-LIFECYCLE', 'AFH-017': 'OG-AUCTION-LIFECYCLE', 'AFH-018': 'OG-AUCTION-LIFECYCLE',
  'AFH-019': 'OG-AUCTION-LIFECYCLE', 'AFH-020': 'OG-AUCTION-LIFECYCLE',
  'AFH-021': 'OG-INSURANCE', 'AFH-022': 'OG-INSURANCE', 'AFH-023': 'OG-INSURANCE', 'AFH-024': 'OG-INSURANCE',
};
const dependenciesById = {
  'AFH-017': ['AFH-018'],
  'AFH-019': ['AFH-018'],
};
const compatibleById = {
  'AFH-003': ['AFH-004'],
  'AFH-004': ['AFH-003'],
  'AFH-016': ['AFH-017'],
  'AFH-018': ['AFH-017', 'AFH-019'],
  'AFH-023': ['AFH-025'],
  'AFH-025': ['AFH-023'],
};
const compositionRoleById = {
  'AFH-002': 'multi_sink_single_root',
  'AFH-017': 'composed_finding_with_distinct_missing_bidder_guard',
  'AFH-018': 'standalone_base_primitive_and_dependency',
  'AFH-019': 'standalone_distinct_root_with_reachability_dependency',
  'AFH-020': 'cross_lifecycle_composition_without_candidate_dependency',
  'AFH-022': 'standalone_direct_reserved_asset_violation',
};
const controlsById = {
  'AFH-002': ['C-002'], 'AFH-004': ['C-004'], 'AFH-005': ['C-OVERLAP'], 'AFH-006': ['C-OVERLAP'],
  'AFH-011': ['C-011'], 'AFH-014': ['C-OVERLAP'], 'AFH-015': ['C-OVERLAP'], 'AFH-016': ['C-OVERLAP'],
  'AFH-017': ['C-017'], 'AFH-018': ['C-019'], 'AFH-019': ['C-019'], 'AFH-020': ['C-020'],
  'AFH-021': ['C-021'], 'AFH-022': ['C-022'], 'AFH-023': ['C-OVERLAP'],
  'AFH-024': ['C-024', 'C-OVERLAP'], 'AFH-025': ['C-OVERLAP'],
};

const resolutions = {
  'AFH-002': 'Confirmed exact as one balance-delta root across three sinks. C-002 reproduced nominal 1,000-wad credit/reserve for 900 native-unit receipts on margin, insurance-share, and bond paths; this is consolidation, not a composition bonus.',
  'AFH-004': 'Confirmed exact and standalone. C-004 doubled a healthy, controller-free request from 100 to 200 wad, proving AFH-003 is a compatible impact amplifier rather than a prerequisite.',
  'AFH-005': 'Confirmed exact. The precision-underflow availability root is source- and fix-distinct from AFH-006 cutoff-round selection; a shared oracle component is not finding overlap.',
  'AFH-006': 'Confirmed exact. The immutable post-cutoff price/PnL path is source- and fix-distinct from AFH-005 normalization availability.',
  'AFH-011': 'Confirmed narrowed to Medium. Stale OI and divergent loss buckets reproduce, but C-011 proves reporting is manual and socialLossIndex has no collection consumer; AFH-017 is only one way to source a deficit, not a required candidate dependency.',
  'AFH-014': 'Confirmed exact and distinct from AFH-015: weighted portfolio price protection and nonce bitmap domain truncation have different triggers, state, impact, and repairs.',
  'AFH-015': 'Confirmed exact and distinct from AFH-014; common router placement alone does not create overlap.',
  'AFH-016': 'Confirmed exact as a standalone bidder-account authority violation. It is grouped only for auction-flow accounting and is not a member of AFH-017.',
  'AFH-017': 'Confirmed narrowed to High. C-017 joined the missing bond/health guard with AFH-018 and produced 81.8 wad pending loss plus live residual exposure, but attacker token profit and fund token delta were both zero and the bidder remained equally negative, so Critical closure failed.',
  'AFH-018': 'Confirmed exact as its own residual-finalization root. It is counted once and used as a reachability dependency by AFH-017 and AFH-019; it is not a member of AFH-020.',
  'AFH-019': 'Confirmed exact as a distinct missing finalized/expiry guard, with AFH-018 recorded as a reachability dependency because a post-final reveal requires residual quantity after timeout finalization. That dependency does not duplicate the root.',
  'AFH-020': 'Confirmed exact without AFH-019. C-020 reopened a settled position while the auction finalized flag remained false throughout, isolating shared-freeze/stale-lifecycle authority rather than the post-final reveal guard.',
  'AFH-021': 'Confirmed narrowed to Medium. C-021 proves the phantom 50-wad reserve blocks deficit coverage, but redeem never consults auctionReserved; redemption failure comes from adding the same retained slash again to accruedProtocolValue. The submitted reservation-caused redemption scope is therefore too broad.',
  'AFH-022': 'Confirmed exact and standalone. C-022 stole a live 100-wad bond after a 100-wad share deposit without any slash or AFH-021 state.',
  'AFH-023': 'Confirmed exact as an uncollectible-fee/NAV root. Its NAV impact shape resembles AFH-024 and AFH-021, but the writer, missing transfer, trigger, and repair are distinct; AFH-025 can feed the fee path but is not required.',
  'AFH-024': 'Confirmed exact. C-024 used an honest venue that transferred 1e18 native units of a 24-decimal token: only 1e12 wad arrived economically yet a 1e18-wad minimum passed. This independently closes the normalization root and remains distinct from AFH-023.',
  'AFH-025': 'Confirmed exact and standalone. The signed-order uint256/uint128 domain split directly burns signer cash and corrupts basis; its fee side effect may reach AFH-023 but neither finding depends on nor duplicates the other.',
};

const nonDisputeRationales = {
  'AFH-001': 'Exact unauthorized configuration mutation, capped at Low because no target consumer reads riskTier.',
  'AFH-003': 'Exact delayed-withdrawal health/freeze bypass with a 900-token collateral delta; AFH-004 is compatible but unnecessary.',
  'AFH-007': 'Exact asymmetric funding cap with direct cash and health consumers, supporting High.',
  'AFH-008': 'Exact checkpoint-splitting invariant violation, capped at Low because only one-wei drift and no profitable amplification were shown.',
  'AFH-009': 'Exact pre-settlement funding-order failure with material account cash and deficit propagation.',
  'AFH-010': 'Exact residual-basis error, retained at Medium without closed third-party extraction.',
  'AFH-012': 'Exact duplicate active-market membership with a reproduced equity consumer effect.',
  'AFH-013': 'Exact sign/correlation margin undercharge with a threefold requirement delta and live leverage admission.',
};

const disagreementFields = {
  'AFH-002': ['composition_accounting'],
  'AFH-004': ['dependency_accounting'],
  'AFH-005': ['overlap_membership'],
  'AFH-006': ['overlap_membership'],
  'AFH-011': ['severity', 'impact_scope', 'dependency_accounting'],
  'AFH-014': ['overlap_membership'],
  'AFH-015': ['overlap_membership'],
  'AFH-016': ['overlap_membership', 'composition_membership'],
  'AFH-017': ['classification', 'severity', 'critical_closure'],
  'AFH-018': ['dependency_accounting'],
  'AFH-019': ['standalone_vs_dependency'],
  'AFH-020': ['dependency_accounting'],
  'AFH-021': ['classification', 'impact_scope', 'overlap_scope'],
  'AFH-022': ['composition_accounting'],
  'AFH-023': ['overlap_scope', 'composition_accounting'],
  'AFH-024': ['reproduction_interpretation', 'overlap_scope'],
  'AFH-025': ['composition_accounting'],
};

const bById = Object.fromEntries(reviewerB.verdicts.map((item) => [item.id, item]));
const aById = Object.fromEntries(reviewerA.candidates.map((item) => [item.id, item]));
const hById = Object.fromEntries(hunter.candidates.map((item) => [item.id, item]));

const verdicts = hunter.candidates.map((submitted) => {
  const id = submitted.id;
  const b = bById[id];
  const successfulRerun = reruns.candidateReruns[id];
  const controlRefs = (controlsById[id] ?? []).map((controlId) => ({
    controlId,
    path: reruns.adjudicationReruns[controlId].path,
    sha256: reruns.adjudicationReruns[controlId].sha256,
  }));
  const classification = finalClassifications[id] ?? 'confirmed_exact';
  const dependencies = dependenciesById[id] ?? [];
  return {
    id,
    classification,
    duplicate_of: null,
    final_severity: finalSeverities[id],
    confidence: 'high',
    root_cause: b.rootCauseScope,
    impact_scope: id === 'AFH-021'
      ? 'A 50% slash of a 100-wad bond leaves 50 wad phantom-reserved and blocks deficit coverage; the separate retained-slash double count inflates NAV and can make redemption overpromise, but auctionReserved itself is not consulted by redeem.'
      : b.impactScope,
    adjudication_rationale: resolutions[id] ?? nonDisputeRationales[id] ?? b.rationale,
    overlap_group: overlapById[id] ?? null,
    accounting: {
      one_to_one_distinct: true,
      standalone_finding: id !== 'AFH-019',
      composition_role: compositionRoleById[id] ?? 'standalone',
      dependencies,
      compatible_or_shared_effect_with: compatibleById[id] ?? [],
      double_counting_rule: dependencies.length
        ? `The distinct ${id} root is counted once; dependency effects (${dependencies.join(', ')}) are not recounted as additional manifestations.`
        : `${id} is counted once at its own root cause; shared component, flow, or impact shape does not merge it with another candidate.`,
    },
    evidence_hashes: {
      hunter_packet: {
        revision: hunterRevision,
        path: submitted.evidence[0].path,
        sha256: submitted.evidence[0].sha256,
      },
      consensus_rerun: {
        path: successfulRerun.path,
        sha256: successfulRerun.sha256,
        attempts: successfulRerun.attempts,
      },
      adjudication_controls: controlRefs,
      target_manifest_aggregate_sha256: expectedInputs.targetManifestAggregateSha256,
    },
    rerun_refs: [successfulRerun.path, ...controlRefs.map((item) => item.path)],
  };
});

const classifications = Object.fromEntries(['confirmed_exact', 'confirmed_narrowed', 'duplicate_of', 'unsupported', 'invalid']
  .map((name) => [name, verdicts.filter((item) => item.classification === name).length]));
const severities = Object.fromEntries(['critical', 'high', 'medium', 'low']
  .map((name) => [name, verdicts.filter((item) => item.final_severity === name).length]));

const fieldComparisonMatrix = verdicts.map((verdict) => {
  const a = aById[verdict.id];
  const b = bById[verdict.id];
  const h = hById[verdict.id];
  return {
    id: verdict.id,
    hunter: { severity: h.severity, composition: h.composition },
    reviewer_a: { classification: a.verdict, severity: a.proposedSeverity, overlap_group: a.overlapGroup, composition: a.composition },
    reviewer_b: { classification: b.status, severity: b.proposedSeverity, overlap_group: b.overlapGroup, composition: b.compositionMembership },
    material_disagreement_fields: disagreementFields[verdict.id] ?? [],
    final: { classification: verdict.classification, severity: verdict.final_severity, overlap_group: verdict.overlap_group },
  };
});

const output = {
  schema_version: 1,
  adjudication_type: 'blind_consensus',
  target: {
    path: targetPrefix,
    revision: targetRevision,
    manifest_aggregate_sha256: expectedInputs.targetManifestAggregateSha256,
  },
  frozen_inputs: expectedInputs,
  aggregate: {
    verdicts: classifications,
    final_severity: severities,
    total_candidates: verdicts.length,
    material_disagreement_candidates: Object.keys(disagreementFields).length,
    material_disagreement_fields: Object.values(disagreementFields).reduce((sum, fields) => sum + fields.length, 0),
    resolutions_complete: Object.keys(disagreementFields).length,
    duplicate_groups: 0,
  },
  rerun_accounting: reruns.counts,
  agreement_sample: reruns.agreementSample,
  overlap_groups: [
    { id: 'OG-WITHDRAWAL', members: ['AFH-003', 'AFH-004'], relationship: 'same withdrawal route; independent health-gate and callback-order roots' },
    { id: 'OG-FUNDING', members: ['AFH-007', 'AFH-008', 'AFH-009'], relationship: 'independent cap, rounding, and epoch-order roots' },
    { id: 'OG-POSITION-LEDGER', members: ['AFH-010', 'AFH-011', 'AFH-012'], relationship: 'independent basis, aggregate OI/loss-routing, and membership roots' },
    { id: 'OG-AUCTION-LIFECYCLE', members: ['AFH-016', 'AFH-017', 'AFH-018', 'AFH-019', 'AFH-020'], relationship: 'distinct authority and lifecycle roots; AFH-018 is a dependency for AFH-017/019 only' },
    { id: 'OG-INSURANCE', members: ['AFH-021', 'AFH-022', 'AFH-023', 'AFH-024'], relationship: 'distinct reserve, asset-ownership, receivable, and venue-semantic roots' },
  ],
  duplicate_groups: [],
  dependency_edges: [
    { from: 'AFH-017', to: 'AFH-018', type: 'composition_dependency' },
    { from: 'AFH-019', to: 'AFH-018', type: 'reachability_dependency' },
  ],
  field_comparison_matrix: fieldComparisonMatrix,
  disagreement_resolution_matrix: Object.entries(disagreementFields).map(([id, fields]) => ({
    id,
    fields,
    resolution: resolutions[id],
    rerun_refs: verdicts.find((item) => item.id === id).rerun_refs,
  })),
  verdicts,
};

fs.writeFileSync(path.join(consensusRoot, 'consensus.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.aggregate));
