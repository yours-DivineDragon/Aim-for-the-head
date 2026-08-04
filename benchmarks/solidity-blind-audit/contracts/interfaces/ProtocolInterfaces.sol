// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC20Metadata is IERC20 {
    function decimals() external view returns (uint8);
}

interface IPriceSource {
    function price() external view returns (uint256);
}

interface IReservePool {
    function spotPrice() external view returns (uint256);
}

interface IAggregator {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IBorrowCallback {
    function onBorrow(address account, uint256 amount, bytes calldata data) external;
}

interface IBridgeCollateralReceiver {
    function onBridgeCredit(address beneficiary, uint256 shares) external;
}

interface IMessageContext {
    function xDomainMessageSender() external view returns (address);
    function xDomainSourceChain() external view returns (uint32);
}

