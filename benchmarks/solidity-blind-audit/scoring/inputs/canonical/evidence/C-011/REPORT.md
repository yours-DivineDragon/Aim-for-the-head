# C-011 — First-share donation can repeatedly deny vault deposits with recoverable capital

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

At nonzero supply, `convertToShares` uses the fully manipulable raw asset balance with no virtual shares/assets (`contracts/AsterVault.sol:19-26`). `deposit` computes before transfer and reverts when rounding produces zero (`52-56`). A first depositor can seed one smallest share, directly donate enough underlying to inflate its price, and make a pending deposit round to zero.

## Attacker, prerequisites, and sequence

An ordinary attacker who can order around a victim deposit seeds 1 wei asset/share, directly transfers 1,000 AST to the vault, then lets a 1,000 AST victim deposit execute. It reverts `ZERO_SHARES`; the victim keeps funds but receives no service. The attacker redeems the one share and recovers the full `1000e18 + 1` starting balance, so capital loss is zero apart from gas/opportunity cost. Repeating the ordering can target further deposits.

## Impact and severity

The proof demonstrates deposit availability loss with fully recoverable capital, but no victim asset theft and capital temporarily matching the blocked deposit. **Severity: Low (unreviewed)** due front/back-running and capital requirements; the effect is repeatable and violates permissionless vault availability.

## Reproduction

- Command: `bash run/evidence/C-011/reproduce.sh`; discovery and fresh-process reproduction exit 0.
- Positive: previewed shares zero, victim shares zero/assets unchanged, attacker capital fully recovered, supply returns zero.
- Negative: without the donation, the same victim deposit succeeds and mints `1000e18` shares.
- Default 18-decimal token, optimized unmodified target, clean in-memory chain.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | ordinary seed deposit/direct owned-token transfer/redeem and transaction ordering | pass |
| Defense / impact | absent virtual offset/min-share mechanism; deterministic victim deposit denial | pass |
| Realistic + safe/release reproduction | default vault/token configuration; bounded local calls | pass |
| Negative control | same deposit without donation | pass |
| Independent reproduction | `reproduction.log` | pass |

