import { compile } from '../../scripts/compiler.mjs';

const result = compile();
if (result.sourceCount !== 15) throw new Error(`expected 15 Solidity inputs, got ${result.sourceCount}`);
if (result.artifacts.size !== 25) throw new Error(`expected 25 artifacts, got ${result.artifacts.size}`);
console.log(JSON.stringify({ sourceCount: result.sourceCount, artifacts: result.artifacts.size, compilerVersion: result.compilerVersion }));
