# Generation report

Completed: `2026-08-04T18:46:18Z` (UTC)

## Environment and scale

- Repository base commit: `0dab54ddf01fc114bea4c254507d7a34eac7412c`
- Branch at generation: `agent/blind-security-benchmark`
- Node: `v24.14.0`
- npm: `11.9.0`
- Solidity compiler: `0.8.30+commit.73712a01.Emscripten.clang`
- Compiler target: Shanghai; optimizer enabled at 300 runs; IR pipeline enabled; metadata bytecode hash disabled
- OpenSSL available for environment attestation: `OpenSSL 3.0.13 30 Jan 2024`
- Solidity inputs: 15 files, 1,635 lines, comprising 9 protocol contracts, 2 libraries, 1 integration-interface file, and 3 ordinary mocks
- Compiled artifacts: 25 (contracts, libraries, and interfaces)
- Pinned production/test packages: `ethers 6.15.0`, `ganache 7.9.2`, `solc 0.8.30`
- Lockfile SHA-256: `5956e54c4fc0d62ef52ed0d81c560f965ee9a389e2a121d166594a83d881276d`

## Deterministic commands and results

All commands ran from `benchmarks/perps-blind-generalization`.

1. `npm run install:deterministic` — pass; clean `npm ci --ignore-scripts` installation, 354 packages.
2. `npm run check` — pass; 15 Solidity inputs compiled to 25 artifacts and 5/5 public tests passed with concurrency 1.
3. `npm run private:test` with the externally held 32-byte secret supplied only on standard input — pass from a newly created temporary decryption directory; 15/15 registered reproductions passed and 15/15 distinguishing patched/control cases passed.
4. `npm run manifest` — wrote the deterministic source manifest.
5. `npm run manifest:verify` — pass; 31/31 covered hunter-visible source/spec/test inputs matched.
6. `npm run seal:verify` — pass; encryption metadata, sizes, ciphertext digest, and public plaintext-commitment format matched.
7. `ps -C node -o pid=,stat=,args=` after validation — empty; no compiler, chain, decryption, or private-run process remained.

Ganache reported that its µWS native binary does not match Node 24 and deterministically used its JavaScript fallback. Public and private results above were produced with that fallback.

## Public-test observations

The ordinary suite covers governance configuration across market/oracle/funding components, collateral deposit and margined position opening, aggregate execution-limit rejection, delayed withdrawal readiness, and proportional insurance share deposit/redemption. Tests use a deterministic local chain (chain id 31337, fixed accounts, Shanghai hardfork) and require no external RPC or network data.

## Private validation

The canonical private archive contains the 15-unit rubric, affected components and preconditions, root-cause/impact/evidence requirements, deterministic reproduction runner, one distinguishing control per unit, required control transformations, private harness contracts, and a private marker. Registered weights sum to 100. Validation was performed after authenticated decryption from the final ciphertext, not from the authoring directory. The temporary archive and extracted copy were deleted automatically when the runner exited.

Private aggregate result: **15/15 reproductions and 15/15 controls passed**. No unit name, identifier, affected location, concrete mechanism, harness test name, or private marker is included in this report.

## Integrity seals

- Manifest covered-file count: `31`
- Manifest aggregate SHA-256: `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381`
- `SOURCE_MANIFEST.json` SHA-256: `86e7f928cf5b5dc05e18a1339a7e36156c38994f0baed09c4b2b92331d045090`
- Canonical plaintext archive size: `51,200` bytes
- Canonical plaintext SHA-256 commitment: `fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e`
- Ciphertext size: `51,200` bytes
- Ciphertext SHA-256: `9dec48029b1fe1f1e83d1f487cc0f9964c047ef87aabab33cecd820b3db68186`
- Seal metadata SHA-256: `1666fa9020a195d3102065b3bac85d725d00b122a3c0a4513f74943e2300e8ed`
- Encryption: AES-256-GCM with scrypt (`N=16384`, `r=8`, `p=1`, 32-byte derived key), 16-byte salt, 12-byte nonce, 16-byte authentication tag, and authenticated label `meridian-clearing-private-v1`

The random decryption secret is not stored in any repository file, environment file, git configuration, or command argument. It is delivered out of band to the benchmark coordinator.

## Plaintext deletion and leak scan

After the freshly decrypted run passed, the four authoring plaintext files (rubric, runner, harness, and marker) were deleted and their empty directories removed. Temporary seal/decryption directories used randomized names under `/tmp` and were removed by `finally` cleanup.

The final scan covered every nondependency, nongenerated, nonciphertext file under this benchmark and searched case-insensitively for registered identifier structure, the private marker prefix and value, the out-of-band secret and identifying prefix, disallowed target-label vocabulary, hidden harness filenames, private authoring directories, and concrete registered-mechanism phrases. Dependency lockfile names and required compiler annotation syntax were classified separately. Result: **clean; zero sensitive matches**.

Repository status was checked from the repository root. All authored changes are confined to `benchmarks/perps-blind-generalization/`; no root documentation, existing benchmark, skill/tool, git history, or other path was changed. No commit or publication was performed.
