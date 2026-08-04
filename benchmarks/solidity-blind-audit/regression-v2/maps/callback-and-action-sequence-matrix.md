# Callback and action-sequence matrix

| Sequence | Pre-callback state | Callback/reentrant action | Post-return state | Oracle | Status |
| --- | --- | --- | --- | --- | --- |
| `borrow -> stable.transfer -> onBorrow -> debt += amount` | new debt absent; collateral posted | `withdrawCollateral(all)` sees debt 0 | debt nonzero, local collateral 0 | stable and all shares held by actor | vulnerable |
| `borrow` with empty data | health checked; collateral posted | none | debt nonzero, collateral remains | shares stay escrowed | negative control |
| flash loan -> pool swap -> vault donation -> borrow -> flash repay | temporary quote capital outstanding | two independent rates changed before borrow | lender repaid; market debt remains | attacker +49,950; market -150,000 | vulnerable composition |
| same flash sequence with positive primary feed | vault rate can move; pool spot ignored | borrow of 150,000 attempted | transaction reverts atomically | no debt or attacker stable | negative control |
| bridge finalize -> receiver credit | message context active | receiver updates bridge collateral | replay flag and credit persist | remote sender not compared | vulnerable origin binding |

## Ordering conclusion

The callback surface cannot be closed after testing only same-function nested
borrow. The decisive edge is callback-to-sibling-function: `borrow` exposes
stable value before recording debt, and `withdrawCollateral` reads the stale
debt during that window.
