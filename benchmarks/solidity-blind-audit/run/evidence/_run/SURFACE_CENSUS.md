# Surface census

Target: frozen commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

All 14 Solidity files (709 lines) were read before activation. All external/public security-relevant entry points and cross-contract effects are queued below. Interfaces and mock stand-ins were inspected to establish supported call semantics; mock administrative controls remain excluded attacker primitives.

## Prioritized surfaces

| Rank | Surface | Attacker source | Dangerous effect / invariant | Initial guard inventory | Rank-lowering observation |
| --- | --- | --- | --- | --- | --- |
| 1 | Lending health and borrow callback (`LendingMarket`) | borrower chooses amount, receiver, callback data/code and nested calls | stable transfer and debt creation must remain collateral-backed | pause, `_healthy`, ERC-20 transfer, callback, debt write | finalized debt always reflects all nested transfers and cannot exceed limit |
| 2 | Bridge message authentication/replay (`BridgeGateway` → `LendingMarket`) | untrusted remote application chooses payload while honest messenger supplies source context | bridge credit and then stable borrowing | messenger caller, source chain, configured remote presence, nonce, bridge-only receiver | configured remote sender is actually enforced and replay identity cannot collide across valid domains |
| 3 | Signed asset actions (`PermitRouter`, `RewardsDistributor`, `SignatureCodec`) | relayer chooses public call fields and submits valid signature bytes | user transfer or reward payout must match exact signed intent and execute once | deadline/nonce or signature hash, recovered signer, payload fields, token transfer | every effect field/domain is signed and equivalent signatures share one replay identity |
| 4 | Strategy authority lifecycle (`StrategyModule`) | arbitrary caller chooses initialization roles and later role-gated effects | token sweep or arbitrary external call | nonzero configuration plus equality checks | initialization is one-time and bound to trusted deploy/setup authority before value arrives |
| 5 | Vault share accounting (`AsterVault`, `TokenMath`, share ERC-20) | depositor/withdrawer chooses assets, shares, owner/receiver and may directly transfer owned asset | underlying transfer must burn sufficient authorized shares | conversions, zero-share deposit guard, allowance, burn, transfer | rounding/donation behavior cannot extract third-party principal or yield after attacker-cost accounting |
| 6 | Pool/oracle price integrity (`ReservePool`, `ReserveOracle`) | liquidity provider/swapper chooses amounts and ordering; ordinary chain time may advance | price feeds health checks and stable lending | primary positive answer, decimal normalization, pool fallback, swap invariant math, minOut, reserve sync | stale/fallback/decimal/manipulation cases cannot produce realistic net protocol loss without trusted controls |
| 7 | Roaming cross-contract/accounting pass | combinations of public operations, token transfers, callbacks, bridging and pricing | asset conservation, authorization, isolation and availability | distributed across all components | no new root cause survives exact attacker-control and final-impact tests |

## Entry-point census

### AsterVault

- Views/conversions: `totalAssets`, `convertToShares`, `convertToAssets`, `previewDeposit`, `previewMint`, `previewWithdraw`, `previewRedeem`.
- Asset/share effects: `deposit`, ERC-4626-like `mint`, `withdraw`, `redeem`; inherited share `approve`, `transfer`, `transferFrom`.
- Excluded harness controls are explicitly overridden: inherited `mint(address,uint256)` and `burn(address,uint256)` revert.

### ReservePool / ReserveOracle

- Pool effects: `addLiquidity`, `swapExactInput`, permissionless `sync`; price views `spotPrice`, `quoteExactInput`.
- Oracle view: `price`; trusted owner-only `configure` and `transferOwnership` inspected for guards but trusted-role malice excluded.

### LendingMarket

- User effects: `depositCollateral`, `withdrawCollateral`, `borrow` with optional callback, `repay`; value views `collateralValue`, `borrowLimit`.
- Bridge effect: `onBridgeCredit` guarded by bridge address.
- Trusted guardian effects: `setBridge`, `setPaused`, `transferGuardianship`; `setCollateralFactor` has asymmetric public/guardian behavior and is separately traced.

### BridgeGateway

- Remote message effect: `finalizeCollateral` using messenger context.
- Trusted admin effects: `configureRemote`, `transferAdmin`.

### PermitRouter / RewardsDistributor

- Router effect: `executeTransfer`; state source `nonces` and constant type hash.
- Reward effects/views: `claim`, `claimPayload`; state source `usedSignatures`.
- Shared signature decoder: Ethereum message prefix, 65-byte `(r,s,v)` parsing, `ecrecover`.

### StrategyModule

- Lifecycle: public `initialize`.
- Privileged effects: operator `sweep`, vault `execute` arbitrary call.

### Interfaces, libraries, mocks

- `ProtocolInterfaces`: all external semantics checked, including messenger sender/chain and aggregator round metadata.
- `TokenMath`: checked multiplication, rounding direction, zero/divisor assumptions.
- `MockERC20`, `MockFeed`, `MockMessenger`: inspected for exact clean-chain behavior and realistic call sequencing; public administrative stand-in controls are not findings or attacker primitives.

## Coverage obligations

- Source read: every Solidity file and repository setup/test/build file inspected.
- Attack surfaces: all seven ranked surfaces require trace or runtime disposition.
- Trust boundaries: public/callback, bridge, signature, oracle, strategy roles, and vault ownership require explicit source-to-sink traces.
- State invariants: debt ordering, bridge authentication/replay, signed action uniqueness/intent, initialization, share conservation, price integrity.
- Runtime/config: ordinary optimized build and tests plus clean Ganache candidate packets.
- Falsification: each plausible lead must receive a condition-changing negative case; rounding/economic leads require net-value accounting.
- Historical family: history is isolation-forbidden; mechanism families are assessed from frozen source only and labeled blocked for external historical comparison.

