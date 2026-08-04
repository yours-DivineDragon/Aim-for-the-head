import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

export const root = path.resolve(import.meta.dirname, '..');

function solidityFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? solidityFiles(full) : entry.name.endsWith('.sol') ? [full] : [];
  });
}

export function compile({ sourceRoot = path.join(root, 'contracts'), writeArtifacts = false, artifactRoot = path.join(root, 'artifacts') } = {}) {
  const sources = {};
  for (const filename of solidityFiles(sourceRoot).sort()) {
    const relative = path.relative(sourceRoot, filename).split(path.sep).join('/');
    sources[relative] = { content: fs.readFileSync(filename, 'utf8') };
  }
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 300 },
      viaIR: true,
      evmVersion: 'shanghai',
      metadata: { bytecodeHash: 'none' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));

  const artifacts = new Map();
  for (const [source, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [name, artifact] of Object.entries(contracts)) {
      const normalized = {
        contractName: name,
        sourceName: source,
        abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`,
        deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
      };
      artifacts.set(name, normalized);
    }
  }
  if (writeArtifacts) {
    fs.mkdirSync(artifactRoot, { recursive: true });
    for (const name of fs.readdirSync(artifactRoot)) {
      if (name.endsWith('.json')) fs.rmSync(path.join(artifactRoot, name));
    }
    for (const [name, artifact] of [...artifacts].sort(([a], [b]) => a.localeCompare(b))) {
      fs.writeFileSync(path.join(artifactRoot, `${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
    }
  }
  return { artifacts, compilerVersion: solc.version(), sourceCount: Object.keys(sources).length };
}
