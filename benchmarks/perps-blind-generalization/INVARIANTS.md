# Invariant catalogue

These are protocol-level properties expected to hold across transactions and contracts. They are written as review and test oracles, not as implementation hints.

1. Only the current governor can mutate market, oracle, funding, module, fee, timing, and venue configuration unless a narrower role is explicitly registered.
2. Account ownership is immutable in the account identifier; delegation never expands to a sibling account.
3. Credited collateral never exceeds assets actually received after token-native behavior.
4. A withdrawal cannot leave an account below initial margin, and a transfer callback cannot observe or reuse an executable withdrawal state.
5. Every accepted oracle answer is positive, complete, fresh, and normalized to exactly 18 decimals for any declared feed precision.
6. A recorded settlement price is immutable and corresponds to its scheduled cutoff rather than caller timing.
7. Funding growth is signed, time-proportional, symmetrically capped, and invariant to economically meaningless checkpoint splitting.
8. Funding is settled against the pre-transition base before a trade, liquidation, or epoch operation changes that base.
9. A same-side increase has a weighted entry basis; a residual after crossing zero has the crossing execution basis.
10. The sum of position changes equals market skew change; outstanding open interest equals the aggregate absolute live exposure definition.
11. Each account has at most one active-list membership per live market, and zero economic quantity does not materialize exposure.
12. Equity counts every live position once. Realized and unrealized PnL cannot both include the same price movement.
13. Portfolio margin is monotone in standalone risk, applies concentration nonlinearly, and applies correlation according to both exposure and return signs.
14. Portfolio price limits are weighted by executed absolute base, and all legs are atomic.
15. A signed-order nonce is owner-controlled and can be consumed at most once in its full 64-bit domain.
16. A frozen account cannot trade or withdraw until its liquidation/settlement transition completes.
17. Auction filled quantity plus residual equals the original lot; finalization never abandons residual exposure.
18. Every auction bond is exactly one of reserved, returned, or slashed; aggregate reserves reconcile with live bond records.
19. Insurance share redemption cannot consume auction reserves or promise more liquid assets than the fund owns.
20. Deficit coverage consumes only unreserved liquidity, and uncovered loss is neither dropped nor allocated against nonexistent exposure.
21. Token-native amounts returned by an external venue are normalized using the returned token's precision before wad accounting.
22. Each account/market/epoch position is settled once, after its final funding checkpoint, at the same immutable epoch price.
