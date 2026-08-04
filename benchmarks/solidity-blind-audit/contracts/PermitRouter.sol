// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "./interfaces/ProtocolInterfaces.sol";
import {SignatureCodec} from "./lib/SignatureCodec.sol";

contract PermitRouter {
    using SignatureCodec for bytes32;

    bytes32 public constant TRANSFER_TYPEHASH =
        keccak256("TransferPermit(address owner,address token,uint256 amount,uint256 nonce,uint256 deadline)");

    mapping(address => uint256) public nonces;

    event PermitTransfer(address indexed owner, address indexed token, address indexed recipient, uint256 amount);

    function executeTransfer(
        address owner,
        IERC20 token,
        uint256 amount,
        address recipient,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "EXPIRED");
        uint256 nonce = nonces[owner]++;
        bytes32 payload = keccak256(abi.encode(TRANSFER_TYPEHASH, owner, address(token), amount, nonce, deadline));
        require(payload.messageHash().recover(signature) == owner, "SIGNER");
        require(token.transferFrom(owner, recipient, amount), "TRANSFER");
        emit PermitTransfer(owner, address(token), recipient, amount);
    }
}
