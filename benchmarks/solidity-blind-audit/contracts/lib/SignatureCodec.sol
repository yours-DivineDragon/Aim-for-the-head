// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library SignatureCodec {
    function messageHash(bytes32 payloadHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payloadHash));
    }

    function recover(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        require(signature.length == 65, "SIGNATURE_LENGTH");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "SIGNATURE_V");
        signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "SIGNATURE");
    }
}

