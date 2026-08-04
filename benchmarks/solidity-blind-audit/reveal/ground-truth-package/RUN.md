# Sealed validation bundle

Extract this bundle as `.hidden` directly under `benchmarks/solidity-blind-audit` after installing the public pinned dependencies.

```sh
node --test --test-concurrency=1 .hidden/tests/*.test.mjs
```

The suite compiles the public target together with `contracts/ExploitActors.sol` and `contracts/HardenedControls.sol`. It contains one canonical reproduction and one blocking control for every scored finding. `validation-map.json` maps each finding to both tests. The canonical commitment is the SHA-256 of the byte-for-byte `ground-truth.json` in this bundle.

