// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IBridgeCollateralReceiver, IMessageContext} from "./interfaces/ProtocolInterfaces.sol";

contract BridgeGateway {
    IMessageContext public immutable messenger;
    IBridgeCollateralReceiver public immutable receiver;
    address public admin;

    mapping(uint32 => address) public remoteGateway;
    mapping(uint64 => bool) public processedNonce;

    event RemoteConfigured(uint32 indexed chainId, address indexed gateway);
    event CollateralFinalized(
        uint32 indexed sourceChain,
        uint64 indexed nonce,
        address indexed beneficiary,
        uint256 shares,
        address sourceSender
    );

    constructor(IMessageContext messenger_, IBridgeCollateralReceiver receiver_, address admin_) {
        messenger = messenger_;
        receiver = receiver_;
        admin = admin_;
    }

    function configureRemote(uint32 sourceChain, address gateway) external {
        require(msg.sender == admin, "ADMIN");
        require(gateway != address(0), "GATEWAY");
        remoteGateway[sourceChain] = gateway;
        emit RemoteConfigured(sourceChain, gateway);
    }

    function finalizeCollateral(uint32 sourceChain, uint64 nonce, address beneficiary, uint256 shares) external {
        require(msg.sender == address(messenger), "MESSENGER");
        require(messenger.xDomainSourceChain() == sourceChain, "SOURCE_CHAIN");
        require(remoteGateway[sourceChain] != address(0), "UNSUPPORTED");
        require(!processedNonce[nonce], "PROCESSED");
        processedNonce[nonce] = true;
        address sourceSender = messenger.xDomainMessageSender();
        receiver.onBridgeCredit(beneficiary, shares);
        emit CollateralFinalized(sourceChain, nonce, beneficiary, shares, sourceSender);
    }

    function transferAdmin(address nextAdmin) external {
        require(msg.sender == admin, "ADMIN");
        require(nextAdmin != address(0), "ADMIN_ZERO");
        admin = nextAdmin;
    }
}

