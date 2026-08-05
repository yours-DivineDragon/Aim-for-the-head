# Goal contract

Use this reference to convert a broad security request into a completion
contract that is hard to game. Complete the threat model first; a goal without
an attacker and protected asset tends to reward visually suspicious code rather
than security impact.

## Threat-model template

Create `THREAT_MODEL.md` with the following sections. Replace every placeholder;
write `none known` rather than silently omitting one.

```markdown
# Threat model

## Target
- Repository and revision:
- Scope authority and source documents:
- Included components:
- Excluded components:
- Release-like configurations:

## Assets and security properties
- Assets:
- Business flows and intended value movement:
- Accounting identities and solvency/conservation properties:
- Confidentiality properties:
- Integrity properties:
- Availability properties:
- Authorization or isolation properties:

## Adversary
- Attacker capabilities:
- Attacker-controlled inputs:
- Attacker starting position:
- Explicit non-capabilities:

## Trust boundaries and effects
- Trust boundaries:
- Privilege transitions:
- Dangerous sinks or effects:
- External dependencies:
- External semantic promises versus assumptions:

## Security invariants
- Invariant:
  - Why it matters:
  - Expected enforcement points:
  - Observable counterexample:
- Downstream consumers of attacker-mutable values:
- Candidate primitive joins and atomic funding sources:

## Operating assumptions
- Deployment defaults:
- Feature flags and optional components:
- Required secrets, privileges, or user interaction:
- Assumptions that still need verification:
```

Model explicit non-capabilities. A local administrator, compromised build host,
or caller already holding the target privilege usually does not demonstrate a
boundary crossing. Treat an assumption as a hypothesis until the repository,
documentation, or experiment verifies it.

## Contract template

Create `GOAL.md` with this structure:

```markdown
# Goal

## Outcome
For a focused hunt, find/prove/reject exactly <count> <finding or property> in
<target and revision>. For a broad audit, complete the bounded scope-wide
baseline and report every validated issue encountered. Require <attacker> to
cause <required impact> under <realistic config>.

## Mode
Profile: <focused-hunt or broad-audit>
Mode: <discovery, variant, invariant, differential, or validation>

## Target and scope
- Included:
- Excluded:
- Scope authority and sources:
- Knowledge policy and known-material disposition:
- Allowed methods and environments:
- Proof-safety constraints:

## Threat model
- Attacker capabilities:
- Attacker non-capabilities:
- Required assets or boundaries crossed:

## Acceptance evidence
- Attacker-controlled source:
- Reachable path and preconditions:
- Missing or bypassed defense:
- Dangerous effect and impact:
- Clean, safe reproduction oracle:
- Release-like reproduction:
- Patched or negative control:
- Independent reproduction:
- Duplicate and scope check:
- Human review:
- Downstream consumer propagation:
- Primitive composition and final system-impact closure:

## Non-success
- Dead, unreachable, or test-only code:
- Unsupported or unrealistic configuration:
- Invalid API use or out-of-model privilege:
- Crash or tool alert without security impact:
- Existing duplicate or excluded class:
- Any other task-specific exclusion:

## Budget and stop
- Start and deadline:
- Experiment or compute limits:
- Finding count:
- Stop policy:
- Broad-audit baseline matrix:
- Exhaustion obligations:
- Blocked condition and required unlock:

## Deliverables
- State directory:
- Evidence directory:
- Finding or non-finding report:
```

Write the outcome as a measurable end state, not a recipe. For example, prefer
“produce one reachable counterexample to authorization invariant X” over “run a
fuzzer for six hours.” The latter may be an experiment; it cannot establish the
security outcome by itself.

## Machine-readable contract

The state helper creates `contract.json`. Fill all placeholders before
activation. Its important fields are:

| Field | Meaning |
| --- | --- |
| `authorization.confirmed` and `basis` | Why this assessment is allowed |
| `target.path`, `revision`, `include`, `exclude` | Exact audit boundary |
| `target.scope_basis`, `scope_sources` | Authority used to choose the boundary |
| `profile` | Focused finding-count hunt or scope-wide broad audit |
| `mode` and `objective` | One outcome, not a list of tasks |
| `success_conditions` | Observable conditions that satisfy the outcome |
| `non_success_conditions` | Shortcuts and false positives that do not count |
| `threat_model.*` | Attacker, assets, boundaries, invariants, impact, configs |
| `threat_model.business_flows` | Intended value and authority movement |
| `threat_model.accounting_invariants` | Cross-component conservation, solvency, and liability properties |
| `threat_model.external_semantic_assumptions` | Verified promises separated from caller assumptions |
| `threat_model.attacker_funding_sources` | Persistent, delegated, repeated, and atomic resources |
| `evidence_requirements.required_gates` | Candidate gates required by this hunt |
| `evidence_requirements.waivable_gates` | Exceptional gates that may be waived with a reason |
| `evidence_requirements.omitted_gates` | Optional gates excluded before activation, mapped to reasons |
| `evidence_requirements.allowed_gate_evidence_sharing` | Exact gate groups allowed to share one digest, each with a reason |
| `novelty_policy` | When and how to check issues, reports, and prior fixes |
| `knowledge_policy` | Inventory, blind-novelty, or validation handling for answer-bearing material |
| `search_requirements.mandatory_passes` | Deep-hunt artifacts required before completion |
| `search_requirements.baseline_lenses` | Component-wide checks required by a broad audit |
| `search_requirements.allowed_pass_evidence_sharing` | Exact mandatory-pass groups allowed to share one digest, each with a reason |
| `search_requirements.primitive_escalation_policy` | How primitives are traced through consumers and joins |
| `search_requirements.impact_priority_policy` | When a lower-impact finding does not satisfy a highest-impact objective |
| `budget` | Time, compute, token, or experiment limits |
| `stop` | Finding threshold, profile-specific stop policy, exhaustion obligations, and blocked rule |
| `outputs.evidence_roots` | Containment roots for local evidence artifacts |

Do not reduce the default evidence gates merely because a tool cannot produce
the evidence. Attacker control, reachability, defense analysis, impact,
realistic configuration, safe and release reproduction, independent
reproduction, and a negative control are non-optional; the negative control may
be pre-authorized as waivable only when equivalent discriminating evidence is
named. Omit duplicate or human review only when genuinely inapplicable, map the
gate to a reason in `omitted_gates` before activation, and disclose the omission
in the result.

Use a distinct artifact digest for each validated gate and each mandatory pass.
When one trace genuinely establishes more than one named claim, declare the
smallest exact sharing group and a substantive reason before activation. Copying
the same bytes to another filename does not make the evidence independent.

Keep evidence under the state directory's parent by default. Add a narrow
absolute root to `outputs.evidence_roots` before activation only when the hunt
must use an existing artifact location. Relative roots may narrow the state
parent but may not escape it.

Workflow version 2 also requires `downstream-impact` and
`composition-review`. The first proves the strongest supported effect through
direct consumers. The second compares the primitive with other active and
rejected leads and records why each material join succeeds or fails. These are
review obligations, not permission to infer impact without a combined proof.

Workflow version 3 freezes `scope-manifest.json`. A `broad-audit` must use
`stop.policy=coverage-complete` and complete the component-by-lens matrix in
[`breadth-first-audit.md`](breadth-first-audit.md) before either `validated` or
`exhausted`. A `focused-hunt` may use `finding-count`.

Treat `budget.max_experiments` as a positive integer counting both experiments
and tool failures. Treat `max_hours` as wall-clock hours since first activation
and `deadline` as an absolute ISO-8601 timestamp with timezone. A
`budget-limited` outcome is valid only after one declared bound is reached.

Keep every mandatory pass and exact item from
[`deep-hunt.md`](deep-hunt.md) in `search_requirements.mandatory_passes`. A pass
may conclude that a risk is inapplicable, but its evidence must demonstrate why
under the approved threat model. Do not remove a pass because the default
configuration is friendly or one local candidate already validated.

## Draft by mode

### Discovery

State an attacker, impact floor, realistic configuration, knowledge policy, and
stop policy. Do not infer a novelty-only objective. Default a broad audit to
known-material inventory and report reproduced current issues with provenance.
Keep the first technical pass blind only when benchmark integrity or explicit
independent discovery requires it; record the blindness basis and inventory the
sequestered material after the pass.

### Variant

Derive a one-sentence risk abstraction from the seed, such as “length is
validated before one transformation but consumed after a second transformation.”
Do not give the hunter the original file and exact fix unless exact matching is
the intended first stage. Require distinct root cause or location, vulnerable
positive, corrected negative, and comparison with the seed.

### Invariant

Write the property over states and transitions, attacker-reachable initial
conditions, forbidden state, and an observable counterexample. A failing
assertion counts only if the asserted property is security-relevant and the
attacker can drive the transition.

### Differential

Name both sides, allowed semantic differences, security-relevant divergence,
and a stable oracle. Control environment, input normalization, undefined
behavior, nondeterminism, and feature flags before treating divergence as a
candidate.

### Validation

State the exact alert or candidate, claim to prove or reject, target revision,
and evidence that would falsify it. Validation may terminate `exhausted` only
for that candidate; it says nothing about the rest of the target.

## Red-team the draft

Before activation, answer these questions adversarially:

1. Could the goal complete after reading only a few suspicious files?
2. Could a high read-coverage or runtime-coverage number substitute for a bug?
3. Could an empty scanner result or broken tool be called exhaustion?
4. Could the proof modify the target until it creates its own vulnerability?
5. Could debug assertions, sanitizers, mocks, or test-only paths create the only
   oracle?
6. Could the attacker require a privilege explicitly excluded by the model?
7. Could a model approve its own prose without reproducing raw artifacts?
8. Could a known issue be rediscovered and called novel?
9. Could the run stop as “blocked” without naming an exact unlock?
10. Could the same unproductive experiment be repeated with different wording?
11. Could one successful path mark an entire surface or consumer graph tested?
12. Could a local Low/Medium primitive combine with another state manipulation,
    temporary funding source, or downstream consumer into High/Critical impact?
13. Could an interface-compatible dependency violate an unstated balance,
    rounding, callback, freshness, ordering, or identity assumption?
14. Could the default unit configuration hide a zero-unit or reversed-rounding
    boundary that the supported input domain permits?
15. Could a same-function callback test miss a cross-function or cross-contract
    action before the outer state is committed?
16. Could a repository-wide request silently become a focused stop-after-one
    hunt?
17. Could known tests, PoCs, reports, or audit annotations be classified as
    duplicates and therefore disappear from the current-risk result?
18. Could the run select an attractive complex surface before checking simple
    zero, unit, decimal, native-sentinel, lifecycle, identity, valuation, and
    cross-instance boundaries across every component?
19. Could the declared scope differ from a supplied competition or engagement
    document, or change after activation?

Add a success or non-success clause for every shortcut that remains possible.

## Activation checklist

Activate only when all answers are yes:

- Is authority recorded?
- Is the focused or broad profile explicit?
- Is there exactly one primary outcome?
- Are the target and revision unambiguous?
- Are scope authority, exact files, and knowledge handling explicit?
- Are attacker capabilities and non-capabilities explicit?
- Is security impact observable?
- Are realistic configurations named?
- Are success and non-success conditions falsifiable?
- Are evidence and independent-review gates defined?
- Are business flows, conservation identities, consumers, external semantics,
  attacker funding, and mandatory composition passes explicit?
- For a broad audit, are the baseline lenses and coverage-complete stop policy
  frozen?
- Are budget, exhaustion, and blocked rules explicit?
- Is state durable across context loss?

If the host has native goal mode, paste or reference the approved contract there.
Native persistence does not replace this activation check.
