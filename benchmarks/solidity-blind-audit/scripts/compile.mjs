import { compileAll } from "./compiler.mjs";

const artifacts = await compileAll({ writeArtifacts: true });
console.log(`Compiled ${Object.keys(artifacts).length} contracts with solc ${process.env.npm_package_dependencies_solc ?? "0.8.30"}.`);

