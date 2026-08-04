// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20Minimal, IExternalVenue} from "./interfaces/IProtocolIntegrations.sol";
import {SignedWadMath} from "./lib/SignedWadMath.sol";

contract InsuranceFund {
    IERC20Minimal public immutable collateralToken;
    uint8 public immutable collateralDecimals;
    address public governor;
    address public clearingHouse;
    address public auction;
    IExternalVenue public venue;

    string public constant name = "Meridian Insurance Share";
    string public constant symbol = "MIS";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    uint256 public accruedProtocolValue;
    uint256 public auctionReserved;
    uint256 public pendingSocialLoss;
    uint256 public socialLossIndex;
    uint256 public reportedOpenInterest;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => uint256) public reservedBond;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Deposited(address indexed account, uint256 assets, uint256 shares);
    event Redeemed(address indexed account, uint256 assets, uint256 shares);
    event DeficitCovered(uint256 indexed accountId, uint256 requested, uint256 covered, uint256 socialized);
    event AuctionBondReserved(bytes32 indexed key, address indexed payer, uint256 amount);
    event AuctionBondReleased(bytes32 indexed key, address indexed recipient, uint256 amount);
    event VenueRebalanced(address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    error Unauthorized();
    error InvalidAmount();
    error TransferFailed();
    error InsufficientShares();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }

    constructor(address initialGovernor, IERC20Minimal token) {
        governor = initialGovernor;
        collateralToken = token;
        collateralDecimals = token.decimals();
    }

    function configure(address clearing, address liquidationAuction, IExternalVenue externalVenue) external onlyGovernor {
        clearingHouse = clearing;
        auction = liquidationAuction;
        venue = externalVenue;
    }

    function setGovernor(address next) external onlyGovernor {
        governor = next;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) allowance[from][msg.sender] = permitted - amount;
        _transfer(from, to, amount);
        return true;
    }

    function deposit(uint256 tokenAmount, address receiver) external returns (uint256 shares) {
        if (tokenAmount == 0 || receiver == address(0)) revert InvalidAmount();
        uint256 assets = _toWad(tokenAmount);
        uint256 valueBefore = totalAssets();
        shares = totalSupply == 0 ? assets : SignedWadMath.mulDiv(assets, totalSupply, valueBefore);
        if (shares == 0) revert InvalidAmount();
        if (!collateralToken.transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();
        totalSupply += shares;
        balanceOf[receiver] += shares;
        emit Transfer(address(0), receiver, shares);
        emit Deposited(receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver) external returns (uint256 assets) {
        if (shares == 0 || balanceOf[msg.sender] < shares) revert InsufficientShares();
        assets = SignedWadMath.mulDiv(shares, totalAssets(), totalSupply);
        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;
        emit Transfer(msg.sender, address(0), shares);
        uint256 tokenAmount = _fromWad(assets);
        if (!collateralToken.transfer(receiver, tokenAmount)) revert TransferFailed();
        emit Redeemed(msg.sender, assets, shares);
    }

    function absorbPenalty(uint256 wadAmount) external {
        if (msg.sender != clearingHouse) revert Unauthorized();
        accruedProtocolValue += wadAmount;
    }

    function reportOpenInterest(uint256 nextOpenInterest) external {
        if (msg.sender != clearingHouse && msg.sender != governor) revert Unauthorized();
        reportedOpenInterest = nextOpenInterest;
        if (nextOpenInterest != 0 && pendingSocialLoss != 0) {
            socialLossIndex += SignedWadMath.mulDiv(pendingSocialLoss, 1e18, nextOpenInterest);
            pendingSocialLoss = 0;
        }
    }

    function coverDeficit(uint256 accountId, uint256 wadAmount) external returns (uint256 covered) {
        if (msg.sender != clearingHouse) revert Unauthorized();
        uint256 liquid = _toWad(collateralToken.balanceOf(address(this)));
        uint256 available = liquid > auctionReserved ? liquid - auctionReserved : 0;
        covered = wadAmount > available ? available : wadAmount;
        if (covered != 0) {
            uint256 tokenAmount = _fromWad(covered);
            if (!collateralToken.transfer(clearingHouse, tokenAmount)) revert TransferFailed();
        }
        uint256 uncovered = wadAmount - covered;
        if (uncovered != 0) {
            if (reportedOpenInterest == 0) pendingSocialLoss += uncovered;
            else socialLossIndex += SignedWadMath.mulDiv(uncovered, 1e18, reportedOpenInterest);
        }
        emit DeficitCovered(accountId, wadAmount, covered, uncovered);
    }

    function reserveAuctionBond(bytes32 key, address payer, uint256 tokenAmount) external {
        if (msg.sender != auction) revert Unauthorized();
        uint256 wadAmount = _toWad(tokenAmount);
        if (!collateralToken.transferFrom(payer, address(this), tokenAmount)) revert TransferFailed();
        reservedBond[key] += wadAmount;
        auctionReserved += wadAmount;
        emit AuctionBondReserved(key, payer, wadAmount);
    }

    function releaseAuctionBond(bytes32 key, address recipient, uint16 slashBps) external returns (uint256 returned) {
        if (msg.sender != auction) revert Unauthorized();
        uint256 amount = reservedBond[key];
        if (amount == 0) return 0;
        delete reservedBond[key];
        uint256 slashed = SignedWadMath.mulDiv(amount, slashBps, 10_000);
        returned = amount - slashed;
        auctionReserved -= returned;
        accruedProtocolValue += slashed;
        if (!collateralToken.transfer(recipient, _fromWad(returned))) revert TransferFailed();
        emit AuctionBondReleased(key, recipient, returned);
    }

    function rebalance(address tokenOut, uint256 tokenAmountIn, uint256 minWadOut, bytes calldata route)
        external
        onlyGovernor
        returns (uint256 amountOut)
    {
        if (!collateralToken.transfer(address(venue), tokenAmountIn)) revert TransferFailed();
        amountOut = venue.swapExactInput(address(collateralToken), tokenOut, tokenAmountIn, route);
        if (amountOut < minWadOut) revert InvalidAmount();
        accruedProtocolValue += amountOut;
        emit VenueRebalanced(tokenOut, tokenAmountIn, amountOut);
    }

    function totalAssets() public view returns (uint256) {
        return _toWad(collateralToken.balanceOf(address(this))) + accruedProtocolValue;
    }

    function _transfer(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _toWad(uint256 amount) private view returns (uint256) {
        if (collateralDecimals == 18) return amount;
        return collateralDecimals < 18 ? amount * (10 ** (18 - collateralDecimals)) : amount / (10 ** (collateralDecimals - 18));
    }

    function _fromWad(uint256 amount) private view returns (uint256) {
        if (collateralDecimals == 18) return amount;
        return collateralDecimals < 18 ? amount / (10 ** (18 - collateralDecimals)) : amount * (10 ** (collateralDecimals - 18));
    }
}
