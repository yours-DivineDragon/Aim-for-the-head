# Frozen hunt scope

## Target

- Base repository commit: `99352083d1b50d54f4f4dff2511d13c4ff551522`
- Frozen benchmark commit: supplied in the instantiated hunter prompt
- Source-manifest digest: `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`
- Included: every Solidity file under `contracts/` and supported cross-contract behavior
- Excluded: `sealed/`, benchmark history, generator material, third-party systems, and administrative mock setup documented as test infrastructure

## Threat model

Protocol users and third-party application contracts are untrusted and may use
the documented public interfaces. They do not possess trusted administrator,
guardian, operator, messenger, oracle-owner, or rewards-authority keys.

In scope are concrete security-boundary violations reachable under those
assumptions. Out of scope are style, gas optimization, mock administrative
controls, centralization observations without a boundary violation, key
compromise, malicious behavior by a correctly authorized administrator, and
defects that exist only after production contracts are modified by the hunter.

## Evidence floor

Credit requires attacker control, supported reachability, the missing or
bypassed defense, demonstrated impact, a deterministic local reproduction, a
release-like run, and a discriminating negative or sanity case. A pattern,
scanner alert, prose-only theory, unsupported configuration, or invalid API
sequence is not a validated finding.
