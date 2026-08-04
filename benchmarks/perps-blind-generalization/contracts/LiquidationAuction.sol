// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IClearingCallbacks, IMarketCatalog, IOracleHub} from "./interfaces/IProtocolIntegrations.sol";
import {InsuranceFund} from "./InsuranceFund.sol";
import {SignedWadMath} from "./lib/SignedWadMath.sol";

interface IPositionReader {
    function position(uint256 accountId, uint32 marketId)
        external
        view
        returns (int128 base, uint128 entryPrice, int192 fundingGrowth, int192 realizedPnl);
    function setFrozen(uint256 accountId, bool status) external;
    function resolveDeficit(uint256 accountId) external returns (uint256 deficit, uint256 covered);
}

contract LiquidationAuction {
    using SignedWadMath for int256;

    struct Auction {
        uint256 accountId;
        uint32 marketId;
        int128 side;
        uint128 remainingBase;
        uint128 referencePrice;
        uint64 startedAt;
        uint64 duration;
        uint16 startDiscountBps;
        uint16 endDiscountBps;
        bool finalized;
    }

    struct BidCommitment {
        bytes32 digest;
        address bidder;
        uint256 bidderAccount;
        uint64 committedAt;
        bool revealed;
    }

    address public governor;
    IClearingCallbacks public immutable clearing;
    IPositionReader public immutable positions;
    IMarketCatalog public immutable catalog;
    IOracleHub public immutable oracle;
    InsuranceFund public immutable insurance;
    uint64 public defaultDuration = 30 minutes;
    uint64 public revealDelay = 20 seconds;
    uint256 public nextAuctionId = 1;

    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => BidCommitment)) public commitments;

    event AuctionStarted(uint256 indexed auctionId, uint256 indexed accountId, uint32 indexed marketId, uint256 baseAmount);
    event BidCommitted(uint256 indexed auctionId, address indexed bidder, uint256 bidderAccount, bytes32 digest);
    event BidFilled(uint256 indexed auctionId, address indexed bidder, uint256 baseAmount, uint256 price);
    event AuctionFinalized(uint256 indexed auctionId, uint256 residualBase, uint256 deficit, uint256 covered);

    error Unauthorized();
    error HealthyAccount();
    error InvalidAuction();
    error InvalidBid();
    error RevealNotReady();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(
        address initialGovernor,
        IClearingCallbacks clearingHouse,
        IPositionReader positionReader,
        IMarketCatalog marketCatalog,
        IOracleHub oracleHub,
        InsuranceFund insuranceFund
    ) {
        governor = initialGovernor;
        clearing = clearingHouse;
        positions = positionReader;
        catalog = marketCatalog;
        oracle = oracleHub;
        insurance = insuranceFund;
    }

    function setTiming(uint64 duration, uint64 delay) external onlyGovernor {
        if (duration == 0 || delay >= duration) revert InvalidAuction();
        defaultDuration = duration;
        revealDelay = delay;
    }

    function start(uint256 accountId, uint32 marketId) external returns (uint256 auctionId) {
        if (clearing.accountEquity(accountId) >= int256(clearing.accountMaintenance(accountId))) revert HealthyAccount();
        (int128 base,,,) = positions.position(accountId, marketId);
        if (base == 0) revert InvalidAuction();
        IMarketCatalog.MarketView memory config = catalog.market(marketId);
        auctionId = nextAuctionId++;
        uint256 index = oracle.indexPrice(marketId);
        auctions[auctionId] = Auction({
            accountId: accountId,
            marketId: marketId,
            side: base > 0 ? int128(1) : int128(-1),
            remainingBase: uint128(int256(base).abs()),
            referencePrice: uint128(index),
            startedAt: uint64(block.timestamp),
            duration: defaultDuration,
            startDiscountBps: config.liquidationPenaltyBps,
            endDiscountBps: uint16(config.liquidationPenaltyBps / 5),
            finalized: false
        });
        positions.setFrozen(accountId, true);
        emit AuctionStarted(auctionId, accountId, marketId, int256(base).abs());
    }

    function commit(uint256 auctionId, uint256 bidderAccount, bytes32 digest, uint256 bondTokenAmount) external {
        Auction storage auction = auctions[auctionId];
        if (auction.startedAt == 0 || auction.finalized || digest == bytes32(0)) revert InvalidAuction();
        BidCommitment storage prior = commitments[auctionId][msg.sender];
        if (prior.digest != bytes32(0)) revert InvalidBid();
        commitments[auctionId][msg.sender] = BidCommitment(digest, msg.sender, bidderAccount, uint64(block.timestamp), false);
        insurance.reserveAuctionBond(_bondKey(auctionId, msg.sender), msg.sender, bondTokenAmount);
        emit BidCommitted(auctionId, msg.sender, bidderAccount, digest);
    }

    function reveal(uint256 auctionId, uint256 baseAmount, uint256 limitPrice, bytes32 salt) external {
        Auction storage auction = auctions[auctionId];
        BidCommitment storage bid = commitments[auctionId][msg.sender];
        if (block.timestamp < bid.committedAt + revealDelay) revert RevealNotReady();
        if (bid.revealed || keccak256(abi.encode(auctionId, bid.bidderAccount, baseAmount, limitPrice, salt)) != bid.digest) {
            revert InvalidBid();
        }
        uint256 price = currentPrice(auctionId);
        bool acceptable = auction.side > 0 ? price <= limitPrice : price >= limitPrice;
        if (!acceptable || baseAmount == 0 || baseAmount > auction.remainingBase) revert InvalidBid();
        bid.revealed = true;
        auction.remainingBase -= uint128(baseAmount);
        int256 distressedDelta = auction.side > 0 ? -int256(baseAmount) : int256(baseAmount);
        uint256 quote = SignedWadMath.mulDiv(baseAmount, price, 1e18);
        clearing.onAuctionFill(auction.accountId, auction.marketId, distressedDelta, quote);
        clearing.onAuctionFill(bid.bidderAccount, auction.marketId, -distressedDelta, quote);
        insurance.releaseAuctionBond(_bondKey(auctionId, msg.sender), msg.sender, 0);
        emit BidFilled(auctionId, msg.sender, baseAmount, price);
    }

    function finalize(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (auction.startedAt == 0 || auction.finalized) revert InvalidAuction();
        if (auction.remainingBase != 0 && block.timestamp < auction.startedAt + auction.duration) revert InvalidAuction();
        auction.finalized = true;
        positions.setFrozen(auction.accountId, false);
        (uint256 deficit, uint256 covered) = positions.resolveDeficit(auction.accountId);
        emit AuctionFinalized(auctionId, auction.remainingBase, deficit, covered);
    }

    function slashUnrevealed(uint256 auctionId, address bidder) external {
        Auction storage auction = auctions[auctionId];
        BidCommitment storage bid = commitments[auctionId][bidder];
        if (bid.digest == bytes32(0) || bid.revealed || block.timestamp < auction.startedAt + auction.duration) revert InvalidBid();
        bid.revealed = true;
        insurance.releaseAuctionBond(_bondKey(auctionId, bidder), bidder, 5_000);
    }

    function currentPrice(uint256 auctionId) public view returns (uint256) {
        Auction storage auction = auctions[auctionId];
        if (auction.startedAt == 0) revert InvalidAuction();
        uint256 elapsed = block.timestamp - auction.startedAt;
        if (elapsed > auction.duration) elapsed = auction.duration;
        uint256 discount = auction.startDiscountBps
            - SignedWadMath.mulDiv(auction.startDiscountBps - auction.endDiscountBps, elapsed, auction.duration);
        if (auction.side > 0) return SignedWadMath.mulDiv(auction.referencePrice, 10_000 - discount, 10_000);
        return SignedWadMath.mulDiv(auction.referencePrice, 10_000 + discount, 10_000);
    }

    function _bondKey(uint256 auctionId, address bidder) private pure returns (bytes32) {
        return keccak256(abi.encode(auctionId, bidder));
    }
}
