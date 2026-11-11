import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) {
  throw new Error('Commit reviewed source before packing a release; artifacts must identify a clean source revision.');
}
const output = path.resolve(root, process.argv[2] || '.releases');
mkdirSync(output, { recursive: true });
const packages = JSON.parse(execFileSync('pnpm', ['-r', 'list', '--depth', '-1', '--json'], { cwd: root, encoding: 'utf8' }));
const revision = git('rev-parse', 'HEAD');
const artifacts = [];
const newTags = [];
for (const entry of packages) {
  if (entry.path === root) continue;
  const pkg = JSON.parse(readFileSync(path.join(entry.path, 'package.json'), 'utf8'));
  if (!pkg.exports && !pkg.main) continue;
  // A released version names one source: the local tag release/<name>@<version> records it.
  const tag = `release/${pkg.name}@${pkg.version}`;
  if (git('tag', '--list', tag)) {
    const changed = spawnSync('git', ['diff', '--quiet', tag, 'HEAD', '--', path.relative(root, entry.path)], { cwd: root }).status !== 0;
    if (changed) throw new Error(`${pkg.name}@${pkg.version} was already released at ${git('rev-list', '-n', '1', tag).slice(0, 7)} and its source changed since; bump the version.`);
  } else newTags.push(tag);
  const filename = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
  execFileSync('pnpm', ['pack', '--pack-destination', output], { cwd: entry.path, stdio: 'pipe' });
  const sha256 = createHash('sha256').update(readFileSync(path.join(output, filename))).digest('hex');
  artifacts.push({ name: pkg.name, version: pkg.version, file: filename, sha256 });
}
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ schemaVersion: 1, repository: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name, revision, artifacts }, null, 2) + '\n');
for (const tag of newTags) git('tag', tag, revision);
console.log(`Packed ${artifacts.length} versioned artifacts into ${output}${newTags.length ? `; tagged ${newTags.join(', ')}` : ''}`);
