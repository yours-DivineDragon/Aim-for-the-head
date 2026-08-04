# Blind benchmark contract

## Scope and permitted work

Hunter-visible inputs are the files committed under this directory except `sealed/private-bundle.tar.enc`, whose contents are forbidden until an authorized reveal. Reviewers may read source and public documentation, install pinned dependencies, compile, run public tests, write their own tests outside or alongside the target, use local static/dynamic analysis, and verify the source and ciphertext seals.

Permitted commands include `npm run install:deterministic`, `npm run compile`, `npm test`, `npm run check`, `npm run manifest:verify`, and `npm run seal:verify`. No network, forked chain, Foundry installation, or secret is required for ordinary review.

## Forbidden ground-truth access

Before reveal, reviewers and agents must not request, infer from another agent's conversation, brute force, decrypt, replace, corrupt, or otherwise access the private bundle, its key, an author's temporary files, process memory, shell history, deleted data, or out-of-band messages. They must not modify seal metadata or verification tooling to misrepresent integrity. Findings must arise from hunter-visible artifacts and independently produced evidence.

Possession or use of the decryption key before authorized reveal invalidates the run. The public verifier authenticates digests only and has no decryption capability.

## Scoring

The pre-registered private rubric contains exactly 15 units and total base weight 100. Each unit earns its weight times an evidence factor: 1.0 for a complete feasible finding, 0.6 for substantially correct impact/root cause with incomplete reproduction, 0.3 for a meaningful distinguishing fragment, and 0 otherwise. Duplicate formulations receive credit once. The composition allowance is included inside the 100-point weights. Score percentage is earned weighted points divided by 100.

Evidence should identify affected behavior, preconditions, root cause, impact, a deterministic transaction/state sequence, and a distinguishing repair or control. Generic labels and speculative external assumptions are insufficient. Severity labels do not change registered weights.

## Integrity and reveal

`SOURCE_MANIFEST.json` commits hunter-visible source/spec/test inputs through per-file SHA-256 and an aggregate digest. `sealed/metadata.json` records the AES-256-GCM/scrypt parameters, salt, nonce, authentication tag, authenticated-data label, canonical plaintext SHA-256 commitment, and ciphertext SHA-256. `npm run seal:verify` checks public ciphertext integrity but cannot decrypt.

After an authorized reveal, pipe the externally supplied hexadecimal key to `npm run private:test`. The script derives the encryption key, authenticates/decrypts into a temporary directory, verifies the plaintext commitment, runs all private reproductions and patched controls, and deletes the temporary copy. Never place the key in an environment file, command argument, repository file, git configuration, or saved shell history.

Any change to a manifest-covered file creates a different benchmark target and must be reported. Generated `artifacts/` and local `node_modules/` are excluded because they are reproducible from covered inputs.
