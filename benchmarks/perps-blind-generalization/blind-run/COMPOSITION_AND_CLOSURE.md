# Primitive composition, failed joins, and final delta ledger

All joins below use the same frozen target. “Success” requires one execution in the named evidence packet; separate prose is never combined. Amounts are deterministic fixture units and do not claim market valuation.

## Primitive cards and consumer edges

| Card | Controlled effect | Direction/lifetime/cost | Direct consumers | Normalization/cleanup |
| --- | --- | --- | --- | --- |
| P-TRANSFER | nominal inbound credit exceeds actual token receipt | increase, persistent; transfer fee | vault equity/withdraw; bond reserve/share NAV | only later withdrawals expose backing gap; no reconciliation |
| P-WITHDRAW | delayed request ignores health/freeze | collateral out, persistent; one matured request | liquidation equity/deficit and vault backing | none after token leaves |
| P-CALLBACK | live request reusable during token transfer | duplicate transfer in one transaction; requires callback token and sufficient balance | vault request/balance; joins P-WITHDRAW | stack unwind leaves request deleted but double debit/transfer final |
| P-PRICE | latest post-cutoff round becomes immutable | signed PnL shift, epoch-persistent; caller timing | settlement PnL/cash/deficit/insurance | immutable; no retry repair |
| P-FUND | negative growth beyond cap / split dust / settlement order | cash credit/debit shift per interval/epoch | equity, margin, withdrawal, liquidation | checkpoint persists; settlement zeroing can suppress final amount |
| P-POS | wrong crossing basis / duplicate active membership | cash/equity/risk distortion, persistent | health, margin, liquidation, settlement | closing changes/zeros base but stale list persists |
| P-OI | OI only increases | overstatement, persistent, low action cost | operational `reportOpenInterest`, social-loss allocation | no decrement/reconciliation path |
| P-RISK | correlation sign undercharges | lower requirement while positions live | trade/withdraw acceptance and liquidation eligibility | price/position changes |
| P-LIMIT | unweighted limit or truncated signed-order execution | accepted bad execution / fee, transaction-persistent | position basis/cash/insurance fee | nonce consumed; health only bounds remaining equity |
| P-BID-AUTH | bidder names unrelated account | unauthorized position, persistent; zero bond possible | victim equity/risk/settlement | victim must trade/liquidate to remove |
| P-BID-HEALTH | auction fill skips bidder health and bond floor | undercollateralized exposure; transaction-persistent, zero capital | next liquidation and deficit | adverse price or end discount realizes shortfall |
| P-RESIDUAL | timeout finalizes without backstop | abandoned exposure + unfreeze, persistent | trade/withdraw/second auction/deficit | none; finalized flag blocks normal lifecycle |
| P-LATE | old commitment reveals after finalization | post-terminal position change | cash/deficit/bidder and lot | no second deficit resolution |
| P-FREEZE | boolean freeze shared across auction/epoch | one lifecycle clears another | every trade/withdraw and terminal | stale lifecycle remains active |
| P-RESERVE | partial decrement or reserve-inclusive NAV | false unavailable liquidity / bond theft | redemption, coverage, terminal bond return | no aggregate repair |
| P-PHANTOM | fee or venue return counted without received token | inflated NAV, persistent | share mint/redeem | no collection/balance-delta repair |

## Successful composed executions

| Join | One-process evidence | Compatibility | Closed caller / protocol / third-party delta |
| --- | --- | --- | --- |
| P-TRANSFER → routed withdrawal | AFH-002/H-002 | same collateral, attacker account, transfer fee reset before output | attacker recovers 1000 nominal after only 900 arrived; vault left 900 backing victim claim 1000; victim shortfall 100 |
| P-WITHDRAW under active liquidation | AFH-003 | request made before adverse move; same account later frozen/unhealthy | recipient +900 native; account margin 100; liquidation remains active; protocol collateral available to cover loss −900 vs routed control |
| P-CALLBACK → duplicate claim | AFH-004 | callback token, balance ≥2× request, permissionless claim | recipient +200 for one 100 request; vault/account −200; request deleted; no-callback +100 |
| P-OI → normal OI report → uncovered deficit | AFH-011 | exact CH stale value used by authorized reporting flow after all bases close | live exposure 0 but reported 4; 775.8 loss indexed at 193.95 with pending0; actual-zero control pending775.8/index0 |
| P-BID-HEALTH + zero bond + P-RESIDUAL | AFH-017 plus AFH-018 dependency | same market/accounts/config; fill near end then 10% adverse price and second auction timeout | bidder capital/bond0; post-fill equity18.2<initial100; final pending social loss81.8; live residual base1 and account unfrozen; repeatable system loss/grief |
| P-FREEZE + epoch settlement + P-LATE | AFH-020 | active bid/auction overlaps scheduled epoch | account settled=true/base0, auction residual1; settlement clears freeze; reveal changes settled account base to−1; future batch skips it |
| P-RESERVE → share redemption | AFH-022 | existing shareholder, live third-party bond, same collateral | shareholder deposited1000 and withdrew2000; fund0; bidder's 1000 record remains but return/slash reverts; no-bond control withdrew1000 |
| P-PHANTOM fee → share redemption | AFH-023 | live shareholder plus trade fee, same fund | token assets1000, promised NAV1120, full redemption permanently reverts; no-fee control succeeds |
| P-PHANTOM venue return | AFH-024 | configured 24-dec output and venue return/effect divergence | collateral input100 sent; output received0; accrued+1e18 though native return would normalize to1e12 if received; system NAV phantom |

## Failed or non-escalating compositions

| Attempt | Result and exact incompatibility |
| --- | --- |
| P-WITHDRAW + P-CALLBACK as a severity upgrade | Compatible and demonstrated separately, but P-WITHDRAW lets the owner pre-request the full balance already. Callback doubles one smaller request but does not increase maximum extractable collateral beyond the matured full request; no severity inflation. |
| 19-decimal oracle + cutoff-price timing | Unsupported as one useful execution: normalization reverts before any settlement value can be recorded, so it causes availability rather than amplifying price corruption. |
| negative funding cap + epoch omission | The current epoch order zeros base and therefore suppresses the final funding payment, including an attacker-favorable negative credit. They can coexist but this ordering blocks, rather than multiplies, that checkpoint effect. |
| cross-zero basis + duplicate active list | Identity/config/lifetime compatible; both distort equity. Existing tests prove local effects, but no one-process net token gain after margin/closure was demonstrated, so no composed impact is claimed. |
| unweighted portfolio limit + signed-order uint128 truncation | Incompatible entry points and data shapes: `executePortfolio` uses uint128 leg prices; `matchOrder` uses uint256 execution and per-order limit. Evidence remains standalone. |
| stale aggregate reservation after slash + theft of live bond | Ordering incompatible: slash deletes the live bond needed for theft; redemption first instead triggers AFH-022 and prevents slash. Both affect available liquidity but are not combined into one claim. |
| fee phantom NAV + full live-bond redemption | Fee phantom makes full redemption exceed even deposit+bond live balance and revert before theft. Partial redemption can still consume bond, but AFH-022 already proves stronger theft without the phantom; no extra impact claimed. |
| direct token transfer to ClearingHouse during coverage (H-028) + withdrawal | Funds remain protocol-owned and account deficit is reduced by the same nominal amount. No source path gave the attacker those tokens or imposed a second claimant loss; rejected at security-impact. |
| sub-native withdrawal rounding + repetition | Repetition only burns the authorized account's own wad claim while sending zero tokens; no attacker profit or third-party loss, rejected. |

## Funding, repayment, profit, and system-loss closure

| Candidate class | Attacker funding/privilege | Fees/repayment/cleanup included | Final attacker delta | Final protocol/third-party delta |
| --- | --- | --- | --- | --- |
| token overcredit AFH-002 | 1000 nominal fee-token units; ordinary account | inbound burn 100 accounted; output fee reset; no debt | returns nominal1000 | victim claim1000 backed by900 (−100) |
| delayed withdrawal AFH-003 | prior 1000 deposit/request; ordinary owner; wait61s | trade fee and adverse PnL included; auction stays active | +900 native tokens from protocol custody | liquidation margin falls900; residual unhealthy exposure persists |
| funding/basis/risk/limit candidates | ordinary margin/order signature as stated | exact fee cash included in oracles; no inference of cash-to-token payout | cash/equity or protected-limit delta only | health/risk/accounting integrity delta; no unsupported external profit |
| matcher cast AFH-025 | victim signed 2000-wei sell; malicious allowlisted matcher | nonce consumed; post-health passes; in-range fee control | matcher token profit not claimed | victim cash −408.338840305126156158 wad vs −2 wei control; truncated position basis |
| auction social loss AFH-017 | zero bond/collateral bidder plus one source distressed lot | late discount, 10% move, second auction duration, finalization and deficit allocation included | no token profit claimed; zero-cost grief | pending social loss+81.8 with residual base1/unfrozen |
| bond theft AFH-022 | existing 1000-share position | full share burn; attempted bond terminal cleanup included | token +2000 after only1000 share deposit | bidder claim −1000 and terminal return/slash unavailable |
| epoch/auction AFH-020 | ordinary permissionless settlement caller/bidder; zero bond | epoch marker, deficit, unfreeze, later reveal all complete | unauthorized/stale position effect | settled account reopened; future batch skips; settlement integrity permanently corrupt |

No unavailable gas-dollar, market-liquidity, model-token, or real-world profit metric is invented. Gas is qualitatively nonzero; AFH-008 is capped Low because its one-wei fixture advantage is uneconomic absent a new amplification source.

