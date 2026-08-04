import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';

const root = path.resolve(import.meta.dirname, '..');

export async function chain() {
  const eip1193 = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 31337, hardfork: 'shanghai' },
    wallet: { deterministic: true, totalAccounts: 8, defaultBalance: 10_000 },
  });
  const provider = new BrowserProvider(eip1193);
  const signers = await Promise.all(Array.from({ length: 8 }, (_, i) => provider.getSigner(i)));
  return { eip1193, provider, signers };
}

export function artifact(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'artifacts', `${name}.json`), 'utf8'));
}

export async function deploy(name, signer, args = []) {
  const compiled = artifact(name);
  const instance = await new ContractFactory(compiled.abi, compiled.bytecode, signer).deploy(...args);
  await instance.waitForDeployment();
  return instance;
}

export async function expectRevert(promise) {
  let reverted = false;
  try {
    await promise;
  } catch {
    reverted = true;
  }
  assert.equal(reverted, true, 'expected transaction to revert');
}

export async function increaseTime(eip1193, seconds) {
  await eip1193.request({ method: 'evm_increaseTime', params: [seconds] });
  await eip1193.request({ method: 'evm_mine', params: [] });
}

export const WAD = 10n ** 18n;
