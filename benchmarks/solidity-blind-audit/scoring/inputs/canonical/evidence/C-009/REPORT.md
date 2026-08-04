# C-009 — Positive primary price is accepted indefinitely without freshness validation

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

The aggregator interface exposes round ID, timestamps, and answered-in-round metadata (`contracts/interfaces/ProtocolInterfaces.sol:25-31`), but `ReserveOracle.price` discards every value except `answer` and accepts any positive result (`contracts/ReserveOracle.sol:17-20`). There is no maximum age or round-completeness check before lending consumes the price.

## Attacker, prerequisites, and sequence

An honest feed last reported AST at 2 aUSD; no attacker calls the mock setter. Time advances 31,536,001 seconds while the current unmanipulated pool price is 1 aUSD. An ordinary borrower deposits 1,000 AST. The unmodified oracle still reports 2, so the market permits a 1,500 aUSD borrow instead of the current-value 750 limit.

## Impact and severity

The attacker ends with 1,500 debt/liquid stable against 1,000 current-value collateral, leaving 750 aUSD immediate undercollateralization relative to the configured 75% factor. **Severity: High (unreviewed)** because ordinary feed staleness plus price decline permits bad-debt extraction; it requires no key compromise but does require a stale positive round.

## Reproduction

- Command: `bash run/evidence/C-009/reproduce.sh`; discovery and separate reproduction exit 0.
- Positive log records age, stale 2-dollar price, current pool 1-dollar price, 750 safe limit, and 1,500 debt.
- Negative comparator adds a one-day freshness bound and uses the already configured pool fallback; the same old round yields 1 dollar and rejects 1,500 with debt zero.
- The comparator is isolated additional source; production remains unmodified and the attacker does not configure the feed.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | attacker controls only deposit/borrow and may wait; stale round is prerequisite | pass |
| Defense / impact | discarded timestamp fields; quantified excess debt | pass |
| Realistic + safe/release reproduction | honest feed stand-in, one-year time advance, optimized chain | pass |
| Negative control | freshness-bound comparator | pass |
| Independent reproduction | `reproduction.log` | pass |

