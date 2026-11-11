// Portable private distribution: compiled connector and local package archives,
// with a lockfile for public dependencies. No source checkout or pnpm at install time.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, '.releases', `mcp-install-${Date.now()}`));
mkdirSync(path.dirname(output), { recursive: true });
mkdirSync(output, { recursive: false });
const version = JSON.parse(readFileSync(path.join(root, 'mcp/package.json'))).version;
const name = `attelier-mcp-${version}`;
const bundle = path.join(output, name);
const packages = path.join(bundle, 'packages');
mkdirSync(packages, { recursive: true });
const dependencies = {};
for (const directory of ['kit', 'motion', 'mcp']) {
  const pkg = JSON.parse(readFileSync(path.join(root, directory, 'package.json')));
  execFileSync('corepack', ['pnpm@10.33.4', 'pack', '--pack-destination', packages], { cwd: path.join(root, directory), stdio: 'pipe' });
  dependencies[pkg.name] = `file:packages/${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`;
}
// Only schemas the connector's dependency closure uses, never the harness/runtime.
const pending = Object.entries(JSON.parse(readFileSync(path.join(root, 'kit/package.json'))).dependencies);
for (const [name, version] of pending) {
  if (dependencies[name]) continue;
  const file = `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;
  copyFileSync(path.join(root, 'vendor', file), path.join(packages, file));
  dependencies[name] = `file:packages/${file}`;
  const metadata = JSON.parse(execFileSync('tar', ['-xOf', path.join(packages, file), 'package/package.json'], { encoding: 'utf8' }));
  for (const [child, childVersion] of Object.entries(metadata.dependencies || {})) {
    if (child.startsWith('@attelier/')) pending.push([child, childVersion]);
  }
}
const pkg = { name: 'attelier-mcp-install', version, private: true, type: 'module', engines: { node: '>=22.18' }, dependencies,
  overrides: Object.fromEntries(Object.keys(dependencies).map(name => [name, `$${name}`])) };
writeFileSync(path.join(bundle, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
copyFileSync(path.join(root, 'scripts/mcp-setup.mjs'), path.join(bundle, 'setup.mjs'));
copyFileSync(path.join(root, 'mcp/INSTALL.md'), path.join(bundle, 'README.md'));
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=30000'], { cwd: bundle, stdio: 'pipe' });
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify({ version, revision, dirty, platform: 'install-time', builtAt: new Date().toISOString() }, null, 2) + '\n');
const archive = path.join(output, `${name}.tar.gz`);
execFileSync('tar', ['-czf', archive, '-C', output, name]);
const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${sha256}  ${path.basename(archive)}\n`);
console.log(`Private installer: ${archive}\nSHA-256: ${sha256}\nSource ${revision}${dirty ? ' + uncommitted changes (review artifact, not a published release)' : ''}`);
