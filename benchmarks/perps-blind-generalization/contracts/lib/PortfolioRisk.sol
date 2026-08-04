// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SignedWadMath} from "./SignedWadMath.sol";

library PortfolioRisk {
    using SignedWadMath for int256;

    struct Leg {
        uint32 marketId;
        int256 notional;
        uint16 marginBps;
        uint128 concentrationScale;
    }

    function requirement(Leg[] memory legs, int16[] memory pairCorrelations) internal pure returns (uint256 total) {
        uint256 length = legs.length;
        uint256[] memory standalone = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            uint256 notional = legs[i].notional.abs();
            uint256 base = SignedWadMath.mulDiv(notional, legs[i].marginBps, 10_000);
            uint256 scale = legs[i].concentrationScale;
            if (scale != 0 && notional > scale) {
                uint256 excess = notional - scale;
                uint256 nonlinear = SignedWadMath.mulDiv(excess, excess, scale * 4);
                base += nonlinear;
            }
            standalone[i] = base;
            total += base;
        }

        uint256 pair;
        for (uint256 i; i < length; ++i) {
            for (uint256 j = i + 1; j < length; ++j) {
                int16 correlation = pairCorrelations[pair++];
                if (correlation == 0) continue;
                uint256 smaller = standalone[i] < standalone[j] ? standalone[i] : standalone[j];
                uint256 adjustment = SignedWadMath.mulDiv(smaller, uint16(correlation < 0 ? -correlation : correlation), 10_000);
                bool opposite = (legs[i].notional < 0) != (legs[j].notional < 0);
                if (opposite || correlation < 0) {
                    total = adjustment > total ? 0 : total - adjustment;
                } else {
                    total += adjustment;
                }
            }
        }
    }
}
