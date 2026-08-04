# Explicit invariant catalog and executable oracles

This catalog expands the 22 public invariants into observable system assertions and direct/transitive consumers. `I-01` through `I-22` correspond to `INVARIANTS.md` in order.

| ID | Assertion/oracle | Enforcement points | Consumers and final impact if violated |
| --- | --- | --- | --- |
| I-01 | every config mutation by a non-governor reverts and state is unchanged | all config setters, nomination/acceptance | all pricing, risk, roles, lifecycle, and assets |
| I-02 | owner bits are immutable; delegate for account A is unauthorized for sibling B | vault owner/delegate and Clearing trade/withdraw | victim collateral/positions/nonces |
| I-03 | account/share/bond wad credit ≤ actual recipient token-balance increase | all inbound transfers and conversions | equity/leverage; NAV/redemption; reserve solvency |
| I-04 | withdrawal final state is healthy/not frozen; callback sees request consumed or otherwise cannot reuse it | both vault and Clearing withdrawal routes; CEI/reentrancy guard | protocol insolvency and account freeze integrity |
| I-05 | accepted oracle answer is positive, complete, nonfuture/fresh, and exactly wad at any supported declared precision | feed configuration/read | all equity, risk, liquidation, funding, settlement |
| I-06 | recorded epoch price is immutable and its round timestamp is at/before or explicitly bound to cutoff | epoch/oracle round selection | exact dated PnL, deficits, insurance |
| I-07 | `growthDelta` is time-proportional and `abs(rate)≤cap`; splitting checkpoints never reduces payer debit | funding accrue/checkpoint rounding | cash/equity/withdraw/liquidation |
| I-08 | funding payment uses base immediately before every trade/liquidation/settlement base change | Clearing apply trade; auction; epoch | cash conservation and settlement PnL |
| I-09 | same-side basis is base-weighted; cross-zero residual basis equals crossing execution price | Clearing trade accounting | unrealized/realized PnL and equity |
| I-10 | skew delta equals signed base delta; OI after = OI before + abs(new) − abs(old) | trade/auction/settlement | insurance loss denominator and market exposure |
| I-11 | each account-market occurs at most once in active list; zero delta never adds exposure | active-list maintenance | equity/risk double-count and gas/liveness |
| I-12 | equity sums collateral+cash+each unique live unrealized PnL once; realized move not also unrealized | accountEquity/position basis/list | health, liquidation, withdrawal, deficit |
| I-13 | requirement is standalone monotone; concentration is nonlinear; pair sign is correlation×exposure-sign | PortfolioRisk/correlation | leverage/withdraw/liquidation |
| I-14 | portfolio limit uses sum(abs(base)×price)/sum(abs(base)); transaction is atomic | router and Clearing reverts | slippage/value transfer |
| I-15 | each 64-bit nonce is an independent owner-controlled bit and is consumed at most once | nonce addressing/cancel/match | signed-order replay or permanent order DoS |
| I-16 | any active liquidation or settlement freeze blocks both trade and withdrawal until that reason completes | shared/account lifecycle and both withdrawal routes | residual escape, state corruption, liveness |
| I-17 | finalization requires zero lot residual or a concrete backstop transfer; fill+backstop=original | auction state and callbacks | abandoned risk and deficit |
| I-18 | sum live `reservedBond` equals `auctionReserved`; terminal key amount is fully returned+slashed | insurance bond reserve/release | reserve spendability, returns, coverage/redeem liveness |
| I-19 | redeemable NAV excludes live reservations and cannot exceed liquid unreserved assets | totalAssets/deposit/redeem | theft of bidder bonds / share insolvency |
| I-20 | coverage uses unreserved received assets; uncovered loss is pending at zero real OI or indexed at real OI | cover/report OI/CH exposure | loss dropped or misallocated |
| I-21 | venue output native amount is converted with tokenOut precision and backed by actual received delta before min/credit | rebalance/venue integration | phantom NAV or minimum bypass |
| I-22 | account-market-epoch settlement executes once after final funding checkpoint at one immutable price | epoch batch/order/markers | funding omission/double PnL/deficit corruption |

Additional global oracles:

- I-23 lifecycle freeze reasons compose monotonically: completing one state machine cannot clear another's freeze.
- I-24 privileged callbacks bind every effect field to an authorized actor/account and postcondition.
- I-25 after any composed value path, attacker net gain, protocol assets-minus-liabilities, and incumbent/bidder claim deltas reconcile after fees, repayment, normalization, finalization, and retries.
- I-26 no explicit narrowing cast of price, growth, PnL, base, nonce address, or timestamp silently changes a supported-domain value used by a security consumer.

