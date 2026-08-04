# Initial attestation

- Frozen repository commit: `158651792f770f5e827c1f0c363ea91f916cb1b8` (required short revision `1586517`).
- Start UTC: `2026-08-04T18:51:00Z`; local date context: `2026-08-05` Asia/Kolkata.
- Preexisting `blind-run/`: absent, confirmed before creation.
- Host: Linux `6.12.13`, x86_64.
- Node: `v24.14.0`; npm: `11.9.0`; Python: `3.12.13`; solc-js: `0.8.30+commit.73712a01.Emscripten.clang`.
- Visible security tools: repository compiler/tests and exact-integer scripting. `forge`, `slither`, `semgrep`, and `echidna` were not found on `PATH`.
- One initial `npx solcjs --version` capability probe failed with npm `E404` because `npx` interpreted the binary name as a package; the pinned local executable subsequently returned the version above. This is a tool-probe failure, not a target result.

## Immutable input/tool hashes

```text
7dadb4bf88b54569c54660c884f1580b0de3b38f3e6204c5ffd75a0dafa3d0eb  root SKILL.md
f304a3cc6ad5746ab72852ee118dde4866b3da9b873f0591cae646d6ec8e5e3e  goal-contract.md
9d44984cb96408ed6daa9c05c179c92f21047b5778e7ee835403d2e07925ea20  evidence-gates.md
7a71e01048316aa670dd9768547b775af03d5a455348250ef9ce951c1805b700  hunt-strategies.md
b918291c4764e30e941b0468958e2eaf238fa2917c3c6918cc2cc9a358bc260e  deep-hunt.md
34c36b2348282562d765467b9269136eb7d2f159f03e0a127b5080fee2c7cd53  goal_state.py
86e7f928cf5b5dc05e18a1339a7e36156c38994f0baed09c4b2b92331d045090  SOURCE_MANIFEST.json
5956e54c4fc0d62ef52ed0d81c560f965ee9a389e2a121d166594a83d881276d  package-lock.json
9d2dee775c965c1c07a165ac2bdbe086ca174c6ed5bf6f2fe7e5cb010cb3999b  package.json
```

## Required initial commands

All ran in `benchmarks/perps-blind-generalization` without modifying manifest-covered inputs.

| Command | Result | Stable output |
| --- | --- | --- |
| `npm run manifest:verify` | pass | 31 files; aggregate `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381` |
| `npm run seal:verify` | pass | public verifier returned `verified: true`; ciphertext digest matched public metadata |
| `npm run compile` | pass | 15 Solidity sources, 25 artifacts, pinned solc-js 0.8.30 |
| `npm test` | pass | 5/5 pass, 0 fail, concurrency 1; deterministic JavaScript fallback used after expected native uWS incompatibility notice |

No private-test command, ciphertext inspection, secret search, decryption, prior-benchmark access, or history/diff inspection was performed.
