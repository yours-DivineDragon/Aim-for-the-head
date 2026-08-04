// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IReviewToken {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Honest-effect venue used to separate output normalization from the
/// hunter's no-transfer mock variant.
contract ReviewerVenue {
    address public immutable outputToken;
    uint256 public immutable outputAmount;

    constructor(address token, uint256 amount) {
        outputToken = token;
        outputAmount = amount;
    }

    function swapExactInput(address, address tokenOut, uint256, bytes calldata)
        external
        returns (uint256 amountOut)
    {
        require(tokenOut == outputToken, "TOKEN");
        require(IReviewToken(outputToken).transfer(msg.sender, outputAmount), "TRANSFER");
        return outputAmount;
    }
}
