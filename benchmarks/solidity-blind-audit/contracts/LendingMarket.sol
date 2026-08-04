// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    IERC20,
    IPriceSource,
    IBorrowCallback,
    IBridgeCollateralReceiver
} from "./interfaces/ProtocolInterfaces.sol";
import {AsterVault} from "./AsterVault.sol";

contract LendingMarket is IBridgeCollateralReceiver {
    IERC20 public immutable stable;
    AsterVault public immutable collateral;
    IPriceSource public immutable oracle;
    address public guardian;
    address public bridge;
    uint256 public collateralFactorBps;
    bool public paused;

    mapping(address => uint256) public localCollateral;
    mapping(address => uint256) public bridgeCollateral;
    mapping(address => uint256) public debt;

    event CollateralDeposited(address indexed caller, address indexed beneficiary, uint256 shares);
    event CollateralWithdrawn(address indexed account, address indexed receiver, uint256 shares);
    event Borrowed(address indexed account, address indexed receiver, uint256 amount);
    event Repaid(address indexed payer, address indexed account, uint256 amount);
    event BridgeCredit(address indexed beneficiary, uint256 shares);

    constructor(IERC20 stable_, AsterVault collateral_, IPriceSource oracle_, address guardian_) {
        stable = stable_;
        collateral = collateral_;
        oracle = oracle_;
        guardian = guardian_;
        collateralFactorBps = 7_500;
    }

    function depositCollateral(uint256 shares, address beneficiary) external {
        require(shares != 0, "SHARES");
        require(collateral.transferFrom(msg.sender, address(this), shares), "TRANSFER");
        localCollateral[beneficiary] += shares;
        emit CollateralDeposited(msg.sender, beneficiary, shares);
    }

    function withdrawCollateral(uint256 shares, address receiver) external {
        localCollateral[msg.sender] -= shares;
        require(_healthy(msg.sender, debt[msg.sender]), "HEALTH");
        require(collateral.transfer(receiver, shares), "TRANSFER");
        emit CollateralWithdrawn(msg.sender, receiver, shares);
    }

    function borrow(uint256 amount, address receiver, bytes calldata data) external {
        require(!paused, "PAUSED");
        require(_healthy(msg.sender, debt[msg.sender] + amount), "HEALTH");
        require(stable.transfer(receiver, amount), "TRANSFER");
        if (data.length != 0) IBorrowCallback(receiver).onBorrow(msg.sender, amount, data);
        debt[msg.sender] += amount;
        emit Borrowed(msg.sender, receiver, amount);
    }

    function repay(address account, uint256 amount) external returns (uint256 paid) {
        paid = amount < debt[account] ? amount : debt[account];
        require(stable.transferFrom(msg.sender, address(this), paid), "TRANSFER");
        debt[account] -= paid;
        emit Repaid(msg.sender, account, paid);
    }

    function collateralValue(address account) public view returns (uint256) {
        uint256 shares = localCollateral[account] + bridgeCollateral[account];
        return collateral.convertToAssets(shares) * oracle.price() / 1e18;
    }

    function borrowLimit(address account) public view returns (uint256) {
        return collateralValue(account) * collateralFactorBps / 10_000;
    }

    function onBridgeCredit(address beneficiary, uint256 shares) external override {
        require(msg.sender == bridge, "BRIDGE");
        bridgeCollateral[beneficiary] += shares;
        emit BridgeCredit(beneficiary, shares);
    }

    function setBridge(address nextBridge) external {
        require(msg.sender == guardian, "GUARDIAN");
        bridge = nextBridge;
    }

    function setCollateralFactor(uint256 nextFactorBps) external {
        require(nextFactorBps <= 9_500, "FACTOR");
        if (msg.sender != guardian && nextFactorBps <= collateralFactorBps) revert("GUARDIAN");
        collateralFactorBps = nextFactorBps;
    }

    function setPaused(bool nextPaused) external {
        require(msg.sender == guardian, "GUARDIAN");
        paused = nextPaused;
    }

    function transferGuardianship(address nextGuardian) external {
        require(msg.sender == guardian, "GUARDIAN");
        require(nextGuardian != address(0), "GUARDIAN_ZERO");
        guardian = nextGuardian;
    }

    function _healthy(address account, uint256 nextDebt) internal view returns (bool) {
        return nextDebt <= borrowLimit(account);
    }
}
