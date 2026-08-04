# C-006 — Any user can raise the global collateral factor

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

`setCollateralFactor` caps the value but rejects a non-guardian only when the new value is less than or equal to the current value (`contracts/LendingMarket.sol:89-93`). Consequently any account may increase the global risk parameter. `borrowLimit` consumes it directly (`74-75`) and `borrow` transfers against that limit (`53-59`).

## Attacker, prerequisites, and sequence

An ordinary borrower deposits 1,000 AST collateral under the default 7,500 bps factor. A 950 aUSD borrow first rejects against the 750 limit. The same borrower calls `setCollateralFactor(9500)` despite not being guardian, then borrows 949 aUSD successfully.

## Impact and severity

The attacker increases a trusted global risk control and extracts 949 aUSD, 199 above the configured limit, while all users inherit the weakened 95% setting. **Severity: High (unreviewed)** because permissionless risk reconfiguration creates immediate excess borrowing and materially erodes the protocol's solvency buffer.

## Reproduction

- Command: `bash run/evidence/C-006/reproduce.sh`; corrected `discovery.log` and fresh-process `reproduction.log` exit 0.
- Negative: the same non-guardian is rejected when lowering the factor to 7,000, proving the comparison direction is the discriminator.
- `harness-failure.log` preserves an initial exit-1 local estimate-cache artifact caused by reusing identical pre/post borrow calldata. The final harness changes only the successful post-change amount to 949; production remains unchanged.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | ordinary borrower directly calls public setter and borrow | pass |
| Defense / impact | inverted conditional; factor/debt/balance state oracle | pass |
| Realistic + safe/release reproduction | default integrated 18-decimal deployment | pass |
| Negative control | unauthorized decrease rejects | pass |
| Independent reproduction | `reproduction.log` | pass |

