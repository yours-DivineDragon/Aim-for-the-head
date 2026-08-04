// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract MockPriceFeed {
    uint8 public immutable decimals;
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    constructor(uint8 precision, int256 initialAnswer) {
        decimals = precision;
        setAnswer(initialAnswer);
    }

    function setAnswer(int256 next) public {
        roundId += 1;
        answer = next;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = roundId;
    }

    function setRound(int256 next, uint256 timestamp, uint80 answeredRound) external {
        roundId += 1;
        answer = next;
        startedAt = timestamp;
        updatedAt = timestamp;
        answeredInRound = answeredRound;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}
