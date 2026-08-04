# Goal

## Outcome
Census every distinct reproducible vulnerability in the unchanged Aster Credit target, prioritize complete Critical business-logic chains, and preserve zero unsupported claims

## Mode
discovery

## Target and scope
- Target: .
- Revision: frozen target `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, source manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`, Aim workflow-v2 commit `c4131ba`.
- Included: `BENCHMARK.md`, all Solidity under `contracts/`, and build/test support only to establish release-like semantics.
- Excluded: seal, reveal, scoring, workflow-v1 findings, Git history, external reports, live systems, and mock administrative controls as attacker primitives during the hunt phase.
- Proof-safety constraints: keep the production target and manifest immutable; use only local in-memory chains and isolated regression harnesses.

## Threat model
- Attacker capabilities: call public actions, deploy callbacks, choose sequences and receivers, transfer/approve owned tokens, relay valid signatures, originate authentic remote-application messages, and use supported temporary funding or interface variants.
- Attacker non-capabilities: no trusted role, signer key, messenger, configured component, mock administrator, build host, source, or storage compromise.
- Required asset or boundary crossed: unauthorized extraction/redirection, unbacked debt/collateral, authorization or identity-domain bypass, or material system-wide availability loss.

## Acceptance evidence
- Required gates: see contract.json
- Mandatory deep-hunt passes: see contract.json
- Safe reproduction oracle: deterministic local assertions over exact caller, system, and affected-user state before and after the complete action sequence.
- Release-like configuration: Node 24, solc-js 0.8.30 optimizer-200/EVM Paris, ethers 6.15.0, Ganache 7.9.2 Shanghai chain 31337, and the pinned lockfile.
- Negative control: change the claimed semantic, boundary, callback, domain, or composition condition while keeping the target bytecode and remaining setup fixed.
- Independent reproduction: rerun every packet in a new Node process and clean in-memory chain; post-freeze canonical validation is separate from candidate construction.
- Downstream impact and composition review: trace every mutable value through all consumers, preserve failed joins, and require one execution to close funding, repayment/cleanup, attacker net, and system loss for composed claims.

## Non-success
- Syntax, code smell, ABI novelty, isolated rounding, intermediate mispricing, or separately demonstrated primitives without supported final impact.
- Trusted-role or mock-admin prerequisites, source/storage mutation, unsupported dependency behavior, harmless dust/self-loss, duplicates, and hidden failed controls.
- Any description of this post-reveal same-target run as blind, novel, clean-room, or unbiased.

## Budget and stop
- Finding count: 15 disclosed regression units.
- Budget: 180 minutes and 250 decisive experiments/invocations; stop honestly if either boundary arrives.
- Exhaustion obligations: see contract.json
- Blocked rule: see contract.json

## Deliverables
- State: `regression-v2/goal-state/`
- Evidence: `regression-v2/evidence/` and `regression-v2/maps/`
- Report: `regression-v2/RESULTS.md`
