# C-003 — Permit relayer can redirect the signed token transfer

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

The permit type omits `recipient` (`contracts/PermitRouter.sol:10-11`), and the signed payload likewise encodes only type hash, owner, token, amount, nonce, and deadline (`26-28`). The subsequent `transferFrom` uses the relayer-supplied unsigned recipient (`29`).

## Attacker, prerequisites, and sequence

An ordinary relayer possesses a valid owner signature for a 25 aUSD transfer and the owner has approved the router for that amount. The owner-side harness records an intended recipient, signs the contract-prescribed payload, and gives the signature to the relayer. The relayer calls `executeTransfer` with its own address as recipient. Signature recovery and nonce checks pass because recipient is absent from the signed bytes.

## Impact and severity

The intended recipient receives zero, the attacker receives 25 aUSD, and the owner nonce advances, consuming the authorization. **Severity: High (unreviewed)** because any relayer or observer of such an authorization can steal the full signed/approved amount without key compromise.

## Reproduction

- Command: `bash run/evidence/C-003/reproduce.sh`; `discovery.log` and separate `reproduction.log` both exit 0.
- Positive oracle includes distinct intended/actual addresses, attacker balance `25e18`, intended balance zero, nonce one.
- Negative: changing the encoded amount by one wei invalidates the signature, leaves attacker balance and nonce zero, discriminating signed from unsigned fields.
- Optimized unmodified target, deterministic chain, and exact versions are printed in logs/base capability record; no cleanup is needed.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | relayer controls public `recipient`; valid signature/approval setup in `repro.test.mjs` | pass |
| Defense / impact | type/payload field inventory and attacker token balance | pass |
| Realistic + safe/release reproduction | ordinary signed-transfer path, optimized clean chain | pass |
| Negative control | encoded amount alteration rejects | pass |
| Independent reproduction | separate clean process in `reproduction.log` | pass |

