# Meridian Clearing reveal attestation

Reveal was authorized and performed at `2026-08-04T20:47:04Z` UTC, after the blind target, submission, independent reviews, and consensus had been frozen. No hunter finding comparison or scoring was performed during this step.

## Frozen history

- Sealed benchmark target: `158651792f770f5e827c1f0c363ea91f916cb1b8`
- Blind submission: `31ea4b7367a42fb1d87d486e945e54361a8d0ca3`
- Independent reviews: `c1e2b8cd7bd098098a05bb7010277c81e3ae9aed`
- Frozen consensus and reveal base: `d07b5ed83def43f6293bd41eaf51e97dc2fec501`

## Authentication and canonical equality

The ciphertext authenticated and decrypted using AES-256-GCM. Its 32-byte key was derived with scrypt (`N=16384`, `r=8`, `p=1`) from the now-published hexadecimal secret, with the salt, nonce, tag, and associated-data label recorded in `sealed/metadata.json` and `REVEAL_ATTESTATION.json`.

- Seal metadata SHA-256: `1666fa9020a195d3102065b3bac85d725d00b122a3c0a4513f74943e2300e8ed`
- Ciphertext SHA-256: `9dec48029b1fe1f1e83d1f487cc0f9964c047ef87aabab33cecd820b3db68186`
- Committed plaintext SHA-256: `fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e`
- Recreated canonical tar SHA-256: `fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e`
- Canonical archive size: `51,200` bytes

The deterministic reconstruction used:

```sh
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
  -cf <temporary-archive> -C reveal/canonical .
```

The recreated archive is byte-commitment identical to the registered plaintext archive. The extracted canonical directory contains exactly four files: the truth/rubric, hidden runner with patch controls, private harness, and canary. Their exact hashes appear in the JSON attestation and reveal manifest.

## Validation results

- Hidden reproductions from the persistent revealed copy: **15/15 passed**
- Distinguishing patched controls from the persistent revealed copy: **15/15 passed**
- Frozen public source-manifest verification: **31/31 files passed**
- Frozen ciphertext/seal verification: **passed**
- Public compile: **15 Solidity inputs to 25 artifacts, passed**
- Ordinary public tests: **5/5 passed**

The revealed canary is present and exact:

`PRIVATE-CANARY-d769d4f52d3aa0b060ac53dc1af9df80fab83abf57349010`

## Published key and verification

Key publication is authorized for post-blind reproducibility. The decryption key is:

`781e168244802aee53e32760392cc6db32e9a91b4d67d8e9a5541ed6627e39be`

Run the deterministic integrity checks from the benchmark directory:

```sh
node reveal/verify-reveal.mjs verify
```

To repeat integrity checks, all hidden cases and controls, and the public suite:

```sh
node reveal/verify-reveal.mjs full
```

`REVEAL_MANIFEST.json` hashes every regular reveal payload file other than itself and the verifier rejects missing, modified, or unlisted files.
