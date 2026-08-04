import ganache from "ganache";
import { ethers } from "ethers";
import { compileAll, benchmarkRoot } from "../scripts/compiler.mjs";

export { ethers, compileAll, benchmarkRoot };

export async function makeChain() {
  const transport = ganache.provider({
    chain: { chainId: 31_337, hardfork: "shanghai" },
    logging: { quiet: true },
    wallet: { deterministic: true, totalAccounts: 12, defaultBalance: 10_000 }
  });
  const provider = new ethers.BrowserProvider(transport);
  const signers = [];
  for (let index = 0; index < 10; index++) signers.push(await provider.getSigner(index));
  const initial = transport.getInitialAccounts();
  const wallets = Object.values(initial).slice(0, 10).map(({ secretKey }) => new ethers.Wallet(secretKey, provider));
  return { provider, signers, wallets, transport };
}

export async function deploy(artifacts, name, signer, args = []) {
  const artifact = artifacts[name];
  if (!artifact || artifact.bytecode === "0x") throw new Error(`Missing deployable artifact: ${name}`);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

export async function send(transaction) {
  const response = await transaction;
  return response.wait();
}

export async function expectRevert(action, contains) {
  try {
    const response = await action;
    if (response && typeof response.wait === "function") await response.wait();
  } catch (error) {
    const text = `${error.shortMessage ?? ""} ${error.message ?? ""}`;
    if (contains && !text.includes(contains)) throw new Error(`Expected revert containing ${contains}, received ${text}`);
    return;
  }
  throw new Error("Expected transaction to revert");
}

export function ether(value) {
  return ethers.parseEther(String(value));
}

export async function blockDeadline(provider, offset = 3_600) {
  const block = await provider.getBlock("latest");
  return BigInt(block.timestamp + offset);
}

