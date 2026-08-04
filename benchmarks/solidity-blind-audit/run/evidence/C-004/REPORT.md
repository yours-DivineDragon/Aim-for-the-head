# C-004 — ECDSA malleability bypasses reward replay protection

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

`SignatureCodec.recover` accepts either ECDSA `s` half because it checks length and `v` but not low-`s` canonicality (`contracts/lib/SignatureCodec.sol:9-23`). `RewardsDistributor` keys replay protection by `keccak256(signature)` (`contracts/RewardsDistributor.sol:24-30`) instead of the authorized payload/claim. `(r,s,v)` and `(r,n-s,flipped-v)` recover the same authority but have different byte hashes.

## Attacker, prerequisites, and sequence

A permissionless claimant/relayer needs one legitimate authority signature for account, amount, and nonce; no signer key is compromised. The proof derives the mathematically equivalent high-`s` encoding locally, submits the canonical signature for 20 rewards, then submits the alternate bytes for the identical payload. Both recovery checks return the authority and each distinct signature ID is marked used.

## Impact and severity

One 20-token authorization pays 40 tokens. **Severity: High (unreviewed)** because every claim can be doubled and a sufficiently large authorization can drain distributor funds beyond signed intent.

## Reproduction

- Command: `bash run/evidence/C-004/reproduce.sh`; discovery and fresh-process reproduction exit 0.
- Positive log records the same payload, distinct canonical/alternate IDs, authorized `20e18`, paid `40e18`.
- Negative: byte-identical replay is rejected and total paid remains `20e18`.
- The proof uses the EVM `ecrecover` behavior in the optimized unmodified target; no patched production code or external cryptographic service is used.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | relayer submits public signature bytes; canonical signature is legitimate | pass |
| Defense / impact | high-`s` acceptance plus byte-key replay map; double balance | pass |
| Realistic + safe/release reproduction | EVM precompile via clean Ganache/optimized bytecode | pass |
| Negative control | identical-byte replay rejects | pass |
| Independent reproduction | `reproduction.log` | pass |

