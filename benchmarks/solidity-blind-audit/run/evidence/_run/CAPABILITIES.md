# Capability inventory

| Capability | Availability / invocation | Evidence | Blind spot / validation need |
| --- | --- | --- | --- |
| Deterministic compile | `npm run compile`; repository `compileAll()` | ABI and optimized EVM Paris bytecode for all contracts | Successful compilation does not prove security or runtime reachability |
| Functional tests | `npm test`; `npm run check` | Ordinary integrated behavior on a clean Ganache chain | Tests cover documented happy paths only |
| Standalone candidate tests | Node 24 test runner plus `ethers` 6.15.0 and `ganache` 7.9.2 | Exact clean-chain call sequence and asserted final state | Each harness needs a discriminating negative/sanity case and a second fresh-process run |
| Compiler | local `solc-js 0.8.30+commit.73712a01`, optimizer 200, EVM Paris | Release-like compilation and bytecode | No sanitizer/formal oracle; source and economic invariants still require manual trace |
| Static/manual query | `rg`, numbered source reads, ABI/source census | Concrete source locations, guard and sink inventories | Pattern matches do not prove attacker control or effect |
| Chain trace/state | Ganache Shanghai, chain ID 31337; ethers receipts/state reads | Transaction success/revert and final balances/ledgers | A single run is not completeness; isolate each candidate on a fresh chain |
| External scanners/history/review | unavailable and forbidden by isolation | none | Cannot support novelty, duplicate, or human-review claims; explicitly omitted where allowed |

Recorded versions: Node v24.14.0, npm 11.9.0, ethers 6.15.0, Ganache 7.9.2, solc-js 0.8.30+commit.73712a01.
