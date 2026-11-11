import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
test('internal releases have verified content and no sibling dependencies', () => {
  const file = path.join(root, 'vendor/manifest.json');
  if (existsSync(file)) for (const release of JSON.parse(readFileSync(file, 'utf8')).releases) {
    for (const artifact of release.artifacts) {
      assert.equal(path.basename(artifact.file), artifact.file);
      assert.equal(createHash('sha256').update(readFileSync(path.join(root, 'vendor', artifact.file))).digest('hex'), artifact.sha256, artifact.name);
    }
  }
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => ['.git', '.codex', 'node_modules', 'target', 'dist', '.next', 'out', '.releases'].includes(e.name) || e.name.startsWith('.next-') ? [] : e.isDirectory() ? walk(path.join(dir,e.name)) : e.name === 'package.json' ? [path.join(dir,e.name)] : []);
  for (const file of walk(root)) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.pnpm?.overrides })) {
      assert.ok(!/^(file|link):.*\.\./.test(version), `${name}: external filesystem dependency`);
      assert.ok(!/^workspace:/.test(version) || file !== path.join(root, 'package.json'), `${name}: root must consume its declared packages`);
    }
  }
});
