import assert from "node:assert/strict";
import { before, test } from "node:test";
import { blockDeadline, compileAll, deploy, ether, ethers, expectRevert, makeChain, send } from "../../../test/support.mjs";

const comparatorSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IERC20} from "contracts/interfaces/ProtocolInterfaces.sol";
import {SignatureCodec} from "contracts/lib/SignatureCodec.sol";
contract DomainPermitRouterC010 {
    using SignatureCodec for bytes32;
    bytes32 public constant TRANSFER_TYPEHASH = keccak256("TransferPermit(address router,uint256 chainId,address owner,address token,uint256 amount,uint256 nonce,uint256 deadline)");
    mapping(address => uint256) public nonces;
    function executeTransfer(address owner, IERC20 token, uint256 amount, address recipient, uint256 deadline, bytes calldata signature) external {
        require(block.timestamp <= deadline, "EXPIRED");
        uint256 nonce = nonces[owner]++;
        bytes32 payload = keccak256(abi.encode(TRANSFER_TYPEHASH, address(this), block.chainid, owner, address(token), amount, nonce, deadline));
        require(payload.messageHash().recover(signature) == owner, "SIGNER");
        require(token.transferFrom(owner, recipient, amount), "TRANSFER");
    }
}
`;

let artifacts;

before(async () => {
  artifacts = await compileAll({
    additionalSources: { "run/evidence/C-010/DomainPermitRouterC010.sol": comparatorSource }
  });
});

async function setup(routerContract = "PermitRouter") {
  const chain = await makeChain();
  const [admin, owner, recipient, relayer] = chain.signers;
  const ownerWallet = chain.wallets[1];
  const token = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const routerA = await deploy(artifacts, routerContract, admin);
  const routerB = await deploy(artifacts, routerContract, admin);
  await send(token.mint(await owner.getAddress(), ether(50)));
  await send(token.connect(owner).approve(await routerA.getAddress(), ether(25)));
  await send(token.connect(owner).approve(await routerB.getAddress(), ether(25)));
  const deadline = await blockDeadline(chain.provider);
  return { chain, owner, ownerWallet, recipient, relayer, token, routerA, routerB, deadline };
}

async function targetSignature(context, amount) {
  const payload = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
    [await context.routerA.TRANSFER_TYPEHASH(), await context.owner.getAddress(), await context.token.getAddress(), amount, 0, context.deadline]
  ));
  return context.ownerWallet.signMessage(ethers.getBytes(payload));
}

async function comparatorSignature(context, amount) {
  const network = await context.chain.provider.getNetwork();
  const payload = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "uint256", "address", "address", "uint256", "uint256", "uint256"],
    [await context.routerA.TRANSFER_TYPEHASH(), await context.routerA.getAddress(), network.chainId, await context.owner.getAddress(), await context.token.getAddress(), amount, 0, context.deadline]
  ));
  return context.ownerWallet.signMessage(ethers.getBytes(payload));
}

async function execute(context, router, amount, signature) {
  return send(router.connect(context.relayer).executeTransfer(
    await context.owner.getAddress(), await context.token.getAddress(), amount,
    await context.recipient.getAddress(), context.deadline, signature
  ));
}

test("positive: one signature replays across two router instances with independent nonce stores", async () => {
  const context = await setup();
  const amount = ether(25);
  const signature = await targetSignature(context, amount);
  await execute(context, context.routerA, amount, signature);
  await execute(context, context.routerB, amount, signature);

  const received = await context.token.balanceOf(await context.recipient.getAddress());
  assert.equal(received, amount * 2n);
  assert.equal(await context.routerA.nonces(await context.owner.getAddress()), 1n);
  assert.equal(await context.routerB.nonces(await context.owner.getAddress()), 1n);
  console.log(JSON.stringify({ oracle: "C-010-positive", authorizedAmount: String(amount), received: String(received), routerA: await context.routerA.getAddress(), routerB: await context.routerB.getAddress(), nonceA: "1", nonceB: "1" }));
});

test("negative comparator: binding router and chain rejects replay on a second instance", async () => {
  const context = await setup("DomainPermitRouterC010");
  const amount = ether(25);
  const signature = await comparatorSignature(context, amount);
  await execute(context, context.routerA, amount, signature);
  await expectRevert(execute(context, context.routerB, amount, signature));

  const received = await context.token.balanceOf(await context.recipient.getAddress());
  assert.equal(received, amount);
  assert.equal(await context.routerB.nonces(await context.owner.getAddress()), 0n);
  console.log(JSON.stringify({ oracle: "C-010-negative", domainBoundReplayRejected: true, authorizedAmount: String(amount), received: String(received), nonceB: "0" }));
});

