# Deep-hunt pass index

Load the pass needed for the current investigation phase instead of loading the
entire deep-hunt protocol up front:

| Pass | Load when | Required coverage item |
| --- | --- | --- |
| [Business invariants](deep-business-invariants.md) | Mapping actors, value, authority, liabilities, or state transitions | `business-invariant/business-flow-and-state-machine-model` and `business-invariant/asset-liability-conservation-ledger` |
| [Consumer propagation](deep-consumer-propagation.md) | A value, observation, permission, or effect is attacker-mutable | `consumer-propagation/mutable-value-to-downstream-consumer-map` |
| [Boundary arithmetic](deep-boundary-arithmetic.md) | Quantization, conversion, decimals, shares, debt, or rounding matter | `boundary-arithmetic/rounding-unit-and-zero-boundaries` |
| [External semantics](deep-external-semantics.md) | A protocol depends on tokens, vaults, messages, signatures, oracles, APIs, or other integrations | `external-semantics/interface-promise-versus-runtime-delta-matrix` |
| [Sequences and interleavings](deep-sequence-interleaving.md) | External control transfer, callbacks, batching, retries, or state-machine order matter | `sequence-interleaving/callback-and-action-sequence-matrix` |
| [Exploit composition](deep-exploit-composition.md) | Escalating a primitive or checking whether individually limited effects join | `exploit-composition/primitive-join-graph` |
| [Economic and system closure](deep-economic-closure.md) | Establishing final impact, severity, profit, loss, authority, isolation, or availability | `economic-closure/funding-repayment-profit-and-system-loss-ledger` |

The objective is not to name more bug classes. Reconstruct intended economics
and state transitions, then test whether individually valid operations compose
into an invalid global result. A workflow-version-2+ `validated` or `exhausted`
outcome must eventually complete every registered item, but the passes should be
loaded and executed when their evidence becomes relevant.

These passes establish candidate and interaction depth. For a workflow-v3
`broad-audit`, they do not replace the scope-wide component matrix in
[`breadth-first-audit.md`](breadth-first-audit.md); both must close.

## Preserve precision across passes

- Require an exact supported-semantic basis before introducing an adversarial
  dependency variant.
- Change one claimed condition in the negative control.
- Keep separate executions separate unless one composed execution proves the
  join.
- Record capital, privileges, time, and configuration the attacker cannot
  obtain.
- Reject paths whose final net effect stays inside the attacker's legitimate
  rights.
- Preserve failed joins and their exact incompatibility.
- Do not upgrade severity from composability alone; reproduce the combined
  system oracle.

If a pass is genuinely inapplicable, its evidence must show why under the threat
model. Record it as tested rather than silently omitting it. The state helper
rejects missing, blocked, merely inspected, or artifact-free mandatory items.
