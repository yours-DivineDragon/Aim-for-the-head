import assert from "node:assert/strict";
import { before, test } from "node:test";
import { compileAll, deploy, ether, expectRevert, makeChain, send } from "../../../test/support.mjs";

const comparatorSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IMessageContextC002 {
    function xDomainMessageSender() external view returns (address);
    function xDomainSourceChain() external view returns (uint32);
}
interface IBridgeReceiverC002 {
    function onBridgeCredit(address beneficiary, uint256 shares) external;
}
contract BridgeGatewayFixedC002 {
    IMessageContextC002 public immutable messenger;
    IBridgeReceiverC002 public immutable receiver;
    address public admin;
    mapping(uint32 => address) public remoteGateway;
    mapping(uint32 => mapping(uint64 => bool)) public processedNonce;

    constructor(IMessageContextC002 messenger_, IBridgeReceiverC002 receiver_, address admin_) {
        messenger = messenger_; receiver = receiver_; admin = admin_;
    }
    function configureRemote(uint32 sourceChain, address gateway) external {
        require(msg.sender == admin, "ADMIN");
        remoteGateway[sourceChain] = gateway;
    }
    function finalizeCollateral(uint32 sourceChain, uint64 nonce, address beneficiary, uint256 shares) external {
        require(msg.sender == address(messenger), "MESSENGER");
        require(messenger.xDomainSourceChain() == sourceChain, "SOURCE_CHAIN");
        address sourceSender = messenger.xDomainMessageSender();
        require(remoteGateway[sourceChain] == sourceSender, "REMOTE_GATEWAY");
        require(!processedNonce[sourceChain][nonce], "PROCESSED");
        processedNonce[sourceChain][nonce] = true;
        receiver.onBridgeCredit(beneficiary, shares);
    }
}
`;

let artifacts;

before(async () => {
  artifacts = await compileAll({
    additionalSources: { "run/evidence/C-002/BridgeGatewayFixedC002.sol": comparatorSource }
  });
});

async function setup(gatewayContract = "BridgeGateway") {
  const chain = await makeChain();
  const [admin, attacker, configuredRemote, untrustedRemote] = chain.signers;
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
  await send(gateway.configureRemote(10, await configuredRemote.getAddress()));
  await send(market.setBridge(await gateway.getAddress()));
  await send(stable.mint(await market.getAddress(), ether(10_000)));
  return { attacker, configuredRemote, untrustedRemote, stable, market, messenger, gateway };
}

function finalizeMessage(gateway, beneficiary, shares) {
  return gateway.interface.encodeFunctionData("finalizeCollateral", [10, 41, beneficiary, shares]);
}

test("positive: authentic messenger relay from an unconfigured remote application creates spendable collateral", async () => {
  const { attacker, untrustedRemote, stable, market, messenger, gateway } = await setup();
  const beneficiary = await attacker.getAddress();
  const configured = await gateway.remoteGateway(10);
  const actualRemote = await untrustedRemote.getAddress();
  assert.notEqual(actualRemote, configured);

  await send(messenger.relay(
    await gateway.getAddress(), 10, actualRemote, finalizeMessage(gateway, beneficiary, ether(1_000))
  ));
  assert.equal(await market.bridgeCollateral(beneficiary), ether(1_000));
  await send(market.connect(attacker).borrow(ether(750), beneficiary, "0x"));
  assert.equal(await stable.balanceOf(beneficiary), ether(750));
  console.log(JSON.stringify({ oracle: "C-002-positive", configuredRemote: configured, actualRemote, bridgeCollateral: String(await market.bridgeCollateral(beneficiary)), attackerStable: String(await stable.balanceOf(beneficiary)) }));
});

test("negative comparator: binding messenger source sender to configured gateway rejects the same message", async () => {
  const { attacker, configuredRemote, untrustedRemote, market, messenger, gateway } = await setup("BridgeGatewayFixedC002");
  const beneficiary = await attacker.getAddress();
  const actualRemote = await untrustedRemote.getAddress();
  const message = finalizeMessage(gateway, beneficiary, ether(1_000));

  await expectRevert(
    messenger.relay(await gateway.getAddress(), 10, actualRemote, message)
  );
  assert.equal(await market.bridgeCollateral(beneficiary), 0n);

  await send(messenger.relay(
    await gateway.getAddress(), 10, await configuredRemote.getAddress(), message
  ));
  assert.equal(await market.bridgeCollateral(beneficiary), ether(1_000));
  console.log(JSON.stringify({ oracle: "C-002-negative", wrongSenderRejected: true, correctSenderCredited: String(await market.bridgeCollateral(beneficiary)) }));
});
