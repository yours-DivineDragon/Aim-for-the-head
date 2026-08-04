// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "./interfaces/ProtocolInterfaces.sol";
import {SignatureCodec} from "./lib/SignatureCodec.sol";

contract RewardsDistributor {
    using SignatureCodec for bytes32;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("RewardClaim(address distributor,uint256 chainId,address account,uint256 amount,uint256 nonce)");

    IERC20 public immutable rewardToken;
    address public immutable authority;
    mapping(bytes32 => bool) public usedSignatures;

    event Claimed(address indexed account, uint256 amount, uint256 nonce);

    constructor(IERC20 rewardToken_, address authority_) {
        rewardToken = rewardToken_;
        authority = authority_;
    }

    function claim(address account, uint256 amount, uint256 nonce, bytes calldata signature) external {
        bytes32 payload = claimPayload(account, amount, nonce);
        bytes32 signatureId = keccak256(signature);
        require(!usedSignatures[signatureId], "USED");
        require(payload.messageHash().recover(signature) == authority, "AUTHORITY");
        usedSignatures[signatureId] = true;
        require(rewardToken.transfer(account, amount), "TRANSFER");
        emit Claimed(account, amount, nonce);
    }

    function claimPayload(address account, uint256 amount, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(CLAIM_TYPEHASH, address(this), block.chainid, account, amount, nonce));
    }
}
