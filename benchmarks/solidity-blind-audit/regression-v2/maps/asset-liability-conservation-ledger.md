# Asset/liability conservation ledger

The ledger follows economic value rather than trusting emitted events or nominal
function arguments.

| Operation | Asset delta | Claim/liability delta | Required conservation | Observed boundary |
| --- | ---: | ---: | --- | --- |
| Standard vault deposit of 100 | vault +100 | shares +100 at 1:1 | minted claim equals received backing | holds in control |
| 10% fee vault deposit of 100 | vault +90 | shares computed from +100 | new claims must use +90 | violated; depositor extracts 9 and incumbent loses 9 |
| 2:1 vault withdrawal of 1 | vault -1 | floor burn 0 | nonzero asset exit requires sufficient burn | violated; zero-share caller gains 1 |
| Borrow 50 | market -50 | debt +50 | reserve decrease equals debt increase | holds before repayment |
| 10% fee repayment of nominal 50 | market +45 | debt -50 | debt decrease must not exceed received value | violated; reserve deficit 5 |
| Callback borrow 500 | market -500 | debt +500 after callback | collateral supporting final debt remains escrowed | violated; final collateral 0 |
| Compound borrow 150,000 | market -150,000 | debt +150,000 | final independently valued collateral supports debt | violated after transient rates normalize |
| Bridge credit | no local asset enters | synthetic collateral rises | authentic origin and replay domain justify liability | origin and namespace checks are incomplete |
| Reward claim | distributor -amount | replay authorization consumed | one authorization funds one payout | raw signature malleability permits a second payout |

## System-loss oracles

- Compound path: market stable balance decreases by exactly 150,000 while the
  attacker closes a 100,000 flash principal plus 50 fee and retains 49,950.
- Fee deposit: attacker's 200-token starting balance becomes 209 after a
  deposit/redeem cycle, while the incumbent's redeemable value falls 900 -> 891.
- Fee repayment: recorded debt becomes zero while the market remains 5 stable
  below its pre-borrow balance.
- Callback exit: the attacker holds the borrowed stable and all original vault
  shares while the market records debt and zero local collateral.

The numerical execution trace is in `regression-v2/evidence/deep-regressions.log`.
