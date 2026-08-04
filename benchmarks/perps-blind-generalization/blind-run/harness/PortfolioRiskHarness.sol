// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PortfolioRisk} from "../../contracts/lib/PortfolioRisk.sol";

contract PortfolioRiskHarness {
    function requirement(PortfolioRisk.Leg[] memory legs, int16[] memory correlations)
        external
        pure
        returns (uint256)
    {
        return PortfolioRisk.requirement(legs, correlations);
    }
}

