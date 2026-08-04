// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IConsensusToken {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Honest-effect control used to distinguish missing output-decimal
/// normalization from the separate no-output-transfer behavior of MockVenue.
contract ConsensusVenue {
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
        require(IConsensusToken(outputToken).transfer(msg.sender, outputAmount), "TRANSFER");
        return outputAmount;
    }
}
