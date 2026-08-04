# System, boundary, flow, and state models

Baseline revision: `158651792f770f5e827c1f0c363ea91f916cb1b8`. This map was reconstructed from every manifest-covered Solidity source, the public specification/invariants/threat surface, compiler scripts, and ordinary tests. Generated artifacts were used only as reproducible ABI/bytecode. Assumptions are labeled.

## Complete source and module census

| Source | Module/purpose | Stateful security data | Public/external entry points | Direct external consumers/calls |
| --- | --- | --- | --- | --- |
| `contracts/lib/SignedWadMath.sol` | signed wad, full-width mul/div, sqrt | none | internal `abs`, `mulWad`, `mulWadDown`, `divWad`, `mulDiv`, `sqrt`, `log2` | consumed by risk, funding, router, auction, insurance |
| `contracts/lib/PortfolioRisk.sol` | portfolio requirement | none | internal `requirement` | catalog-derived correlations/config; consumed by ClearingHouse |
| `contracts/interfaces/IProtocolIntegrations.sol` | declared integration ABIs | none | ERC-20, feed, venue, clearing, insurance, oracle, catalog, funding interfaces | all modules |
| `contracts/MarketCatalog.sol` | markets/correlations/governance | governor/pending governor; configs; listed IDs; correlations | `nominateGovernor`, `acceptGovernor`, `configureMarket`, `setMarketActive`, `setRiskTier`, `setCorrelation`, `market`, `correlationBps`, `marketCount`, `marketAt`; getters | ClearingHouse risk/trade; auction price endpoints |
| `contracts/OracleHub.sol` | current and epoch prices | governor/coordinator; feed configs; last good; settlement price/round | `setGovernor`, `setSettlementCoordinator`, `configureFeed`, `observe`, `indexPrice`, `recordSettlement`, `settlementPrice`; getters | feed `latestRoundData`/`decimals`; funding, clearing, auction, epoch |
| `contracts/FundingEngine.sol` | signed global growth/checkpoints | governor/clearing; per-market growth, mark, time, interval, cap | `setGovernor`, `setClearingHouse`, `configure`, `updateMark`, `accrue`, `growth`, `checkpointPosition`; getter | oracle index; ClearingHouse writes mark/reads checkpoint |
| `contracts/MarginVault.sol` | account identity/collateral/delegates/withdrawals | governor/controller/delay/nonce; balances; delegates; requests | `setGovernor`, `setController`, `setWithdrawalDelay`, `openAccount`, `ownerOf`, `isAuthorized`, `setDelegate`, `deposit`, `requestWithdrawal`, `cancelWithdrawal`, `claimWithdrawal`, `controllerWithdraw`, `controllerCredit`, `controllerDebit`, `balanceOf`; getters | collateral decimals/balance transfers; ClearingHouse health/equity |
| `contracts/ClearingHouse.sol` | positions, PnL, funding, health, module hub | modules/fees; position and active-market ledgers; skew/OI/cash/freeze | `configureModules`, `setFees`, `setFrozen`, `trade`, `onAuctionFill`, `settleAccountFunding`, `withdrawMargin`, `realizeSettlement`, `resolveDeficit`, `accountEquity`, `accountInitial`, `accountMaintenance`, `position`, `activeMarketCount`, `activeMarketAt`; getters | catalog/oracle/funding/vault/insurance; router, auction, epoch callers |
| `contracts/ExecutionRouter.sol` | portfolio execution and signed orders | governor; matcher allowlist; nonce bitmap; EIP-712 domain | `setMatcher`, `executePortfolio`, `matchOrder`, `cancelNonce`; getters | ClearingHouse `trade`; ecrecover |
| `contracts/LiquidationAuction.sol` | auction/bid lifecycle | governor/timing/next ID; auctions; per-bidder commitments | `setTiming`, `start`, `commit`, `reveal`, `finalize`, `slashUnrevealed`, `currentPrice`; getters | ClearingHouse health/positions/freeze/fill/deficit; catalog/oracle; insurance bonds |
| `contracts/InsuranceFund.sol` | shares, reserves, deficit/social loss, venue | module addresses; share supply/balances/allowances; value/reserve/loss/OI ledgers; bonds | `configure`, `setGovernor`, `approve`, `transfer`, `transferFrom`, `deposit`, `redeem`, `absorbPenalty`, `reportOpenInterest`, `coverDeficit`, `reserveAuctionBond`, `releaseAuctionBond`, `rebalance`, `totalAssets`; getters | collateral balance/transfers; venue swap; ClearingHouse/auction callers |
| `contracts/EpochSettlement.sol` | epoch scheduling/price/account lifecycle | governor; epoch sequence/state; market lists; account settled flags | `setGovernor`, `schedule`, `recordPrices`, `settleBatch`, `close`, `marketCount`, `marketAt`; getters | OracleHub record/read; ClearingHouse freeze/funding/realization/deficit |
| `contracts/mocks/MockERC20.sol` | interface-supported token semantics | supply/balances/allowances/transfer fee | `setTransferFee`, `mint`, `approve`, `transfer`, `transferFrom`; getters | expresses fee-on-transfer boundary |
| `contracts/mocks/MockPriceFeed.sol` | round-data semantics | precision/current round fields | `setAnswer`, `setRound`, `latestRoundData`; getters | expresses arbitrary precision/time/round values |
| `contracts/mocks/MockVenue.sol` | venue return semantics | quoted output/last arguments | `setQuotedOutput`, `swapExactInput`; getters | expresses return-value-only boundary |

### Entry-point reachability classes

- Permissionless actor entries: vault account/delegate/deposit/request/cancel/claim; router portfolio; owner nonce cancellation; auction start/commit/reveal/finalize/slash; insurance ERC-20/share actions; funding accrue; oracle observe/index; epoch record/settle; views.
- Allowlisted role entries: router matcher order execution.
- Governor entries: every module configuration/timing/fees/market/feed/venue/matcher/epoch schedule-close action except `MarketCatalog.setRiskTier`, whose implementation must be tested against the documented role.
- Configured-module callbacks: ClearingHouse trade (router), freeze/fill/deficit (auction/epoch), settlement realization (epoch); vault controller methods (ClearingHouse); funding mark (ClearingHouse); insurance penalty/deficit (ClearingHouse), bonds (auction); oracle settlement record (epoch).
- Indirect reachability: an untrusted router/order/auction/settlement call reaches multiple configured-module callbacks; token/feed/venue calls can return adversarial values and may transfer control where EVM call type permits.

## Actor and trust-boundary map

| Actor/domain | Legitimate capabilities | Must not gain | Boundary/enforcement | Downstream effects |
| --- | --- | --- | --- | --- |
| Governor / pending governor | supported config and role transfer | actions after relinquishing role; arbitrary untrusted caller access | `onlyGovernor` or nominate/accept | all module topology and economics |
| Account owner | all effects for encoded account | sibling/victim account effects without delegation | high 160-bit owner; vault `isAuthorized` | collateral, positions, nonce, withdrawals |
| Account delegate | scoped effects for one account | sibling account or ownership/configuration | `delegateFor[accountId]` | trade/withdraw request or routed effect |
| Matcher | relay signed order | invent signer/account authority; reuse/corrupt nonce domain | matcher allowlist, EIP-712 recovery, vault auth | position/PnL/fee/health |
| Keeper/liquidator | start/finalize unhealthy auction | arbitrary healthy freeze, abandoned residual, premature release | health, auction state/time | freeze, positions, deficit/unfreeze |
| Bidder | commit/reveal own bid and account | mutate a third party's account or create uncollateralized loss | commitment identity/account authorization and post-fill health (expected) | two accounts, bonds, OI, insurance |
| Settlement caller | permissionlessly advance scheduled epoch | choose non-cutoff price, reorder funding after realization, unfreeze other lifecycle | epoch status/cutoff/immutable price/freeze reasons | PnL/funding/deficit/position closure |
| Insurance shareholder | deposit/redeem pro rata liquid NAV | consume reserved bonds or phantom value | balance-delta, reserve-excluded NAV, burn-before-transfer | token assets/reserves/claims |
| Token/feed/venue | configured interface behavior | silently redefine received value, precision, time, identity, callback/order | allowlist/config constraints plus measured before/after delta | collateral/equity/share/bond/oracle/venue accounting |

## Asset-flow and conservation ledger

Wad values are internal 18-decimal accounting; token native amounts use the dependency's declared precision.

| Operation | Attacker inputs | System debit | System credit/liability | External observation | Required identity / downstream consumer |
| --- | --- | --- | --- | --- | --- |
| Margin deposit | account, native amount, sender | sender token debit | vault token receipt and account wad balance | `transferFrom` return vs actual balance delta | credited wad ≤ actual receipt; equity/withdrawal/health consume balance |
| Routed margin withdrawal | account, wad, recipient | account balance and vault tokens | recipient token credit | callback/return/native rounding | final account equity ≥ initial; frozen false; one debit/transfer |
| Delayed withdrawal | request amount/time/recipient/claim order | account balance and vault tokens | recipient token credit | executable state across transfer | same health/freeze policy; request single-use before callback |
| Trade/order leg | base delta, execution/limit, actor/signature | fee and old-side position/PnL | new position/cash; insurance fee claim | catalog/oracle/funding | skew delta = base delta; OI delta = `abs(new)-abs(old)`; basis/PnL exact; health and limit safe |
| Funding checkpoint | market/base/growth/time/mark-index | payer cash | receiver/system signed cash claim (model has account-local cash only) | oracle price and growth | symmetric cap; payer-favor splitting impossible; checkpoint before base mutation |
| Auction commit/reveal | victim market; bidder account; amount/price/salt/bond | bond payer; victim position; bidder capacity | reserved bond; paired positions | price/feed and token receipt | bid authority; both accounts' positions sum zero; bidder health; lot fill + residual = original |
| Bond release/slash | key/recipient/slash | reserved token/liability | returned token or protocol-owned value | actual transfer | aggregate reserve decreases by full resolved amount; key ends exactly one terminal state |
| Deficit cover | account/deficit | unreserved insurance liquidity | account cash coverage; uncovered loss index/pending | actual fund balance and OI | reserved assets untouched; coverage equals actual asset transfer; uncovered loss persists |
| Insurance deposit/redeem | native amount/shares/receiver | token transfer or share burn | liquid assets or share liability | actual balance delta; reserved subset | shares priced from liquid NAV; redemption cannot consume reserved/phantom value |
| Venue rebalance | tokenOut/in/min/route | collateral native amount | output-token native receipt plus normalized value | actual tokenOut balance/decimals vs return | minimum evaluated in output native precision; accrued value equals received normalized assets |
| Epoch record/settle | epoch/time/accounts | open position/funding/deficit | immutable cutoff price; realized cash; closed position | round timestamp/ID | cutoff correspondence; funding first; position once; lifecycle freeze preserved |

Unverified/absent conservation links discovered during mapping are hypotheses, not findings: fee accounting to actual insurance assets; insurance transfer to ClearingHouse versus vault custody; and open-interest reporting to the insurance loss index require dynamic closure tests.

## Business-flow and state-machine / epoch map

### Account and position

`unopened ID (owner bits may still be syntactically valid)` → `openAccount emits ID` → deposit/delegate → routed trade(s) → position `{zero ↔ same-side increase ↔ reduction ↔ cross-zero}` → funding checkpoints before each base transition → optional healthy withdrawal. `activeMarkets` is intended to be set-like while any position has ever existed; equity and risk iterate it and skip zero bases.

### Liquidation

`healthy` → price/funding movement → `equity < maintenance` → `start` snapshots one market lot and freezes account → bidder `commit (reserved bond)` → wait reveal delay → `reveal` once transfers victim/bidder bases at Dutch price and releases bond → repeat until zero residual, or explicit backstop takes residual → `finalize` resolves deficit and unfreezes. Unrevealed commitment after expiry → slash. Overlapping auctions and other freeze reasons are not specified as permitted and must preserve the frozen invariant.

### Epoch settlement

`Unset` → governor `Scheduled(cutoff, nonempty markets)` → after cutoff permissionless `recordPrices` must bind each immutable value to cutoff → `PriceRecorded` → batches: freeze each not-yet-settled account, checkpoint pre-transition funding, realize each market once, cover deficit, set settled, release only this lifecycle's freeze → governor reconciliation → `Closed`.

### Insurance and social loss

`liquid unreserved assets + reserved bonds + accrued protocol value + share liabilities + pending/indexed social loss`. Deposit mints pro rata claims to liquid NAV; reserve moves received token into unavailable subset; release resolves entire per-key and aggregate reserve; deficit uses only unreserved liquid assets and indexes any uncovered amount against actual live exposure (or queues it at zero exposure); redemption burns shares for available claim value without consuming reservations.

### Privileged-action map

| Effect | Intended caller | Implementation enforcement to verify |
| --- | --- | --- |
| Governor rotation | governor then nominated address, or governor setter | Catalog two-step; other modules single-step `onlyGovernor` |
| Market config/active/risk tier/correlation | governor | each mutator must check current governor |
| Feed/coordinator/funding/modules/fees/controller/timing/venue/matcher | governor | `onlyGovernor`; zero/compatibility checks where needed |
| Account trade | router with authorized actor/signer | configured router + vault authorization + not frozen + post-health |
| Auction position mutation/freeze/deficit | configured auction | module caller plus auction lifecycle, account authority for bidder side, final health/lot invariants |
| Settlement mutation/freeze/deficit | configured epoch module | module caller plus epoch state/once/order/freeze-reason invariants |
| Vault debit/credit | configured ClearingHouse | controller only and corresponding accounting/health caller |
| Insurance penalty/deficit/bond | ClearingHouse or auction | configured address only plus exact asset/liability changes |

## External-semantics map

| Dependency/action | ABI/spec guarantee | Caller assumption observed | Required runtime deltas and variants |
| --- | --- | --- | --- |
| ERC-20 `transferFrom` into vault/fund | boolean plus callable `balanceOf`/`decimals` | nominal amount received and safely wad-normalized | sender debit, recipient credit, fee; 0/1/6/8/18/>18 decimals; false/missing return; callback where supported |
| ERC-20 `transfer` out | boolean | recipient obtains nominal native amount; state safe during call | sender debit/recipient credit; fee; rounding; receiver/token callback before/after commitment |
| Feed `latestRoundData` | current tuple | round valid/fresh and current price suitable for cutoff | answer positive, `answeredInRound≥roundId`, timestamp not future/stale, precision ≤/≥18, round timestamp relative to cutoff |
| Feed `decimals` | uint8 | exponent `18-precision` valid and normalizes exactly | precision 0,1,6,8,18,19,255; overflow/underflow boundaries |
| Venue return | native `amountOut` only | return is received normalized wad and directly comparable to min wad | tokenOut declared precision, before/after token balance, return/effect divergence, callbacks, route identity |

## Mutable-value to downstream-consumer map

- `MarketView.{riskTier, ratios, penalty, maxAge, skewScale, concentrationScale}` ← governor/config mutators → trade active guard; account initial/maintenance; auction discount; liquidation eligibility; withdrawal/health decisions.
- `correlationBps` ← governor → `PortfolioRisk.requirement` pair adjustment → initial/maintenance → trade/withdraw acceptance and liquidation eligibility.
- feed round answer/time/precision → OracleHub normalized price → equity, margin notional/concentration, liquidation eligibility/reference price, funding premium, immutable epoch price → PnL/deficit/insurance.
- funding mark/time/cap/growth → position checkpoint/payment → cash/equity → margin, liquidation, deficit, withdrawal.
- position `{base,entry,fundingCheckpoint}` and `activeMarkets` → unrealized equity and risk legs; base changes also feed skew/OI; all feed health, liquidation, settlement, social loss.
- vault accounted balance / actual token balance → equity and withdrawals; controller deficit paths; frozen-health enforcement; token insolvency among users.
- router leg weights/directions and nonce bitmap → accepted execution and signature availability → position/PnL/fee/health.
- auction `remainingBase/finalized`, bidder account, bond records, and shared `frozen` boolean → privileged position callbacks, user trade/withdraw ability, deficit coverage, insurance reserve/liquidity.
- insurance live token balance, `auctionReserved`, `accruedProtocolValue`, share supply, reported OI/pending/index → share mint/redeem; deficit capacity; social loss; bond return.
- epoch cutoff/status/markets/account-settled → oracle immutable price; ordering of funding and PnL; position zeroing; deficit; shared freeze release.

## Callback and action-sequence matrix (mapping stage)

| Interaction point | State committed before call | Attacker-reachable actions to test | Final oracle |
| --- | --- | --- | --- |
| Vault/fund inbound `transferFrom` | credit/share/bond ledgers not yet committed | fee delta; token-driven reentry into deposit/request/share action | actual receipt backs exact credit; no stale supply/NAV reuse |
| Vault `claimWithdrawal` outbound transfer | request and balance still live | same-function claim; cancel/new request; routed withdrawal/trade if token invokes actor path | exactly one request consumed; health/freeze and balance hold |
| Vault controller outbound transfer | account balance still live | cross-function ClearingHouse withdrawal/trade via authorized callback actor | no duplicated debit and final health safe |
| Insurance redeem outbound transfer | shares/supply already burned | deposit/redeem/transfer callback | NAV/share conservation and reserve isolation |
| Insurance deficit outbound transfer | no explicit coverage ledger; caller cash update occurs after return | share redeem/deposit; bond release; nested deficit through configured caller feasibility | actual unreserved transfer equals cash credit; no reserve use |
| Insurance bond return | key deleted and reserve partially adjusted before transfer | new auction/bond/share/deficit action | key/aggregate/full amount reconcile |
| Venue swap | collateral already transferred; accrued value not yet updated | venue reentry into governor-only or public share actions | actual output received/normalized and final NAV correct |
| Clearing → funding/insurance | position mostly updated before fee call; mark after fee | configured module reentry across public functions | global position/fee/health atomicity |
| Auction reveal → two Clearing callbacks → insurance | remaining/revealed set before calls | cross-account/cross-auction/finalize/reveal interleavings | paired base/OI/health/bond final state |
| Epoch settle → Clearing callbacks | account frozen; settled marker only after all markets | auction start/finalize overlap, repeated account IDs, duplicate markets | funding-before-base, once, correct freeze reason after unwind |

## Primitive join graph (initial)

Nodes are preliminary and require tests; arrows show a plausible compatibility worth discriminating, not a claimed exploit.

- position-list duplication / basis distortion / OI drift → inflated or distorted equity/risk → routed or delayed withdrawal → protocol/user collateral loss.
- oracle cutoff/precision semantics → settlement/funding/liquidation valuation → PnL/deficit → insurance reserve/share/loss effects.
- funding asymmetric cap or checkpoint rounding/order → cash/equity shift → avoid liquidation or withdraw → deficit.
- auction bidder-account authority + no bidder health + zero/under-sized bond → uncollateralized position transfer → price/settlement loss → insurance deficit.
- overlapping/finalized auction sequencing + shared freeze boolean → residual or post-finalization position mutation → withdrawal/trade or repeated deficit.
- reserve-accounting or reserve-inclusive share NAV + redemption → bidder bond consumption → bond return failure and auction liveness.
- fee-on-transfer nominal credits → inflated margin/share/bond accounting → position leverage/redemption/deficit or reserve shortfall.
- venue native/wad mismatch or return/effect divergence → phantom accrued value → share issuance/redemption or deficit capacity distortion.

Pairwise joins are tested first. A third link will only be added to close a demonstrated funding, health, realization, or cleanup gap. Failed joins remain in the hypothesis ledger and final composition ledger.

## Prioritized surface queue

| Rank | Surface | Why now | Observation that lowers rank |
| --- | --- | --- | --- |
| 1 | ClearingHouse position, equity, risk, OI, consumer propagation | remotely influenced value state feeds nearly every high-impact decision; multiple nonlinear/cached consumers | exact-integer state tests show set-like membership, correct basis/OI/risk and no downstream extraction |
| 2 | Liquidation/settlement cross-lifecycle and privileged callbacks | untrusted callers cause module-privileged cross-account writes, freezes, deficits, and cleanup | all state/order/authority/health/residual and interleaving controls hold from fresh state |
| 3 | Insurance/share/bond/deficit conservation | direct token custody and third-party claims; several ledgers share live balance | three-party before/after ledgers reconcile across reserve, redemption, coverage, and social loss |
| 4 | Oracle/funding/epoch signed arithmetic and timing | signed growth and immutable prices propagate to cash/PnL/deficit | sign/boundary/cutoff/splitting/order differentials all match exact model |
| 5 | Vault token semantics and withdrawal callbacks/health | direct custody boundary and two withdrawal routes | actual balance deltas, health, freeze, rounding, and callback controls hold for supported variants |
| 6 | Router aggregate limits and EIP-712 nonce/authority | public trade entry and full nonce domain | weighted exact limits and all 64-bit nonce/cancel pairs distinguish correctly |
| Roaming | Cross-component cache/state coherence, privilege transitions, weird sequences | mandatory unconstrained pass after queue | no novel source-to-sink or compatible join remains after replaying all public effects |

## Coverage accounting at mapping checkpoint

No single percentage is used.

| Dimension | Status | Concrete evidence / remaining work |
| --- | --- | --- |
| source-read | inspected | all 15 manifest-covered Solidity files, ordinary tests, public specs, and build/manifest/public-seal tooling read; runtime dependencies not source-audited |
| attack-surface/entry-point | inspected | complete table above; dynamic cases pending |
| trust-boundary/source-to-sink | inspected | actor/module/integration boundary tables above; dynamic sink deltas pending |
| state-transition/invariant | inspected | account, position, auction, epoch, insurance state maps; sequence tests pending |
| runtime/corpus | tested baseline only | 5 ordinary tests pass; security PoCs/boundaries pending |
| config/build variant | tested baseline only | pinned release compile and default system; semantic variants pending |
| historical-family | inspected | no forbidden history; generic families mapped from source only |
| falsification/controls | uninspected | paired controls pending |
| business-invariant/conservation | inspected | asset-flow ledger above; executable closure pending |
| downstream consumer propagation | inspected | mutable consumer map above; strongest effects pending |
| boundary arithmetic | inspected | exact boundary plan recorded; executable model/tests pending |
| external semantics | inspected | promise/assumption matrix above; variants pending |
| sequence/interleaving | inspected | callback/action matrix above; executions pending |
| exploit composition | inspected | initial join graph above; pairwise tests pending |
| economic/system closure | uninspected | attacker/protocol/third-party final ledgers pending |

