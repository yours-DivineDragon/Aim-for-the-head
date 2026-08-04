import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let cursor = path.dirname(fileURLToPath(import.meta.url));
while (!existsSync(path.join(cursor, "test", "support.mjs"))) {
  const parent = path.dirname(cursor);
  if (parent === cursor) throw new Error("benchmark support module not found");
  cursor = parent;
}

const {
  compileAll,
  deploy,
  ether,
  ethers,
  makeChain,
  send,
  expectRevert,
  blockDeadline
} = await import(pathToFileURL(path.join(cursor, "test", "support.mjs")));

export { deploy, ether, ethers, makeChain, send, expectRevert, blockDeadline };

let artifactsPromise;

export function hiddenArtifacts() {
  if (!artifactsPromise) {
    artifactsPromise = Promise.all([
      readFile(new URL("../contracts/ExploitActors.sol", import.meta.url), "utf8"),
      readFile(new URL("../contracts/HardenedControls.sol", import.meta.url), "utf8")
    ]).then(([actors, controls]) => compileAll({
      additionalSources: {
        "hidden/ExploitActors.sol": actors,
        "hidden/HardenedControls.sol": controls
      }
    }));
  }
  return artifactsPromise;
}

export async function deploySystem({ feedAnswer = 100_000_000 } = {}) {
  const artifacts = await hiddenArtifacts();
  const chain = await makeChain();
  const [admin, liquidityProvider, borrower, attacker, recipient] = chain.signers;
  const asset = await deploy(artifacts, "MockERC20", admin, ["Aster Asset", "AST", 18]);
  const stable = await deploy(artifacts, "MockERC20", admin, ["Aster Dollar", "aUSD", 18]);
  const vault = await deploy(artifacts, "AsterVault", admin, [await asset.getAddress()]);
  const pool = await deploy(artifacts, "ReservePool", admin, [await asset.getAddress(), await stable.getAddress()]);
  const feed = await deploy(artifacts, "MockFeed", admin, [8, feedAnswer]);
  const oracle = await deploy(artifacts, "ReserveOracle", admin, [await feed.getAddress(), await pool.getAddress()]);
  const market = await deploy(artifacts, "LendingMarket", admin, [
    await stable.getAddress(), await vault.getAddress(), await oracle.getAddress(), await admin.getAddress()
  ]);
  await send(asset.mint(await liquidityProvider.getAddress(), ether(30_000)));
  await send(stable.mint(await liquidityProvider.getAddress(), ether(30_000)));
  await send(asset.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(stable.connect(liquidityProvider).approve(await pool.getAddress(), ether(10_000)));
  await send(pool.connect(liquidityProvider).addLiquidity(ether(10_000), ether(10_000)));
  await send(stable.mint(await market.getAddress(), ether(1_000_000)));
  return {
    artifacts,
    ...chain,
    admin,
    liquidityProvider,
    borrower,
    attacker,
    recipient,
    asset,
    stable,
    vault,
    pool,
    feed,
    oracle,
    market
  };
}

export async function seedVault(system, amount) {
  const owner = system.liquidityProvider;
  const address = await owner.getAddress();
  await send(system.asset.connect(owner).approve(await system.vault.getAddress(), amount));
  await send(system.vault.connect(owner).deposit(amount, address));
}

export function transferPayload(routerAddress, typeHash, owner, token, amount, nonce, deadline) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
    [typeHash, owner, token, amount, nonce, deadline]
  ));
}

export function scopedPayload(chainId, routerAddress, typeHash, owner, token, amount, recipient, nonce, deadline) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "address", "address", "address", "uint256", "address", "uint256", "uint256"],
    [typeHash, chainId, routerAddress, owner, token, amount, recipient, nonce, deadline]
  ));
}

export function malleate(signature) {
  const bytes = ethers.getBytes(signature);
  const r = bytes.slice(0, 32);
  const s = BigInt(ethers.hexlify(bytes.slice(32, 64)));
  const v = bytes[64] >= 27 ? bytes[64] : bytes[64] + 27;
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const alternateS = ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(order - s), 32));
  return ethers.hexlify(ethers.concat([r, alternateS, Uint8Array.from([v === 27 ? 28 : 27])]));
}
