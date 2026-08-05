# Benchmark records and independence policy

Benchmark payloads are archived separately from the installable Agent Skill.
The complete original corpus is preserved at:

- archive branch: [`archive/benchmarks-2026-08-05`](https://github.com/yours-DivineDragon/Aim-for-the-head/tree/archive/benchmarks-2026-08-05)
- immutable snapshot: [`3d1b6f68430737c82155218eb6714f3637dd0d3d`](https://github.com/yours-DivineDragon/Aim-for-the-head/tree/3d1b6f68430737c82155218eb6714f3637dd0d3d/benchmarks)

The `main` branch intentionally contains no vulnerable target, sealed answer
bundle, hunter transcript, scoring log, or benchmark runner. The documented
shallow, single-branch install therefore fetches the skill package without the
research corpus.

## What the existing studies establish

### Aster: history-verifiable blind benchmark

The [Aster benchmark](https://github.com/yours-DivineDragon/Aim-for-the-head/tree/3d1b6f68430737c82155218eb6714f3637dd0d3d/benchmarks/solidity-blind-audit)
has a public chronological boundary. Commit `75d19f5` contains the target,
source manifest, commitment, and sealed truth without the run, reveal, or
scoring directories. The hunter submission appears later in `2818814`; the
commitment and ciphertext remain byte-identical. The published history therefore
supports the claim that the answers were committed before the submitted hunt.

The resulting blind score is 66.67% with no false positives. The later 15/15
workflow-v2 run is useful truth-informed regression evidence only; it is not a
second blind score or a generalization result.

### Meridian: common-author self-evaluation

The [Meridian Clearing study](https://github.com/yours-DivineDragon/Aim-for-the-head/tree/3d1b6f68430737c82155218eb6714f3637dd0d3d/benchmarks/perps-blind-generalization)
is reproducible and internally consistent. Its authenticated seal opens to the
published reveal, the deterministic tests pass, and the scoring arithmetic
produces 89.4/100 with no false positives.

That number is not presented as independent generalization. The checklist,
target interests, planted rubric, hunter, reviewer, and scorer roles were all
created inside one operator-controlled study. The public repository also lacks
a reachable pre-run commit containing only the target and sealed truth; target,
run, reveal, key, and score entered published history together. Cryptography
proves that the reveal matches the ciphertext, but not when the answers became
fixed relative to the hunt.

The target code was hidden from the hunter context, but the bug taxonomy was
not independent of the workflow's design interests. The 11 validated findings
outside the registered rubric are evidence of open-world discovery breadth and
of rubric incompleteness—not extra recall. The registered critical composed
chain received only 0.3 fragment credit. These limitations are part of the
result, not footnotes to it.

### Meridian archive erratum: unreachable freeze identifiers

`REVEAL_ATTESTATION.md` in the archived study cites four intermediate freeze
identifiers that are not reachable as commit objects from any published ref:

- `158651792f770f5e827c1f0c363ea91f916cb1b8` — target and seal;
- `31ea4b7367a42fb1d87d486e945e54361a8d0ca3` — hunter submission;
- `c1e2b8cd7bd098098a05bb7010277c81e3ae9aed` — independent reviews;
- `d07b5ed83def43f6293bd41eaf51e97dc2fec501` — review consensus.

They record local orchestration stages, not third-party-verifiable publication
boundaries. The archive is preserved unchanged as historical evidence; this
erratum is the authoritative interpretation of those identifiers. The absence
of reachable stage commits is one reason Meridian remains classified as a
common-author self-evaluation.

## Protocol for future headline benchmarks

The executable procedure is documented in
[`references/benchmark-protocol.md`](references/benchmark-protocol.md) and
implemented by [`scripts/benchmark_protocol.py`](scripts/benchmark_protocol.py).
Its private pre-seal gate rejects unmapped public invariants, orphaned or
multiply mapped scoring units, missing controls, and weights that do not total
100. Its publication gate requires distinct remote refs and a direct-parent
commit chain for sealed target, submission, reveal, and scoring, with chained
receipts and no future-stage material in earlier trees or intermediate commits.

A future result may be described as blind or generalizing only when all of the
following are publicly verifiable:

1. **Independent authorship.** A person or team that did not author or tune the
   hunting checklist supplies the target and hidden rubric. A naturally
   occurring third-party codebase may substitute for planted bugs when scope and
   disclosure rules permit.
2. **Public precommitment.** One reachable commit contains the frozen target,
   hunter-visible manifest, scoring rules, commitment, and authenticated sealed
   truth. It contains no hunter submission, reveal, key, or post-hoc scoring.
3. **Ordered publication.** Later commits separately publish the hunter
   submission and reviews, then the reveal/key, then final scoring. Every cited
   freeze SHA remains reachable from a published ref.
4. **Interest separation.** The target author does not receive the hunter's
   private strategy or use its named checklist to choose the planted taxonomy.
   The hunter receives no rubric-derived bug-class hints beyond a neutral scope
   and threat model.
5. **Deterministic verification.** Third parties can authenticate the seal,
   recreate the reveal, verify source manifests, run positive and negative
   controls, and reproduce score arithmetic from documented commands.
6. **Honest accounting.** Registered truth units determine recall. Distinct
   out-of-rubric findings are reported separately. Unsupported candidates count
   against precision, and partial composed chains do not inherit the severity of
   an unproven final impact.

If independence or chronology is missing, publish the work as a regression,
ablation, or common-author self-evaluation and state the confound next to the
number. The next generalization target for this project must come from an
external target/rubric author.

That final requirement is an external dependency, not a repository task that
the current operator can self-certify. Until a genuinely independent author or
naturally occurring third-party target with an appropriate disclosure history
is secured, the project must not publish another common-author score as a
generalization result.
