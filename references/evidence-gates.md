# Evidence gates

Use these gates to separate a lead from a validated vulnerability. A scanner
match, crash, anomalous output, model explanation, or code smell starts a
candidate; none finishes it.

## Candidate states

- `lead`: plausible enough to test; at least one gate remains open.
- `rejected`: a named gate failed. Preserve the reason and strongest evidence so
  the same false positive is not repeatedly rediscovered.
- `validated`: every gate required by the approved contract passed or an
  explicitly waivable gate has a documented, pre-authorized waiver. Any optional
  gate omitted before activation remains visible with its rationale.

Append a revision rather than modifying prior candidate history. A later
reproduction failure can move a previously validated candidate to `rejected`.

## Default gate set

### `attacker-control`

Identify the exact bytes, values, requests, actions, or state transitions the
attacker controls. Prove how they enter the target. Configuration or local state
is attacker-controlled only when the threat model gives the attacker a feasible
way to set it.

Reject when the proof directly edits internal state, calls a private function in
an impossible sequence, or assumes a privilege excluded by the contract.

### `reachability`

Trace the target-revision path from a supported entry point to the relevant
effect, including transformations, dispatch, validation, and lifecycle state.
Demonstrate it dynamically when practical.

Reject dead code, tests, mocks, unsupported API sequences, impossible object
states, or feature combinations that cannot exist in a supported deployment.

### `defense-analysis`

Name the expected enforcement point and show that it is missing, incomplete,
misordered, inconsistent, or bypassed. Trace every relevant guard, not only the
one nearest the sink. Account for framework, proxy, sandbox, database, and
operating-system enforcement.

Reject when an earlier or later guard reliably prevents the effect.

### `security-impact`

Show the confidentiality, integrity, availability, authorization, isolation, or
code-execution property that fails. Connect the technical effect to an asset and
boundary from the threat model.

Reject harmless crashes, controlled errors, information already available to
the attacker, and behavior that stays within the caller's legitimate privilege.

### `downstream-impact`

Trace the corrupted or attacker-mutable value through every direct security
consumer and then to the strongest supported system effect. Record each
consumer, transformation, guard, persistence boundary, and final oracle. Show
the caller, system, and affected third-party deltas where value or rights move.

Reject a candidate disposition that stops at a local imbalance, manipulated
view, stale intermediate state, or isolated primitive while a material consumer
remains untested. If there is no downstream consumer, preserve the search map
that establishes that boundary rather than asserting it from one call site.

### `composition-review`

Compare the candidate with every supported primitive and meaningful rejected
lead. Record compatibility of identity, assets, configuration, ordering,
lifetime, funding, and cleanup. Reproduce every material join that could raise
impact or make an otherwise uneconomic path feasible; preserve failed joins and
their exact incompatibility.

Reject an inferred composed impact assembled from separate executions. A
composed claim passes only when one feasible sequence reaches repayment or
cleanup and the final security oracle. A standalone candidate may pass this
gate with evidence that all material joins were tested or ruled out.

### `realistic-configuration`

Reproduce in a supported, relevant configuration. Prefer defaults; otherwise
show why the non-default configuration is documented and realistically used.
Record feature flags, dependencies, platform, initialization, credentials, and
attacker prerequisites.

Reject debug-only behavior, impossible dependency versions, unsupported builds,
or configuration that already grants the claimed impact.

### `safe-reproduction`

Provide a minimal, deterministic, local proof and a precise oracle. Start from a
clean state and preserve commands, input, expected safe behavior, observed
unsafe behavior, output, and cleanup. Do not require destructive effects when a
trace, mock sink, isolated fixture, or intercepted operation proves the boundary
crossing.

Reject prose-only claims and proofs that succeed only after modifying production
logic to make the path vulnerable.

### `release-reproduction`

Repeat in the relevant release-like build, not only a debug, sanitizer, mocked,
or specially patched harness. Instrumentation may remain for diagnosis, but the
security oracle must survive without instrumentation-specific semantics.

Reject assertions or sanitizer artifacts that cannot correspond to an effect in
the real configuration.

### `negative-control`

Run the same proof against a corrected, patched, or known-safe comparator, or
change the one condition claimed to cause the bug. The proof should fail safely.
For generated rules, require a vulnerable-positive and safe-negative fixture.

Waive only when no meaningful comparator can exist and the contract authorized
that exception before activation. State the alternative discriminating evidence.

### `independent-reproduction`

Give a fresh reviewer the target revision, raw input, build command, and claimed
oracle without the hunter's persuasive narrative. Require the reviewer to
reconstruct and reproduce the path. Prefer a different model family or a human
using a clean environment.

Reject a second model's agreement, paraphrase, or severity vote when it did not
run or independently trace the proof.

### `duplicate-check`

After the trigger and root cause are technically stable, search allowed issue
trackers, advisories, changelogs, commits, reports, and known-findings lists.
Compare affected component, mechanism, trigger, impact, and fix—not only titles.

If the contract does not claim novelty, record this gate in `omitted_gates` with
a reason before activation. Otherwise reject exact duplicates and clearly label
closely related variants.

### `human-review`

Require a qualified person to review authorization, reproduction, impact,
realistic prerequisites, duplicate analysis, disclosure safety, and final
wording. Human review is mandatory before external disclosure, live testing,
severity finalization, or calling a finding previously unknown. A strictly
internal technical-validation contract may omit this gate before activation,
but the result must remain labeled unreviewed and must not be disclosed.

## Evidence matrix

Maintain a matrix in the candidate report:

| Gate | Claim | Artifact | Independent result | Status |
| --- | --- | --- | --- | --- |
| Attacker control | What the attacker sets | Source trace/input | Confirmed or disputed | pass/fail |
| Reachability | Supported path to effect | Trace/test/log | Reproduced or not | pass/fail |
| Defense analysis | Missing or bypassed guard | Guard inventory | Confirmed or disputed | pass/fail |
| Impact | Security property violated | Safe effect oracle | Confirmed or disputed | pass/fail |
| Downstream impact | Strongest supported consumer effect | Consumer map and system-delta trace | Reproduced or bounded | pass/fail |
| Composition review | Compatible and incompatible primitive joins | Join graph and combined/failed runs | Reproduced or ruled out | pass/fail |
| Realistic config | Relevant deployment | Build/config manifest | Recreated or not | pass/fail |
| Safe reproduction | Deterministic minimal proof | Reproducer/log | Reproduced or not | pass/fail |
| Release reproduction | Effect survives realistic build | Release log | Reproduced or not | pass/fail |
| Negative control | Corrected condition is safe | Paired run | Reproduced or not | pass/fail/waived |
| Duplicate check | Novel or distinct | Search notes | Human checked | pass/fail/N/A |
| Human review | Final judgment | Review record | Reviewer identity | pass/fail |

Use paths, hashes, commands, or trace identifiers as artifacts. “Reviewed by
agent” is not an artifact.

## Build a safe reproduction packet

Include:

1. repository identity and exact commit;
2. environment and dependency versions;
3. release-like build and setup commands;
4. minimal attacker-controlled input or action sequence;
5. expected safe behavior and observed behavior;
6. deterministic oracle and repeat count;
7. logs or traces with secrets removed;
8. cleanup instructions;
9. negative-control command and result;
10. proof-safety notes and known limitations.
11. downstream consumer map and final system delta;
12. primitive-join graph, combined run, and failed-join evidence.

Avoid outbound callbacks, real credentials, destructive writes, uncontrolled
resource exhaustion, third-party targets, and weaponized payloads. Demonstrate
the smallest effect needed to prove the security boundary.

## Handle tool failures and negative results

Classify each experiment as one of:

- `supports`: adds evidence for a gate;
- `contradicts`: weakens or rejects a candidate;
- `negative`: the experiment ran correctly and did not observe the hypothesis;
- `inconclusive`: the method could not discriminate the hypothesis;
- `tool-failure`: build, harness, query, environment, or tool did not work.

Only a correctly configured discriminating experiment can produce a negative
result. Do not turn `tool-failure` or `inconclusive` into evidence of absence.

## Keep discovery and duplicate review independent

When novelty matters, avoid current issue titles, reports, and expected answers
during initial discovery. This reduces anchoring and benchmark contamination.
Once the candidate has a stable input, path, root-cause statement, and impact,
perform the duplicate check and record search scope and date.

For independent technical review, provide raw artifacts first. Reveal the
hunter's report only after the reviewer records its own result. Resolve
disagreements by repeating the disputed gate, not by model voting.

## Report a rejection usefully

Name the first failed gate, the experiment that failed it, and what new evidence
could reopen the candidate. Keep the rejection in the append-only log. Rejected
candidates improve search precision and prevent repeated work; they are not
embarrassing output to hide.
