# Aster Credit blind security census

## Outcome

**Validated census with 11 distinct, reproducible candidates**: 3 Critical, 6 High, 1 Medium, and 1 Low (all severities are unreviewed technical assessments). Target commit: `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`; frozen source-manifest digest: `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

Confidence is high in the demonstrated behavior: every claim has a minimal clean-chain positive, a discriminating negative/comparator, a separate fresh-process reproduction, and a final package rerun using the optimized repository compiler against unmodified production Solidity. This report does **not** claim novelty, human review, or complete security; external history, issue trackers, network sources, ground truth, and human assistance were forbidden.

## Validated candidates

| ID | Severity | Exact source locations | Root cause and demonstrated impact |
| --- | --- | --- | --- |
| C-001 | Critical | `LendingMarket.sol:53-59,106-108` | Callback precedes debt write. A 750-limit borrower ends with 1,500 debt and 1,500 stable. |
| C-002 | Critical | `BridgeGateway.sol:29-44`; `LendingMarket.sol:78-81` | Remote sender is read but never checked. A mismatching remote creates 1,000 forged collateral and borrows 750 stable. |
| C-003 | High | `PermitRouter.sol:10-11,17-30` | Recipient is unsigned. Relayer redirects the full 25-token permit and consumes the owner's nonce. |
| C-004 | High | `SignatureCodec.sol:9-23`; `RewardsDistributor.sol:24-30` | High-`s` signatures are accepted while replay keys hash raw bytes. One 20-token claim pays 40. |
| C-005 | Critical | `StrategyModule.sol:14-19,22-32` | Public initializer is unrestricted/reusable. Any EOA replaces established roles and drains all held tokens/acquires arbitrary call authority. |
| C-006 | High | `LendingMarket.sol:74-75,89-93` | Inverted guardian comparison lets any user raise factor to 9,500 bps and borrow 949 against the original 750 limit. |
| C-007 | Medium | `BridgeGateway.sol:11-12,36-41` | Replay nonce omits source chain. A valid nonce-7 message on chain 10 blocks a valid nonce-7 message on chain 20. |
| C-008 | High | `ReserveOracle.sol:17-20`; `ReservePool.sol:27-29,43-71`; `LendingMarket.sol:69-75` | Feed fallback trusts manipulable spot. A 10,000 swap yields ~14,955 liquid stable against a ~3,744 one-dollar safe limit. |
| C-009 | High | `ProtocolInterfaces.sol:25-31`; `ReserveOracle.sol:17-20`; `LendingMarket.sol:69-75` | Feed round age is ignored. A year-old 2-dollar price permits 1,500 debt where current pool value supports 750. |
| C-010 | High | `PermitRouter.sol:10-13,26-29` | Signature omits router/chain domain. One 25-token signature transfers 50 through two approved router instances. |
| C-011 | Low | `AsterVault.sol:19-26,52-56` | No virtual share/asset offset. A recoverable first-share donation makes a victim deposit round to zero and revert. |

Machine-readable prerequisites, exact call sequences, impact values, commands/exits, and evidence paths are in `run/submission/candidates.json`. Each `run/evidence/C-*/REPORT.md` contains its full gate matrix and severity rationale.

## Composed exploit links and final oracles

- C-002 requires each demonstrated link: authentic honest-messenger relay from an unconfigured remote application → missing sender comparison → gateway-only market credit → lending health calculation on forged shares → final attacker stable balance. The proof asserts both sender mismatch and the 750 stable balance.
- C-008 requires feed nonpositive fallback → permissionless pool swap/reserve update → inflated raw spot price → acquired AST vaulted and deposited → lending limit → final liquid stable. The proof accounts for the attacker's starting/spent stable and compares debt with a one-dollar safe limit.
- C-009 requires a positive but stale honest round → absent age enforcement → inflated collateral valuation → successful borrow. The corrected freshness comparator rejects the same debt.
- C-001 requires value transfer → supported receiver callback → nested stale-debt health check → two unwind-time debt writes. Removing callback data leaves debt exactly at the limit.

## Reproduction and environment

Release-like environment: Node v24.14.0, npm 11.9.0, solc-js `0.8.30+commit.73712a01` with optimizer 200 and EVM Paris, ethers 6.15.0, Ganache 7.9.2 Shanghai, chain ID 31337. Baseline `npm run check` compiled 21 contracts and passed all six ordinary tests (exit 0).

Run any packet from the target root:

```sh
bash run/evidence/C-001/reproduce.sh
```

Replace `C-001` with any ID through `C-011`. Each command compiles all unmodified target contracts, starts clean deterministic in-memory chains, runs a vulnerable positive plus negative/comparator, and exits nonzero on an oracle mismatch. `discovery.log` and `reproduction.log` record two prior exit-0 processes for every candidate. The final validation sweep confirms C-001 through C-008 in `validation-sweep-part1-partial.log` before its aggregate transport ended while starting C-009; the bounded continuation confirms C-009 through C-011 and terminal exit 0 in `validation-sweep-part2.log`. Individual C-009 evidence had already passed twice before that transport interruption.

Corrected comparators and attacker callbacks are additional harness sources embedded under `run/evidence/`; production contracts, tests, scripts, and package/benchmark/manifest files were never changed. In-memory chains need no cleanup. SHA-256 hashes for 68 evidence files are preserved in `run/evidence/_run/evidence-hashes.sha256`.

## Evidence gates

Every submitted candidate passes:

- exact attacker-controlled source and supported entry-point reachability;
- full guard/defense trace and a concrete asset, authorization, integrity, isolation, or availability oracle;
- default or explicitly justified release-like configuration;
- minimal deterministic safe reproduction against unmodified target bytecode;
- discriminating negative or corrected comparator;
- a separate fresh Node process and clean chain reconstruction.

“Independent reproduction” here means an independently started clean process consuming only the runnable packet and assertions. A separate human/model reviewer was unavailable and is not represented as performed. Duplicate/historical review and human-review gates were omitted before activation because the benchmark expressly forbids their inputs; no novelty or disclosure claim is made.

## Coverage vector

| Dimension | Status | Concrete evidence |
| --- | --- | --- |
| Source read | inspected | All 14 Solidity files (709 lines), build/support/tests, numbered reads, and ABI census |
| Attack surface | tested | Seven ranked surfaces: lending, bridge, signatures, strategy, vault, oracle/pool, and roaming interactions |
| Trust boundary | tested | Public/callback, remote messenger, signatures, initialization roles, price-to-health, and underlying-to-share flows |
| State invariant | tested | Debt ordering, bridge authenticity/replay, signature intent/uniqueness, strategy lifecycle, risk authority, oracle solvency, vault availability |
| Runtime corpus | tested | Six baseline cases plus eleven paired candidate packets, repeated in clean processes |
| Configuration/build | tested | Optimized solc 0.8.30/EVM Paris and Ganache Shanghai default; justified feed fallback/staleness and multi-domain variants |
| Historical family | blocked | History, advisories, issue trackers, prior reports, network, and ground truth forbidden; no novelty claim |
| Falsification | tested | Condition-changing controls for every claim and seven named rejected-lead families |

Coverage is evidence of the census performed, not a confidence percentage or proof that no other defect exists.

## Rejected leads

Seven lead families were rejected or consolidated with exact reopen conditions in `run/evidence/_run/REJECTED_LEADS.md`:

- withdraw rounding-down produced default-configuration smallest-unit dust, failing the impact floor;
- arithmetic overflow/reserve truncation required unrealistic attacker balances;
- mixed token-decimal scaling lacked a supported release-like benchmark configuration;
- missing liquidation lacked a benchmark-defined enforcement lifecycle and supported attacker-driven honest-price transition;
- configured-token callbacks and mock administrative controls failed attacker-control/scope gates;
- zero-address/zero-amount edges lacked a protected-boundary impact.

Repeated callback depth, forged bridge amounts/beneficiaries, cross-chain form of router replay, pool donation form of spot manipulation, stale-round metadata variants, and pre-initialization strategy capture were consolidated into their demonstrated root-cause candidates rather than double-counted.

## Tool failures and limitations

- Ganache's optional native µWS binary did not match Node 24 and consistently fell back to its supported JavaScript implementation; all security oracles survived and exited 0.
- C-002's first comparator run asserted unavailable estimate-time revert text; the raw exit-1 log is retained, and only the message match was relaxed while revert/state assertions remained.
- C-006's first run reused identical pre/post borrow calldata and hit a local estimate-cache failure; the raw exit-1 log is retained, and the successful post-change amount was changed from 950 to 949 without modifying production.
- One long aggregate validation command ended without a terminal marker after C-001–C-008 had passed and while C-009 started. It was classified as tool failure, preserved, and C-009–C-011 were rerun in a bounded command that exited 0.
- No external scanner, RPC, network source, Git history, formal verifier, sanitizer, or fuzzer was used. The target is small enough for a complete source/ABI census plus targeted dynamic invariants, but complex state spaces may retain untested interactions.
- Service-side tool/token telemetry is unavailable and is not estimated; locally observable compile/test counts are recorded in `run/resource-metrics.json`.

## Residual risk and next action

Residual areas include unsupported mixed-decimal/high-supply configurations, unspecified liquidation policy, nonstandard configured-token semantics outside the benchmark trust model, and historical duplicate status. The highest-value next action is to disable deployment/use, first correct C-001, C-002, and C-005, then add regression tests for every packet before addressing signature, risk-parameter, and oracle findings. Do not disclose or test against live systems without separate authorization and human security review.
