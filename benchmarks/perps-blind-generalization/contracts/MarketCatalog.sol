// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IMarketCatalog} from "./interfaces/IProtocolIntegrations.sol";

contract MarketCatalog is IMarketCatalog {
    address public governor;
    address public pendingGovernor;

    mapping(uint32 => MarketView) private markets;
    mapping(bytes32 => int16) private correlations;
    uint32[] private listedMarkets;

    event GovernorNominated(address indexed nominee);
    event GovernorAccepted(address indexed governor);
    event MarketConfigured(uint32 indexed marketId, MarketView config);
    event RiskTierUpdated(uint32 indexed marketId, uint8 tier);
    event CorrelationUpdated(uint32 indexed first, uint32 indexed second, int16 bps);

    error Unauthorized();
    error InvalidConfiguration();
    error UnknownMarket();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(address initialGovernor) {
        if (initialGovernor == address(0)) revert InvalidConfiguration();
        governor = initialGovernor;
    }

    function nominateGovernor(address nominee) external onlyGovernor {
        if (nominee == address(0)) revert InvalidConfiguration();
        pendingGovernor = nominee;
        emit GovernorNominated(nominee);
    }

    function acceptGovernor() external {
        if (msg.sender != pendingGovernor) revert Unauthorized();
        governor = pendingGovernor;
        pendingGovernor = address(0);
        emit GovernorAccepted(governor);
    }

    function configureMarket(uint32 marketId, MarketView calldata config) external onlyGovernor {
        if (
            marketId == 0 || config.initialBps < config.maintenanceBps || config.initialBps > 10_000
                || config.liquidationPenaltyBps > 5_000 || config.maxOracleAge == 0 || config.skewScale == 0
        ) revert InvalidConfiguration();
        if (!markets[marketId].active) listedMarkets.push(marketId);
        markets[marketId] = config;
        emit MarketConfigured(marketId, config);
    }

    function setMarketActive(uint32 marketId, bool active) external onlyGovernor {
        MarketView storage config = markets[marketId];
        if (config.skewScale == 0) revert UnknownMarket();
        config.active = active;
        emit MarketConfigured(marketId, config);
    }

    function setRiskTier(uint32 marketId, uint8 tier) external {
        MarketView storage config = markets[marketId];
        if (config.skewScale == 0 || tier > 7) revert InvalidConfiguration();
        config.riskTier = tier;
        emit RiskTierUpdated(marketId, tier);
    }

    function setCorrelation(uint32 first, uint32 second, int16 bps) external onlyGovernor {
        if (first == second || bps < -10_000 || bps > 10_000) revert InvalidConfiguration();
        correlations[_pairKey(first, second)] = bps;
        emit CorrelationUpdated(first, second, bps);
    }

    function market(uint32 marketId) external view returns (MarketView memory) {
        return markets[marketId];
    }

    function correlationBps(uint32 first, uint32 second) external view returns (int16) {
        if (first == second) return 10_000;
        return correlations[_pairKey(first, second)];
    }

    function marketCount() external view returns (uint256) {
        return listedMarkets.length;
    }

    function marketAt(uint256 index) external view returns (uint32) {
        return listedMarkets[index];
    }

    function _pairKey(uint32 first, uint32 second) private pure returns (bytes32) {
        return first < second ? keccak256(abi.encode(first, second)) : keccak256(abi.encode(second, first));
    }
}
