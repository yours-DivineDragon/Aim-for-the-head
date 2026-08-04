# C-002 — Bridge credit does not authenticate the remote application sender

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

`configureRemote` stores the approved gateway (`contracts/BridgeGateway.sol:29-34`), but `finalizeCollateral` only proves the local messenger, source chain, and that some remote is configured (`36-44`). It reads `xDomainMessageSender()` at line 42 only for the event and never compares it with `remoteGateway[sourceChain]`. `LendingMarket.onBridgeCredit` then trusts the gateway (`contracts/LendingMarket.sol:78-81`).

## Attacker, prerequisites, and sequence

An untrusted remote application can originate a message that the honest messenger relays with its real, mismatching sender; no messenger corruption or admin role is assumed. Admin honestly configures chain 10 to remote A and the market to the gateway. Remote B submits `finalizeCollateral(10,41,attacker,1000e18)`. The gateway observes chain 10 and sender B, still credits 1,000 bridge shares, and the attacker borrows 750 aUSD against nonexistent collateral.

## Impact and severity

The proof records configured remote `0x22d4…e32b`, actual remote `0xE11B…882d`, 1,000 forged shares, and 750 stolen aUSD. Arbitrary `shares` permits scaling to market liquidity. **Severity: Critical (unreviewed)** for permissionless unbacked collateral and stable-asset extraction across the remote-application boundary.

## Reproduction

- Command: `bash run/evidence/C-002/reproduce.sh`; discovery and fresh-process `reproduction.log` exit 0.
- `repro.test.mjs` compiles the unmodified target and an isolated corrected comparator that binds `xDomainMessageSender` to the configured remote.
- Negative: the same wrong-sender relay is rejected by the comparator with zero credit, while the configured sender succeeds.
- `harness-failure.log` preserves an initial exit-1 run where the expected rejection lacked estimate-time revert text; only the over-specific message assertion was relaxed, while revert/state oracles remained.
- Versions/configuration match C-001; in-memory cleanup is automatic.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | authentic mock messenger context with mismatching remote; target event/state log | pass |
| Defense / impact | missing sender comparison; forged credit followed by successful borrow | pass |
| Realistic + safe/release reproduction | benchmark messenger stand-in, optimized build, clean chain | pass |
| Negative control | corrected sender-binding comparator plus correct-sender sanity | pass |
| Independent reproduction | `reproduction.log`, separate process | pass |

