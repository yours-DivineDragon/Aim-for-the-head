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
- Included components:
- Excluded components:
- Release-like configurations:

## Assets and security properties
- Assets:
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

## Security invariants
- Invariant:
  - Why it matters:
  - Expected enforcement points:
  - Observable counterexample:

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
Find/prove/reject exactly <count> <finding or property> in <target and revision>
that allows <attacker> to cause <required impact> under <realistic config>.

## Scope
- Included:
- Excluded:
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
| `mode` and `objective` | One outcome, not a list of tasks |
| `success_conditions` | Observable conditions that satisfy the outcome |
| `non_success_conditions` | Shortcuts and false positives that do not count |
| `threat_model.*` | Attacker, assets, boundaries, invariants, impact, configs |
| `evidence_requirements.required_gates` | Candidate gates required by this hunt |
| `evidence_requirements.waivable_gates` | Exceptional gates that may be waived with a reason |
| `evidence_requirements.omitted_gates` | Optional gates excluded before activation, mapped to reasons |
| `novelty_policy` | When and how to check issues, reports, and prior fixes |
| `budget` | Time, compute, token, or experiment limits |
| `stop` | Finding count, exhaustion obligations, and blocked rule |

Do not reduce the default evidence gates merely because a tool cannot produce
the evidence. Attacker control, reachability, defense analysis, impact,
realistic configuration, safe and release reproduction, independent
reproduction, and a negative control are non-optional; the negative control may
be pre-authorized as waivable only when equivalent discriminating evidence is
named. Omit duplicate or human review only when genuinely inapplicable, map the
gate to a reason in `omitted_gates` before activation, and disclose the omission
in the result.

## Draft by mode

### Discovery

State an attacker, impact floor, realistic configuration, novelty policy, and
one finding count. Keep the first technical pass blind to current issue trackers
when benchmark integrity or independent discovery matters. Search duplicates
after a candidate has a stable trigger and root-cause fingerprint.

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

Add a success or non-success clause for every shortcut that remains possible.

## Activation checklist

Activate only when all answers are yes:

- Is authority recorded?
- Is there exactly one primary outcome?
- Are the target and revision unambiguous?
- Are attacker capabilities and non-capabilities explicit?
- Is security impact observable?
- Are realistic configurations named?
- Are success and non-success conditions falsifiable?
- Are evidence and independent-review gates defined?
- Are budget, exhaustion, and blocked rules explicit?
- Is state durable across context loss?

If the host has native goal mode, paste or reference the approved contract there.
Native persistence does not replace this activation check.
