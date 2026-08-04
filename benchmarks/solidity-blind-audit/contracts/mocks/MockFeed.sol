// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAggregator} from "../interfaces/ProtocolInterfaces.sol";

contract MockFeed is IAggregator {
    uint8 public immutable override decimals;
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        setRound(initialAnswer, block.timestamp);
    }

    function setRound(int256 nextAnswer, uint256 timestamp) public {
        roundId++;
        answer = nextAnswer;
        startedAt = timestamp;
        updatedAt = timestamp;
        answeredInRound = roundId;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

