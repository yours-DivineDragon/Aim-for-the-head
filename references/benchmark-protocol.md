# Benchmark pre-seal and publication protocol

Use this protocol only for a benchmark intended to support a blind or
generalization claim. Regression and common-author self-evaluations may use the
same checks, but must retain their weaker label.

The checker enforces two boundaries:

1. every published invariant is dispositioned before truth is sealed, and every
   scored unit maps back to exactly one public invariant;
2. sealed target, submission, reveal, and scoring are direct-parent commits on
   distinct published refs, with no uninspected intermediate commit and no
   future-stage material in an earlier tree.

It does **not** create independent authorship or interest separation. An
external target and rubric author remains mandatory for the next headline
benchmark.

## Pre-seal invariant coverage

Prepare three private JSON files before encryption.

`public-invariants.json`:

```json
{
  "schema_version": 1,
  "invariants": [
    {"id": "INV-001", "statement": "Protocol assets cover redeemable claims"}
  ]
}
```

`units.json` contains the scored truth units. Weights must be positive and total
exactly 100:

```json
{
  "schema_version": 1,
  "units": [
    {"id": "UNIT-001", "weight": 100}
  ]
}
```

`invariant-coverage.json` contains one row per public invariant:

```json
{
  "schema_version": 1,
  "rows": [
    {
      "invariant_id": "INV-001",
      "disposition": "registered-unit",
      "unit_ids": ["UNIT-001"],
      "evidence": ["private-controls/unit-001.log"],
      "reason": "The hidden reproduction and patched control exercise this invariant"
    }
  ]
}
```

Allowed dispositions are:

| Disposition | Requirement |
| --- | --- |
| `registered-unit` | One or more uniquely owned scored unit IDs and non-empty control evidence |
| `patched-safe` | Non-empty executable safe-behavior evidence and no unit IDs |
| `negative-control` | Non-empty discriminating control evidence and no unit IDs |
Run the private check before constructing ciphertext:

```bash
python3 scripts/benchmark_protocol.py preseal \
  --root /absolute/path/to/private-bundle-work \
  --invariants public-invariants.json \
  --units units.json \
  --matrix invariant-coverage.json \
  --output /absolute/path/to/public-benchmark/sealed/PRESEAL_ATTESTATION.json
```

The public attestation exposes counts and commitments, not the invariant-to-unit
rows. Seal `units.json`, `invariant-coverage.json`, controls, canary, and private
runner together. Publish the byte-equivalent units and matrix under `reveal/`;
the staged checker verifies both canonical hashes. Delete plaintext copies only
after a fresh decrypt-and-rerun.

## Required sealed commitment

The public `sealed/commitment.json` must use schema version 1 and bind:

- `ciphertext_sha256` — raw encrypted bundle bytes;
- `preseal_attestation_sha256` — raw `PRESEAL_ATTESTATION.json` bytes;
- `invariant_matrix_sha256` — private canonical matrix hash copied from the
  pre-seal attestation;
- `public_invariants_sha256` — canonical JSON hash;
- `source_manifest_sha256` — canonical JSON hash; and
- `scoring_rules_sha256` — canonical JSON hash.

The publication checker recomputes every public hash and verifies that the
private matrix commitment is carried through unchanged.

`SOURCE_MANIFEST.json` uses one record per hunter-visible target file and no
others. Paths are relative to the benchmark root:

```json
{
  "schema_version": 1,
  "files": [
    {
      "path": "target/contracts/Protocol.sol",
      "sha256": "<sha256-of-raw-file-bytes>"
    }
  ]
}
```

The sealed-stage check rejects missing, extra, duplicate, escaping, or
digest-mismatched target entries.

## Standard benchmark tree

At the sealed stage, `<benchmark-root>` must contain:

```text
target/<at least one hunter-visible file>
PUBLIC_INVARIANTS.json
SOURCE_MANIFEST.json
SCORING_RULES.json
sealed/PRESEAL_ATTESTATION.json
sealed/commitment.json
sealed/private-bundle.tar.enc
```

Later stages add:

| Stage | Added paths |
| --- | --- |
| `submission` | `submission/submission.json`, `publication-receipts/sealed.json` |
| `reveal` | `reviews/consensus.json`, `reveal/key.txt`, `reveal/units.json`, `reveal/invariant-coverage.json`, `publication-receipts/submission.json` |
| `scoring` | `scoring/final-score.json`, `publication-receipts/reveal.json` |

The checker rejects submission, review, reveal, scoring, or receipt paths in the
sealed tree; reveal/scoring paths in the submission tree; and scoring paths in
the reveal tree. Files outside the declared stage paths are also rejected, so
future material cannot be hidden under an alternate top-level name. Every later
commit may only add files in its own stage paths; it may not modify or delete
the target, commitments, prior submissions, reviews, reveals, receipts, or
other earlier-stage material.

## Publish and gate each stage

Choose a fresh immutable benchmark ID and ref prefix. Push only the sealed
commit first, fetch the public remote-tracking ref, and run:

```bash
git push origin HEAD:refs/heads/benchmark/<id>/sealed
git fetch origin

python3 scripts/benchmark_protocol.py publication \
  --repository /absolute/path/to/repository \
  --benchmark-root benchmarks/<id> \
  --benchmark-id <id> \
  --remote origin \
  --ref-prefix benchmark/<id> \
  --through sealed \
  --output /tmp/sealed-publication-receipt.json
```

Do not start the hunt until this command succeeds and an independent observer
can resolve the sealed ref. The checker requires all later-stage refs to be
absent at this gate.

Add the sealed receipt unchanged as
`publication-receipts/sealed.json` in the submission commit, push that commit to
`benchmark/<id>/submission`, fetch, and rerun with `--through submission`.
Repeat for reveal and scoring. Each stage:

- uses a distinct commit;
- is the direct child of the preceding stage commit;
- has matching fetched and live-remote refs for
  `refs/heads/<prefix>/<stage>`;
- contains the preceding receipt with the expected commit, tree, ref, absence
  list, timestamp shape, and receipt-chain hash; and
- emits the receipt to include in the next stage.

Never generate all four refs after the hunt and present them as a precommitment.
Preserve the pull requests, workflow runs, or other public-host events showing
that the sealed gate was published before the hunter began. The ref and receipt
chain makes the repository structure checkable; host chronology supplies the
external timestamp.

## Final interpretation

A passing result establishes that the registered rubric was complete relative
to the published invariant list at sealing, public hashes stayed bound, and the
published Git objects have the required stage separation. It does not establish
that the invariant list itself was complete, that the target was naturally
occurring, or that authorship interests were independent. Report those facts
separately and refuse the word “generalization” when they are absent.
