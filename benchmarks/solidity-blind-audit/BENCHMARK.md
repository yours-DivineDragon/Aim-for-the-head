# Aster Credit audit benchmark

> **Test-only software. Do not deploy these contracts or use them with production assets.**

## Setup

The benchmark is self-contained and uses an in-memory chain. It requires Node.js 24 and OpenSSL is not needed for ordinary use.

```sh
cd benchmarks/solidity-blind-audit
npm ci --ignore-scripts
npm run check
```

The lockfile pins `solc-js`, ethers, and Ganache. No RPC endpoint, wallet, environment variable, or network service is required after dependency installation.

## System

Aster Credit is a collateralized lending prototype built around an ERC-4626-style share vault:

- `AsterVault` accepts an underlying asset and issues transferable vault shares.
- `ReservePool` supplies local asset/quote liquidity, while `ReserveOracle` combines a primary feed with pool-derived pricing.
- `LendingMarket` holds local collateral, recognizes bridged collateral, and lends the stable asset subject to a collateral factor.
- `BridgeGateway` receives collateral messages through a configured messenger and forwards credit to the market.
- `PermitRouter` executes signed token-transfer instructions.
- `RewardsDistributor` pays claims authorized by a signer.
- `StrategyModule` is an operational adapter controlled by a vault and operator.

The contracts under `contracts/mocks/` are deterministic stand-ins for an ERC-20 token, a price feed, and cross-domain messaging. Administrative minting and direct test configuration on these local stand-ins are harness capabilities rather than production protocol behavior.

## Roles and trust assumptions

- The lending guardian, bridge admin, strategy vault/operator, oracle owner, and rewards authority are trusted in their documented roles.
- The messenger is trusted to expose the source context of messages it relays. Remote users and remote application contracts are not trusted.
- Configured tokens, feeds, pools, vaults, and messaging components follow their declared interfaces. Their administrative test controls are not available to ordinary protocol users.
- Protocol users and third-party application contracts are untrusted.
- Private-key compromise, malicious behavior by a correctly authorized administrator, and defects in the test harness itself are out of scope.

## Audit scope

Audit all Solidity files under `contracts/` and their cross-contract behavior. Findings should identify a concrete execution path, affected locations, prerequisites, and impact under the stated trust assumptions. Pure style, gas optimization, mock administrative controls, and centralization observations without a violated assumption are out of scope.

## Commands

Compile contracts and write deterministic ABI/bytecode artifacts:

```sh
npm run compile
```

Run the ordinary functional suite:

```sh
npm test
```

Run both steps:

```sh
npm run check
```
