# Rounding, unit, and zero-boundary matrix

| Surface | Formula/direction | Boundary tested | Positive oracle | Control | Disposition |
| --- | --- | --- | --- | --- | --- |
| `convertToShares` | `assets * supply / managed`, down | assets=1, supply=100, managed=200, decimals=0 | result 0 | at 1:1 result 1 | unsafe for withdrawal |
| `withdraw` | burns `convertToShares(assets)` | owner shares=0, requested assets=1 | transfers 1, burns 0 | 1:1 zero-share withdrawal reverts | supported finding |
| `deposit` | shares computed before transfer | transfer fee=10% | nominal 100 creates excess claim | standard token returns starting balances | supported finding |
| `repay` | `paid=min(amount,debt)` before transfer | transfer fee=10%, debt=50 | debt -50, reserve +45 | standard token restores reserve | supported finding |
| collateral conversion | multiply then divide | posted shares remain fixed while exchange rate changes | borrow limit nearly doubles | transfer outside vault has no effect | supported finding |
| oracle normalization | decimal exponent conversion | feed decimals below/equal/above 18 | no independent exploit isolated | covered by ordinary suite | closed |
| pool quote | fee and constant-product floors | shallow reserves and large atomic input | manipulable spot reaches consumer | positive feed blocks fallback join | primitive plus compound |

The arithmetic hunt deliberately used coarse units and non-1:1 rates; a default
18-decimal, 1:1 fixture would conceal the zero-burn withdrawal.
