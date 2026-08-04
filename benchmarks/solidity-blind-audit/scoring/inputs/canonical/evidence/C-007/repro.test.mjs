import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, expectRevert, makeChain, send } from "../../../test/support.mjs";

const comparatorSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IMessageContextC007 {
    function xDomainMessageSender() external view returns (address);
    function xDomainSourceChain() external view returns (uint32);
}
interface IBridgeReceiverC007 {
    function onBridgeCredit(address beneficiary, uint256 shares) external;
}
contract BridgeGatewayNonceFixedC007 {
    IMessageContextC007 public immutable messenger;
    IBridgeReceiverC007 public immutable receiver;
    address public admin;
    mapping(uint32 => address) public remoteGateway;
    mapping(uint32 => mapping(uint64 => bool)) public processedNonce;
    constructor(IMessageContextC007 messenger_, IBridgeReceiverC007 receiver_, address admin_) {
        messenger = messenger_; receiver = receiver_; admin = admin_;
    }
    function configureRemote(uint32 sourceChain, address gateway) external {
        require(msg.sender == admin, "ADMIN"); remoteGateway[sourceChain] = gateway;
    }
    function finalizeCollateral(uint32 sourceChain, uint64 nonce, address beneficiary, uint256 shares) external {
        require(msg.sender == address(messenger), "MESSENGER");
        require(messenger.xDomainSourceChain() == sourceChain, "SOURCE_CHAIN");
        require(remoteGateway[sourceChain] != address(0), "UNSUPPORTED");
        require(!processedNonce[sourceChain][nonce], "PROCESSED");
        processedNonce[sourceChain][nonce] = true;
        receiver.onBridgeCredit(beneficiary, shares);
    }
}
`;

let artifacts;

before(async () => {
  artifacts = await compileAll({
    additionalSources: { "run/evidence/C-007/BridgeGatewayNonceFixedC007.sol": comparatorSource }
  });
});

async function setup(gatewayContract = "BridgeGateway") {
  const chain = await makeChain();
  const [admin, beneficiaryA, beneficiaryB, remoteA, remoteB] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, 100_000_000]);
  const oracle = await deploy(artifacts, "ReserveOracle", admin, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await admin.getAddress()
  ]);
  const messenger = await deploy(artifacts, "MockMessenger", admin);
  const gateway = await deploy(artifacts, gatewayContract, admin, [
    await messenger.getAddress(), await market.getAddress(), await admin.getAddress()
  ]);
  await send(gateway.configureRemote(10, await remoteA.getAddress()));
  await send(gateway.configureRemote(20, await remoteB.getAddress()));
  await send(market.setBridge(await gateway.getAddress()));
  return { beneficiaryA, beneficiaryB, remoteA, remoteB, market, messenger, gateway };
}

function message(gateway, chain, nonce, beneficiary, shares) {
  return gateway.interface.encodeFunctionData("finalizeCollateral", [chain, nonce, beneficiary, shares]);
}

test("positive: a valid nonce on one configured source chain blocks the same nonce on another", async () => {
  const { beneficiaryA, beneficiaryB, remoteA, remoteB, market, messenger, gateway } = await setup();
  const accountA = await beneficiaryA.getAddress();
  const accountB = await beneficiaryB.getAddress();
  const nonce = 7;

  await send(messenger.relay(
    await gateway.getAddress(), 10, await remoteA.getAddress(), message(gateway, 10, nonce, accountA, ether(1))
  ));
  await expectRevert(messenger.relay(
    await gateway.getAddress(), 20, await remoteB.getAddress(), message(gateway, 20, nonce, accountB, ether(2))
  ));

  assert.equal(await market.bridgeCollateral(accountA), ether(1));
  assert.equal(await market.bridgeCollateral(accountB), 0n);
  assert.equal(await gateway.processedNonce(nonce), true);
  console.log(JSON.stringify({ oracle: "C-007-positive", sharedNonce: String(nonce), chain10Credit: String(await market.bridgeCollateral(accountA)), chain20Credit: "0", secondValidMessageRejected: true }));
});

test("negative comparator: chain-scoped replay keys accept both valid messages", async () => {
  const { beneficiaryA, beneficiaryB, remoteA, remoteB, market, messenger, gateway } = await setup("BridgeGatewayNonceFixedC007");
  const accountA = await beneficiaryA.getAddress();
  const accountB = await beneficiaryB.getAddress();
  const nonce = 7;

  await send(messenger.relay(
    await gateway.getAddress(), 10, await remoteA.getAddress(), message(gateway, 10, nonce, accountA, ether(1))
  ));
  await send(messenger.relay(
    await gateway.getAddress(), 20, await remoteB.getAddress(), message(gateway, 20, nonce, accountB, ether(2))
  ));

  assert.equal(await market.bridgeCollateral(accountA), ether(1));
  assert.equal(await market.bridgeCollateral(accountB), ether(2));
  console.log(JSON.stringify({ oracle: "C-007-negative", chainScopedNonce: String(nonce), chain10Credit: String(await market.bridgeCollateral(accountA)), chain20Credit: String(await market.bridgeCollateral(accountB)) }));
});

