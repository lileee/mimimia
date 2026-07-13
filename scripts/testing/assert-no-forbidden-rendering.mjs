import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const forbidden = ['ShaderMaterial', 'RawShaderMaterial', 'onBeforeCompile', 'EffectComposer'];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(path));
    else if (['.ts', '.tsx', '.js', '.mjs'].includes(extname(entry.name))) output.push(path);
  }
  return output;
}

const violations = [];
for (const path of await sourceFiles('src')) {
  const contents = await readFile(path, 'utf8');
  for (const token of forbidden) {
    if (contents.includes(token)) violations.push(`${path}: ${token}`);
  }
}
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const threeVersion = lock.packages?.['node_modules/three']?.version;
if (threeVersion !== '0.185.1') violations.push(`package-lock.json: expected three 0.185.1, received ${threeVersion ?? 'missing'}`);

if (violations.length > 0) {
  console.error(`Forbidden rendering check failed:\n${violations.join('\n')}`);
  process.exit(1);
}
console.log('Rendering core check passed: r185 TSL path only.');
