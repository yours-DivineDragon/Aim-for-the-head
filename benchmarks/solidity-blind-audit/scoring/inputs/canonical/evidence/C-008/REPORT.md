# C-008 — Manipulable reserve spot price is trusted during feed fallback

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

When the primary feed answer is nonpositive, `ReserveOracle.price` directly returns `pool.spotPrice()` (`contracts/ReserveOracle.sol:17-20`). That value is the instantaneous reserve ratio (`contracts/ReservePool.sol:27-29`) after permissionless swaps (`43-71`), with no TWAP, delay, or manipulation bound. Lending immediately consumes it (`contracts/LendingMarket.sol:69-75`).

## Attacker, prerequisites, and sequence

Prerequisite: the honest primary feed is in the explicitly implemented nonpositive fallback state. A 10,000/10,000 honest pool and funded market use default 18-decimal tokens. An ordinary funded attacker swaps 10,000 aUSD into the pool, receives about 4,992.49 AST, raising spot price to about 3.994 aUSD/AST. They vault/deposit that AST and borrow the now-reported limit in the same sequence.

## Impact and severity

At a one-dollar unmanipulated reference, collateral supports about 3,744.37 aUSD, but the market issues about 14,955 aUSD. After spending the starting 10,000 stable on the swap, the attacker holds about 14,955 liquid stable and can default, a roughly 4,955 stable gain; debt exceeds safe backing by over 11,210. **Severity: High (unreviewed)** because a routine feed-fallback condition enables profitable bad debt, conditional on material manipulation capital/liquidity depth.

## Reproduction

- Command: `bash run/evidence/C-008/reproduce.sh`; both logs exit 0 in separate processes.
- Positive values and asset/debt/stable oracles are in `discovery.log` and `reproduction.log`.
- Negative: with a positive one-dollar primary feed, the identical pool manipulation leaves limit about 3,744 and a 10,000 borrow reverts with debt zero.
- Setup uses honest benchmark stand-ins; the attacker never calls mock feed controls.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | permissionless swap/deposit/borrow; feed fallback is a declared prerequisite | pass |
| Defense / impact | raw spot fallback; quantified net liquid gain and bad debt | pass |
| Realistic + safe/release reproduction | default tokens/pool/compiler with supported fallback branch | pass |
| Negative control | positive primary feed ignores same manipulation | pass |
| Independent reproduction | `reproduction.log` | pass |

