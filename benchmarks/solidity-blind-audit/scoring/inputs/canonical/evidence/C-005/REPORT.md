# C-005 — StrategyModule can be reinitialized and seized by any caller

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

`initialize` is public, has no caller authorization, and never requires `!initialized`; it overwrites both privileged roles even though it sets `initialized = true` (`contracts/StrategyModule.sol:14-19`). Those roles gate token sweep and arbitrary external call (`22-32`).

## Attacker, prerequisites, and sequence

The trusted deployer first initializes the module to the documented vault/operator and the module receives 10 aUSD. An unrelated EOA calls `initialize(attacker,attacker)`, overwriting both established roles, then calls `sweep(token,attacker,10e18)`. No race, role, key compromise, or malicious token is required.

## Impact and severity

The proof shows the original roles replaced, module balance zero, and attacker balance 10 aUSD. The attacker also becomes `vault` and can use arbitrary `target.call`. **Severity: Critical (unreviewed)** because any account can take persistent privileged control and drain all strategy-held assets.

## Reproduction

- Command: `bash run/evidence/C-005/reproduce.sh`; `discovery.log` and separate `reproduction.log` exit 0.
- Negative: after honest initialization but without attacker reinitialization, the same direct sweep reverts and all 10 tokens remain in the module.
- The proof uses the ordinary documented setup order and unmodified optimized target on a fresh chain.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | arbitrary EOA calls public initializer then role-gated sweep | pass |
| Defense / impact | absent lifecycle/authorization guard; complete token drain | pass |
| Realistic + safe/release reproduction | post-initialization takeover in ordinary deployment | pass |
| Negative control | direct non-operator sweep before overwrite rejects | pass |
| Independent reproduction | `reproduction.log` | pass |

