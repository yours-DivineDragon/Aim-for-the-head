// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockMessenger {
    address public xDomainMessageSender;
    uint32 public xDomainSourceChain;

    event Relayed(uint32 indexed sourceChain, address indexed sourceSender, address indexed target);

    function relay(address target, uint32 sourceChain, address sourceSender, bytes calldata message)
        external
        returns (bytes memory result)
    {
        require(xDomainMessageSender == address(0), "ACTIVE");
        xDomainMessageSender = sourceSender;
        xDomainSourceChain = sourceChain;
        (bool ok, bytes memory returned) = target.call(message);
        xDomainMessageSender = address(0);
        xDomainSourceChain = 0;
        require(ok, _reason(returned));
        emit Relayed(sourceChain, sourceSender, target);
        return returned;
    }

    function _reason(bytes memory data) private pure returns (string memory) {
        if (data.length < 68) return "RELAY";
        assembly {
            data := add(data, 0x04)
        }
        return abi.decode(data, (string));
    }
}

