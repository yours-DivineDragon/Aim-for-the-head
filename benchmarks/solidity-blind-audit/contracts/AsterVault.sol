// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20, IERC20Metadata} from "./interfaces/ProtocolInterfaces.sol";
import {MockERC20} from "./mocks/MockTokens.sol";
import {TokenMath} from "./lib/TokenMath.sol";

contract AsterVault is MockERC20 {
    using TokenMath for uint256;

    IERC20 public immutable asset;

    constructor(IERC20Metadata asset_)
        MockERC20("Aster Vault Share", "avSHARE", asset_.decimals())
    {
        asset = asset_;
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply;
        uint256 managed = totalAssets();
        return supply == 0 || managed == 0 ? assets : assets.mulDivDown(supply, managed);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply;
        return supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }

    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    function previewMint(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply;
        uint256 managed = totalAssets();
        return supply == 0 || managed == 0 ? shares : shares.mulDivUp(managed, supply);
    }

    function previewWithdraw(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        require(shares != 0, "ZERO_SHARES");
        require(asset.transferFrom(msg.sender, address(this), assets), "TRANSFER");
        _mint(receiver, shares);
    }

    function mint(address, uint256) external pure override {
        revert("UNSUPPORTED");
    }

    function burn(address, uint256) external pure override {
        revert("UNSUPPORTED");
    }

    function mint(uint256 shares, address receiver) external returns (uint256 assets) {
        assets = previewMint(shares);
        require(asset.transferFrom(msg.sender, address(this), assets), "TRANSFER");
        _mint(receiver, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) {
        shares = convertToShares(assets);
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        _burn(owner, shares);
        require(asset.transfer(receiver, assets), "TRANSFER");
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        assets = convertToAssets(shares);
        _burn(owner, shares);
        require(asset.transfer(receiver, assets), "TRANSFER");
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _spendAllowance(address owner, address spender, uint256 amount) internal {
        uint256 allowed = allowance[owner][spender];
        if (allowed != type(uint256).max) {
            allowance[owner][spender] = allowed - amount;
            emit Approval(owner, spender, allowance[owner][spender]);
        }
    }
}
