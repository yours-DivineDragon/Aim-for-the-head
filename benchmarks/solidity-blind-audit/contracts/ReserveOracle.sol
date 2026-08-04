// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAggregator, IPriceSource, IReservePool} from "./interfaces/ProtocolInterfaces.sol";

contract ReserveOracle is IPriceSource {
    IAggregator public feed;
    IReservePool public immutable pool;
    address public owner;

    constructor(IAggregator feed_, IReservePool pool_) {
        feed = feed_;
        pool = pool_;
        owner = msg.sender;
    }

    function price() external view override returns (uint256) {
        (, int256 answer,,,) = feed.latestRoundData();
        if (answer > 0) return _normalize(uint256(answer));
        return pool.spotPrice();
    }

    function configure(IAggregator nextFeed) external {
        require(msg.sender == owner, "OWNER");
        require(address(nextFeed) != address(0), "CONFIG");
        feed = nextFeed;
    }

    function transferOwnership(address nextOwner) external {
        require(msg.sender == owner, "OWNER");
        require(nextOwner != address(0), "OWNER_ZERO");
        owner = nextOwner;
    }

    function _normalize(uint256 answer) internal view returns (uint256) {
        uint8 d = feed.decimals();
        if (d < 18) return answer * 10 ** (18 - d);
        if (d > 18) return answer / 10 ** (d - 18);
        return answer;
    }
}
