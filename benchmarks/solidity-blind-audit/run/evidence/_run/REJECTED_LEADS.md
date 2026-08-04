# Rejected and consolidated leads

These dispositions are part of the census. A rejection means a named contract gate failed; it is not evidence that the broader target is secure.

## R-001 — `AsterVault.withdraw` rounds shares down

- Locations: `contracts/AsterVault.sol:44-46`, `contracts/AsterVault.sol:73-78`, `contracts/lib/TokenMath.sol:5-7`.
- Observation: `withdraw` uses `convertToShares`, which rounds down rather than the ERC-4626-style round-up. At the default 18-decimal configuration and a modest share price above one, the maximum under-burn per call is less than one smallest share unit. A zero-share call can move only one or a few smallest asset units unless the exchange rate itself has already been inflated by extraordinary unsupported amounts.
- Failed gate: security impact. The contract's census floor expressly excludes low-impact rounding dust; no realistic clean-chain sequence extracted material victim principal. The separate first-share donation availability mechanism is retained as C-011.
- Reopen with: a supported low-decimal/high-share-price deployment or bounded batching sequence that produces material net victim loss at realistic gas/capital cost.

## R-002 — `TokenMath` multiplication overflow and pool `uint112` truncation

- Locations: `contracts/lib/TokenMath.sol:5-11`, `contracts/ReservePool.sol:78-80`.
- Observation: pre-division multiplication can revert and explicit `uint112` casts can truncate balances. Reaching either effect in the benchmark's 18-decimal 10,000/10,000 configuration requires balances around or above `2^112` raw units or still larger products.
- Failed gate: realistic configuration and attacker control. Ordinary users do not possess the required astronomical configured-token balance; mock minting is an explicitly excluded harness control.
- Reopen with: a documented supported asset supply/decimal configuration and attacker-owned balance reaching the boundary without trusted mint/configuration privileges.

## R-003 — mixed token decimals can mis-scale pool/lending values

- Locations: `contracts/ReservePool.sol:27-29`, `contracts/ReserveOracle.sol:35-39`, `contracts/LendingMarket.sol:69-75`.
- Observation: the pool's raw reserve ratio and lending value arithmetic do not explicitly convert collateral and stable-token decimal units. The frozen integrated deployment uses 18 decimals for both tokens, and only feed decimals are documented/normalized.
- Failed gate: realistic configuration. No benchmark documentation establishes mixed token decimals as a supported release-like deployment, and the default configuration does not diverge.
- Reopen with: a documented supported asset/stable pair with unequal decimals and a clean proof of net over-borrowing after all unit conversions.

## R-004 — absence of liquidation after an exogenous price decline

- Locations: complete external ABI of `contracts/LendingMarket.sol` (confirmed in `run/evidence/_run/abi-entrypoints.log`).
- Observation: no liquidation entry point exists, so an exogenous price decline can leave debt above current borrow limit. The benchmark does not specify liquidation policy, close factors, incentives, or a supported attacker-driven honest-feed transition; direct mock feed configuration is explicitly excluded.
- Failed gate: defense analysis / scope. A collateralized prototype suggests residual solvency risk, but the intended enforcement lifecycle cannot be established precisely enough to call the absence an exploitable implementation defect under the submission contract.
- Reopen with: protocol documentation defining liquidation guarantees or an attacker-controlled supported transition that creates and realizes bad debt without trusted feed controls.

## R-005 — configured-token callback and fee semantics

- Locations: external token calls throughout `AsterVault`, `ReservePool`, and `LendingMarket`.
- Observation: malicious/reentrant or nonconforming token behavior could invalidate balance and state assumptions in several functions.
- Failed gate: attacker control. BENCHMARK.md trusts configured tokens to follow their declared interfaces, and no ordinary user selects the market/vault/pool's configured token. Candidate C-001 instead uses the explicitly supported untrusted borrow receiver callback.

## R-006 — mock mint, burn, feed, and relay controls

- Locations: `contracts/mocks/MockTokens.sol:23-32`, `contracts/mocks/MockFeed.sol:19-25`, `contracts/mocks/MockMessaging.sol:10-23`.
- Observation: these stand-ins expose direct test setup methods.
- Failed gate: scope and attacker control. BENCHMARK.md expressly treats mock administrative minting and direct test configuration as harness capabilities. Relay is used only to model an authentic messenger context for remote-application tests; no claim relies on corrupting the messenger's reported context.

## R-007 — zero receiver/beneficiary and zero-amount edge cases

- Locations: public transfer, deposit, bridge, borrow, repay, and claim entry points.
- Observation: several paths permit zero addresses or zero values, depending on configured token semantics.
- Failed gate: security impact. The inspected default token either performs the requested arithmetic or reverts; tested/plausible cases lock or move only the caller's own authorized value and do not cross a protected boundary.

## Consolidated manifestations

- Reentering C-001 more than once increases the same stale-debt root cause; it is not a second finding.
- Forging different beneficiaries/amounts through C-002 uses the same absent remote-sender comparison; it is not a second finding.
- Cross-chain replay of C-010 is the same missing verifier-domain binding demonstrated safely with two same-chain instances; only the demonstrated same-chain claim is submitted.
- Pool donation/sync and swap-based fallback manipulation both feed the same unprotected spot-price oracle root cause; C-008 uses the economically stronger swap sequence.
- Stale, zero-timestamp, and incomplete-round metadata all arise from `ReserveOracle.price` consuming only `answer`; C-009 submits only the fully reproduced stale-positive manifestation and does not overclaim untested round states.
- Pre-initialization capture and post-initialization overwrite in `StrategyModule` share the same missing initialization lifecycle guard; C-005 uses the stronger post-setup takeover.
