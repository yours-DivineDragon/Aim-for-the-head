# Breadth-first audit profile

Use this profile when the user asks to audit, review, or find vulnerabilities in
an entire repository or multi-component scope. Use `focused-hunt` only for an
explicitly narrow property, candidate, surface, or requested finding count.

## Lock scope before analysis

Resolve scope authority in this order: the user's explicit boundaries; supplied
competition, engagement, or audit rules; a repository scope manifest; then a
clearly labeled production-source default. Inspect every supplied scope document
before selecting files. Do not silently reinterpret “current codebase” as a
competition scope or vice versa.

Record the authority, source documents, exact revision, target-relative include
patterns, and target-relative exclusions in `contract.json`. Use machine paths,
not prose descriptions. Freeze exact file bytes before activation:

```bash
python3 "<skill-root>/scripts/goal_state.py" scope \
  --dir .goal-hunt \
  --component src/ModuleA.sol \
  --component src/ModuleB.sol
```

The helper expands the include/exclude set, requires any explicit `--component`
list to match it exactly, writes `scope-manifest.json`, binds it to activation,
and rejects later source drift. Omit `--component` to freeze the expanded set
automatically. Start a new goal directory when scope or target bytes change.

## Choose the knowledge policy explicitly

Default broad audits to `knowledge_policy.mode=inventory`. Inventory local
reports, PoCs, verify tests, audit annotations, issue references, and prior
patches during mapping. Reproduce technically valid current vulnerabilities,
label their provenance, and report them; do not call them novel without a
separate novelty check.

Use `blind-novelty` only when the user explicitly requests independent discovery
or a benchmark requires it. Record the blindness basis, sequester answer-bearing
material, and perform a post-hunt known-material inventory. An exact duplicate
does not satisfy a novelty target, but it must remain visible as a known current
issue rather than disappearing from the audit result.

## Complete the baseline before deep convergence

Build an entry-point and critical-state inventory for every in-scope component.
Then close every component against each configured baseline lens:

| Lens | Minimum discriminating questions |
| --- | --- |
| `entry-points-and-privilege` | Enumerate public, callback, constructor, fallback, privileged, and inherited paths; verify guards and dangerous effects. |
| `known-material-and-provenance` | Search allowed reports, PoCs, verify tests, audit annotations, issues, and prior fixes; reproduce current issues and label provenance. |
| `zero-empty-one-and-extremes` | Test zero, empty, one unit, dust supply/liquidity, maxima, and terminal cleanup states. |
| `units-scaling-rounding-and-casts` | Trace dimensions, decimals, normalization, rounding beneficiary, casts, and mixed-unit configurations. |
| `external-calls-and-native-sentinels` | Test return/revert behavior, callbacks, native-asset sentinels, zero addresses, and interface/runtime differences. |
| `lifecycle-time-and-transition-boundaries` | Test first/last action, rollover, expiry, repeated sync, partial/full exit, pause/retry, and old-to-new period state. |
| `identity-domain-and-deterministic-collisions` | Bind every identity field; compare function variants, pools, chains, salts, selectors, and deterministic deployment domains. |
| `valuation-solvency-and-incentive-extremes` | Test zero-value collateral, liquidation incentives, midpoint/fallback pricing, debt socialization, and realizable value. |
| `cross-instance-and-shared-state-isolation` | Test two users, pools, vaults, wrappers, currencies, and instances sharing global or cached state. |

Do not mark a row complete because the file was read or another row found a bug.
Use `tested` for a discriminating source proof or execution. Use
`reasoned-not-applicable` only with evidence and a component-specific reason.
Record rows append-only:

```bash
python3 "<skill-root>/scripts/goal_state.py" baseline \
  --dir .goal-hunt \
  --component src/ModuleA.sol \
  --lens zero-empty-one-and-extremes \
  --status tested \
  --evidence .goal-hunt/artifacts/module-a-boundaries.log \
  --note "Executed zero, one-unit, dust-supply, and full-exit cases"
```

After the baseline, deepen the highest-risk open rows and candidate paths using
the normal consumer, sequence, composition, and economic-closure passes. A
finding closes only its candidate gates and the exact matrix rows its evidence
supports; it does not close its component, surface, or sibling lens.

## Stop without overstating coverage

For `focused-hunt`, `stop.policy=finding-count` may terminate after the requested
candidate count passes its gates. For `broad-audit`, require
`stop.policy=coverage-complete`; the helper rejects both `validated` and
`exhausted` outcomes until the full component-by-lens matrix closes. Report every
validated current issue encountered, including known/reproduced issues with
provenance. A completed baseline is bounded evidence of performed work, not a
claim that the codebase has no other vulnerabilities.
