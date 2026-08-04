// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    IERC20,
    IERC20Metadata,
    IAggregator,
    IPriceSource,
    IBorrowCallback,
    IBridgeCollateralReceiver,
    IMessageContext
} from "contracts/interfaces/ProtocolInterfaces.sol";
import {AsterVault} from "contracts/AsterVault.sol";

library ControlSignatures {
    uint256 private constant HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

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
        require(uint256(s) <= HALF_ORDER, "SIGNATURE_S");
        signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "SIGNATURE");
    }
}

contract HardenedPermitRouter {
    using ControlSignatures for bytes32;

    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "TransferPermit(uint256 chainId,address router,address owner,address token,uint256 amount,address recipient,uint256 nonce,uint256 deadline)"
    );
    mapping(address => uint256) public nonces;

    function executeTransfer(
        address owner,
        IERC20 token,
        uint256 amount,
        address recipient,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "EXPIRED");
        uint256 nonce = nonces[owner]++;
        bytes32 payload = keccak256(
            abi.encode(
                TRANSFER_TYPEHASH,
                block.chainid,
                address(this),
                owner,
                address(token),
                amount,
                recipient,
                nonce,
                deadline
            )
        );
        require(payload.messageHash().recover(signature) == owner, "SIGNER");
        require(token.transferFrom(owner, recipient, amount), "TRANSFER");
    }
}

contract HardenedRewardsDistributor {
    using ControlSignatures for bytes32;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("RewardClaim(address distributor,uint256 chainId,address account,uint256 amount,uint256 nonce)");
    IERC20 public immutable rewardToken;
    address public immutable authority;
    mapping(bytes32 => bool) public usedClaims;

    constructor(IERC20 rewardToken_, address authority_) {
        rewardToken = rewardToken_;
        authority = authority_;
    }

    function claim(address account, uint256 amount, uint256 nonce, bytes calldata signature) external {
        bytes32 payload = claimPayload(account, amount, nonce);
        require(!usedClaims[payload], "USED");
        require(payload.messageHash().recover(signature) == authority, "AUTHORITY");
        usedClaims[payload] = true;
        require(rewardToken.transfer(account, amount), "TRANSFER");
    }

    function claimPayload(address account, uint256 amount, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(CLAIM_TYPEHASH, address(this), block.chainid, account, amount, nonce));
    }
}

contract StrictOracle is IPriceSource {
    IAggregator public immutable feed;
    uint256 public immutable maxAge;

    constructor(IAggregator feed_, uint256 maxAge_) {
        feed = feed_;
        maxAge = maxAge_;
    }

    function price() external view override returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        require(answer > 0, "ANSWER");
        require(updatedAt <= block.timestamp && block.timestamp - updatedAt <= maxAge, "STALE");
        uint8 d = feed.decimals();
        if (d < 18) return uint256(answer) * 10 ** (18 - d);
        if (d > 18) return uint256(answer) / 10 ** (d - 18);
        return uint256(answer);
    }
}

contract ManagedVault {
    IERC20 public immutable asset;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    uint256 public managedAssets;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(IERC20Metadata asset_) {
        asset = asset_;
        decimals = asset_.decimals();
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return totalSupply == 0 ? shares : shares * managedAssets / totalSupply;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        uint256 beforeBalance = asset.balanceOf(address(this));
        require(asset.transferFrom(msg.sender, address(this), assets), "TRANSFER");
        uint256 received = asset.balanceOf(address(this)) - beforeBalance;
        shares = totalSupply == 0 || managedAssets == 0 ? received : received * totalSupply / managedAssets;
        require(shares != 0, "SHARES");
        managedAssets += received;
        totalSupply += shares;
        balanceOf[receiver] += shares;
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) {
        shares = totalSupply == 0 ? assets : _ceilDiv(assets * totalSupply, managedAssets);
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender];
            if (allowed != type(uint256).max) allowance[owner][msg.sender] = allowed - shares;
        }
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        managedAssets -= assets;
        require(asset.transfer(receiver, assets), "TRANSFER");
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender];
            if (allowed != type(uint256).max) allowance[owner][msg.sender] = allowed - shares;
        }
        assets = convertToAssets(shares);
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        managedAssets -= assets;
        require(asset.transfer(receiver, assets), "TRANSFER");
    }

    function _ceilDiv(uint256 x, uint256 y) private pure returns (uint256) {
        return x == 0 ? 0 : (x - 1) / y + 1;
    }
}

contract GuardedBorrowMarket {
    IERC20 public immutable stable;
    AsterVault public immutable collateral;
    IPriceSource public immutable oracle;
    mapping(address => uint256) public localCollateral;
    mapping(address => uint256) public debt;

    constructor(IERC20 stable_, AsterVault collateral_, IPriceSource oracle_) {
        stable = stable_;
        collateral = collateral_;
        oracle = oracle_;
    }

    function depositCollateral(uint256 shares) external {
        collateral.transferFrom(msg.sender, address(this), shares);
        localCollateral[msg.sender] += shares;
    }

    function withdrawCollateral(uint256 shares) external {
        localCollateral[msg.sender] -= shares;
        require(debt[msg.sender] <= borrowLimit(msg.sender), "HEALTH");
        collateral.transfer(msg.sender, shares);
    }

    function borrow(uint256 amount, address receiver, bytes calldata data) external {
        require(debt[msg.sender] + amount <= borrowLimit(msg.sender), "HEALTH");
        debt[msg.sender] += amount;
        stable.transfer(receiver, amount);
        if (data.length != 0) IBorrowCallback(receiver).onBorrow(msg.sender, amount, data);
    }

    function borrowLimit(address account) public view returns (uint256) {
        return collateral.convertToAssets(localCollateral[account]) * oracle.price() / 1e18 * 7_500 / 10_000;
    }
}

contract GuardedRiskConfig {
    address public immutable guardian;
    uint256 public collateralFactorBps = 7_500;

    constructor(address guardian_) {
        guardian = guardian_;
    }

    function setCollateralFactor(uint256 nextFactorBps) external {
        require(msg.sender == guardian, "GUARDIAN");
        require(nextFactorBps <= 9_500, "FACTOR");
        collateralFactorBps = nextFactorBps;
    }
}

contract DeltaRepayer {
    IERC20 public immutable token;
    address public immutable owner;
    mapping(address => uint256) public debt;

    constructor(IERC20 token_) {
        token = token_;
        owner = msg.sender;
    }

    function setDebt(address account, uint256 amount) external {
        require(msg.sender == owner, "OWNER");
        debt[account] = amount;
    }

    function repay(address account, uint256 amount) external returns (uint256 received) {
        uint256 beforeBalance = token.balanceOf(address(this));
        token.transferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - beforeBalance;
        uint256 reduction = received < debt[account] ? received : debt[account];
        debt[account] -= reduction;
    }
}

contract GuardedStrategyModule {
    address public vault;
    address public operator;
    bool public initialized;

    function initialize(address vault_, address operator_) external {
        require(!initialized, "INITIALIZED");
        require(vault_ != address(0) && operator_ != address(0), "CONFIG");
        initialized = true;
        vault = vault_;
        operator = operator_;
    }

    function sweep(IERC20 token, address receiver, uint256 amount) external {
        require(msg.sender == operator, "OPERATOR");
        token.transfer(receiver, amount);
    }
}

contract GuardedBridgeGateway {
    IMessageContext public immutable messenger;
    IBridgeCollateralReceiver public immutable receiver;
    address public immutable admin;
    mapping(uint32 => address) public remoteGateway;
    mapping(bytes32 => bool) public processed;

    constructor(IMessageContext messenger_, IBridgeCollateralReceiver receiver_, address admin_) {
        messenger = messenger_;
        receiver = receiver_;
        admin = admin_;
    }

    function configureRemote(uint32 sourceChain, address gateway) external {
        require(msg.sender == admin, "ADMIN");
        remoteGateway[sourceChain] = gateway;
    }

    function finalizeCollateral(uint32 sourceChain, uint64 nonce, address beneficiary, uint256 shares) external {
        require(msg.sender == address(messenger), "MESSENGER");
        require(messenger.xDomainSourceChain() == sourceChain, "SOURCE_CHAIN");
        require(messenger.xDomainMessageSender() == remoteGateway[sourceChain], "SOURCE_SENDER");
        bytes32 id = keccak256(abi.encode(sourceChain, nonce));
        require(!processed[id], "PROCESSED");
        processed[id] = true;
        receiver.onBridgeCredit(beneficiary, shares);
    }
}

contract CreditSink is IBridgeCollateralReceiver {
    mapping(address => uint256) public credit;

    function onBridgeCredit(address beneficiary, uint256 shares) external override {
        credit[beneficiary] += shares;
    }
}
