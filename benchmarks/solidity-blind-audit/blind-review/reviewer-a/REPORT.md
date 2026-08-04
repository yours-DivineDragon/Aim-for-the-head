# Reviewer A reproduction report

Target commit: `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`  
Source digest: `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`

## Attestation

The independently recomputed 22-file manifest matched every declared SHA-256 and the combined digest. The ordinary `npm test` suite passed all 6 tests. Review remained inside the assigned isolated workspace, used no network or human assistance, did not inspect forbidden sources or Git history, and did not modify frozen inputs.

Each submitted reproduction ran in a fresh Node process. Every harness included a positive path and a sanity/negative control; all 22 submitted tests passed. A reviewer-only harness added three discriminating checks: C-001 scaled to eight nested borrow frames, C-005 exercised seized arbitrary-call authority, and C-006 confirmed that the reproduced 95% LTV remained nominally collateralized at the static price.

## Results

| ID | Status | Root cause / path / impact | Scope | Severity | Control |
|---|---|---|---|---|---|
| C-001 | reproduced | supported | in scope | critical | passed |
| C-002 | reproduced | supported | in scope | critical | passed |
| C-003 | reproduced | supported | in scope | high | passed |
| C-004 | reproduced | supported | in scope | high | passed |
| C-005 | reproduced | supported | in scope | critical | passed |
| C-006 | reproduced | supported, with no immediate static-price shortfall shown | in scope | medium | passed |
| C-007 | reproduced | destination credit denial supported; source-side lock/retry behavior unavailable | in scope | medium | passed |
| C-008 | reproduced | supported | in scope | high | passed |
| C-009 | reproduced | supported, conditional on stale overvaluation | in scope | high | passed |
| C-010 | reproduced | supported, conditional on dual approvals and aligned nonces | in scope | high | passed |
| C-011 | reproduced | supported | in scope | low | passed |

Status totals: 11 reproduced, 0 not reproduced, 0 inconclusive, 0 out of scope. Severity totals: 3 critical, 5 high, 2 medium, 1 low.

## Adjudication notes

- C-001 is Critical because the stale-debt window repeats across arbitrary callback depth and can scale to market liquidity.
- C-002 is Critical because an honest messenger can relay authentic context from any untrusted remote application, yet the gateway never authenticates that application before creating collateral.
- C-005 is Critical because role overwrite grants both immediate asset-sweep power and unrestricted module call authority.
- C-006 is Medium rather than the submitted unreviewed High: it bypasses a guardian risk control and reduces the solvency buffer to 5%, but the reproduced debt remains below fair collateral value at the unchanged price.
- C-007 is Medium because the destination-side denial is concrete, while permanent source-side stranding depends on remote contracts and retry semantics absent from the frozen target.

No duplicates were identified. Candidates that share a component require materially different fixes: sender authentication versus nonce namespacing (C-002/C-007), recipient binding versus domain separation (C-003/C-010), and safe fallback design versus feed freshness checks (C-008/C-009).

Machine-readable per-claim assessments and command outcomes are in `reviewer-a.json`; raw execution outputs are under `logs/`.
