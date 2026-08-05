# Hunt strategies

Use this reference to choose experiments without hard-coding a tool into the
goal. The best next experiment is the one that most cheaply distinguishes
plausible security hypotheses, not the one that produces the most output.
Use the [deep-hunt pass index](deep-hunt.md) to load only the business,
consumer, integration, arithmetic, interleaving, composition, or closure pass
needed for the current experiment.
For repository-wide work, first use the component matrix in
[breadth-first-audit.md](breadth-first-audit.md); candidate depth cannot replace
scope-wide baseline coverage.

## Build the surface queue

During the bounded mapping pass, inventory:

- external parsers, protocol handlers, importers, and deserializers;
- authentication, authorization, tenant boundaries, and object ownership;
- filesystem, process, network, database, cryptographic, and template sinks;
- privilege changes, sandbox boundaries, plugins, callbacks, and extension APIs;
- caches, queues, retries, concurrency, lifecycle transitions, and recovery;
- canonicalization, encoding, integer, length, and type conversions;
- build tags, feature flags, compatibility modes, and deployment defaults;
- generated code, foreign-function boundaries, and dependency wrappers.
- business flows, asset/liability ledgers, and state-machine transitions;
- externally supplied balances, prices, rates, identities, and timestamps;
- direct consumers of every attacker-mutable value and multiplicative joins;
- temporary funding, batching, repetition, and atomic settlement paths.

Rank three to seven surfaces. Use ordinal judgments rather than a fake precision
score:

| Factor | Prefer a higher rank when… |
| --- | --- |
| Attacker influence | Remote or low-privilege input controls decisions or data |
| Security leverage | The surface reaches secrets, privilege, code, or isolation |
| Semantic complexity | Parsing, state, concurrency, or transformations are deep |
| Guard uncertainty | Enforcement is distributed, optional, or inconsistently ordered |
| Variant evidence | History or a seed suggests the same risk family |
| Test gap | Relevant negative, boundary, or release-config tests are absent |

Record why each surface is ranked and what observation would lower its rank.
Queue a roaming pass for cross-component interactions only after component
boundaries are understood.

## Inventory tools deliberately

Do not assume an agent knows every installed or internal tool. Inspect only
authorized, visible locations and record:

| Capability | Availability and invocation | Evidence produced | Blind spot |
| --- | --- | --- | --- |
| Build and tests | Repository command | Reproducible behavior | Existing tests encode only known expectations |
| Static query | Tool, ruleset, config | Candidate paths or patterns | Reachability and impact may be absent |
| Dynamic trace | Build and runtime command | Concrete execution | One trace does not establish completeness |
| Sanitizer | Release-like instrumented build | Memory or UB oracle | Harness and config may make code unreachable |
| Fuzzer | Harness, corpus, dictionary | Inputs and coverage | Coverage rewards may miss semantic states |
| Symbolic/formal | Model and bound | Counterexample or proof in model | Model may omit real preconditions |
| Differential | Two controlled targets | Divergent behavior | Differences may be allowed or nondeterministic |
| Read coverage | AICov or transcript tooling | Files and lines observed by agent | Not comprehension, execution, or security coverage |

Search existing repository scripts before inventing a harness. Reuse a tool only
when its output can feed a contract gate.

## Choose a mode-specific sequence

### Discovery sequence

1. Lock exact scope, profile, and known-material policy.
2. Map sources, boundaries, enforcement points, and dangerous effects.
3. For a broad audit, run the baseline lenses across every component and use
   open or failed rows to prioritize deeper hypotheses.
4. Form a small hypothesis around a violated security invariant.
5. Trace a concrete path manually before scaling the search.
6. Create the smallest oracle that discriminates safe from unsafe behavior.
7. Scale with a query, fuzzer, generator, or state exploration only after the
   oracle and reachable configuration are credible.
8. Falsify high-ranked candidates early; preserve rejected patterns to improve
   later searches.
9. Trace every supported primitive through downstream consumers and run the
   mandatory boundary, semantic, sequence, composition, and closure passes.

Retain one unconstrained roaming pass. Pure checklist decomposition can miss
interactions that no single subsystem owner sees.

### Variant sequence

1. Reduce the seed to a mechanism-independent risk statement.
2. Confirm the seed with a vulnerable positive and patched or safe negative.
3. Search exact structural matches first.
4. Generalize one semantic dimension at a time: API, data type, transformation,
   control-flow shape, subsystem, language, or configuration.
5. Add a positive and negative fixture for every generalization.
6. Trace each match to attacker influence and impact; a matching syntax tree is
   only a lead.
7. Compare surviving candidates with the seed and check whether they are truly
   distinct.

When producing Semgrep or similar rules, require both vulnerable-positive and
safe-negative tests. Increase recall gradually; record which generalization
caused each new false positive.

### Invariant sequence

1. Define the allowed state machine and forbidden state.
2. Identify attacker-controlled actions and realistic starting states.
3. Enumerate boundary, reordering, repetition, interruption, and concurrency
   transitions.
4. Encode the narrowest executable or formal oracle.
5. Minimize a counterexample while preserving attacker reachability.
6. Re-run in a release-like build and from a clean state.
7. Mutate cross-function and cross-component sequences, then assert the global
   state after the outer operation, cleanup, or settlement completes.

### Differential sequence

1. Normalize inputs and environments on both sides.
2. Enumerate allowed differences before generating cases.
3. Compare structured security effects rather than only text output.
4. Repeat to rule out nondeterminism and resource noise.
5. Minimize the input and locate the first semantic divergence.
6. Demonstrate why the divergence crosses the threat model's security property.

### Validation sequence

1. Hide the original conclusion from the reproducer; provide raw input, target,
   revision, and claimed oracle.
2. Reconstruct the path and preconditions from source.
3. Reproduce in a clean release-like environment.
4. Try a corrected or negative-control target.
5. Record `validated` or `rejected` with the failing gate; do not broaden the
   conclusion beyond the candidate.

## Use fuzzing as an experiment, not a ritual

Before starting a coverage-guided campaign:

- select a threat-model-relevant entry point;
- confirm the harness reaches it with a seed;
- use the relevant sanitizers or semantic oracle;
- preserve production validation and initialization;
- choose release-like build flags and feature set;
- supply dictionaries, structured mutation, or state sequences when raw bytes
  cannot express meaningful inputs;
- retain crashing input, build command, logs, and minimized reproducer.

Reject crashes that depend on invalid harness use, impossible state, unsupported
configuration, resource exhaustion outside the contract, or instrumentation-only
behavior. A long campaign that cannot reach the relevant state is a harness
diagnosis, not evidence of safety.

## Track coverage as evidence vectors

For every dimension, list concrete items and one of `uninspected`, `inspected`,
`tested`, or `blocked`:

| Dimension | Example item | Strong evidence |
| --- | --- | --- |
| `source-read` | authorization middleware | Reviewed lines plus traced call sites |
| `attack-surface` | archive import endpoint | Entry point, parser, and effect mapped |
| `trust-boundary` | tenant ID to object lookup | Source-to-enforcement-to-sink trace |
| `state-invariant` | pending → approved transition | Executed transition and negative cases |
| `runtime-corpus` | protocol frame variants | Coverage artifact plus semantic oracle |
| `config-build` | default release with plugin enabled | Exact reproducible build and config |
| `historical-family` | post-validation length change | Seed abstraction and variant query |
| `falsification` | attacker cannot set path root | Negative experiment or source proof |
| `business-invariant` | assets cover claims across operations | Flow model plus exact before/after ledger |
| `consumer-propagation` | mutable rate reaches credit decision | Transitive consumer map plus strongest effect |
| `boundary-arithmetic` | value movement near quotient boundary | Exact-integer model and zero/coarse-unit cases |
| `external-semantics` | requested transfer equals received value | Interface matrix and measured semantic variants |
| `sequence-interleaving` | callback before state commitment | Reachable action matrix and final unwind oracle |
| `exploit-composition` | two primitives share an atomic path | Join graph plus combined or incompatible runs |
| `economic-closure` | attacker profit and system shortfall | Funding, fee, repayment, cleanup, and loss ledger |

Use coverage to find blind spots and choose the next hypothesis. Never use a
coverage vector to claim the absence of vulnerabilities.

## Pivot on information gain

Before repeating an experiment, state what new observation it can produce. Pivot
when any of these occurs:

- two attempts fail for the same harness or environment reason;
- the same hypothesis receives no new attacker-control, reachability, guard, or
  impact evidence;
- a tool reports many syntactic matches but validation rejects the same missing
  semantic condition;
- coverage grows while the relevant invariant or dangerous effect remains
  unreachable;
- the surface queue contains a higher-impact unresolved boundary.
- a valid primitive has untested consumers or a compatible join that can change
  profitability, authority, persistence, or severity.

Useful pivots change at least one of surface, abstraction, configuration, oracle,
or analysis family. Rewording the prompt is not a pivot.

## Split work without diluting outcomes

Give each independent agent one surface and one goal contract. Keep a shared,
append-only index of hypotheses and evidence paths, but avoid exposing a
hunter's conclusion to its independent validator. Use different model families
for validation when available because shared blind spots can correlate.

Do not let parallelism create several weak reports. A focused hunt may stop once
the requested finding count passes all gates. A broad audit must continue until
its component-by-lens baseline closes or its declared budget produces an honest
`budget-limited` result; report every validated issue found along the way.
