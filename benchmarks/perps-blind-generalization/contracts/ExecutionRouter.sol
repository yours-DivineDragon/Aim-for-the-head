// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SignedWadMath} from "./lib/SignedWadMath.sol";

interface ITradeClearing {
    function trade(uint256 accountId, uint32 marketId, int256 baseDelta, uint256 executionPrice, address actor)
        external
        returns (int256 realizedPnl, uint256 fee);
}

contract ExecutionRouter {
    using SignedWadMath for int256;

    struct Leg {
        uint32 marketId;
        int128 baseDelta;
        uint128 executionPrice;
    }

    struct SignedOrder {
        uint256 accountId;
        uint32 marketId;
        int128 baseDelta;
        uint128 limitPrice;
        uint64 deadline;
        uint64 nonce;
    }

    address public governor;
    ITradeClearing public immutable clearing;
    mapping(address => bool) public matcher;
    mapping(uint256 => mapping(uint8 => uint256)) public nonceBitmap;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "SignedOrder(uint256 accountId,uint32 marketId,int128 baseDelta,uint128 limitPrice,uint64 deadline,uint64 nonce)"
    );

    event MatcherSet(address indexed matcher, bool allowed);
    event PortfolioExecuted(uint256 indexed accountId, address indexed actor, uint256 legCount, uint256 averagePrice);
    event OrderMatched(bytes32 indexed orderHash, address indexed signer, uint256 executionPrice);

    error Unauthorized();
    error InvalidOrder();
    error LimitExceeded();
    error NonceUsed();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(address initialGovernor, ITradeClearing clearingHouse) {
        governor = initialGovernor;
        clearing = clearingHouse;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Meridian Execution"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function setMatcher(address account, bool allowed) external onlyGovernor {
        matcher[account] = allowed;
        emit MatcherSet(account, allowed);
    }

    function executePortfolio(uint256 accountId, Leg[] calldata legs, uint256 limitPrice, bool isBuy) external {
        if (legs.length == 0) revert InvalidOrder();
        uint256 priceSum;
        for (uint256 i; i < legs.length; ++i) {
            clearing.trade(accountId, legs[i].marketId, legs[i].baseDelta, legs[i].executionPrice, msg.sender);
            priceSum += legs[i].executionPrice;
        }
        uint256 averagePrice = priceSum / legs.length;
        if ((isBuy && averagePrice > limitPrice) || (!isBuy && averagePrice < limitPrice)) revert LimitExceeded();
        emit PortfolioExecuted(accountId, msg.sender, legs.length, averagePrice);
    }

    function matchOrder(SignedOrder calldata order, uint256 executionPrice, uint8 v, bytes32 r, bytes32 s) external {
        if (!matcher[msg.sender]) revert Unauthorized();
        if (block.timestamp > order.deadline || order.baseDelta == 0) revert InvalidOrder();
        bytes32 structHash = keccak256(abi.encode(ORDER_TYPEHASH, order));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidOrder();
        uint8 word = uint8(order.nonce >> 8);
        uint256 bit = uint256(1) << uint8(order.nonce);
        if (nonceBitmap[order.accountId][word] & bit != 0) revert NonceUsed();
        nonceBitmap[order.accountId][word] |= bit;
        bool priceOk = order.baseDelta > 0 ? executionPrice <= order.limitPrice : executionPrice >= order.limitPrice;
        if (!priceOk) revert LimitExceeded();
        clearing.trade(order.accountId, order.marketId, order.baseDelta, executionPrice, signer);
        emit OrderMatched(digest, signer, executionPrice);
    }

    function cancelNonce(uint256 accountId, uint64 nonce) external {
        if (address(uint160(accountId >> 96)) != msg.sender) revert Unauthorized();
        uint8 word = uint8(nonce >> 8);
        uint256 bit = uint256(1) << uint8(nonce);
        nonceBitmap[accountId][word] |= bit;
    }
}
