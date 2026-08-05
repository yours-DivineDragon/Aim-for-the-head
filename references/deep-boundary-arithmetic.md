# Deep pass: boundary arithmetic

Classify each division or quantization by who must be favored. Derive the
required rounding direction from the obligation rather than copying a nearby
helper. Distinguish:

- value paid out from value charged;
- shares issued from shares burned;
- assets received from nominal assets requested;
- collateral credited from collateral actually locked;
- debt or liability extinguished from payment actually received.

Test exact integer boundaries, not only realistic-looking 18-decimal examples:

- zero, one, one unit below and above a quotient boundary, and maximum permitted
  values;
- zero and one unit of supply, assets, shares, debt, allowance, and reserve;
- coarse and mixed units, including 0, 1, 6, 8, and 18 decimals when the target
  does not enforce an allowlist;
- exchange rates below, equal to, and above one;
- direct balance changes, donations, burns, rebases, and supply changes;
- repetition until rounding dust becomes material or a zero-unit transition
  moves nonzero value.

Build a small exact-integer model or property test for preview/mutation pairs.
Assert both the caller delta and the system or other-user delta. Reject a
boundary only after the supported input domain and amplification paths have
been tested; do not dismiss it from the default fixture alone.

Record `boundary-arithmetic/rounding-unit-and-zero-boundaries` with the exact
model, tested values, and paired system deltas.
