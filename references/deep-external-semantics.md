# Deep pass: external semantics

Separate what an interface proves from what an integration merely assumes. A
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
- quoted or previewed amount versus the mutating operation;
- message parameters versus authenticated transport context;
- signed fields versus every effect field and replay domain;
- oracle answer versus decimals, round completion, timestamp, fallback source,
  and the consumer's required time horizon.

For token-like integrations, consider fees, rebases, hooks, missing or false
return values, decimal variation, and direct transfers only when the documented
allowlist or interface leaves them possible. For vault-like integrations, test
opposing rounding directions, unsolicited balances, supply extremes, and
whether a manipulable conversion is consumed as a price. First prove a variant
is supported or not excluded, then prove a protected system delta.

Record `external-semantics/interface-promise-versus-runtime-delta-matrix` with
the contract promise, measured behavior, and discriminating control.
