# Deep pass: consumer propagation

Every attacker-mutable value gets a propagation record:

1. List every writer, indirect writer, and external condition that changes it.
2. Bound its direction, magnitude, duration, and cost.
3. Find every direct consumer and continue transitively through conversions,
   caches, limits, eligibility checks, pricing, authorization, and settlement.
4. Record guards at the consumer, not only at the source.
5. Test the strongest credible consumer effect and state what remains untested.

Do this after validating a primitive as well as during mapping. A local
manipulation may be Low by itself and Critical when a downstream component
multiplies it, treats it as collateral, grants authority from it, or persists it
after normalization. One tested consumer does not close the source or surface.

Prefer a graph with nodes for state values/effects and labeled edges for
transformations. Flag:

- one mutable source feeding several security decisions;
- one decision multiplying or dividing two independently mutable values;
- a transient value consumed as though it were durable;
- a view or preview value reused as a security oracle;
- a local credit or receipt accepted by another component without independent
  validation.

Record `consumer-propagation/mutable-value-to-downstream-consumer-map` with the
graph and strongest tested downstream effect.
