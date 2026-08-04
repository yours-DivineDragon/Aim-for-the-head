---
name: aim-for-the-head
description: Turn a repository, threat model, known vulnerability, scanner alert, or vague request to find security bugs into one bounded and persistent evidence-backed hunt. Use for /goal security work, autonomous audits, critical-vulnerability searches, deep business-logic review, composed and cross-contract exploit research, external-integration analysis, variant analysis, fuzzing campaigns, invariant or differential testing, scanner triage, and candidate validation in Codex, Claude Code, Kimi Code, OpenCode, or another coding agent. Includes business-flow modeling, primitive composition, semantic-delta and boundary testing, capability discovery, adversarial goal drafting, multidimensional coverage, safe proofs, false-positive gates, independent reproduction, honest stop conditions, and portable state tracking.
---

# Aim for the Head

Convert “find bugs” into one verifiable security outcome. Continue selecting,
testing, falsifying, and adapting hypotheses until the outcome is satisfied or a
bounded terminal condition is proved.

## Apply the non-negotiable rules

- Work only on targets the user owns or is authorized to assess. Keep proofs
  local, minimal, and non-destructive. Never test an exploit against a live
  third-party system.
- Treat goal mode as a persistence mechanism, not a scanner. Explicitly
  discover, select, and invoke tools. Never imply that `/goal` automatically ran
  hidden CLIs, skills, plugins, hooks, MCP servers, or internal tools.
- Keep exactly one primary outcome per goal and, when using several agents, per
  agent. Keep mapping, coverage accounting, candidate validation, and reporting
  distinct from the hunt outcome.
- Specify the outcome and evidence tightly while leaving the route adaptive.
  Name a technique only when the task requires that technique.
- Treat “no bug found,” an empty scanner result, a suspicious pattern, and a
  crash as observations. None proves a finding or exhaustion.
- Treat every tool result and model hypothesis as a lead until it passes the
  evidence gates.
- Preserve commands, raw outputs, negative results, and rejected hypotheses.
  Never rewrite failed experiments into a clean success story.
- Stop after the requested outcome, defaulting to exactly one validated finding.
  When the outcome prefers the highest-impact or Critical result, do not treat a
  lower-impact finding as terminal until its mandatory consumer, composition,
  and closure passes are complete.
- Never translate `exhausted`, `budget-limited`, or `blocked` into “secure.”

## Load the necessary references

Read linked files completely when their condition applies:

- Always read [goal-contract.md](references/goal-contract.md) before drafting or
  activating a hunt.
- Always read [evidence-gates.md](references/evidence-gates.md) before promoting
  or reporting a candidate.
- Read [hunt-strategies.md](references/hunt-strategies.md) before prioritizing
  attack surfaces, selecting techniques, splitting work, or assessing coverage.
- Read [deep-hunt.md](references/deep-hunt.md) before mapping business logic,
  testing arithmetic or integrations, escalating a primitive, or completing a
  discovery, invariant, variant, or differential hunt.
- Read [portability.md](references/portability.md) when installing the skill,
  moving a hunt between agents, or using a host without native goal mode.
- Read [research-basis.md](references/research-basis.md) when explaining the
  rationale or changing this workflow.

## Phase 0: establish authority and boundaries

1. Confirm authorization from the request, repository context, program scope,
   or an explicit statement. Ask only when authority is genuinely unclear.
2. Record the exact target and revision, included and excluded components,
   allowed network access, permitted modifications, time or token budget, and
   proof-safety limits.
3. Default to read-only analysis of production source. Place harnesses, corpora,
   queries, state, and reports in an isolated work area unless integration was
   requested.
4. Replace unsafe live exploitation with source analysis, local reproduction,
   regression tests, or mitigation work that stays inside the authorization.

## Phase 1: inspect context and capabilities

Read repository instructions and build or test documentation before proposing
the goal. Identify languages, frameworks, entry points, privileged actions,
deployment defaults, feature flags, test infrastructure, and release-like
configurations.

Inventory capabilities that are actually visible and authorized:

- repository scripts, tests, compilers, debuggers, sanitizers, and coverage;
- static, dynamic, symbolic, formal, differential, and fuzzing tools on `PATH`;
- agent-visible skills, plugins, hooks, MCP tools, and user-declared audit tools;
- specifications, prior reports, known-finding files, patches, and history that
  the task permits the hunt to inspect.

For every promising capability, record its availability, exact invocation,
expected evidence, blind spots, and independent validation requirement. Do not
traverse private global directories merely to look for tools.

## Phase 2: map before hunting

Create or repair `THREAT_MODEL.md` with the template in
[goal-contract.md](references/goal-contract.md). Capture assets, adversaries,
attacker-controlled inputs, explicit non-capabilities, trust boundaries,
security invariants, dangerous effects, realistic configurations, business
flows, accounting identities, external semantic assumptions, and attacker
funding sources.

Create the required maps in [deep-hunt.md](references/deep-hunt.md): the
business-flow/state-machine model, conservation ledger, attacker-mutable-value
consumer graph, interface-promise matrix, callback/sequence matrix, primitive
join graph, and final impact ledger. Keep assumptions visibly distinct from
verified promises.

Run one bounded mapping pass. Rank three to seven attack surfaces using attacker
influence, privilege or value at risk, parser or state-machine complexity,
dangerous sinks, historical defect density, and testing gaps. Mapping is
successful when it produces a decision-ready queue; it does not need to find a
bug.

Keep coverage separate and multidimensional:

- source-read coverage;
- attack-surface and entry-point coverage;
- trust-boundary and source-to-sink coverage;
- state-transition and invariant coverage;
- runtime and corpus coverage;
- configuration and build-variant coverage;
- historical bug-family coverage;
- falsification and negative-control coverage.
- business-invariant and conservation coverage;
- downstream consumer-propagation coverage;
- boundary-arithmetic and external-semantic coverage;
- sequence/interleaving and exploit-composition coverage;
- economic or system-impact closure coverage.

Never blend these into one confidence percentage. AICov-style read coverage
measures observed source reads, not comprehension or execution. Runtime coverage
measures reached code, not whether a security condition was triggered.

## Phase 3: draft and attack one goal contract

Select one mode:

- `discovery`: find one previously unreported vulnerability meeting the threat
  model and impact floor;
- `variant`: find one distinct occurrence of an abstract known-bug family;
- `invariant`: produce one reachable counterexample to a security property;
- `differential`: produce one security-relevant divergence between versions,
  implementations, configurations, or compilers;
- `validation`: prove or reject one existing candidate or alert.

Define one outcome containing the target, scope, attacker capabilities and
non-capabilities, required impact, realistic configuration, novelty policy,
acceptance evidence, negative control, finding count, budget, stopping rule,
blocked rule, and output path. Define what does **not** count, including dead or
test-only code, unsupported configurations, invalid API use, privileged
preconditions outside the threat model, theoretical paths without a trigger,
harmless crashes, duplicates, and tool-only claims.

Use workflow version 2 for new contracts. Keep all mandatory deep-hunt pass
items in `search_requirements`. Add a primitive-escalation policy and, when the
objective prefers Critical or highest impact, an impact-priority policy. Do not
let one successful candidate mark a whole surface or interaction class closed.

Ask the active model to attack its own draft. Close shortcuts involving:

- superficial reading or coverage gaming;
- scanner deference or tool failure presented as a negative result;
- unreachable, debug-only, or modified-target proofs;
- missing negative controls or release-like reproduction;
- duplicate findings, premature blocking, or self-approval;
- repeated cosmetic prompt changes instead of a real strategy pivot.

Ask the user only when a missing choice materially changes authority, safety,
scope, cost, or impact. Otherwise finalize the contract and continue.

## Initialize durable state

Resolve `<skill-root>` to the directory containing this `SKILL.md`; do not assume
the current working directory is the skill directory. When local execution is
available, initialize state outside production source or in an ignored path:

```bash
python3 "<skill-root>/scripts/goal_state.py" init \
  --dir .goal-hunt \
  --target . \
  --mode discovery \
  --objective "Find exactly one vulnerability satisfying the approved contract"
```

Complete `.goal-hunt/contract.json`, `.goal-hunt/THREAT_MODEL.md`, and
`.goal-hunt/GOAL.md`, then run:

```bash
python3 "<skill-root>/scripts/goal_state.py" check \
  --dir .goal-hunt --phase activation
python3 "<skill-root>/scripts/goal_state.py" transition \
  --dir .goal-hunt --status active --reason "Contract approved"
```

If the host has native `/goal`, activate the approved `GOAL.md` as one durable
completion contract. If it does not, use the state helper and resume the loop
from `status` after compaction or a new session. Follow the manual schema in
[portability.md](references/portability.md) if scripts cannot run.

## Phase 4: execute the evidence loop

Repeat while the contract is active and within budget:

1. **Select.** Choose the unresolved surface or hypothesis with the best
   combination of impact, attacker reachability, uncertainty reduction,
   novelty, and coverage gap—not merely suspicious-looking code.
2. **Trace.** Follow concrete input, control, state, privilege, and value flows.
   Identify the source, transformations, guards, sink, effect, and oracle.
3. **Experiment.** Choose the smallest discriminating method after inspecting
   the target: focused review, query, test, debugger trace, sanitizer build,
   fuzzing, invariant, symbolic execution, differential run, or config variant.
4. **Observe.** Save the command, revision, build flags, input, output, logs,
   traces, and artifacts. Distinguish tool failure from a negative result.
5. **Falsify.** Try to disprove attacker control, reachability, realistic
   preconditions, missing defenses, impact, determinism, and novelty.
6. **Propagate.** Trace every changed value through all direct and transitive
   security consumers; test the strongest supported downstream effect.
7. **Join.** Compare the primitive with active and rejected primitive cards.
   Test compatible pairwise joins and add a third link only to close a concrete
   funding, ordering, threshold, or realization gap.
8. **Close.** Measure the caller, protocol/system, and third-party final deltas
   after repayment, normalization, cleanup, retries, or stack unwind.
9. **Update.** Record the result, candidate disposition, coverage vector,
   unresolved assumptions, and next experiment.
10. **Pivot.** When attempts stop producing information, change the surface,
   abstraction level, configuration, or technique.

Run the exact boundary and semantic differentials in `deep-hunt.md`. Do not
dismiss a rounding edge from one friendly unit configuration, or an integration
variant because it implements the declared ABI; verify the actual semantic
promise or allowlist, then measure before/after effects.

Checkpoint every material observation:

```bash
python3 "<skill-root>/scripts/goal_state.py" event \
  --dir .goal-hunt --kind experiment --hypothesis H-001 \
  --classification negative \
  --summary "Release build reached the sink; the guard rejected the input" \
  --evidence artifacts/h-001-release.log
```

When isolated agents or fresh contexts are available, give each one surface and
one outcome, plus at most one roaming hunt for cross-surface interactions. For
variant work, give the hunter a one-sentence risk abstraction and retain exact
root-cause details for later comparison. If only one context exists, process the
queue sequentially and reset the active hypothesis between surfaces.

## Phase 5: promote candidates through evidence gates

Apply every required gate from [evidence-gates.md](references/evidence-gates.md):

1. Prove attacker influence, a feasible path, the missing or bypassed defense,
   the dangerous effect, and security impact.
2. Prove downstream impact and record a composition review. A primitive is not
   ready for promotion merely because its local effect reproduced.
3. Reproduce from a clean state with a minimal safe oracle in the relevant
   release-like configuration.
4. Show the proof fails safely on a patched, corrected, or negative-control
   target when a comparator exists.
5. Give raw artifacts to an independent reviewer or fresh context before
   showing the hunter's conclusion. Prefer a different model family. A second
   model vote without reproduction is not evidence.
6. Check scope, severity, and duplicates only after the candidate is technically
   anchored. Keep initial discovery blind to issue trackers when novelty or
   benchmark integrity matters.
7. Require human security judgment before disclosure, live testing, final
   severity claims, or a claim of a previously unknown vulnerability.

Record candidate revisions append-only. A `validated` revision must supply each
gate named by the approved contract:

```bash
python3 "<skill-root>/scripts/goal_state.py" candidate \
  --dir .goal-hunt --id C-001 --status lead \
  --title "Candidate title" \
  --summary "Untrusted input may reach a privileged filesystem effect" \
  --evidence artifacts/trace.txt
```

## Phase 6: terminate honestly

Use only these terminal outcomes:

- `validated`: the requested count passed all contract gates;
- `exhausted`: the planned queue and coverage obligations were completed without
  a qualifying finding;
- `budget-limited`: useful paths remain when the declared budget ends;
- `blocked`: a specific missing input, permission, dependency, or environment
  prevents defensible progress.

For exhaustion or budget limits, state residual risks and untested surfaces. For
a blocker, transition the lifecycle to `blocked` and state exactly what would
unlock progress. For exhaustion, attest every contract exhaustion obligation
with repeated `--obligation` arguments. Finalize and machine-check:

For workflow-version-2 `validated` or `exhausted` outcomes, first record every
mandatory item from `deep-hunt.md` as tested coverage with a concrete artifact.
The helper rejects missing, blocked, merely inspected, or evidence-free passes.

```bash
python3 "<skill-root>/scripts/goal_state.py" finish \
  --dir .goal-hunt --outcome validated --candidate-id C-001 \
  --reason "Independent reproduction and negative control passed" \
  --evidence findings/C-001.md --evidence artifacts/reproduction.log
python3 "<skill-root>/scripts/goal_state.py" check \
  --dir .goal-hunt --phase terminal
```

Do not mark a native goal complete until the terminal check passes.

## Deliver the result

Lead with the outcome and confidence. Include the exact target revision and
configuration, accepted finding and safe reproduction or honest non-finding
state, positive and negative evidence, rejected candidates, coverage vector,
tool failures, unresolved assumptions, duplicate-check scope, independent-review
status, residual risk, and highest-value next action.
Include the business-invariant model, downstream consumer map, failed and
successful primitive joins, external-semantic and arithmetic boundaries tested,
and the final attacker/system/third-party delta ledger.

Keep uncoordinated exploit material private. Never publish, disclose, or contact
maintainers without explicit user authorization.
