// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract MockVenue {
    uint256 public quotedOutput;
    address public lastTokenIn;
    address public lastTokenOut;
    uint256 public lastAmountIn;
    bytes public lastRoute;

    function setQuotedOutput(uint256 amount) external {
        quotedOutput = amount;
    }

    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata route)
        external
        returns (uint256 amountOut)
    {
        lastTokenIn = tokenIn;
        lastTokenOut = tokenOut;
        lastAmountIn = amountIn;
        lastRoute = route;
        return quotedOutput;
    }
}
