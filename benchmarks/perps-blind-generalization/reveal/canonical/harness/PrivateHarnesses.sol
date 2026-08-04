// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PortfolioRisk} from "../lib/PortfolioRisk.sol";

contract RiskProbe {
    function requirement(PortfolioRisk.Leg[] memory legs, int16[] memory correlations) external pure returns (uint256) {
        return PortfolioRisk.requirement(legs, correlations);
    }
}

interface IVaultView {
    function balanceOf(uint256 accountId) external view returns (uint256);
    function withdrawalRequests(uint256 accountId) external view returns (uint128, uint64, address);
    function claimWithdrawal(uint256 accountId) external;
}

contract CallbackToken {
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 precision) { decimals = precision; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        if (to.code.length != 0) to.call(abi.encodeWithSignature("observe()"));
        return true;
    }
}

contract WithdrawalObserver {
    IVaultView public immutable vault;
    uint256 public immutable accountId;
    uint256 public observedBalance;
    uint128 public observedRequest;

    constructor(IVaultView marginVault, uint256 account) { vault = marginVault; accountId = account; }
    function observe() external {
        observedBalance = vault.balanceOf(accountId);
        (observedRequest,,) = vault.withdrawalRequests(accountId);
    }
}

contract TradeClearingProbe {
    uint256 public calls;
    uint256 public lastPrice;
    int256 public grossBase;
    function trade(uint256, uint32, int256 baseDelta, uint256 executionPrice, address)
        external returns (int256, uint256)
    {
        calls += 1;
        lastPrice = executionPrice;
        grossBase += baseDelta < 0 ? -baseDelta : baseDelta;
        return (0, 0);
    }
}

contract SettlementClearingProbe {
    uint256 public phase;
    bool public orderViolation;
    mapping(uint256 => bool) public frozen;
    function onAuctionFill(uint256, uint32, int256, uint256) external {}
    function accountEquity(uint256) external pure returns (int256) { return 1; }
    function accountMaintenance(uint256) external pure returns (uint256) { return 0; }
    function setFrozen(uint256 accountId, bool status) external { frozen[accountId] = status; }
    function resolveDeficit(uint256) external pure returns (uint256, uint256) { return (0, 0); }
    function realizeSettlement(uint256, uint32, uint256) external returns (int256) { phase = 1; return 0; }
    function settleAccountFunding(uint256, uint32) external returns (int256) {
        if (phase == 1) orderViolation = true;
        phase = 2;
        return 0;
    }
}

contract AuctionClearingProbe {
    bool public frozen;
    uint256 public resolveCalls;
    function accountEquity(uint256) external pure returns (int256) { return 0; }
    function accountMaintenance(uint256) external pure returns (uint256) { return 1; }
    function position(uint256, uint32) external pure returns (int128, uint128, int192, int192) {
        return (int128(10e18), uint128(2_000e18), 0, 0);
    }
    function setFrozen(uint256, bool status) external { frozen = status; }
    function resolveDeficit(uint256) external returns (uint256, uint256) { resolveCalls += 1; return (0, 0); }
    function onAuctionFill(uint256, uint32, int256, uint256) external {}
    function settleAccountFunding(uint256, uint32) external pure returns (int256) { return 0; }
    function realizeSettlement(uint256, uint32, uint256) external pure returns (int256) { return 0; }
}
