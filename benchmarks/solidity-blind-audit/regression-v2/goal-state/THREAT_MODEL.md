# Threat model

## Target
- Repository and revision: unchanged Aster Credit target at `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`; manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.
- Included components: all Solidity under `contracts/` and cross-contract behavior; build/test support only for deployment semantics.
- Excluded components: sealed/revealed truth, old submissions/scoring as hunt inputs, history/external reports, live infrastructure, and mock admin controls as attacker powers.
- Release-like configurations: Node 24, solc-js 0.8.30 optimizer 200/EVM Paris, ethers 6.15.0, Ganache 7.9.2 Shanghai chain 31337.

## Assets and security properties
- Assets: vault underlying/share claims, pool liquidity, market stable reserves and debt, posted collateral, bridge credit, signed transfers/rewards, and strategy-held tokens/authority.
- Business flows and intended value movement: underlying becomes shares, shares become collateral, independently valued collateral permits stable borrowing, repayments restore market assets while extinguishing debt, and authenticated messages/signatures/roles authorize their exact effects.
- Accounting identities and solvency/conservation properties: redeemable claims remain backed; shares/liabilities change by actual value received or released; debt remains covered after every transition; caller gains reconcile with system and incumbent deltas.
- Confidentiality properties: no material confidentiality asset is modeled in this benchmark.
- Integrity properties: balances, shares, debt, reserves, replay state, roles, and remote/signature identity must reflect the complete authorized action.
- Availability properties: one untrusted user must not permanently block another valid deposit/message/action through a global namespace or manipulable boundary.
- Authorization or isolation properties: guardians/admins/signers/remote gateways/strategy roles and per-domain nonces cannot be forged, substituted, replayed, or overwritten by ordinary users.

## Adversary
- Attacker capabilities: call public functions, deploy callback actors, choose supported sequences/receivers/amounts, approve and transfer owned tokens, relay legitimately supplied signatures, originate authentic remote-application messages, and use temporary atomic funding or interface-compatible variants not excluded by policy.
- Attacker-controlled inputs: action arguments, callback code/data, ordering and repetition, direct transfers, owned approvals/balances, message payload and authentic remote sender, relayed signature bytes, and supported dependency configuration selected at deployment.
- Attacker starting position: ordinary user/application with no protocol role; may fund a legitimate position and obtain temporary capital that must be repaid.
- Explicit non-capabilities: no trusted role/key/messenger/configured component/build host compromise; no mock mint/feed control as exploit input; no source/storage edit or external/live system.

## Trust boundaries and effects
- Trust boundaries: public user to callback/configured call; token balance to share/debt accounting; pool/feed observation to solvency; messenger context to bridge credit; signature to transfer/reward; initializer to privileged strategy actions.
- Privilege transitions: guardian risk/bridge/pause changes, bridge-only collateral credit, signer-authorized payout/transfer, and vault/operator sweep or arbitrary-call authority.
- Dangerous sinks or effects: stable/underlying transfer, share mint/burn, collateral/debt credit, reserve price consumption, replay-state update, strategy sweep, and arbitrary external execution.
- External dependencies: ERC-20-like assets/stable, ERC-4626-like vault semantics, feed/pool price sources, messenger context, callbacks, and ECDSA recovery.
- External semantic promises versus assumptions: callable ABI and boolean success do not prove exact balance deltas, fee absence, callback absence, decimals, rounding, freshness, sender/domain binding, or atomic durability; each assumed property requires a specification/allowlist or measured delta.

## Security invariants
- Invariant: every borrower remains within an independently valued limit after callbacks, interleavings, normalization, and stack unwind.
  - Why it matters: lending reserves otherwise become attacker profit backed by transient or nonexistent collateral.
  - Expected enforcement points: vault conversion semantics, oracle validation, borrow/withdraw ordering, actual transfer deltas, and finalized debt/collateral state.
  - Observable counterexample: attacker ends with stable or recovered collateral while market debt/reserve loss exceeds normalized backing.
- Downstream consumers of attacker-mutable values: vault conversions feed deposit/withdraw/redeem and market collateral value; oracle observations feed borrow limits; token balance deltas feed shares/reserves/debt; callback-time debt/collateral feed health; message/signature fields feed credit and transfers.
- Candidate primitive joins and atomic funding sources: mutable pool spot, mutable vault exchange rate, direct transfers, callback interleavings, interface balance deltas, and temporary quote liquidity are joined only when identity/state/time/configuration are compatible and repayment or cleanup closes.

## Operating assumptions
- Deployment defaults: deterministic constructor wiring and ordinary suite; configured roles are trusted but every public edge is untrusted.
- Feature flags and optional components: oracle fallback activates on a nonpositive feed; borrow callbacks activate with nonempty data; cross-domain and signature flows activate when configured/funded.
- Required secrets, privileges, or user interaction: no secret or trusted privilege is required by the attacker; valid signatures may be relayed only for their intended authorized action.
- Assumptions that still need verification: exact supported token semantic range, unit/decimal range, temporary-liquidity availability, every downstream consumer, and every pairwise primitive compatibility are experiment obligations rather than preaccepted facts.
