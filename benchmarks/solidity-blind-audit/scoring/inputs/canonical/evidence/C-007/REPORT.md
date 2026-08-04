# C-007 — Replay nonce is global across all source chains

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

Although remotes are configured per `sourceChain`, replay state is only `mapping(uint64 => bool)` (`contracts/BridgeGateway.sol:11-12`). `finalizeCollateral` authenticates the asserted source chain but tests and writes only the bare nonce (`36-41`). Valid messages `(chain A,n)` and `(chain B,n)` therefore collide.

## Attacker, prerequisites, and sequence

Two source chains are honestly configured to distinct remote gateways. An untrusted remote user can cause one legitimate bridge message on chain 10 using its local nonce 7. A victim's otherwise valid configured-gateway message on chain 20 also has local nonce 7. The first receives 1 share; the second reverts `PROCESSED`, leaving the victim with zero bridge credit. Both relays use their configured remote identities, so C-002's missing-sender flaw is not needed.

## Impact and severity

An ordinary bridge user on one domain can block unrelated collateral finalization on another whenever independent nonce sequences collide; common per-chain counters make repeated collisions plausible. **Severity: Medium (unreviewed)** for cross-domain availability loss and stranded collateral/credit, with no demonstrated direct theft.

## Reproduction

- Command: `bash run/evidence/C-007/reproduce.sh`; discovery and separate `reproduction.log` exit 0.
- Positive: chain 10 credit `1e18`, chain 20 credit zero, shared nonce 7 rejected.
- Negative comparator changes only replay storage to `(chain,nonce)`; both same-nonce valid messages credit `1e18` and `2e18`.
- Optimized unmodified target and isolated comparator run on clean in-memory chains.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | legitimate configured remote messages with independent local nonce | pass |
| Defense / impact | global key at lines 12/40-41; victim zero credit | pass |
| Realistic + safe/release reproduction | two configured source domains on benchmark messenger | pass |
| Negative control | chain-scoped comparator | pass |
| Independent reproduction | `reproduction.log` | pass |

