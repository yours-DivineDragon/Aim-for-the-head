// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {OracleHub} from "./OracleHub.sol";
import {IClearingCallbacks} from "./interfaces/IProtocolIntegrations.sol";

interface ISettlementClearing is IClearingCallbacks {
    function setFrozen(uint256 accountId, bool status) external;
    function resolveDeficit(uint256 accountId) external returns (uint256 deficit, uint256 covered);
}

contract EpochSettlement {
    enum Status {
        Unset,
        Scheduled,
        PriceRecorded,
        Closed
    }

    struct Epoch {
        uint64 cutoff;
        uint64 priceRecordedAt;
        Status status;
        uint32 accountCursor;
    }

    address public governor;
    OracleHub public immutable oracle;
    ISettlementClearing public immutable clearing;
    uint64 public nextEpoch = 1;
    mapping(uint64 => Epoch) public epochs;
    mapping(uint64 => uint32[]) private epochMarkets;
    mapping(uint64 => mapping(uint256 => bool)) public accountSettled;

    event EpochScheduled(uint64 indexed epoch, uint64 cutoff, uint32[] marketIds);
    event EpochPricesRecorded(uint64 indexed epoch, uint64 recordedAt);
    event AccountSettled(uint64 indexed epoch, uint256 indexed accountId, int256 aggregatePnl);
    event EpochClosed(uint64 indexed epoch);

    error Unauthorized();
    error InvalidEpoch();
    error NotReady();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(address initialGovernor, OracleHub oracleHub, ISettlementClearing clearingHouse) {
        governor = initialGovernor;
        oracle = oracleHub;
        clearing = clearingHouse;
    }

    function setGovernor(address next) external onlyGovernor {
        governor = next;
    }

    function schedule(uint64 cutoff, uint32[] calldata marketIds) external onlyGovernor returns (uint64 epoch) {
        if (cutoff <= block.timestamp || marketIds.length == 0) revert InvalidEpoch();
        epoch = nextEpoch++;
        epochs[epoch] = Epoch(cutoff, 0, Status.Scheduled, 0);
        for (uint256 i; i < marketIds.length; ++i) epochMarkets[epoch].push(marketIds[i]);
        emit EpochScheduled(epoch, cutoff, marketIds);
    }

    function recordPrices(uint64 epoch) external {
        Epoch storage state = epochs[epoch];
        if (state.status != Status.Scheduled) revert InvalidEpoch();
        if (block.timestamp < state.cutoff) revert NotReady();
        uint32[] storage markets = epochMarkets[epoch];
        for (uint256 i; i < markets.length; ++i) oracle.recordSettlement(markets[i], epoch);
        state.priceRecordedAt = uint64(block.timestamp);
        state.status = Status.PriceRecorded;
        emit EpochPricesRecorded(epoch, state.priceRecordedAt);
    }

    function settleBatch(uint64 epoch, uint256[] calldata accountIds) external {
        Epoch storage state = epochs[epoch];
        if (state.status != Status.PriceRecorded) revert InvalidEpoch();
        uint32[] storage markets = epochMarkets[epoch];
        for (uint256 a; a < accountIds.length; ++a) {
            uint256 accountId = accountIds[a];
            if (accountSettled[epoch][accountId]) continue;
            clearing.setFrozen(accountId, true);
            int256 aggregatePnl;
            for (uint256 m; m < markets.length; ++m) {
                uint256 price = oracle.settlementPrice(markets[m], epoch);
                aggregatePnl += clearing.realizeSettlement(accountId, markets[m], price);
                clearing.settleAccountFunding(accountId, markets[m]);
            }
            accountSettled[epoch][accountId] = true;
            clearing.resolveDeficit(accountId);
            clearing.setFrozen(accountId, false);
            state.accountCursor += 1;
            emit AccountSettled(epoch, accountId, aggregatePnl);
        }
    }

    function close(uint64 epoch) external onlyGovernor {
        Epoch storage state = epochs[epoch];
        if (state.status != Status.PriceRecorded) revert InvalidEpoch();
        state.status = Status.Closed;
        emit EpochClosed(epoch);
    }

    function marketCount(uint64 epoch) external view returns (uint256) {
        return epochMarkets[epoch].length;
    }

    function marketAt(uint64 epoch, uint256 index) external view returns (uint32) {
        return epochMarkets[epoch][index];
    }
}
