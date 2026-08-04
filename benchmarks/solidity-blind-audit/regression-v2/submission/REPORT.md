# Workflow-v2 same-target regression submission

## Status and interpretation

Workflow v2 validates 15 distinct candidates on the unchanged Aster Credit
source manifest. All candidate severities are internal technical assessments.
This run occurred after the benchmark truth was revealed, so it is a
**revealed regression**, not a blind hunt, novelty claim, or unbiased estimate
of performance on unseen code.

The purpose is narrower and still useful: determine whether the generalized
deep-hunt intervention can force complete target-specific reasoning and preserve
the prior zero-unsupported-claim boundary on the exact benchmark that exposed
the weaknesses.

## Candidate census

| ID | Severity | Candidate | Measured final oracle |
| --- | --- | --- | --- |
| R2-01 | Critical | Compound pool-spot and vault-rate amplification | flash principal + fee repaid; attacker +49,950 stable; market -150,000 |
| R2-02 | High | Instantaneous fallback reserve ratio | same-block pool movement reaches lending capacity |
| R2-03 | Medium | Vault donation reaches posted collateral | limit 75 -> ~143.18 with unchanged shares |
| R2-04 | High | Borrow callback exits collateral before debt write | 500 debt and stable; zero local collateral; all shares recovered |
| R2-05 | High | Public collateral-factor increase | non-guardian raises factor to 9,500 bps |
| R2-06 | Medium | Withdrawal rounds required shares down | zero-share caller gains one coarse asset unit |
| R2-07 | High | Deposit trusts nominal token amount | attacker +9; incumbent redeemable value -9 |
| R2-08 | High | Transfer permit lacks domain | identical signature spends at two routers |
| R2-09 | High | Transfer permit omits recipient | relayer redirects signed amount |
| R2-10 | Critical | Bridge ignores remote application sender | 1,000 fabricated collateral supports 750 stable borrow |
| R2-11 | Medium | Bridge nonce omits source chain | valid equal nonce on second chain is blocked |
| R2-12 | High | Strategy can be reinitialized | attacker seizes roles and drains module |
| R2-13 | High | Oracle accepts expired positive round | stale $2 value permits 1,500 versus current 750 |
| R2-14 | High | Repayment trusts nominal token amount | debt zero while reserve remains short 5 |
| R2-15 | High | Replay key hashes malleable signature bytes | one reward payload pays twice |

Machine-readable source locations, roots, sequences, impacts, controls, and
evidence paths are in `regression-v2/submission/candidates.json`.

## Deep-search artifacts

The run makes the reasoning products durable rather than leaving them in an
ephemeral transcript:

- business-flow/state-machine and asset/liability conservation models;
- mutable-value-to-consumer propagation map;
- rounding, unit, and zero-boundary matrix;
- interface-promise versus runtime-delta matrix;
- callback/action interleaving matrix;
- primitive join graph;
- funding, repayment, profit, and system-loss ledger.

Those artifacts are under `regression-v2/maps/`. The terminal goal state proves
that each mandatory item was completed before the run was finalized.

## Execution evidence

`regression-v2/scripts/run-regression.mjs` verifies the frozen 22-file source
manifest, runs the ordinary compile/test suite, reruns nine retained exact
packets, and executes the six new positive/control pairs twice in independent
fresh Node processes. The final run passed 13 commands; the ordinary suite was
6/6, retained packets were 18/18, and the two deep runs were 12/12 each.

The optional Ganache µWS binary does not match Node 24, so Ganache uses its
supported JavaScript fallback. This affects speed only; all state and economic
oracles pass in both fresh processes.

## Precision boundary

Every candidate requires attacker control, public reachability, guard analysis,
release-like reproduction, a matched negative control, an independent repeat,
downstream impact, and composition review. Token-semantic claims require
measured balance/accounting divergence under an ABI-compatible variant; generic
“nonstandard token” warnings do not count. Composite claims require one
compatible execution that closes funding, repayment, profit, and system loss.
