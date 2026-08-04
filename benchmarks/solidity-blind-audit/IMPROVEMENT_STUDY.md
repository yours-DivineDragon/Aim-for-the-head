# Aim workflow-v2 improvement study

This study records why the pre-tuning hunter missed or only partially matched
six committed paths, the target-independent changes derived from that evidence,
and the protocol for rerunning the unchanged Aster Credit target.

The immutable baseline is indexed in [`BASELINE_RECORD.md`](BASELINE_RECORD.md).
Its contamination boundary is commit
`6a7759462f19b0c97adc8540d70db6562be32e5d`, tree
`6b5eb5e558f8d2dfaf8165c66733377cc297788e`. This document and every later run
are post-reveal research. They do not alter or supersede the blind result.

## Evidence-led diagnosis

| Failure mechanism | Baseline evidence | Consequence |
| --- | --- | --- |
| A successful candidate closed an overly broad surface | `coverage.json` marked the entire vault surface tested using only C-011 and marked roaming interactions tested using an aggregate validation log | ERC-4626 rounding and nominal/received token accounting remained untested even though the surface appeared closed |
| Primitive discovery stopped before consumer propagation | C-011 proved donation-driven exchange-rate movement only as a first-deposit availability issue | The same mutable rate's existing-collateral consumer in `LendingMarket` was not tested, leaving F-03 partial |
| Compatible primitives were never placed in one join graph | C-008 proved pool-spot manipulation and C-011 proved a vault-rate primitive; the submission described composed links for each candidate separately | No atomic funding/ordering experiment multiplied both rates, so the Critical F-01 reserve drain was missed |
| Rounding was judged from the default friendly fixture | R-001 recognized that `withdraw` rounds shares down, then rejected it after testing only the 18-decimal/default economic shape; its own reopen condition named a low-decimal/high-rate deployment | The valid zero-share burn at coarse units and a 2:1 rate was not exercised, so F-06 was missed |
| ABI conformance was conflated with exact transfer semantics | R-005 grouped fees with malicious/nonconforming token behavior, although the benchmark promise was conformance to the declared interface and that interface did not guarantee recipient balance delta | Both nominal deposit minting and nominal debt reduction escaped testing, so F-07 and F-14 were missed |
| Callback review emphasized one recursive action | C-001 demonstrated nested `borrow` through the supported callback and correctly found stale debt | The callback-to-`withdrawCollateral` transition and zero-collateral final state were not enumerated, so F-04 remained partial |
| The state machine checked candidate proof but not deep-search completion | Workflow v1 required evidence gates for a validated candidate, while the `validated` terminal path did not require coverage dimensions or explicit business/composition artifacts | The run could honestly reproduce all submitted claims yet still terminate with material cross-surface blind spots |

The diagnosis is grounded in
[`run/evidence/_run/SURFACE_CENSUS.md`](run/evidence/_run/SURFACE_CENSUS.md),
[`run/evidence/_run/REJECTED_LEADS.md`](run/evidence/_run/REJECTED_LEADS.md),
[`run/goal-state/coverage.json`](run/goal-state/coverage.json),
[`run/goal-state/events.jsonl`](run/goal-state/events.jsonl), the candidate
packets, and the canonical
[`scoring/output/match-adjudication.json`](scoring/output/match-adjudication.json).

## Generalized intervention

The implementation deliberately does not mention Aster Credit identifiers,
contract names, truth IDs, or expected answers.

### Business invariants before local findings

New contracts record business flows, accounting/conservation identities,
external-semantic assumptions, and attacker funding. The required artifacts
model value and authority across the whole system, so a balanced local mapping
cannot stand in for solvency, backing, authorization, or isolation.

### Mandatory consumer propagation

Every attacker-mutable value is mapped through all direct and transitive
security consumers. A primitive must reach its strongest supported system
effect or carry evidence that no stronger consumer is available. Candidate
promotion adds a non-optional `downstream-impact` gate.

### Explicit primitive composition

Every supported manipulation and meaningful rejected lead receives a primitive
card with magnitude, lifetime, cost, consumers, prerequisites, and
normalization. Compatible cards are tested pairwise; a third link is added only
to close a concrete funding, threshold, ordering, realization, or cleanup gap.
A non-optional `composition-review` gate rejects impact inferred from
incompatible separate executions.

### Semantic-delta integration tests

The workflow separates ABI/specification promises from caller assumptions and
measures before/after effects. Nominal arguments are compared with sender,
recipient, protocol-balance, liability, price, timestamp, identity, and replay
domain deltas. Adversarial variants count only when the interface or supported
configuration leaves them possible; behavior alone is not a finding.

### Exact arithmetic and unit boundaries

Rounding direction is derived from the obligation and party that must be
favored. The mandatory matrix covers zero/one, quotient boundaries, zero and
one supply, exchange rates above and below one, direct balance changes,
repetition, and coarse/mixed units where no enforceable allowlist excludes
them. A boundary is rejected only after its supported input domain and
amplification paths are tested.

### Cross-function and cross-contract sequences

Every external interaction gets a snapshot of checks performed and state not
yet committed. The callback/action matrix enumerates same-function recursion,
every reachable public action, a second component, and dependency-state changes,
then asserts the final state after the stack unwinds.

### Machine-enforced completion

Workflow version 2 adds seven deep coverage dimensions and eight exact required
items. The helper rejects `validated` and `exhausted` completion when any item
is absent, blocked, merely inspected, or lacks evidence. Old workflow-v1 state
remains checkable and is explicitly labeled as version 1.

## Precision protections retained

- Attacker control, reachability, defense analysis, system impact, realistic
  configuration, safe/release reproduction, negative control, and independent
  reproduction remain mandatory.
- External variants require a supported-semantic basis; interface novelty alone
  does not qualify.
- Separate primitive executions cannot be merged into a composed claim.
- Every combined claim must close temporary principal, fees, repayments,
  cleanup, attacker net, protocol/system loss, and third-party effect.
- Failed joins and rejected variants retain exact reopen conditions.
- Severity follows the reproduced final oracle, not theoretical composability.
- Duplicate and human review remain explicit limitations where unavailable.

## Same-target regression protocol

The follow-up uses the same frozen target commit and source-manifest digest, the
same release-like toolchain, the same 180-minute/250-invocation ceilings, no
production-source mutation, and the same committed scoring definitions. It
will preserve the new contract, maps, experiments, rejected leads, candidates,
reproductions, controls, resource metrics, and deterministic comparison under a
separate `regression-v2/` directory.

Because the truth and fixes are now present in this repository and were used to
diagnose the workflow, the follow-up cannot be blind, clean-room, novel, or an
unbiased generalization estimate. It answers a narrower regression question:

> Does workflow v2 force the reasoning and evidence steps that workflow v1
> skipped, while retaining zero unsupported claims on this fixed target?

The baseline remains the only blind measurement. A future generalization claim
requires a new sealed target unknown to the hunter.

## Pre-run comparison hypotheses

1. The consumer map should connect the donation-sensitive conversion rate to
   every collateral/credit consumer instead of stopping at a deposit symptom.
2. The boundary matrix should prevent dismissal of a wrong rounding direction
   based only on a friendly default unit configuration.
3. The semantic-delta matrix should test nominal-versus-received value wherever
   external transfer effects create shares, reduce liabilities, or update
   reserves.
4. The callback matrix should enumerate cross-function exits before pending
   state commits.
5. The primitive join graph and economic ledger should require one compatible,
   funded, profitable execution before assigning composed Critical impact.
6. False-positive and duplicate counts should remain zero; otherwise the recall
   gain is not accepted as a precision-preserving improvement.

## Actual regression result

The workflow-v2 submission was frozen with a 31-file aggregate commitment before
post-run canonical validation. The unchanged target then passed all 15 canonical
reproductions and all 15 patched controls. Independent result calculation passed
286 assertions.

| Metric | Blind baseline | Revealed regression v2 |
| --- | ---: | ---: |
| Exact recall | 9/15 (60.00%) | 15/15 (100%) |
| Credited recall | 10/15 (66.67%) | 15/15 (100%) |
| Severity-weighted recall | 41/62 (66.13%) | 62/62 (100%) |
| Unique precision | 10/11 (90.91%) | 15/15 (100%) |
| False positives | 0 | 0 |
| Duplicates | 0 | 0 |
| Secondary rubric | 66/104 | 104/104 |

All six comparison hypotheses held. F-03 and F-04 moved from partial to exact;
F-01, F-06, F-07, and F-14 moved from missed to exact. The compound execution
distinguishes a spot-only borrow limit below flash repayment from a combined
limit above 150,000, repays principal plus fee, leaves 49,950 attacker stable,
and measures a 150,000 market-reserve loss. Matched controls block the join,
donation propagation, callback exit, zero-burn boundary, deposit dilution, and
repayment deficit under the condition whose absence caused each issue.

No precision tradeoff was observed on this fixed instance: false-positive and
duplicate counts remained zero, while severity calibration reached 100%. This
supports the intervention as a regression fix. It does not establish blind
generalization because the target and truth were already known. The detailed
comparison, immutable inputs, hunt artifacts, logs, and calculation checker are
under [`regression-v2/`](regression-v2/RESULTS.md).
