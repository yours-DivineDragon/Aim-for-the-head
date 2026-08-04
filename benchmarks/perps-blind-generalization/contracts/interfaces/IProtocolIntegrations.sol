// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20Minimal {
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IExternalVenue {
    /// @notice Exchanges an exact input amount and returns the venue-native output amount.
    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata route)
        external
        returns (uint256 amountOut);
}

interface IClearingCallbacks {
    function onAuctionFill(uint256 accountId, uint32 marketId, int256 baseDelta, uint256 quotePaid) external;
    function settleAccountFunding(uint256 accountId, uint32 marketId) external returns (int256 payment);
    function realizeSettlement(uint256 accountId, uint32 marketId, uint256 settlementPrice) external returns (int256 pnl);
    function accountEquity(uint256 accountId) external view returns (int256);
    function accountMaintenance(uint256 accountId) external view returns (uint256);
}

interface IInsuranceSink {
    function absorbPenalty(uint256 amount) external;
    function coverDeficit(uint256 accountId, uint256 amount) external returns (uint256 covered);
}

interface IOracleHub {
    function indexPrice(uint32 marketId) external view returns (uint256);
    function settlementPrice(uint32 marketId, uint64 epoch) external view returns (uint256);
}

interface IMarketCatalog {
    struct MarketView {
        bool active;
        uint8 riskTier;
        uint16 initialBps;
        uint16 maintenanceBps;
        uint16 liquidationPenaltyBps;
        uint32 maxOracleAge;
        uint128 skewScale;
        uint128 concentrationScale;
    }

    function market(uint32 marketId) external view returns (MarketView memory);
    function correlationBps(uint32 first, uint32 second) external view returns (int16);
}

interface IFundingEngine {
    function growth(uint32 marketId) external view returns (int256);
    function updateMark(uint32 marketId, int256 markPrice) external;
    function checkpointPosition(uint32 marketId, int256 base, int256 previousGrowth)
        external
        view
        returns (int256 payment, int256 currentGrowth);
}
