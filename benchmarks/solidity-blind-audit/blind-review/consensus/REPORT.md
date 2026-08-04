# Blind consensus report

## Outcome

All 11 submitted candidates are **reproduced** and **in scope** under the frozen benchmark threat model. Final severities are 2 Critical, 5 High, 3 Medium, and 1 Low. No candidates meet the strict duplicate criterion.

| Candidate | Final status | Severity | Consensus impact boundary |
|---|---|---:|---|
| C-001 | reproduced | Critical | Reentrant callback over-borrows beyond collateral and can scale to market liquidity. |
| C-002 | reproduced | Critical | Unauthenticated remote application can create unbacked bridge credit. |
| C-003 | reproduced | High | Relayer can redirect the full signed transfer amount. |
| C-004 | reproduced | High | Four accepted raw encodings paid one authorization four times. |
| C-005 | reproduced | High | Any caller can seize both roles and all module-held assets; system-wide integration is not shown. |
| C-006 | reproduced | Medium | Global factor can be raised to 95%, but the reproduced loan retains positive spot equity. |
| C-007 | reproduced | Medium | Cross-chain nonce collision denies the second local credit; permanent remote stranding is unproven. |
| C-008 | reproduced | High | Manipulated fallback spot creates profitable undercollateralized borrowing during feed failure. |
| C-009 | reproduced | High | Stale positive feed enables debt twice the reproduction's current-value limit. |
| C-010 | reproduced | Medium | Cross-router replay doubles transfer, but needs two approved, nonce-aligned routers. |
| C-011 | reproduced | Low | Recoverable donation can transiently deny deposits without victim asset loss. |

## Methodology

The source manifest was independently recomputed over all 22 declared files before and after execution; no mismatches were found and the combined digest matched `9ac26ede…c926`. The supplied reviewer JSON hashes matched exactly. The ordinary suite passed 6/6.

Reviewer records were compared candidate by candidate across reproduction status, scope, demonstrated impact, severity, and duplicate clustering. There were no reproduction, scope, or clustering disagreements. Material differences concerned C-004 impact magnitude, C-005/C-006/C-010 severity, and limitation labels for C-006/C-007/C-009.

Every material difference received fresh-process execution coverage. A consensus-owned four-test boundary suite resolved C-004/C-005/C-006/C-010; submitted harnesses independently covered C-005/C-006/C-007/C-009/C-010. Agreement samples C-001, C-008, and C-011 also passed, spanning Critical, High, and Low outcomes. Decisions follow observed execution and the benchmark trust assumptions, not reviewer vote count.

Two direct attempts to run reviewer-owned added suites from their frozen relocated package paths failed before tests because their relative imports retained the original review-workspace layout. The failures are logged; they had no evidentiary bearing. Equivalent material boundaries were run successfully from `consensus-output/checks`.

## Disagreement resolutions

| Candidate | Difference | Resolution |
|---|---|---|
| C-004 | Twofold vs fourfold raw-signature amplification | Four distinct encodings were accepted; 20e18 authorization paid 80e18. |
| C-005 | Critical vs High | High: full module compromise is direct, but system-wide downstream value is not modeled. |
| C-006 | Impact label; Medium vs High | Supported with limitation, Medium: guardian buffer is bypassed, yet 949e18 debt remained below 1,000e18 current collateral value. |
| C-007 | Impact/prerequisite support labels | Local denial reproduced; source-side permanence and nonce control remain unproven. |
| C-009 | Impact support label | Supported with the explicit pool-as-current-value comparator limitation. |
| C-010 | High vs Medium | Medium: direct extra transfer, conditioned on multiple approved routers with aligned nonces. |

## Duplicate analysis

No final duplicate clusters were formed. C-002/C-007 differ on sender authentication versus nonce-domain separation; C-003/C-010 differ on recipient versus verifier-domain binding; C-008/C-009 differ on fallback manipulation versus primary-feed freshness. Each pair requires materially different remediation.

All raw outputs, commands, exits, and input checksums are referenced from `consensus.json`.

