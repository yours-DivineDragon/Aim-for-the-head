# Meridian Clearing blind security audit

Outcome: 25 reportable candidates survived technical evidence gates at frozen commit `158651792f770f5e827c1f0c363ea91f916cb1b8`: 1 Critical, 14 High, 7 Medium, and 3 Low. Six serious leads were rejected. Every submitted candidate has a release-like local reproduction and meaningful control launched in a fresh process. This is an internal benchmark result without human review or any claim of public novelty.

The target manifest verified before the hunt: 31 files, aggregate `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381`. The public seal verifier, pinned compile, and ordinary 5/5 suite passed. No private archive, decryption key, prior benchmark, forbidden history/diff, live system, or unrelated secret source was accessed.

## Results at a glance

| ID | Severity | Confidence | Canonical title | Type |
| --- | --- | --- | --- | --- |
| AFH-001 | Low | High | Any caller can mutate a market's risk tier | standalone |
| AFH-002 | High | High | Nominal inbound transfers create unbacked margin and bond credit | composed closure |
| AFH-003 | High | High | Delayed vault withdrawal bypasses clearing health and freeze enforcement | standalone |
| AFH-004 | Medium | High | Withdrawal callback reuses a live request before it is consumed | standalone; compatible with AFH-003 |
| AFH-005 | Medium | High | Feeds above 18 decimals permanently brick price normalization | standalone |
| AFH-006 | High | High | Epoch settlement records the caller-time price instead of the cutoff price | standalone |
| AFH-007 | High | High | Negative funding accrual bypasses the configured symmetric cap | standalone |
| AFH-008 | Low | High | Checkpoint splitting erases payer funding dust | standalone |
| AFH-009 | High | High | Epoch settlement zeroes the position before its final funding checkpoint | standalone |
| AFH-010 | Medium | High | Cross-zero trades assign an averaged residual entry price | standalone |
| AFH-011 | High | High | Open interest only increases and misallocates loss against nonexistent exposure | composed closure |
| AFH-012 | Medium | High | Closing and reopening duplicates active-market membership and equity | standalone |
| AFH-013 | High | High | Negative correlation and opposite exposure are incorrectly treated as a hedge | standalone |
| AFH-014 | Medium | High | Portfolio limit uses an unweighted arithmetic mean | standalone |
| AFH-015 | Low | High | Nonce bitmap aliases the upper 48 bits of every uint64 nonce | standalone |
| AFH-016 | High | High | Bidder can force liquidation exposure into an unrelated account | standalone |
| AFH-017 | Critical | High | Zero-capital unhealthy auction fills compose into repeatable socialized deficits | composed; depends on AFH-018 |
| AFH-018 | High | High | Timed-out auctions finalize and unfreeze without handling residual exposure | standalone |
| AFH-019 | High | High | Precommitted bids remain executable after auction finalization | standalone; depends on AFH-018 state |
| AFH-020 | High | High | Epoch settlement clears an auction freeze and stale reveal reopens the settled account | composed; depends on stale auction transition |
| AFH-021 | Medium | High | Bond slashing leaves a phantom aggregate reservation | standalone |
| AFH-022 | High | High | Insurance shareholders can redeem live auction bonds | composed closure |
| AFH-023 | Medium | High | Trade fees create unbacked insurance NAV | standalone |
| AFH-024 | High | High | Venue return is credited as received wad without output normalization | standalone |
| AFH-025 | High | High | Matcher can use an out-of-range execution price that truncates basis but charges the full fee | standalone |

The canonical machine-readable descriptions—including exact affected functions, preconditions, transaction sequences, observed/expected values, remediation, dependencies, evidence hashes, and coverage dimensions—are in `submission.json`.

## Detailed findings

### AFH-001 — Any caller can mutate a market's risk tier (Low)

`MarketCatalog.setRiskTier` omits `onlyGovernor`. An ordinary EOA changed tier 2→7; the same caller's adjacent `setMarketActive` call reverted. This proves unauthorized persistent market-configuration mutation, although no current on-chain tier consumer exists. Add `onlyGovernor` and test every mutator. Reproduce: `node blind-run/run-case.mjs AFH-001`.

### AFH-002 — Nominal inbound transfers create unbacked margin and bond credit (High)

`MarginVault.deposit`, `InsuranceFund.deposit`, and `reserveAuctionBond` trust the nominal argument rather than recipient balance delta. With a 10% fee, 900 wad received creates 1000 wad credit/reserve. The attacker withdrew nominal 1000, leaving 900 backing a victim's 1000 claim; the bond path produced the same gap. Measure before/after balances and credit only received normalized assets. Reproduce: `node blind-run/run-case.mjs AFH-002`.

### AFH-003 — Delayed withdrawal bypasses health and freeze enforcement (High)

`MarginVault.claimWithdrawal` never consults ClearingHouse. A request for 900 created while funded was claimed after the account became below maintenance and was frozen in liquidation. The ClearingHouse route rejected the same withdrawal. Route both request/execution through a shared controller policy and re-check health/freeze at claim time. Reproduce: `node blind-run/run-case.mjs AFH-003`.

### AFH-004 — Withdrawal callback reuses a live request (Medium)

The token transfer occurs before balance debit and request deletion. A one-shot callback reentered the permissionless claim: one 100 request transferred/debited 200 from a 300 balance; no-callback control transferred 100. Consume state before interaction and add reentrancy protection. Reproduce: `node blind-run/run-case.mjs AFH-004`.

### AFH-005 — Feeds above 18 decimals brick normalization (Medium)

`10 ** (18 - precision)` underflows for precision 19+. Configuration does not reject it. A 19-decimal feed made all price reads revert; 18 decimals returned exact wad. Validate precision and divide for values above 18. Reproduce: `node blind-run/run-case.mjs AFH-005`.

### AFH-006 — Settlement uses caller-time price, not cutoff price (High)

The epoch/oracle path reads `latestRoundData` when anyone records after cutoff. A 2100 cutoff round followed by a 3000 post-cutoff round permanently recorded 3000; without the later round it recorded 2100. Bind settlement to an authenticated cutoff round/timestamp. Reproduce: `node blind-run/run-case.mjs AFH-006`.

### AFH-007 — Negative funding bypasses the symmetric cap (High)

`FundingEngine.accrue` clamps only positive rate. Valid mark/index 1000/2000 produced growth `-516666666666666646` against magnitude bound `62000000000000`; the positive mirror equaled the bound. Clamp both signs. Reproduce: `node blind-run/run-case.mjs AFH-007`.

### AFH-008 — Checkpoint splitting erases funding dust (Low)

Each signed payment truncates toward zero, then the checkpoint discards the fractional remainder. Ten split increments paid zero; one checkpoint over identical growth paid one wei. Carry remainders or round payer-conservatively. No gas-profitable amplification is claimed. Reproduce: `node blind-run/run-case.mjs AFH-008`.

### AFH-009 — Settlement zeroes base before funding (High)

`settleBatch` realizes PnL before checkpointing. Realization sets base zero, omitting the final funding payment. The batch changed cash by only −1000 PnL; checkpoint-first control included the 2-wad debit. Checkpoint every market before realization. Reproduce: `node blind-run/run-case.mjs AFH-009`.

### AFH-010 — Cross-zero residual basis is averaged (Medium)

On a flip, ClearingHouse assigns `(oldEntry+execution)/2` rather than execution. Buy one at 3000 then sell two at 2000 produced short basis 2500, cutting the closed round-trip loss by about 500 before fees. Set residual basis exactly to the crossing price. Reproduce: `node blind-run/run-case.mjs AFH-010`.

### AFH-011 — Open interest only increases and misallocates loss (High)

OI adds `abs(baseDelta)` and settlement never subtracts exposure. After all live bases were zero, OI was 4. Normal reporting sent this stale value to insurance, indexing a 775.8 loss at 193.95 with pending zero; reporting actual zero queued 775.8 pending. Maintain exact aggregate absolute live exposure and report/query it atomically. Reproduce: `node blind-run/run-case.mjs AFH-011`.

### AFH-012 — Active-market membership and equity duplicate (Medium)

Every `oldBase==0` pushes another market ID. Close/reopen made two memberships and counted a 1000 unrealized gain twice; a single-open control counted once. Track set membership explicitly and migrate/deduplicate old arrays. Reproduce: `node blind-run/run-case.mjs AFH-012`.

### AFH-013 — Correlation sign undercharges opposite exposure (High)

The `opposite || correlation < 0` branch subtracts risk even when negative correlation and opposite exposures should multiply into risk-increasing covariance. Equal legs observed requirement 200 instead of 600; positive-correlation/opposite control correctly yielded 200. Determine adjustment sign from both exposure signs and correlation. Reproduce: `node blind-run/run-case.mjs AFH-013`.

### AFH-014 — Portfolio limit is unweighted (Medium)

The router averages prices by leg count. Buys of 1 at 1000 and 9 at 3000 passed a 2200 limit because arithmetic average was 2000, while required base-weighted average was 2800. Compute `sum(abs(base)*price)/sum(abs(base))` and validate direction per leg. Reproduce: `node blind-run/run-case.mjs AFH-014`.

### AFH-015 — Nonce bitmap aliases uint64 nonces (Low)

The word index is narrowed to `uint8`, so nonce 0 and 65536 share the same bit; nonce 1 correctly uses another. Use an untruncated 56-bit word index. Impact is order cancellation/availability, not replay. Reproduce: `node blind-run/run-case.mjs AFH-015`.

### AFH-016 — Bidder forces exposure into unrelated account (High)

Auction commitment binds an arbitrary `bidderAccount`, but reveal never proves the bidder owns/delegates it. A bidder forced +1 base into a funded victim; ordinary trade control reverted. Bind account authority at commit and reveal and enforce post-fill health. Reproduce: `node blind-run/run-case.mjs AFH-016`.

### AFH-017 — Zero-capital auction chain socializes deficits (Critical)

Three compatible primitives execute in one chain: zero/unrelated bond, no bidder health check, and residual finalization. A zero-collateral bidder received a late lot with equity 18.2 below initial 100. After a 10% adverse move and second timed-out auction, final state had pending social loss 81.8, live residual base 1, and no bond/capital. Require risk-proportional received bond, atomic bidder health, and complete backstop closure before loss allocation. Reproduce: `node blind-run/run-case.mjs AFH-017`.

### AFH-018 — Timeout abandons residual exposure (High)

After duration, `finalize` accepts nonzero residual without transferring it to a backstop. No-fill control left remaining/base 1 and unfroze the account; fully filled control ended at zero. Require zero residual or execute the backstop transfer before unfreeze/deficit. Reproduce: `node blind-run/run-case.mjs AFH-018`.

### AFH-019 — Reveal mutates finalized auction (High)

`reveal` does not check `finalized`. A precommitted bid executed after finalize, changing distressed base 1→0 and residual 1→0 after deficit resolution. New commits correctly reverted. Invalidate outstanding commitments and reject all post-terminal reveals. Reproduce: `node blind-run/run-case.mjs AFH-019`.

### AFH-020 — Settlement/auction freeze incoherence reopens settled account (High)

One boolean represents independent freeze reasons. Epoch settlement cleared an active auction freeze, marked the account settled with base zero, then stale reveal reopened it at base −1 while the settled marker remained true. A settlement-only control stayed zero. Use reason-counted locks, mutual lifecycle exclusion, and pending-lot invalidation. Reproduce: `node blind-run/run-case.mjs AFH-020`.

### AFH-021 — Slashing leaves phantom reservation (Medium)

Bond release subtracts only `returned`, not the full resolved amount. A 100 bond slashed 50 deleted its record and accrued 50, but `auctionReserved` still reported 50. Subtract the full amount before splitting and assert aggregate equals live record sum. Reproduce: `node blind-run/run-case.mjs AFH-021`.

### AFH-022 — Shareholder redeems live bidder bonds (High)

`totalAssets` includes reservations and redeem has no unreserved cap. A 1000-share depositor redeemed 2000 after a bidder added a 1000 bond, draining the fund; bond terminal action then reverted. Without bond, redemption was 1000. Exclude reserved assets from share NAV and spendable liquidity. Reproduce: `node blind-run/run-case.mjs AFH-022`.

### AFH-023 — Trade fees create unbacked insurance NAV (Medium)

Fee cash debit increments `accruedProtocolValue`, but no token reaches insurance and no collection path exists. A 120 fee turned 1000 actual assets into promised 1120 and made full redemption revert; no-fee control succeeded. Recognize only received/collectible value. Reproduce: `node blind-run/run-case.mjs AFH-023`.

### AFH-024 — Venue return is credited without normalization/receipt (High)

Rebalance compares raw native return to `minWadOut` and credits it directly. With 24-decimal output, raw `1e18` passed and credited `1e18` wad despite zero output received; if received it would normalize to `1e12` wad. Measure tokenOut balance delta, validate decimals, normalize, and then enforce the minimum. Reproduce: `node blind-run/run-case.mjs AFH-024`.

### AFH-025 — Out-of-range signed-order price truncates basis but charges full fee (High)

Sell matching accepts uint256 execution above uint128. A victim-signed 2000-wei sell executed at `2^128+2e18`, stored entry `2e18`, and charged `408.338840305126156158` wad while post-health passed. In-range `2e18` charged 2 wei. Bound before every limit/fee/trade consumer and use checked casts. Reproduce: `node blind-run/run-case.mjs AFH-025`.

## Evidence gates

All candidates passed attacker control, target reachability, defense analysis, security impact at the stated severity, realistic pinned configuration, safe/release reproduction, negative control, fresh-process reproduction, internal duplicate check, downstream propagation, and composition review. `run-case.mjs all` launched 26 security tests across 25 evidence packets because AFH-002 exercises both vault and bond sinks; every test embeds at least one control. Human review was omitted before activation because this is an internal benchmark, so severity remains hunter-classified and the material must not be externally disclosed as a novel vulnerability.

The major evidence matrix is:

| Gate | Artifact |
| --- | --- |
| Authority/reachability/guards | `MODELS.md`, `INVARIANT_CATALOG.md`, per-case test source |
| Security/downstream impact | `submission.json`, `COMPOSITION_AND_CLOSURE.md`, per-case canonical evidence |
| Release/safe reproduction | `run-case.mjs`, `poc/`, `harness/`, `evidence/AFH-NNN.json` |
| Negative control | embedded in each named test and canonical packet |
| Composition/economic closure | `COMPOSITION_AND_CLOSURE.md` |
| Duplicate/rejection/falsification | `HYPOTHESIS_LEDGER.md`, `evidence/REJECTED.json` |

## Rejected leads

Six leads are separately preserved, not findings:

- REJ-001: concentration arithmetic remained monotone at zero/scale/quotient boundaries; no counterexample.
- REJ-002: deficit tokens sent to ClearingHouse remain protocol-owned; no second claimant or attacker delta was shown.
- REJ-003: sub-native withdrawal rounding burns only the authorized caller's claim and yields no gain.
- REJ-004: zero-delta list growth is not a distinct victim attack; nonzero duplicate membership is AFH-012.
- REJ-005: duplicate epoch market IDs require trusted-governor input.
- REJ-006: global account nonce still preserves owner bits, uniqueness, and authorization.

See `evidence/REJECTED.json` and the append-only hypothesis ledger for first failed gates, reopening conditions, preserved tool/setup failures, Devil's Advocate objections, and Rescue Critic decisions.

## Coverage and residual risk

The run completed a full manifest-source/entry census, actor/trust/asset/privilege maps, account/position/auction/epoch state machines, all 22 explicit invariants plus four global invariants, mutable-value consumer propagation, exact arithmetic/precision/zero boundaries, interface-promise/runtime deltas, callback/action sequences, primitive join graph, successful and failed compositions, three-party economic closure, and a roaming cast/cache/terminal pass after the prioritized queue.

Coverage is a vector, not a percentage. Read coverage does not include dependency internals; runtime line/branch coverage was unavailable. No symbolic solver, Echidna, Foundry, Slither, or Semgrep was on PATH. The deterministic suites exercise the strongest identified paths, but they are not a proof that no additional bugs remain—especially around adversarial callbacks in other insurance flows, extreme supported cast bounds, operational OI reporting, and configurations not represented by the public topology.

Chronology, commands, versions, tool failure, corrections, timing proxies, and unavailable metrics are in `INITIAL_ATTESTATION.md` and `RUN_CHRONOLOGY.md`. The exact maps, failed joins, and final delta ledgers are in `MODELS.md` and `COMPOSITION_AND_CLOSURE.md`.

