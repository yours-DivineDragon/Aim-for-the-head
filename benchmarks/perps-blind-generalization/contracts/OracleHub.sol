// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPriceFeed} from "./interfaces/IProtocolIntegrations.sol";

contract OracleHub {
    struct FeedConfig {
        IPriceFeed feed;
        uint32 maxAge;
        uint16 maxDeviationBps;
        uint256 lastGoodPrice;
    }

    address public governor;
    address public settlementCoordinator;
    mapping(uint32 => FeedConfig) public feeds;
    mapping(uint32 => mapping(uint64 => uint256)) private settledPrices;
    mapping(uint32 => mapping(uint64 => uint80)) public settlementRounds;

    event FeedConfigured(uint32 indexed marketId, address indexed feed, uint32 maxAge, uint16 maxDeviationBps);
    event PriceObserved(uint32 indexed marketId, uint256 price, uint80 roundId);
    event SettlementRecorded(uint32 indexed marketId, uint64 indexed epoch, uint256 price, uint80 roundId);

    error Unauthorized();
    error InvalidPrice();
    error StalePrice();
    error ExcessiveDeviation();
    error AlreadySettled();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(address initialGovernor) {
        governor = initialGovernor;
    }

    function setGovernor(address next) external onlyGovernor {
        if (next == address(0)) revert Unauthorized();
        governor = next;
    }

    function setSettlementCoordinator(address coordinator) external onlyGovernor {
        settlementCoordinator = coordinator;
    }

    function configureFeed(uint32 marketId, IPriceFeed feed, uint32 maxAge, uint16 maxDeviationBps)
        external
        onlyGovernor
    {
        if (address(feed) == address(0) || maxAge == 0 || maxDeviationBps > 10_000) revert InvalidPrice();
        feeds[marketId] = FeedConfig(feed, maxAge, maxDeviationBps, 0);
        emit FeedConfigured(marketId, address(feed), maxAge, maxDeviationBps);
    }

    function observe(uint32 marketId) external returns (uint256 price) {
        FeedConfig storage config = feeds[marketId];
        uint80 roundId;
        (price, roundId) = _read(config);
        uint256 prior = config.lastGoodPrice;
        if (prior != 0 && config.maxDeviationBps != 0) {
            uint256 delta = price > prior ? price - prior : prior - price;
            if (delta * 10_000 > prior * config.maxDeviationBps) revert ExcessiveDeviation();
        }
        config.lastGoodPrice = price;
        emit PriceObserved(marketId, price, roundId);
    }

    function indexPrice(uint32 marketId) external view returns (uint256 price) {
        FeedConfig storage config = feeds[marketId];
        (price,) = _read(config);
    }

    function recordSettlement(uint32 marketId, uint64 epoch) external returns (uint256 price) {
        if (msg.sender != settlementCoordinator) revert Unauthorized();
        if (settledPrices[marketId][epoch] != 0) revert AlreadySettled();
        FeedConfig storage config = feeds[marketId];
        uint80 roundId;
        (price, roundId) = _read(config);
        settledPrices[marketId][epoch] = price;
        settlementRounds[marketId][epoch] = roundId;
        emit SettlementRecorded(marketId, epoch, price, roundId);
    }

    function settlementPrice(uint32 marketId, uint64 epoch) external view returns (uint256) {
        return settledPrices[marketId][epoch];
    }

    function _read(FeedConfig storage config) private view returns (uint256 price, uint80 roundId) {
        int256 answer;
        uint256 updatedAt;
        uint80 answeredInRound;
        (roundId, answer,, updatedAt, answeredInRound) = config.feed.latestRoundData();
        if (answer <= 0 || updatedAt == 0 || answeredInRound < roundId) revert InvalidPrice();
        if (block.timestamp - updatedAt > config.maxAge) revert StalePrice();
        uint8 precision = config.feed.decimals();
        price = uint256(answer) * (10 ** (18 - precision));
    }
}
