# Funding, repayment, profit, and system-loss ledger

## Compound Critical execution

All quantities below are stable-token units unless stated otherwise.

| Step | Attacker/actor | Flash lender | Lending market | Other state |
| --- | ---: | ---: | ---: | --- |
| Initial | 0 stable + 1,000 posted vault shares | 100,000 | 1,000,000 | pool 10,000 asset / 10,000 stable |
| Flash funding | +100,000 | -100,000 | unchanged | principal due 100,000 + 50 fee |
| Stable-to-asset swap | stable spent; asset received | unchanged | unchanged | fallback spot manipulated |
| Vault donation | -8,000 asset | unchanged | unchanged | posted-share exchange rate increases |
| Market borrow | +150,000 stable | unchanged | -150,000 | debt +150,000 |
| Flash close | -100,050 stable | +100,050 | unchanged | funding fully closed |
| Final | **+49,950 stable** | principal restored +50 | **-150,000 stable; +150,000 undercollateralized debt** | transient rates later normalize |

Discriminating boundary: the recorded spot-only borrow limit is below 100,050,
while the combined limit exceeds 150,000. Thus neither a flash-loan story nor a
pair of isolated primitives is treated as a Critical claim without closure.

## Standalone accounting closures

| Finding path | Attacker cost/funding | Repayment/cleanup | Attacker gain | System loss |
| --- | --- | --- | --- | --- |
| Fee-token vault deposit | 100 nominal token deposit; fee returns to depositor | redeem all minted shares | +9 tokens over pre-deposit balance | incumbent redeemable value -9 |
| Fee-token debt repayment | borrow 50 against legitimate collateral | nominally repay 50; transfer delivers 45 | debt fully cleared for 45 received | market reserve short 5 |
| Callback collateral exit | pre-fund/post 1,000 vault shares | none required by target | 500 stable plus recovery of all shares | 500 unsecured debt |
| Zero-burn withdrawal | no shares; request one coarse asset unit | none | +1 asset | vault -1 with unchanged supply |

Measured values and controls are preserved in
`regression-v2/evidence/deep-regressions.log`.
