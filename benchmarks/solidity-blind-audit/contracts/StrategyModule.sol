// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "./interfaces/ProtocolInterfaces.sol";

contract StrategyModule {
    address public vault;
    address public operator;
    bool public initialized;

    event Initialized(address indexed vault, address indexed operator);
    event Swept(address indexed token, address indexed receiver, uint256 amount);

    function initialize(address vault_, address operator_) external {
        require(vault_ != address(0) && operator_ != address(0), "CONFIG");
        vault = vault_;
        operator = operator_;
        initialized = true;
        emit Initialized(vault_, operator_);
    }

    function sweep(IERC20 token, address receiver, uint256 amount) external {
        require(msg.sender == operator, "OPERATOR");
        require(token.transfer(receiver, amount), "TRANSFER");
        emit Swept(address(token), receiver, amount);
    }

    function execute(address target, bytes calldata data) external returns (bytes memory result) {
        require(msg.sender == vault, "VAULT");
        (bool ok, bytes memory returned) = target.call(data);
        require(ok, "EXECUTE");
        return returned;
    }
}

