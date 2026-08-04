// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "./interfaces/ProtocolInterfaces.sol";

contract ReservePool {
    IERC20 public immutable asset;
    IERC20 public immutable quote;
    uint112 public reserveAsset;
    uint112 public reserveQuote;

    event LiquidityAdded(address indexed provider, uint256 assets, uint256 quotes);
    event Swap(address indexed sender, address indexed tokenIn, uint256 amountIn, uint256 amountOut, address to);

    constructor(IERC20 asset_, IERC20 quote_) {
        asset = asset_;
        quote = quote_;
    }

    function addLiquidity(uint256 assets, uint256 quotes) external {
        require(asset.transferFrom(msg.sender, address(this), assets), "ASSET_TRANSFER");
        require(quote.transferFrom(msg.sender, address(this), quotes), "QUOTE_TRANSFER");
        _sync();
        emit LiquidityAdded(msg.sender, assets, quotes);
    }

    function spotPrice() external view returns (uint256) {
        require(reserveAsset != 0, "NO_LIQUIDITY");
        return uint256(reserveQuote) * 1e18 / uint256(reserveAsset);
    }

    function quoteExactInput(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        uint256 amountAfterFee = amountIn * 9_970;
        if (tokenIn == address(asset)) {
            amountOut = amountAfterFee * reserveQuote / (uint256(reserveAsset) * 10_000 + amountAfterFee);
        } else if (tokenIn == address(quote)) {
            amountOut = amountAfterFee * reserveAsset / (uint256(reserveQuote) * 10_000 + amountAfterFee);
        } else {
            revert("TOKEN");
        }
    }

    function swapExactInput(address tokenIn, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 amountOut)
    {
        require(to != address(0) && to != address(this), "RECIPIENT");
        uint256 receivedIn;
        uint256 quotedOut;
        if (tokenIn == address(asset)) {
            uint256 inputBalance = asset.balanceOf(address(this));
            require(asset.transferFrom(msg.sender, address(this), amountIn), "INPUT");
            receivedIn = asset.balanceOf(address(this)) - inputBalance;
            quotedOut = quoteExactInput(tokenIn, receivedIn);
            uint256 outputBalance = quote.balanceOf(to);
            require(quote.transfer(to, quotedOut), "OUTPUT");
            amountOut = quote.balanceOf(to) - outputBalance;
        } else if (tokenIn == address(quote)) {
            uint256 inputBalance = quote.balanceOf(address(this));
            require(quote.transferFrom(msg.sender, address(this), amountIn), "INPUT");
            receivedIn = quote.balanceOf(address(this)) - inputBalance;
            quotedOut = quoteExactInput(tokenIn, receivedIn);
            uint256 outputBalance = asset.balanceOf(to);
            require(asset.transfer(to, quotedOut), "OUTPUT");
            amountOut = asset.balanceOf(to) - outputBalance;
        } else {
            revert("TOKEN");
        }
        require(amountOut >= minOut, "MIN_OUT");
        _sync();
        emit Swap(msg.sender, tokenIn, receivedIn, amountOut, to);
    }

    function sync() external {
        _sync();
    }

    function _sync() internal {
        reserveAsset = uint112(asset.balanceOf(address(this)));
        reserveQuote = uint112(quote.balanceOf(address(this)));
    }
}
