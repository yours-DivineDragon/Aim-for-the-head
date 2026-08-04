import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { ContractFactory } from 'ethers';

const harnessRoot = path.resolve(import.meta.dirname, '..', 'harness');
const targetRoot = path.resolve(harnessRoot, '..', '..');

export function compileHarness(filename, contractName) {
  const source = fs.readFileSync(path.join(harnessRoot, filename), 'utf8');
  const harnessKey = `blind-run/harness/${filename}`;
  const sources = { [harnessKey]: { content: source } };
  if (filename === 'PortfolioRiskHarness.sol') {
    sources['contracts/lib/PortfolioRisk.sol'] = { content: fs.readFileSync(path.join(targetRoot, 'contracts', 'lib', 'PortfolioRisk.sol'), 'utf8') };
    sources['contracts/lib/SignedWadMath.sol'] = { content: fs.readFileSync(path.join(targetRoot, 'contracts', 'lib', 'SignedWadMath.sol'), 'utf8') };
  }
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 300 },
      viaIR: true,
      evmVersion: 'shanghai',
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  const artifact = output.contracts[harnessKey][contractName];
  return { abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` };
}

export async function deployHarness(filename, contractName, signer, args = []) {
  const artifact = compileHarness(filename, contractName);
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}
