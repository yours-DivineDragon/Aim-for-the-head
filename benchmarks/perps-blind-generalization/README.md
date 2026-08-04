# Meridian Clearing

Meridian Clearing is a deterministic local implementation of a cross-margin perpetual-futures clearing protocol. It is designed as a serious Solidity audit target: markets share collateral at the account level, positions accrue signed funding, portfolio risk uses correlations and nonlinear concentration charges, unhealthy accounts move through commit/reveal liquidation auctions, and dated markets close through explicit settlement epochs. An insurance share pool receives protocol value, reserves auction bonds, covers deficits, and records socialized loss when liquid assets are insufficient.

The repository is self-contained and does not contact an RPC service or live venue. Mocks model the semantic boundaries of ERC-20 collateral, a round-based price feed, and an external swap venue.

## Quick start

```sh
npm run install:deterministic
npm run check
npm run manifest:verify
npm run seal:verify
```

The pinned suite targets Node 24 and compiles with `solc-js 0.8.30` for the Shanghai EVM. Ganache may print a native µWS compatibility warning on Node 24 and then use its deterministic JavaScript fallback; this does not affect results.

## Components

- `MarketCatalog` holds live market risk configuration and pairwise correlations.
- `OracleHub` normalizes round-based feed prices and records immutable epoch settlement values.
- `FundingEngine` accrues a signed cumulative funding-growth index from mark/index premium.
- `MarginVault` custodies the collateral asset and owns account/delegate/withdrawal state.
- `ClearingHouse` maintains positions, entry bases, realized PnL, funding checkpoints, account equity, and portfolio margin.
- `ExecutionRouter` executes atomic multi-leg portfolios and EIP-712 matcher orders.
- `LiquidationAuction` runs committed Dutch-auction transfers for distressed positions.
- `InsuranceFund` issues proportional shares, reserves bidder bonds, covers deficits, and tracks loss allocation.
- `EpochSettlement` schedules cutoffs, records prices, settles accounts in batches, and closes epochs.

See `SPECIFICATION.md`, `INVARIANTS.md`, and `THREAT_SURFACE.md` for intended semantics. Benchmark process and integrity rules are in `BENCHMARK_CONTRACT.md`.
