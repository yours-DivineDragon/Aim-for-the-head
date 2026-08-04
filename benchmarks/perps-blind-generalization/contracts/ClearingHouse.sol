// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SignedWadMath} from "./lib/SignedWadMath.sol";
import {PortfolioRisk} from "./lib/PortfolioRisk.sol";
import {
    IMarketCatalog,
    IOracleHub,
    IFundingEngine,
    IInsuranceSink
} from "./interfaces/IProtocolIntegrations.sol";
import {MarginVault} from "./MarginVault.sol";

contract ClearingHouse {
    using SignedWadMath for int256;

    struct Position {
        int128 base;
        uint128 entryPrice;
        int192 fundingGrowth;
        int192 realizedPnl;
    }

    address public governor;
    address public executionRouter;
    address public liquidationAuction;
    address public epochSettlement;
    IMarketCatalog public immutable catalog;
    IOracleHub public immutable oracle;
    IFundingEngine public immutable fundingEngine;
    MarginVault public immutable vault;
    IInsuranceSink public insurance;
    uint16 public takerFeeBps = 6;

    mapping(uint256 => mapping(uint32 => Position)) private positions;
    mapping(uint256 => uint32[]) private activeMarkets;
    mapping(uint32 => int256) public marketSkew;
    mapping(uint32 => uint256) public openInterest;
    mapping(uint256 => int256) public cashBalance;
    mapping(uint256 => bool) public frozen;

    event PositionChanged(
        uint256 indexed accountId,
        uint32 indexed marketId,
        int256 baseDelta,
        uint256 executionPrice,
        int256 newBase,
        int256 realizedPnl,
        uint256 fee
    );
    event FundingSettled(uint256 indexed accountId, uint32 indexed marketId, int256 payment);
    event MarginWithdrawn(uint256 indexed accountId, uint256 amount, address recipient);
    event AccountFrozen(uint256 indexed accountId, bool status);
    event SettlementRealized(uint256 indexed accountId, uint32 indexed marketId, uint256 price, int256 pnl);

    error Unauthorized();
    error InactiveMarket();
    error InvalidTrade();
    error InsufficientMargin();
    error FrozenAccount();
    error InvalidSettlement();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(
        address initialGovernor,
        IMarketCatalog marketCatalog,
        IOracleHub oracleHub,
        IFundingEngine funding,
        MarginVault marginVault
    ) {
        governor = initialGovernor;
        catalog = marketCatalog;
        oracle = oracleHub;
        fundingEngine = funding;
        vault = marginVault;
    }

    function configureModules(address router, address auction, address settlement, IInsuranceSink insuranceFund)
        external
        onlyGovernor
    {
        executionRouter = router;
        liquidationAuction = auction;
        epochSettlement = settlement;
        insurance = insuranceFund;
    }

    function setFees(uint16 nextTakerFeeBps) external onlyGovernor {
        if (nextTakerFeeBps > 100) revert InvalidTrade();
        takerFeeBps = nextTakerFeeBps;
    }

    function setFrozen(uint256 accountId, bool status) external {
        if (msg.sender != liquidationAuction && msg.sender != epochSettlement) revert Unauthorized();
        frozen[accountId] = status;
        emit AccountFrozen(accountId, status);
    }

    function trade(uint256 accountId, uint32 marketId, int256 baseDelta, uint256 executionPrice, address actor)
        external
        returns (int256 realizedPnl, uint256 fee)
    {
        if (msg.sender != executionRouter) revert Unauthorized();
        if (!vault.isAuthorized(accountId, actor)) revert Unauthorized();
        if (frozen[accountId]) revert FrozenAccount();
        IMarketCatalog.MarketView memory config = catalog.market(marketId);
        if (!config.active) revert InactiveMarket();
        (realizedPnl, fee) = _applyTrade(accountId, marketId, baseDelta, executionPrice, takerFeeBps);
        if (accountEquity(accountId) < int256(accountInitial(accountId))) revert InsufficientMargin();
    }

    function onAuctionFill(uint256 accountId, uint32 marketId, int256 baseDelta, uint256 quotePaid) external {
        if (msg.sender != liquidationAuction) revert Unauthorized();
        uint256 price = baseDelta.abs() == 0 ? 0 : SignedWadMath.mulDiv(quotePaid, 1e18, baseDelta.abs());
        _applyTrade(accountId, marketId, baseDelta, price, 0);
    }

    function _applyTrade(
        uint256 accountId,
        uint32 marketId,
        int256 baseDelta,
        uint256 executionPrice,
        uint16 feeBps
    ) private returns (int256 realizedPnl, uint256 fee) {
        if (executionPrice == 0 || baseDelta > type(int128).max || baseDelta < type(int128).min) revert InvalidTrade();
        settleAccountFunding(accountId, marketId);
        Position storage position = positions[accountId][marketId];
        int256 oldBase = position.base;
        int256 newBase = oldBase + baseDelta;
        if (newBase > type(int128).max || newBase < type(int128).min) revert InvalidTrade();

        if (oldBase == 0) {
            activeMarkets[accountId].push(marketId);
            position.entryPrice = uint128(executionPrice);
        } else if ((oldBase < 0) == (baseDelta < 0)) {
            uint256 oldNotionalBase = oldBase.abs();
            uint256 deltaBase = baseDelta.abs();
            position.entryPrice = uint128(
                (oldNotionalBase * position.entryPrice + deltaBase * executionPrice) / (oldNotionalBase + deltaBase)
            );
        } else {
            uint256 closed = oldBase.abs() < baseDelta.abs() ? oldBase.abs() : baseDelta.abs();
            int256 priceMove = int256(executionPrice) - int256(uint256(position.entryPrice));
            realizedPnl = int256(closed) * priceMove / 1e18;
            if (oldBase < 0) realizedPnl = -realizedPnl;
            if ((newBase < 0) != (oldBase < 0)) position.entryPrice = uint128((uint256(position.entryPrice) + executionPrice) / 2);
        }

        position.base = int128(newBase);
        position.realizedPnl += int192(realizedPnl);
        marketSkew[marketId] += baseDelta;
        openInterest[marketId] += baseDelta.abs();
        fee = SignedWadMath.mulDiv(baseDelta.abs(), executionPrice, 1e18);
        fee = SignedWadMath.mulDiv(fee, feeBps, 10_000);
        cashBalance[accountId] += realizedPnl - int256(fee);
        if (fee != 0) insurance.absorbPenalty(fee);
        fundingEngine.updateMark(marketId, int256(executionPrice));
        emit PositionChanged(accountId, marketId, baseDelta, executionPrice, newBase, realizedPnl, fee);
    }

    function settleAccountFunding(uint256 accountId, uint32 marketId) public returns (int256 payment) {
        Position storage position = positions[accountId][marketId];
        int256 currentGrowth;
        (payment, currentGrowth) = fundingEngine.checkpointPosition(marketId, position.base, position.fundingGrowth);
        if (payment != 0) cashBalance[accountId] -= payment;
        position.fundingGrowth = int192(currentGrowth);
        emit FundingSettled(accountId, marketId, payment);
    }

    function withdrawMargin(uint256 accountId, uint256 wadAmount, address recipient) external {
        if (!vault.isAuthorized(accountId, msg.sender)) revert Unauthorized();
        if (frozen[accountId]) revert FrozenAccount();
        vault.controllerWithdraw(accountId, recipient, wadAmount);
        if (accountEquity(accountId) < int256(accountInitial(accountId))) revert InsufficientMargin();
        emit MarginWithdrawn(accountId, wadAmount, recipient);
    }

    function realizeSettlement(uint256 accountId, uint32 marketId, uint256 settlementPrice)
        external
        returns (int256 pnl)
    {
        if (msg.sender != epochSettlement) revert Unauthorized();
        Position storage position = positions[accountId][marketId];
        int256 base = position.base;
        if (base == 0) return 0;
        pnl = base * (int256(settlementPrice) - int256(uint256(position.entryPrice))) / 1e18;
        cashBalance[accountId] += pnl;
        marketSkew[marketId] -= base;
        position.realizedPnl += int192(pnl);
        position.base = 0;
        position.entryPrice = 0;
        emit SettlementRealized(accountId, marketId, settlementPrice, pnl);
    }

    function resolveDeficit(uint256 accountId) external returns (uint256 deficit, uint256 covered) {
        if (msg.sender != liquidationAuction && msg.sender != epochSettlement) revert Unauthorized();
        int256 equity = accountEquity(accountId);
        if (equity >= 0) return (0, 0);
        deficit = uint256(-equity);
        covered = insurance.coverDeficit(accountId, deficit);
        cashBalance[accountId] += int256(covered);
    }

    function accountEquity(uint256 accountId) public view returns (int256 equity) {
        equity = int256(vault.balanceOf(accountId)) + cashBalance[accountId];
        uint32[] storage markets = activeMarkets[accountId];
        for (uint256 i; i < markets.length; ++i) {
            Position storage position = positions[accountId][markets[i]];
            if (position.base == 0) continue;
            uint256 price = oracle.indexPrice(markets[i]);
            equity += int256(position.base) * (int256(price) - int256(uint256(position.entryPrice))) / 1e18;
        }
    }

    function accountInitial(uint256 accountId) public view returns (uint256) {
        return _marginRequirement(accountId, true);
    }

    function accountMaintenance(uint256 accountId) public view returns (uint256) {
        return _marginRequirement(accountId, false);
    }

    function _marginRequirement(uint256 accountId, bool initial) private view returns (uint256) {
        uint32[] storage ids = activeMarkets[accountId];
        uint256 count;
        for (uint256 i; i < ids.length; ++i) if (positions[accountId][ids[i]].base != 0) ++count;
        PortfolioRisk.Leg[] memory legs = new PortfolioRisk.Leg[](count);
        uint256 cursor;
        for (uint256 i; i < ids.length; ++i) {
            Position storage position = positions[accountId][ids[i]];
            if (position.base == 0) continue;
            IMarketCatalog.MarketView memory config = catalog.market(ids[i]);
            uint256 price = oracle.indexPrice(ids[i]);
            legs[cursor++] = PortfolioRisk.Leg({
                marketId: ids[i],
                notional: int256(position.base) * int256(price) / 1e18,
                marginBps: initial ? config.initialBps : config.maintenanceBps,
                concentrationScale: config.concentrationScale
            });
        }
        int16[] memory correlations = new int16[](count > 1 ? count * (count - 1) / 2 : 0);
        cursor = 0;
        for (uint256 i; i < count; ++i) {
            for (uint256 j = i + 1; j < count; ++j) {
                correlations[cursor++] = catalog.correlationBps(legs[i].marketId, legs[j].marketId);
            }
        }
        return PortfolioRisk.requirement(legs, correlations);
    }

    function position(uint256 accountId, uint32 marketId) external view returns (Position memory) {
        return positions[accountId][marketId];
    }

    function activeMarketCount(uint256 accountId) external view returns (uint256) {
        return activeMarkets[accountId].length;
    }

    function activeMarketAt(uint256 accountId, uint256 index) external view returns (uint32) {
        return activeMarkets[accountId][index];
    }
}
