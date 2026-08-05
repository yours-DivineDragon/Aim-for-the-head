# Deep pass: business invariants

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

Record both required coverage items with concrete models:

- `business-invariant/business-flow-and-state-machine-model`
- `business-invariant/asset-liability-conservation-ledger`
