# Deep business-logic and composition hunt

Use these passes to search for failures that remain invisible when every
function is reviewed in isolation. The objective is not to name more bug
classes. It is to reconstruct the system's intended economics and state
machine, then test whether individually valid operations compose into an
invalid global result.

## Contents

- [Build the business model](#build-the-business-model)
- [Trace mutable values through consumers](#trace-mutable-values-through-consumers)
- [Attack arithmetic obligations](#attack-arithmetic-obligations)
- [Differential-test external semantics](#differential-test-external-semantics)
- [Enumerate sequences and interleavings](#enumerate-sequences-and-interleavings)
- [Join primitives into composed exploits](#join-primitives-into-composed-exploits)
- [Close the economics and system impact](#close-the-economics-and-system-impact)
- [Preserve precision](#preserve-precision)
- [Record completion artifacts](#record-completion-artifacts)

## Build the business model

Create the model before treating source-local observations as findings.
Reconstruct it from code, tests, deployment configuration, and specifications;
mark every unverified intention as an assumption.

Inventory:

- actors, roles, capabilities, delegated authority, and identity domains;
- assets, liabilities, claims, shares, debt, reserves, limits, rewards, and
  other rights represented by state;
- entry points and state transitions, including initialization, pause,
  settlement, retry, cancellation, migration, and recovery;
- value sources and sinks, including direct transfers that bypass an intended
  entry point;
- external observations used in decisions, such as balances, prices, rates,
  timestamps, callbacks, messages, signatures, and database or API responses;
- funding available to an attacker, including temporary or atomic capital,
  credit, delegated approvals, batching, and repeated low-cost actions.

For each business operation, write a delta row:

| Operation | Attacker-controlled inputs | System debits | System credits | Liability/right change | External observation | Required invariant |
| --- | --- | --- | --- | --- | --- | --- |

Express invariants across the whole system. Examples include total assets
covering redeemable claims, debt reduction not exceeding assets received,
authorization applying to every effect field, and a state transition preserving
the conditions checked before it. Do not substitute a successful function call
or balanced local mapping for a global invariant.

## Trace mutable values through consumers

Every attacker-mutable value gets a propagation record:

1. List every writer, indirect writer, and external condition that changes it.
2. Bound its direction, magnitude, duration, and cost.
3. Find every direct consumer and continue transitively through conversions,
   caches, limits, eligibility checks, pricing, authorization, and settlement.
4. Record guards at the consumer, not only at the source.
5. Test the strongest credible consumer effect and state what remains untested.

Do this after validating a primitive as well as during mapping. A local
manipulation may be Low by itself and Critical when a downstream component
multiplies it, treats it as collateral, grants authority from it, or persists it
after normalization. One tested consumer does not close the source or surface.

Prefer a graph with nodes for state values/effects and labeled edges for
transformations. Flag:

- one mutable source feeding several security decisions;
- one decision multiplying or dividing two independently mutable values;
- a transient value consumed as though it were durable;
- a view/preview value reused as a security oracle;
- a local credit or receipt accepted by another component without independent
  validation.

## Attack arithmetic obligations

Classify each division or quantization by who must be favored. Derive the
required rounding direction from the obligation rather than copying the helper
used nearby. In particular, distinguish:

- value paid out from value charged;
- shares issued from shares burned;
- assets received from nominal assets requested;
- collateral credited from collateral actually locked;
- debt or liability extinguished from payment actually received.

Test exact integer boundaries, not only realistic-looking 18-decimal examples:

- zero, one, one unit below/above a quotient boundary, and maximum permitted
  values;
- zero and one unit of supply, assets, shares, debt, allowance, and reserve;
- coarse and mixed units, including 0, 1, 6, 8, and 18 decimals when the target
  does not enforce an allowlist;
- exchange rates below, equal to, and above one;
- direct balance changes, donations, burns, rebases, and supply changes;
- repetition until rounding dust becomes material or a zero-unit transition
  moves nonzero value.

Build a small exact-integer model or property test for preview/mutation pairs.
Assert both the caller delta and the system/other-user delta. Reject a boundary
only after the supported input domain and amplification paths have been tested;
do not dismiss it from the default fixture alone.

## Differential-test external semantics

Separate what an interface proves from what the integration merely assumes. A
successful call and a declared return type do not necessarily prove the exact
balance, fee, callback, freshness, ordering, or identity semantics expected by
the caller.

Create an interface-promise matrix:

| Dependency/action | Guaranteed by specification or allowlist | Assumed by caller | Observable before/after delta | Adversarial but supported variant |
| --- | --- | --- | --- | --- |

Where an action moves value or extinguishes a liability, measure the relevant
before/after state. Compare at least:

- nominal argument versus sender debit, recipient credit, and protocol balance
  delta;
- return value versus actual effect;
- cached total versus live balance;
- quoted/previewed amount versus the mutating operation;
- message parameters versus authenticated transport context;
- signed fields versus every effect field and replay domain;
- oracle answer versus decimals, round completion, timestamp, fallback source,
  and the consumer's required time horizon.

For token-like integrations, consider fees, rebases, hooks, missing/false return
values, decimal variation, and direct transfers only when the documented
allowlist or interface leaves them possible. For vault-like integrations, test
opposing rounding directions, unsolicited balances, supply extremes, and
whether a manipulable conversion is consumed as a price. Do not label every
variant a vulnerability; first prove it is supported or not excluded, then
prove a protected system delta.

## Enumerate sequences and interleavings

Treat every external interaction as a possible control transfer, including
calls to configured or apparently trusted contracts that can reach hooks or
unknown implementations.

At each interaction point:

1. Snapshot the checks already performed and the state not yet committed.
2. List every public action reachable before the outer operation finishes.
3. Build a callback matrix from the interaction to those actions.
4. Test same-function recursion, cross-function reentry, a second component,
   and a state-changing dependency.
5. Assert the final global state after the entire stack unwinds.

Also mutate ordinary action sequences: reorder, repeat, omit, interrupt,
front-run, back-run, batch, retry, use two identities/domains, transfer directly,
and perform several operations atomically. State-machine bugs often preserve
each function's local precondition while violating a precondition assumed by a
later transition.

## Join primitives into composed exploits

Do not end the search at a validated primitive. Create a primitive card for
every supported manipulation and meaningful rejected lead:

| Field | Record |
| --- | --- |
| Controlled variable/effect | Exact state or observation changed |
| Direction and magnitude | Increase, decrease, bypass, delay, duplicate |
| Lifetime | Same call, transaction, block, epoch, or persistent |
| Cost and funding | Capital, approvals, fees, gas, temporary liquidity |
| Consumers | Every component or decision that reads the result |
| Preconditions | Identity, state, configuration, timing, ordering |
| Normalization | What reverses or limits the effect |

Create edges between cards when their identities, assets, configuration,
ordering, and lifetimes are compatible. Prioritize joins that:

- multiply or exponentiate attacker-controlled terms;
- let one primitive satisfy another's otherwise uneconomic prerequisite;
- cross a component, trust, identity, or settlement boundary;
- turn availability or dust into extraction, unbacked credit, or authority;
- use temporary capital and finish before normalization;
- make an isolated negative-return action profitable.

Test pairwise joins first. Add a third link only when the graph shows a missing
funding, threshold, realization, or cleanup step. A report may mention separate
primitives, but a composed finding requires one feasible sequence and its final
oracle; never let prose combine evidence from executions that cannot coexist.

## Close the economics and system impact

For value-bearing paths, calculate three ledgers from the same clean execution:

1. attacker net value after principal, fees, repayments, locked capital, and
   recoverable positions;
2. protocol assets minus liabilities before and after normalization;
3. third-party or incumbent claim value before and after.

For non-financial systems, use the analogous closure: acquired authority,
persisted data, escaped isolation, or denied service after cleanup and retries.
The final oracle must survive the whole sequence, not only an intermediate
mispricing or inconsistent mapping.

When the goal asks for the highest-impact or Critical-preferred result, a lower
severity candidate does not finish the hunt until all mandatory consumer,
composition, and closure passes are complete. This is a contract property, not
permission to ignore the requested finding count or budget.

## Preserve precision

Keep the existing evidence gates. In addition:

- require an exact supported-semantic basis before introducing an adversarial
  dependency variant;
- change one claimed condition in the negative control;
- keep separate executions separate unless one composed execution proves the
  join;
- record capital, privileges, time, and configuration that the attacker cannot
  obtain;
- reject paths whose final net effect stays inside the attacker's legitimate
  rights;
- preserve failed joins and the exact incompatibility so they are not
  rediscovered as plausible prose;
- do not upgrade severity from composability alone—reproduce the combined
  system oracle.

## Record completion artifacts

Workflow version 2 requires these coverage dimensions and item names. Point
each tested record to a concrete map, matrix, model, trace, or ledger:

| Dimension | Required item |
| --- | --- |
| `business-invariant` | `business-flow-and-state-machine-model` |
| `business-invariant` | `asset-liability-conservation-ledger` |
| `consumer-propagation` | `mutable-value-to-downstream-consumer-map` |
| `boundary-arithmetic` | `rounding-unit-and-zero-boundaries` |
| `external-semantics` | `interface-promise-versus-runtime-delta-matrix` |
| `sequence-interleaving` | `callback-and-action-sequence-matrix` |
| `exploit-composition` | `primitive-join-graph` |
| `economic-closure` | `funding-repayment-profit-and-system-loss-ledger` |

If a pass is genuinely inapplicable, the evidence must show why under the
threat model; record the pass as tested, not silently absent. The state helper
will not allow a workflow-version-2 `validated` or `exhausted` outcome while any
required item is absent, blocked, merely inspected, or unsupported by an
artifact.
