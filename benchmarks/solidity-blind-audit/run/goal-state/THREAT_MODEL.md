# Threat model

## Target
- Repository and revision: designated Aster Credit benchmark at commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest digest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.
- Included components: all Solidity files under `contracts/`, every public/external entry point, and cross-contract behavior of AsterVault, ReservePool, ReserveOracle, LendingMarket, BridgeGateway, PermitRouter, RewardsDistributor, StrategyModule, libraries, interfaces, and deterministic mocks as honest stand-ins.
- Excluded components: trusted-role malice/key compromise; mock administrative minting/burning/direct feed configuration as attacker behavior; pure style/gas/centralization; tests/scripts/packages as vulnerability targets; sealed paths, Git/history, other workspaces, issue trackers, network sources, prior reports, and ground truth.
- Release-like configurations: the repository compiler settings (`solc-js 0.8.30`, optimizer enabled with 200 runs, EVM Paris) on deterministic Ganache 7.9.2 using Shanghai and chain ID 31337, plus only supported deployment/configuration variants justified by source or benchmark documentation.

## Assets and security properties
- Assets: stable/collateral/reward tokens held by market, pool, vault, distributor, strategy, and users; vault shares; user token allowances; lending collateral/debt; bridge credit; signed transfer/claim authority; oracle state.
- Confidentiality properties: none known; contracts and calldata are public, and no secret storage is intended.
- Integrity properties: debt and collateral remain correctly backed; share/token accounting conserves ownership; oracle values used for lending reflect enforced source/units; nonces and replay domains bind authorized actions.
- Availability properties: an ordinary or remote user cannot cheaply and persistently block unrelated users' collateral bridging, withdrawals, borrowing, swaps, claims, or privileged operation.
- Authorization or isolation properties: only configured remote gateways create bridge credit; signatures authorize exactly their encoded effect; only the intended vault/operator controls strategy effects; ordinary users cannot move others' assets or protocol liquidity without sufficient collateral/approval.

## Adversary
- Attacker capabilities: an untrusted EOA or application contract can call any public entry point, deploy arbitrary callback logic, fund legitimate positions, approve tokens it owns, choose receivers/beneficiaries/amounts/data, observe and relay public calldata/signatures, and originate a remote application message that the trusted messenger faithfully relays with its actual source chain and sender.
- Attacker-controlled inputs: transaction sender/order, entry-point calldata, callback code and nested call sequence, owned-token approvals/transfers, liquidity/swap amounts, bridge source application and message payload, signature submission recipient/parameters where not cryptographically bound, and timing within ordinary chain behavior.
- Attacker starting position: no trusted protocol role or private key; may own ordinary tokens/positions and may be a permissionless relayer or remote application.
- Explicit non-capabilities: no compromised guardian/admin/operator/vault/oracle owner/rewards authority/bridge admin/messenger/configured component; no arbitrary victim approval; no direct storage editing; no mock admin mint/burn/feed setter as an exploit primitive; no source/build mutation, external service, RPC, network, or harness defect.

## Trust boundaries and effects
- Trust boundaries: untrusted public calls and callbacks into protocol state; remote sender context through the trusted messenger; off-chain signatures into token/reward transfers; pool/feed values into oracle and health checks; strategy initialization into operator/vault authority.
- Privilege transitions: bridge message to collateral ledger credit; health check to stable transfer/debt creation; signed payload to transfer/claim; initialization to strategy sweep/arbitrary-call authority; vault share burn to underlying transfer.
- Dangerous sinks or effects: ERC-20 transfers/transferFrom, mint/burn of shares, stable borrowing, collateral/debt ledger writes, bridge credit, arbitrary external `target.call`, signature consumption, pool reserve sync/price calculation, and privileged role writes.
- External dependencies: honest configured ERC-20s, aggregator feed, reserve pool, vault, messenger, and deterministic Ganache/solc runtime. Interface-compliant behavior and documented configuration are assumed; stronger unstated guarantees require verification.

## Security invariants
- Invariant: every debt-increasing stable transfer leaves the originating account's finalized debt at or below its borrow limit, including across receiver callbacks.
  - Why it matters: the market's stable liquidity must remain solvent and collateral-backed.
  - Expected enforcement points: `LendingMarket.borrow`, health calculation, debt state update, and callback ordering/reentrancy controls.
  - Observable counterexample: an ordinary borrower ends one transaction with debt or extracted stable above its pre-transaction borrow limit.
- Invariant: bridge credit is created only for a message whose authentic remote sender equals the admin-configured gateway for its authentic source chain, and replay identity includes all domains needed to distinguish messages.
  - Why it matters: bridge credit is treated as collateral without custody of local vault shares.
  - Expected enforcement points: `BridgeGateway.finalizeCollateral`, messenger sender/chain checks, remote mapping comparison, nonce keying, and `LendingMarket.onBridgeCredit`.
  - Observable counterexample: a message from an unconfigured remote application creates credit/borrowing power, or a valid unrelated message is blocked by a cross-domain nonce collision.
- Invariant: a signature can trigger only its exact intended transfer/claim once.
  - Why it matters: users and the reward authority delegate a narrow asset effect, not arbitrary redirection or repeat payout.
  - Expected enforcement points: payload type/domain fields, signature recovery, owner nonce, claim replay key, and recipient/action binding.
  - Observable counterexample: the same authorized payload moves assets to a different recipient or pays more than once using an alternate accepted encoding.
- Invariant: only the intended strategy vault/operator may establish and use privileged strategy effects.
  - Why it matters: StrategyModule can transfer all held tokens and make arbitrary external calls.
  - Expected enforcement points: initialization lifecycle guard and `sweep`/`execute` role checks.
  - Observable counterexample: an untrusted account assigns itself authority and extracts module-held value or exercises the vault call capability.
- Invariant: each vault asset withdrawal burns sufficient authorized shares, and each pool/oracle price used for lending has correct supported units and defensible manipulation bounds.
  - Why it matters: vault owner assets and lending solvency depend on accounting/price integrity.
  - Expected enforcement points: ERC-4626 rounding direction, allowance/burn, token balance accounting, reserve math/decimals, feed validity/freshness, fallback selection, and health check.
  - Observable counterexample: an account extracts third-party assets without enough shares, or an ordinary funded sequence creates an inflated borrow limit and net protocol loss.

## Operating assumptions
- Deployment defaults: the integrated test deployment uses honest 18-decimal tokens, 10,000/10,000 pool liquidity, an 8-decimal positive primary feed normalized to 18 decimals, 75% collateral factor, trusted roles, and pre-funded market/distributor as applicable.
- Feature flags and optional components: no build flags; bridge, callback, signed-transfer, reward, strategy, and oracle fallback paths are public/documented components. Non-default token decimals or feed failure are considered only if interface-supported and the exploit remains realistic without trusted-role action.
- Required secrets, privileges, or user interaction: validated attacks require no trusted secret/role. A signature-based claim may assume possession of a legitimately issued signature but not signer compromise; user approval may cover only the router/action the user intended.
- Assumptions that still need verification: whether each suspected state/order/domain weakness produces a net attacker gain under clean release-like execution; whether pool/oracle concerns survive realistic attacker funding and decimal configurations; whether rounding behaviors can harm another party rather than merely recover an attacker's donation; whether all cross-component callbacks and replay domains are covered by existing guards.
