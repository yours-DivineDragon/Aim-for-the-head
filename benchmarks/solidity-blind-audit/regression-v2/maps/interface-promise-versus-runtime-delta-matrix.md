# Interface promise versus runtime-delta matrix

| Integration | Interface-level promise | Consumer assumption | Supported semantic variant | Runtime oracle | Result |
| --- | --- | --- | --- | --- | --- |
| Vault underlying `transferFrom` | call returns `bool` | requested amount equals vault balance increase | 10% fee token | before/after balances | excess shares and incumbent dilution |
| Market stable `transferFrom` | call returns `bool` | requested payment equals market receipt | 10% fee token | reserve restored vs debt cleared | 5-unit accounting deficit |
| Pool input/output tokens | call returns `bool` | implementation measures balance deltas | fee-bearing token | actual input/output deltas | guarded on tested surface |
| Price feed `latestRoundData` | answer plus round metadata | any positive answer is current | stale positive round | timestamp/round age vs borrow limit | stale value accepted |
| Messenger context | exposes source chain and sender | configured chain implies configured app | mismatching source sender | credit and subsequent borrow | origin bypass |
| ECDSA recovery | equivalent encodings can recover signer | raw bytes identify authorization use | high-s counterpart | signer equal, signature hash distinct | replay bypass |

## Precision boundary

No finding relies on arbitrary malicious return values. Each positive semantic
variant is ABI-compatible and not excluded by an enforceable target rule. Matched
standard-token controls prevent generic “nonstandard token” allegations from
counting without a measured accounting or asset-loss consequence.
