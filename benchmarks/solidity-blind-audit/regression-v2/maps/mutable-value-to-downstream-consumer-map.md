# Mutable-value to downstream-consumer map

| Mutable producer | Attacker action | Immediate value | Downstream consumers | Final decision/impact | Tested join |
| --- | --- | --- | --- | --- | --- |
| `ReservePool.reserveAsset/reserveQuote` | swap quote through shallow pool | `spotPrice` | `ReserveOracle.price` -> `LendingMarket.collateralValue` -> `borrowLimit` | transiently enlarged borrow | joined with vault rate |
| `AsterVault.totalAssets` | direct underlying transfer | `convertToAssets(shares)` | `LendingMarket.collateralValue` -> `borrowLimit` | existing posted shares gain capacity | standalone and compound |
| feed round fields | leave a positive but expired answer | normalized price | oracle -> market | stale collateral value permits excess borrow | retained exact regression |
| `collateralFactorBps` | public caller increases factor | `borrowLimit` multiplier | `_healthy` in borrow/withdraw | system-wide risk expansion | retained exact regression |
| message context sender | honest messenger exposes unbound application sender | bridge credit authorization | market `bridgeCollateral` | fabricated borrow capacity | retained exact regression |
| raw ECDSA bytes | replace low-s with equivalent high-s encoding | replay key changes, signer unchanged | reward transfer | repeated payout | retained exact regression |
| nominal token amount | fee-bearing `transferFrom` | actual received amount differs | vault shares or market debt | dilution or reserve deficit | two deep regressions |

## Propagation rule applied

A producer was not marked complete when its local output changed. Each path was
followed until a user-visible authorization, solvency, accounting, or payout
decision. This is why direct vault donation is reported as a lending-integration
finding rather than only a vault availability observation, and why both mutable
rates were joined into the compound market drain.
