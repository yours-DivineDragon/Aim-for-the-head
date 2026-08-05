# Research basis

This workflow combines primary field reports, official tool documentation, and
open skill specifications. It distinguishes reported observations from design
inferences so future maintainers can revisit the choices.

## Goal persistence is infrastructure, not analysis

Trail of Bits' Patch the Planet report describes three effective practices:
have the model draft and critique the goal, specify the outcome rather than the
route, and keep one outcome per agent. It also treats threat modeling as close to
essential and separates bug hunting from coverage work. The reported pipelines
then add variant abstraction, multiple validation passes, and human review.

Source: [How we use `/goal` to find bugs in Patch the
Planet](https://blog.trailofbits.com/2026/07/28/how-we-use-goal-to-find-bugs-in-patch-the-planet/).

OpenAI's goal documentation defines a goal as a durable thread-scoped completion
contract with evidence, boundaries, iteration, and explicit blocked behavior. It
also explains event-driven continuation and pause, resume, and clear lifecycle
operations. This supports the design inference that `/goal` improves persistence
but does not itself choose or run security tools.

Sources: [Using Goals in
Codex](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex),
[Follow a goal](https://learn.chatgpt.com/use-cases/follow-goals), and
[Iterate on difficult
problems](https://learn.chatgpt.com/use-cases/iterate-on-difficult-problems).

## Threat models prevent meaningless success

OWASP frames threat modeling around scope, what can go wrong, mitigations, and
verification, with assets, entry points, trust boundaries, threats, and controls
as core inputs. The contract in this skill uses those inputs to prevent findings
that require impossible privileges or produce no protected-asset impact.

Source: [OWASP Threat Modeling
Project](https://owasp.org/www-project-threat-modeling/).

## Read coverage and runtime coverage answer different questions

AICov records which source lines an agent observed and can emit LCOV, JSON, and
HTML reports; it also distinguishes searches and identifies tracked files with
zero reads. Its documentation makes it a useful blind-spot instrument. The
inference in this skill is deliberately narrower: observed reads do not prove
comprehension, execution, semantic-state exploration, or vulnerability absence.
Transcripts may also contain sensitive material, so audit storage and sharing.

Source: [Trail of Bits AICov](https://github.com/trailofbits/aicov).

LLVM describes libFuzzer as an in-process, coverage-guided engine that mutates a
corpus and is commonly paired with SanitizerCoverage. That makes runtime coverage
valuable for input exploration while leaving harness reachability and semantic
oracles as separate obligations.

Source: [libFuzzer documentation](https://llvm.org/docs/LibFuzzer.html).

## Adaptive experiments outperform prescribed rituals

Trail of Bits' zlib field report describes an agent building its own fuzzing and
sanitizer setup, testing variants, and rejecting crashes that could not reach
the real target. Project Zero's Big Sleep report likewise describes an agent
adapting failed tests and finding a SQLite memory-safety issue that a substantial
fuzzing campaign did not rediscover because coverage and harness configuration
did not express the needed semantic path.

These reports support leaving technique selection open while making reachability,
configuration, reproducibility, and impact non-negotiable.

Sources: [Field reports from Patch the
Planet](https://blog.trailofbits.com/2026/07/02/field-reports-from-patch-the-planet/)
and [From Naptime to Big
Sleep](https://projectzero.google/2024/10/from-naptime-to-big-sleep.html).

## Standards expose semantic and arithmetic integration boundaries

ERC-20 standardizes a callable token API and requires callers to handle a false
return, but it does not state that a nominal transfer argument must equal the
recipient's observed balance increase. This supports treating exact balance
movement as an integration assumption that must be verified or measured rather
than inferred from ABI compatibility.

ERC-4626 distinguishes approximate conversion views from mutation previews,
warns that preview/conversion results can be manipulable, and specifies opposing
rounding directions that favor the vault: shares issued and assets returned
round down, while assets charged and shares burned round up. This supports the
exact boundary matrix and the requirement to trace a manipulable conversion
through every security consumer.

Solidity's official security guidance states that any external call hands over
control, that reentrancy can involve multi-contract state, and that state effects
should be committed before interactions. This supports enumerating all
cross-function and cross-contract actions reachable at each interaction point
rather than testing only same-function recursion.

Sources: [ERC-20](https://eips.ethereum.org/EIPS/eip-20),
[ERC-4626](https://eips.ethereum.org/EIPS/eip-4626), and
[Solidity security considerations](https://docs.soliditylang.org/en/latest/security-considerations.html#reentrancy).

## Composed attacks require sequence synthesis and economic closure

Qin et al. model flash-loan attacks as optimization over protocol and ecosystem
state, including atomic repayment and profit. FlashSyn later synthesizes
multi-invocation adversarial transactions and searches parameters that maximize
profit. These primary results support two design inferences here: retain
temporary funding as an attacker capability when the environment permits it,
and require one compatible execution to close principal, fees, profit, and
system loss rather than combining separately demonstrated primitives in prose.

Sources: [Attacking the DeFi Ecosystem with Flash Loans for Fun and
Profit](https://arxiv.org/abs/2003.03810) and [FlashSyn](https://arxiv.org/abs/2206.10708).

## Variant analysis needs abstraction plus controls

CodeQL defines variant analysis as using a known vulnerability as a seed for
similar problems. Semgrep's guidance recommends starting with an exact match and
generalizing carefully because precision and recall trade off; its test format
uses positive `ruleid` and negative `ok` annotations. The variant workflow here
therefore separates a risk abstraction from the exact seed and requires positive
and negative fixtures as a rule broadens.

Sources: [About CodeQL](https://codeql.github.com/docs/codeql-overview/about-codeql/),
[Semgrep variant-analysis guidance](https://semgrep.dev/blog/2025/finding-more-zero-days-through-variant-analysis/),
and [Semgrep rule testing](https://docs.semgrep.dev/writing-rules/testing-rules).

## Independent reproduction is stronger than agreement

The Trail of Bits pipeline reports two validation passes using different models
before human review. This skill strengthens the operational definition: an
independent reviewer receives raw artifacts before the hunter's conclusion and
must reproduce or trace the disputed gates. Different-model agreement without
reproduction remains correlated opinion, not evidence.

This is a design inference from the Patch the Planet process rather than a claim
that model diversity alone guarantees independence.

## Broad audits need scope-wide baselines before candidate convergence

OWASP's secure-code-review guidance distinguishes baseline review of an entire
codebase from diff review, starts baseline work with application boundaries and
entry points, and recommends tracking manual coverage gaps. The OWASP Smart
Contract Security checklist likewise uses scoping, entry-point mapping, state
changes, math/precision, business logic, oracles, and integrations as structured
audit coverage. NIST IR 8397 recommends multiple complementary verification
techniques rather than treating one technique or result as sufficient.

These sources support a workflow inference: candidate evidence can prove one
finding deeply, but it cannot satisfy the breadth obligation of a repository-wide
audit. The v3 broad-audit profile therefore requires an exact scope manifest and
a component-by-lens baseline before a terminal result.

Sources: [OWASP Secure Code Review Cheat
Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html),
[OWASP Smart Contract Security
Checklist](https://scs.owasp.org/checklists/), and [NIST IR
8397](https://csrc.nist.gov/pubs/ir/8397/final).

NIST's combinatorial-testing guidance recommends equivalence partitions and
boundary values rather than arbitrary low/medium/high samples. EIP-1014 makes a
CREATE2 address depend on deployer, salt, and init-code hash, and explicitly
specifies collision failure. Together with ERC-4626's unit and rounding rules,
these sources support mandatory baseline questions for zero/one/extreme states,
units and decimals, lifecycle transitions, identity domains, and deterministic
deployment collisions.

Sources: [NIST testing do's and
don'ts](https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software/software-testing-methodology/dos-and-don-ts-of-testing),
[EIP-1014](https://eips.ethereum.org/EIPS/eip-1014), and
[ERC-4626](https://eips.ethereum.org/EIPS/eip-4626).

## Portability follows the open skill layout

The Agent Skills specification defines a `SKILL.md` package with optional scripts,
references, and assets, and recommends progressive disclosure. Official host
documentation supplies the host-specific discovery and invocation paths used in
the portability table.

Sources: [Agent Skills
specification](https://agentskills.io/specification), [Codex
skills](https://developers.openai.com/codex/build-skills), [Codex best
practices](https://developers.openai.com/codex/learn/best-practices), [Claude
Code skills](https://code.claude.com/docs/en/skills), [Kimi Code
skills](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html),
[Kimi goals](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/goals.html),
and [OpenCode skills](https://opencode.ai/docs/skills/).

## Design consequences

The evidence above leads to these deliberate choices:

1. Use one outcome per durable goal; keep the method adaptive.
2. Build the threat model and non-success conditions before activation.
3. Inventory tools explicitly because persistence cannot discover hidden tools.
4. Separate mapping, hunting, coverage, validation, and reporting.
5. Track coverage as a vector and never equate it with security completeness.
6. Treat tool output as leads and require attacker-to-impact evidence.
7. Validate in release-like conditions with a safe oracle and negative control.
8. Blind independent reproduction and delay duplicate search until the candidate
   is technically anchored when novelty matters.
9. Preserve durable, vendor-neutral state so compaction and model changes do not
   erase the contract or failed experiments.
10. End with a typed terminal outcome and residual risk, never an unsupported
    declaration that the target is secure.
11. Model business flows and system-wide conservation before promoting a local
    effect.
12. Treat ABI compatibility and nominal arguments as distinct from measured
    external semantics.
13. Trace every primitive through consumers, interleavings, and compatible
    joins before closing the surface.
14. Require arithmetic boundary cases and a final attacker/system/third-party
    impact ledger before calling a composed result.
15. Distinguish focused finding-count hunts from broad scope-wide audits.
16. Freeze exact scope bytes and the authority used to select them.
17. Default broad audits to a visible known-material inventory; blind novelty
    must be explicit and must not erase known current risk.
18. Require every broad-audit component to close the simple baseline lenses
    before one deep candidate can terminate the run.
