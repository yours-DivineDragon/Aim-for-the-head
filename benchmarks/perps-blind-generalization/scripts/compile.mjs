import { compile } from './compiler.mjs';

const result = compile({ writeArtifacts: true });
console.log(`Compiled ${result.sourceCount} Solidity sources with ${result.compilerVersion}; wrote ${result.artifacts.size} artifacts.`);
