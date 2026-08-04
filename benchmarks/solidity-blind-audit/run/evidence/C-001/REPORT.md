# C-001 — Borrow callback reentrancy finalizes debt after value transfer

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

`LendingMarket.borrow` checks health against the current debt, transfers stable, and invokes attacker-controlled receiver code before recording the new debt (`contracts/LendingMarket.sol:53-59`; health predicate at `106-108`). A nested call therefore observes the unchanged debt and independently passes the same limit.

## Attacker, prerequisites, and sequence

An ordinary borrower needs legitimate collateral and may choose a contract receiver plus nonempty callback data; no trusted role or token behavior is required. The clean proof deposits 1,000 AST of vault shares for the callback contract, establishing a 750 aUSD limit, and funds the market normally. The callback contract calls `borrow(750, self, data)`; after the first 750 transfer, `onBorrow` reenters `borrow(750, self, empty)`. Both health checks see debt zero. Nested and outer frames then each add 750 debt.

## Impact and severity

The final debt and attacker stable balance are both 1,500 aUSD while the borrow limit remains 750. Repeating the same nesting can scale to available market liquidity. **Severity: Critical (unreviewed)** because an untrusted collateral borrower can create unbacked debt and extract lending liquidity without privileged access.

## Reproduction

- Command: `bash run/evidence/C-001/reproduce.sh`.
- Environment: Node 24.14.0, solc-js 0.8.30 optimizer 200/EVM Paris, ethers 6.15.0, Ganache 7.9.2 Shanghai/chain 31337.
- Discovery: `discovery.log`, exit 0. Fresh-process reproduction: `reproduction.log`, exit 0.
- Positive oracle: limit `750e18`, debt/balance `1500e18`.
- Negative: identical setup with empty callback data borrows once; debt/balance equal the `750e18` limit.
- Production Solidity is unmodified; only the callback harness is an additional compiled source. Chains are in-memory and require no cleanup.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | `repro.test.mjs`, `discovery.log`; supported `IBorrowCallback` path | pass |
| Defense / impact | source lines above; final debt exceeds asserted limit | pass |
| Realistic + safe/release reproduction | optimized repository compiler and honest configured tokens on clean Ganache | pass |
| Negative control | no-callback test in both logs | pass |
| Independent reproduction | separate Node process in `reproduction.log` | pass |

