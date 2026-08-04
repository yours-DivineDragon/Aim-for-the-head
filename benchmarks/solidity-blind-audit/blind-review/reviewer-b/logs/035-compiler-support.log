import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import solc from "solc";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(resolved));
    if (entry.isFile() && entry.name.endsWith(".sol")) files.push(resolved);
  }
  return files.sort();
}

export async function compileAll({ additionalSources = {}, writeArtifacts = false } = {}) {
  const sources = {};
  for (const filename of await sourceFiles(path.join(root, "contracts"))) {
    const key = path.relative(root, filename).split(path.sep).join("/");
    sources[key] = { content: await readFile(filename, "utf8") };
  }
  for (const [key, content] of Object.entries(additionalSources)) sources[key] = { content };

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      metadata: { bytecodeHash: "none" },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const diagnostics = output.errors ?? [];
  const failures = diagnostics.filter(({ severity }) => severity === "error");
  if (failures.length) throw new Error(failures.map(({ formattedMessage }) => formattedMessage).join("\n"));

  const artifacts = {};
  for (const [source, contracts] of Object.entries(output.contracts)) {
    for (const [name, contract] of Object.entries(contracts)) {
      if (artifacts[name]) throw new Error(`Duplicate contract name: ${name}`);
      artifacts[name] = {
        contractName: name,
        sourceName: source,
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
        deployedBytecode: `0x${contract.evm.deployedBytecode.object}`
      };
    }
  }

  if (writeArtifacts) {
    const outputDirectory = path.join(root, "artifacts");
    await rm(outputDirectory, { recursive: true, force: true });
    await mkdir(outputDirectory, { recursive: true });
    for (const [name, artifact] of Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b))) {
      await writeFile(path.join(outputDirectory, `${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
    }
  }
  return artifacts;
}

export const benchmarkRoot = root;

