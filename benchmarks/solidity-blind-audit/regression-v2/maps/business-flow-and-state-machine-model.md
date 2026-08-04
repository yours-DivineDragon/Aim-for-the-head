# Business-flow and state-machine model

This is a target-specific workflow-v2 hunt artifact. It was built from the
unchanged public Aster Credit sources before post-run truth adjudication.

## Value flows

| Flow | Entry | State/value transition | Security decision | Exit |
| --- | --- | --- | --- | --- |
| Vault deposit | `AsterVault.deposit` | caller assets -> vault balance; nominal assets -> receiver shares | pre-transfer `convertToShares(assets)` | share claim |
| Vault withdrawal | `AsterVault.withdraw` | owner shares burned; vault assets -> receiver | floor-rounded `convertToShares(assets)` | underlying value |
| Local collateral | `LendingMarket.depositCollateral` | user shares -> market; `localCollateral` rises | nonzero shares only | borrowing capacity |
| Borrow | `LendingMarket.borrow` | stable -> receiver; optional callback; debt rises last | health checked before transfer/callback | stable plus debt |
| Repayment | `LendingMarket.repay` | requested stable transfer; nominal debt falls | cap at recorded debt | reserve restoration |
| Price fallback | `ReserveOracle.price` | feed answer or pool reserve ratio | positive answer selects primary; otherwise spot | collateral valuation |
| Pool swap | `ReservePool.swapExactInput` | input received; output sent; reserves synchronized | balance deltas and `minOut` | changed spot price |
| Bridge credit | `BridgeGateway.finalizeCollateral` | message -> replay mark -> market credit | messenger, chain, configured remote, global nonce | synthetic collateral |
| Signed transfer | `PermitRouter.executeTransfer` | nonce increments; owner token -> chosen recipient | signature over owner/token/amount/nonce/deadline | token transfer |
| Reward claim | `RewardsDistributor.claim` | signature bytes marked; reward -> account | recovered authority and raw-signature replay key | reward transfer |
| Strategy authority | `StrategyModule.initialize` | vault/operator overwritten | nonzero addresses only | sweep/execute authority |

## State-machine obligations and tested violations

- Vault claim creation must follow assets actually received. The fee-token
  deposit regression violates this while its exact-delta control preserves it.
- A withdrawal must consume a positive sufficient claim. The 2:1, zero-decimal
  regression transfers one asset while burning zero shares.
- Borrowed value must remain backed after every callback and after stack unwind.
  The callback regression withdraws all collateral before debt is committed.
- Debt reduction must follow reserve value actually received. The fee-token
  repayment regression clears 50 debt while restoring only 45 stable.
- Valuation inputs must not be independently and atomically attacker-controlled.
  The compound regression joins reserve spot movement with vault-rate movement.
- Cross-domain credit must bind both chain and authenticated remote application;
  replay identity must include every relevant domain.
- Initialization must be a one-way transition. `StrategyModule.initialize`
  instead allows `initialized -> initialized` with new privileged identities.

## Evidence

Positive and matched control executions are captured in
`regression-v2/evidence/deep-regressions.log`; retained standalone findings are
captured in `regression-v2/evidence/retained-exact-regressions.log`.
