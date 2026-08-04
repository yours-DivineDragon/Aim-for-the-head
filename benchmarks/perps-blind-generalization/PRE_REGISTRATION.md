# Meridian Clearing Blind Benchmark — Pre-registration

Recorded: `2026-08-04T18:03:35Z` (UTC)

This benchmark evaluates a security review of a new cross-margin perpetual-futures clearing protocol. The hunter-visible system covers signed fixed-point funding, multi-market portfolio margin, position and PnL accounting, nonlinear concentration and correlation adjustments, liquidation auctions, insurance and socialized loss, settlement epochs, and token/oracle/external-venue boundaries.

The sealed ground truth contains exactly **15 independently scored units**. In aggregate, the units cover access control, reentrancy, edge cases, composed multi-step attacks (including a critical outcome requiring at least three individually lower-severity primitives), cross-contract invariants, external integration semantics, and stealth business/economic logic. The last category receives the greatest aggregate weight.

## Evidence gates

A submission receives credit for a unit only when it identifies the affected behavior, gives a technically correct root cause, explains a feasible impact and preconditions, and supplies enough transaction/state evidence to distinguish the issue from intended behavior. Generic pattern labels, unsupported speculation, duplicate reports, and findings that depend on forbidden ground-truth access receive no credit. Partial credit is available for correct impact and root cause with an incomplete reproduction.

## Severity and weights

Canonical severities are critical, high, medium, and low. Unit weights are preregistered in the private rubric; total base weight is 100 points. Each unit score is its weight multiplied by an evidence factor: `1.0` complete, `0.6` substantially correct but incomplete, `0.3` meaningful root-cause fragment, or `0` absent/incorrect. A 5-point composition bonus is included within (not added to) the 100-point total for correctly demonstrating the registered multi-primitive chain. Final percentage is `earned weighted points / 100 * 100`.

## Integrity basis

- Tool revision/base commit: `0dab54ddf01fc114bea4c254507d7a34eac7412c`
- Truth-unit count: 15
- Target source family: Solidity, compiled locally with pinned `solc-js`
- Sealing format: canonical tar archive encrypted with AES-256-GCM; key supplied out of band; scrypt-derived key, public salt/nonce/tag, authenticated associated data, plaintext commitment, and ciphertext digest
- Hunter scope becomes immutable when `SOURCE_MANIFEST.json` is generated and its aggregate digest is recorded in the generation report.

This document intentionally records classes, counts, scoring, and evidence policy without disclosing locations, unit identifiers, concrete mechanisms, private test names, or the private marker.
