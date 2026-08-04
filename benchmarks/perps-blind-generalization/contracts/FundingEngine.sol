// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SignedWadMath} from "./lib/SignedWadMath.sol";
import {IOracleHub} from "./interfaces/IProtocolIntegrations.sol";

contract FundingEngine {
    using SignedWadMath for int256;

    struct FundingState {
        int256 growth;
        int256 markPrice;
        uint64 lastAccrued;
        uint64 interval;
        int128 maxRatePerSecond;
    }

    address public governor;
    address public clearingHouse;
    IOracleHub public immutable oracle;
    mapping(uint32 => FundingState) public funding;

    event FundingConfigured(uint32 indexed marketId, uint64 interval, int128 maxRatePerSecond);
    event MarkUpdated(uint32 indexed marketId, int256 markPrice);
    event FundingAccrued(uint32 indexed marketId, int256 rate, int256 growth, uint64 elapsed);

    error Unauthorized();
    error InvalidFunding();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(address initialGovernor, IOracleHub oracleHub) {
        governor = initialGovernor;
        oracle = oracleHub;
    }

    function setGovernor(address next) external onlyGovernor {
        governor = next;
    }

    function setClearingHouse(address next) external onlyGovernor {
        clearingHouse = next;
    }

    function configure(uint32 marketId, uint64 interval, int128 maxRatePerSecond) external onlyGovernor {
        if (interval == 0 || maxRatePerSecond <= 0) revert InvalidFunding();
        FundingState storage state = funding[marketId];
        state.interval = interval;
        state.maxRatePerSecond = maxRatePerSecond;
        if (state.lastAccrued == 0) state.lastAccrued = uint64(block.timestamp);
        emit FundingConfigured(marketId, interval, maxRatePerSecond);
    }

    function updateMark(uint32 marketId, int256 markPrice) external {
        if (msg.sender != clearingHouse) revert Unauthorized();
        if (markPrice <= 0) revert InvalidFunding();
        funding[marketId].markPrice = markPrice;
        emit MarkUpdated(marketId, markPrice);
    }

    function accrue(uint32 marketId) public returns (int256 nextGrowth) {
        FundingState storage state = funding[marketId];
        uint64 elapsed = uint64(block.timestamp) - state.lastAccrued;
        if (elapsed < state.interval) return state.growth;
        uint256 index = oracle.indexPrice(marketId);
        if (state.markPrice == 0 || index == 0) revert InvalidFunding();
        int256 premium = (state.markPrice - int256(index)).divWad(int256(index));
        int256 rate = premium / int256(uint256(state.interval));
        if (rate > state.maxRatePerSecond) rate = state.maxRatePerSecond;
        nextGrowth = state.growth + rate * int256(uint256(elapsed));
        state.growth = nextGrowth;
        state.lastAccrued = uint64(block.timestamp);
        emit FundingAccrued(marketId, rate, nextGrowth, elapsed);
    }

    function growth(uint32 marketId) external view returns (int256) {
        return funding[marketId].growth;
    }

    function checkpointPosition(uint32 marketId, int256 base, int256 previousGrowth)
        external
        view
        returns (int256 payment, int256 currentGrowth)
    {
        currentGrowth = funding[marketId].growth;
        payment = (base * (currentGrowth - previousGrowth)) / 1e18;
    }
}
