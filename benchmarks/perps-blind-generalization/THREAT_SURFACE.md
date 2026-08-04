# Threat surface

## Trust model

The governor is trusted to choose supported markets, feeds, collateral, timing, module addresses, and external venue routes, but governance calls remain part of the authorization surface. Matchers may submit signed orders but cannot invent account authority. Keepers, liquidators, auction bidders, delegates, settlement callers, insurance shareholders, and token recipients are untrusted. Feed and venue contracts are integration boundaries: their declared interface is trusted, while timing, precision, callback, and token-transfer behavior must be validated.

## Value-moving entry points

Collateral enters through vault and insurance deposits and auction bonds. It leaves through account withdrawals, share redemptions, bond releases, deficit coverage, and venue rebalancing. Position value moves through portfolio execution, signed orders, funding checkpoints, auction fills, and epoch realization. Review should follow both token balances and wad-denominated ledgers through every call sequence.

## Cross-contract transitions

- Execution: router authority → funding checkpoint → position/PnL mutation → fee recognition → portfolio health.
- Liquidation: health check → freeze → lot/bond state → paired position transfer → residual reconciliation → insurance waterfall → unfreeze.
- Settlement: scheduled cutoff → oracle record → freeze → funding → PnL → deficit waterfall → settled marker → unfreeze.
- Insurance: deposit/share pricing → auction reservation → liquid coverage → pending or indexed social loss.

Adversarial sequencing includes callbacks during token movement, repeated zero or dust quantities, position flips, multi-market sign combinations, delayed keepers, partial auction fills, empty-open-interest epochs, fee-on-transfer assets, non-18-decimal integrations, repeated batch inputs, and transactions at exact time boundaries.

## Out of scope assumptions

Private-key compromise, malicious governance acting through correctly authorized calls, consensus reorganization, compiler compromise, and price-feed economic manipulation outside the configured freshness/round semantics are outside the target. Gas optimization and centralized-governance design are not findings by themselves. Mocks are scope-relevant only where they express the documented integration interface.
