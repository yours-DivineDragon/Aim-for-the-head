# Protocol specification

## Units and accounts

Internal quote, margin, price, notional, PnL, and cumulative indices use 18-decimal fixed point unless a function explicitly names a token-native amount. Base position quantities are signed 18-decimal values. Each margin account is a 256-bit identifier whose high 160 bits encode its owner; the low 96 bits are an owner-local nonce. A delegate is scoped to one account.

Collateral deposits convert from token precision into wad precision. Withdrawals are allowed only when the account remains above initial margin after the transfer. Delayed vault withdrawals represent unencumbered-collateral flows; production routing is expected to apply the same clearing health policy before allowing a request.

## Markets and prices

A market configuration includes initial and maintenance ratios, a liquidation penalty, oracle freshness, a funding skew scale, and a concentration scale. Market identifiers are stable. Correlation is symmetric and expressed in signed basis points.

Price feeds follow the common round-data interface. Answers must be positive, fresh, and complete. Feed precision is normalized to 18 decimals. `observe` adds a deviation circuit breaker against the last accepted observation; read-only index valuation still checks validity and age.

An epoch settlement price represents the oracle value at its scheduled cutoff. Recording makes that market/epoch price immutable. A dated position is valued exactly once at the recorded price.

## Funding

For each market, funding growth accumulates the signed mark/index premium over elapsed time. The configured maximum rate is symmetric: neither positive nor negative accrual should exceed its magnitude. A position's funding payment is `base * (currentGrowth - checkpoint)`, rounded conservatively so splitting checkpoints cannot improve the payer's result. Funding is checkpointed before changing or zeroing the base.

Positive payment means the account pays funding and reduces cash; negative payment credits cash. Funding growth is market-global while checkpoints are position-local.

## Trading and PnL

Atomic portfolio executions apply all legs or revert. Buy limits cap the absolute-base-weighted execution price; sell limits floor it. Signed orders are domain-separated, expire at their deadline, and consume one account nonce.

Same-side increases use a base-weighted entry price. A reduction realizes PnL only for the closed base. A trade through zero realizes the old side at the execution price, and the residual opposite position takes that execution price as its new entry. Open interest measures outstanding absolute exposure and therefore increases or decreases with `abs(newBase) - abs(oldBase)`.

Account equity equals collateral plus realized cash plus each unique live position's unrealized PnL. Initial and maintenance requirements use the corresponding market ratio, a quadratic charge above the concentration scale, and sign-aware pair correlations. Risk-increasing covariance adds margin; genuine hedging covariance reduces it.

## Liquidation

Any account below maintenance may be frozen and auctioned market by market. The lot transfers distressed base at a Dutch price moving between registered discount endpoints. Bidders commit an account, quantity, price limit, salt, and bond, wait for the reveal delay, and then reveal once. A successful fill changes both distressed and bidder positions atomically and releases the associated bond. Unrevealed bids can be slashed after expiry.

Finalization is permitted when a lot is fully filled or its residual has been transferred to a defined backstop. Only then may the account be unfrozen. Negative post-liquidation equity enters the insurance waterfall.

## Insurance and loss waterfall

Insurance deposits mint shares pro rata to liquid net asset value. Auction bonds remain excluded from spendable deficit coverage until returned or slashed. Releasing a bond reconciles both its per-bond record and aggregate reserve; a slash becomes protocol-owned value.

Deficits consume unreserved liquid collateral first. Any uncovered amount becomes socialized loss. With open interest, the loss is added to a wad loss index; without open interest, it is held pending and allocated when exposure next becomes nonzero. Reported open interest must correspond to actual outstanding absolute exposure.

An external venue boundary accepts token-native input and output quantities. Callers and integrations are responsible for comparing minimum output in the output token's declared precision before recognizing normalized protocol value.

## Settlement lifecycle

Governance schedules an epoch with a future cutoff and a nonempty market set. After the cutoff, the coordinator records one cutoff-bound oracle value per market. Batch settlement freezes each account, checkpoints funding, realizes dated-market PnL, covers a deficit if needed, marks the account settled, then unfreezes it. Repeated batches skip accounts already processed. Governance closes the epoch when operational reconciliation is complete.
