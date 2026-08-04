# Baseline research record

This file indexes the complete pre-tuning audit record. The raw evidence remains
in its original files; this index does not rewrite or reinterpret the blind run.

## Immutable boundary

- Final pre-tuning commit: `6a7759462f19b0c97adc8540d70db6562be32e5d`
- Final pre-tuning tree: `6b5eb5e558f8d2dfaf8165c66733377cc297788e`
- Frozen target commit: `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`
- Target source-manifest digest: `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`
- Skill base commit: `99352083d1b50d54f4f4dff2511d13c4ff551522`
- Ground-truth commitment: `b200a4a2908b88a3db88d485a173fe60a434968bc8a785a3d3b202aea4031475`
- Encrypted-bundle digest: `5b73c297c2797056a22fc344736c145785ca2a7e3df19e0fd8d6f5010c683601`

The commit and tree above are the contamination boundary. Any run using later
Aim instructions against this target is a **revealed regression run**, not a
second blind evaluation. It may measure whether the revised workflow closes
known failure modes, but it cannot establish unbiased generalization.

## Frozen protocol

The benchmark used one fresh-context hunter and isolated generator, reviewer,
consensus, reveal, and scoring stages. The hunter had a 180-minute wall-clock
budget, at most 250 tool invocations, no human assistance, no network access,
and no access to the ground truth, seal, other commits, workspaces, issue
trackers, or external reports. Production contracts and the frozen source
manifest were not modified.

The environment was Node.js 24.14.0, npm 11.9.0, solc-js 0.8.30, ethers 6.15.0,
and Ganache 7.9.2. Native Forge, native solc, and GitHub CLI were unavailable.
Exact configuration is stored in
[`environment/pre-hunt.json`](environment/pre-hunt.json),
[`preregistration/budget.json`](preregistration/budget.json), and
[`run/run-attestation.json`](run/run-attestation.json).

## Baseline result

| Measure | Frozen result |
| --- | ---: |
| Committed truth units | 15: 2 Critical, 10 High, 3 Medium |
| Submitted / independently reproduced claims | 11 / 11 |
| Exact matches | 9 / 15 (60.00%) |
| Exact plus partial credit | 10 / 15 (66.67%) |
| Severity-weighted recall | 41 / 62 (66.13%) |
| Unique/raw precision | 10 / 11 (90.91%) |
| False-positive clusters | 0 / 11 (0%) |
| Duplicate claims | 0 / 11 (0%) |
| Severity calibration | 59 / 66 (89.39%) |
| Secondary committed rubric | 66 / 104 (63.46%) |
| Hunter wall time | 44m 52.232s / 180m |

Exact matches were F-02, F-05, F-08, F-09, F-10, F-11, F-12, F-13,
and F-15. F-03 and F-04 were partial. F-01, F-06, F-07, and F-14 were
missed. The miss pattern was concentrated in composed economic exploitation,
downstream consumer escalation, ERC-4626 rounding, and fee-on-transfer balance
accounting. See [`RESULTS.md`](RESULTS.md) and the canonical
[`scoring/output/results.json`](scoring/output/results.json) for the complete
breakdown and protocol caveats.

## Raw artifact map

| Stage | Canonical record |
| --- | --- |
| Pre-registration | [`preregistration/`](preregistration/) |
| Frozen target and source hashes | [`source-manifest.json`](source-manifest.json) |
| Sealed truth commitment | [`commitment.json`](commitment.json) and [`sealed/`](sealed/) |
| Hunter state, coverage, rejected leads, and events | [`run/goal-state/`](run/goal-state/) and [`run/evidence/_run/`](run/evidence/_run/) |
| All candidate harnesses and raw outputs | [`run/evidence/`](run/evidence/) |
| Frozen hunter submission | [`run/submission/`](run/submission/) |
| Independent blind reviews | [`blind-review/reviewer-a/`](blind-review/reviewer-a/) and [`blind-review/reviewer-b/`](blind-review/reviewer-b/) |
| Blind consensus | [`blind-review/consensus/`](blind-review/consensus/) |
| Reveal and 15 exploit / 15 patched-control checks | [`reveal/`](reveal/) |
| Independent post-reveal scores | [`scoring/inputs/scorer-a/`](scoring/inputs/scorer-a/) and [`scoring/inputs/scorer-b/`](scoring/inputs/scorer-b/) |
| Canonical adjudication and calculations | [`scoring/output/`](scoring/output/) |
| Resource accounting | [`run/resource-metrics.json`](run/resource-metrics.json) |

The hunter recorded 12 Aim experiment events, 11 validated candidates, seven
rejected candidate families, 37 confirmed compilations, 36 completed test
processes, and 76 completed test cases (74 passed). The two failed cases were
preserved harness-only first attempts that were corrected and rerun. Service-side
tool-call, token, compute, cost, time-to-first-finding, and per-candidate timing
telemetry were unavailable and were not estimated.

## Archive revalidation before tuning

At `2026-08-04T16:19:11Z`, before changing Aim, the archived record was checked
again from the repository:

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts --cache /tmp/aim-baseline-npm-cache` | 354 pinned packages installed |
| `npm run check` | 21 contracts compiled; 6/6 ordinary tests passed |
| Revealed exploit/control suite | 30/30 tests passed |
| `node scoring/output/calculation-check.mjs` | 1,009 assertions passed; 73 input hashes verified |
| `python3 -m unittest discover -s tests -v` | 16/16 Aim state tests passed |
| Skill quick validation | Passed |
| `sha256sum -c SHA256SUMS` in the reveal package | 10/10 files passed |

The first dependency-install attempt used the unavailable `/root/.npm` cache and
failed before testing; the isolated-cache retry above succeeded. Ganache also
reported its expected native µWS incompatibility and used its JavaScript
fallback. Neither environment message changed a test result.

## Interpretation rule for the next run

Keep the evidence gates and false-positive accounting unchanged. Report every
new claim, rejected lead, reproduction, negative control, duplicate, and miss.
Compare recall, precision, severity calibration, evidence quality, composition
coverage, and resource use—not raw finding count alone. Never describe a
revealed-target improvement as blind or novel.
