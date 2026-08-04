// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library TokenMath {
    function mulDivDown(uint256 x, uint256 y, uint256 d) internal pure returns (uint256) {
        return x * y / d;
    }

    function mulDivUp(uint256 x, uint256 y, uint256 d) internal pure returns (uint256) {
        if (x == 0 || y == 0) return 0;
        return (x * y - 1) / d + 1;
    }
}

