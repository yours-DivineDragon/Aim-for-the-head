// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20Minimal} from "./interfaces/IProtocolIntegrations.sol";

contract MarginVault {
    IERC20Minimal public immutable collateralToken;
    uint8 public immutable collateralDecimals;
    address public governor;
    address public controller;
    uint64 public withdrawalDelay;
    uint96 public nextAccountNonce = 1;

    struct WithdrawalRequest {
        uint128 amount;
        uint64 executableAt;
        address recipient;
    }

    mapping(uint256 => uint256) private balances;
    mapping(uint256 => address) public delegateFor;
    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;

    event AccountOpened(address indexed owner, uint256 indexed accountId);
    event DelegateSet(address indexed owner, address indexed delegate);
    event MarginDeposited(uint256 indexed accountId, address indexed sender, uint256 tokenAmount, uint256 wadAmount);
    event MarginWithdrawn(uint256 indexed accountId, address indexed recipient, uint256 wadAmount, uint256 tokenAmount);
    event WithdrawalRequested(uint256 indexed accountId, address indexed recipient, uint256 amount, uint64 executableAt);
    event WithdrawalCancelled(uint256 indexed accountId);

    error Unauthorized();
    error InvalidAmount();
    error InsufficientMargin();
    error TransferFailed();
    error NotReady();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    constructor(address initialGovernor, IERC20Minimal token, uint64 delay) {
        governor = initialGovernor;
        collateralToken = token;
        collateralDecimals = token.decimals();
        withdrawalDelay = delay;
    }

    function setGovernor(address next) external onlyGovernor {
        if (next == address(0)) revert Unauthorized();
        governor = next;
    }

    function setController(address next) external onlyGovernor {
        controller = next;
    }

    function setWithdrawalDelay(uint64 delay) external onlyGovernor {
        withdrawalDelay = delay;
    }

    function openAccount() external returns (uint256 accountId) {
        uint96 nonce = nextAccountNonce++;
        accountId = (uint256(uint160(msg.sender)) << 96) | nonce;
        emit AccountOpened(msg.sender, accountId);
    }

    function ownerOf(uint256 accountId) public pure returns (address) {
        return address(uint160(accountId >> 96));
    }

    function isAuthorized(uint256 accountId, address actor) public view returns (bool) {
        address owner = ownerOf(accountId);
        return actor == owner || actor == delegateFor[accountId];
    }

    function setDelegate(uint256 accountId, address delegate) external {
        if (ownerOf(accountId) != msg.sender) revert Unauthorized();
        delegateFor[accountId] = delegate;
        emit DelegateSet(msg.sender, delegate);
    }

    function deposit(uint256 accountId, uint256 tokenAmount) external returns (uint256 wadAmount) {
        if (ownerOf(accountId) == address(0) || tokenAmount == 0) revert InvalidAmount();
        wadAmount = _toWad(tokenAmount);
        if (!collateralToken.transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();
        balances[accountId] += wadAmount;
        emit MarginDeposited(accountId, msg.sender, tokenAmount, wadAmount);
    }

    function requestWithdrawal(uint256 accountId, uint128 wadAmount, address recipient) external {
        if (!isAuthorized(accountId, msg.sender)) revert Unauthorized();
        if (recipient == address(0) || wadAmount == 0 || balances[accountId] < wadAmount) revert InvalidAmount();
        withdrawalRequests[accountId] = WithdrawalRequest({
            amount: wadAmount,
            executableAt: uint64(block.timestamp) + withdrawalDelay,
            recipient: recipient
        });
        emit WithdrawalRequested(accountId, recipient, wadAmount, uint64(block.timestamp) + withdrawalDelay);
    }

    function cancelWithdrawal(uint256 accountId) external {
        if (!isAuthorized(accountId, msg.sender)) revert Unauthorized();
        delete withdrawalRequests[accountId];
        emit WithdrawalCancelled(accountId);
    }

    function claimWithdrawal(uint256 accountId) external {
        WithdrawalRequest storage request = withdrawalRequests[accountId];
        if (request.amount == 0 || block.timestamp < request.executableAt) revert NotReady();
        uint256 amount = request.amount;
        address recipient = request.recipient;
        if (balances[accountId] < amount) revert InsufficientMargin();
        uint256 tokenAmount = _fromWad(amount);
        if (!collateralToken.transfer(recipient, tokenAmount)) revert TransferFailed();
        balances[accountId] -= amount;
        delete withdrawalRequests[accountId];
        emit MarginWithdrawn(accountId, recipient, amount, tokenAmount);
    }

    function controllerWithdraw(uint256 accountId, address recipient, uint256 wadAmount) external onlyController {
        if (balances[accountId] < wadAmount) revert InsufficientMargin();
        uint256 tokenAmount = _fromWad(wadAmount);
        if (!collateralToken.transfer(recipient, tokenAmount)) revert TransferFailed();
        balances[accountId] -= wadAmount;
        emit MarginWithdrawn(accountId, recipient, wadAmount, tokenAmount);
    }

    function controllerCredit(uint256 accountId, uint256 wadAmount) external onlyController {
        balances[accountId] += wadAmount;
    }

    function controllerDebit(uint256 accountId, uint256 wadAmount) external onlyController returns (uint256 debited) {
        uint256 available = balances[accountId];
        debited = wadAmount > available ? available : wadAmount;
        balances[accountId] = available - debited;
    }

    function balanceOf(uint256 accountId) external view returns (uint256) {
        return balances[accountId];
    }

    function _toWad(uint256 tokenAmount) private view returns (uint256) {
        if (collateralDecimals == 18) return tokenAmount;
        if (collateralDecimals < 18) return tokenAmount * (10 ** (18 - collateralDecimals));
        return tokenAmount / (10 ** (collateralDecimals - 18));
    }

    function _fromWad(uint256 wadAmount) private view returns (uint256) {
        if (collateralDecimals == 18) return wadAmount;
        if (collateralDecimals < 18) return wadAmount / (10 ** (18 - collateralDecimals));
        return wadAmount * (10 ** (collateralDecimals - 18));
    }
}
