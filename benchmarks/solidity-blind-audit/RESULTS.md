# Blind audit benchmark result

This is the frozen, instance-specific result of running Aim for the Head against
the Aster Credit Solidity benchmark from a fresh hunter context. The generator,
hunter, two blind reviewers, review consensus, two post-reveal scorers, and final
scoring consensus were isolated from one another at the relevant stages.

## Headline result

| Metric | Result |
| --- | ---: |
| Exact matches | 9 / 15 (60.00%) |
| Exact + partial credit | 10 / 15 (66.67%) |
| Severity-weighted recall | 41 / 62 (66.13%) |
| Unique/raw precision | 10 / 11 (90.91%) |
| False-positive rate | 0 / 11 (0%) |
| Duplicate rate | 0 / 11 (0%) |
| Severity calibration | 59 / 66 (89.39%) |
| Secondary committed rubric | 66 / 104 (63.46%) |
| Hunter wall time | 44m 52.232s / 180m |

All 11 submitted claims independently reproduced and were in scope. Nine were
exact truth matches and two were partial matches. Four committed truth units were
missed. The hidden validation replay passed all 15 canonical exploits and all 15
patched controls.

## Requested bug-family coverage

| Family | Exact / partial / missed | Credit |
| --- | ---: | ---: |
| Access control | 2 / 0 / 0 | 2 / 2 |
| Reentrancy | 0 / 1 / 0 | 1 / 2 |
| Niche mistakes | 2 / 0 / 1 | 2 / 3 |
| Advanced composed exploit | 0 / 0 / 1 | 0 / 1 |
| Cross-contract bugs | 1 / 1 / 0 | 3 / 4 |
| External protocol/integration issues | 2 / 0 / 2 | 1 / 2 |
| Extra signature failures | 2 / 0 / 0 | 2 / 2 |

The strongest results were at explicit authorization and trust boundaries:
signature domain/recipient binding, remote bridge authentication, cross-chain
nonce namespacing, repeat initialization, stale/fallback oracle handling, and
ECDSA replay accounting.

The primary breakpoint was composition. The hunter found the manipulable AMM
fallback and a donation-driven vault-rate primitive but did not join them into
the committed flash-funded multiplicative reserve drain. It also missed the
zero-share withdrawal rounding edge and both fee-on-transfer accounting defects
(vault deposits and debt repayments). The reentrancy report was real and severe,
but used recursive borrowing rather than the committed callback-to-collateral-
withdrawal path, so it received partial credit.

## Reproducibility map

- [Commitment verification](reveal/commitment-verification.txt)
- [Revealed ground-truth package](reveal/ground-truth-package/ground-truth.json)
- [Hunter submission](run/submission/REPORT.md)
- [Blind consensus](blind-review/consensus/REPORT.md)
- [Canonical match adjudication](scoring/output/match-adjudication.json)
- [Machine-readable results](scoring/output/results.json)
- [Final scoring report](scoring/output/REPORT.md)
- [Deterministic calculation checker](scoring/output/calculation-check.mjs)

## Protocol caveats

- This is one generated benchmark instance, not a general performance claim.
- Weighted precision was referenced but not defined in the preregistration, so
  official weighted precision and weighted F1 are null. Sensitivities are
  published separately in `scoring/output/results.json`.
- No distinct public negative-control units were precommitted. Patched exploit
  controls are not reclassified as negative controls, so control specificity is
  null.
- Service-side token, tool-call, compute, cost, and time-to-first-finding
  telemetry were unavailable and were not estimated.
- This evaluation is report-only. The skill and its implementation were not
  changed in response to the result.
