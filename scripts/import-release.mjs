import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv[2];
if (!release) throw new Error('Usage: node scripts/import-release.mjs /absolute/path/to/release');
const manifest = JSON.parse(readFileSync(path.join(release, 'manifest.json'), 'utf8'));
const vendor = path.join(root, 'vendor');
mkdirSync(vendor, { recursive: true });
const prior = path.join(vendor, 'manifest.json');
const releases = existsSync(prior) ? JSON.parse(readFileSync(prior, 'utf8')).releases : [];
const workspace = JSON.parse(execFileSync('pnpm', ['-r', 'list', '--depth', '-1', '--json'], { cwd: root, encoding: 'utf8' }));
const packageFiles = [...new Set([root, ...workspace.map(entry => entry.path)])].map(dir => path.join(dir, 'package.json'));
const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const dependencyNames = pkg => FIELDS.flatMap(field => Object.keys(pkg[field] ?? {}));
// Only what this repository declares, plus what those artifacts need from the same release.
const declared = new Set(packageFiles.flatMap(file => dependencyNames(JSON.parse(readFileSync(file, 'utf8')))));
const byName = new Map(manifest.artifacts.map(artifact => [artifact.name, artifact]));
const needs = artifact => dependencyNames(JSON.parse(execFileSync('tar', ['-xOzf', path.join(release, artifact.file), 'package/package.json'], { encoding: 'utf8' })));
const wanted = new Set();
const visit = name => { if (wanted.has(name) || !byName.has(name)) return; wanted.add(name); for (const dependency of needs(byName.get(name))) visit(dependency); };
for (const name of declared) visit(name);
manifest.artifacts = manifest.artifacts.filter(artifact => wanted.has(artifact.name));
for (const artifact of manifest.artifacts) {
  if (path.basename(artifact.file) !== artifact.file) throw new Error('Invalid artifact name');
  const source = path.join(release, artifact.file);
  if (createHash('sha256').update(readFileSync(source)).digest('hex') !== artifact.sha256) throw new Error(`Hash mismatch: ${artifact.name}`);
  copyFileSync(source, path.join(vendor, artifact.file));
}
// The previous release of this repository leaves no tarball behind that the manifest no longer names.
const kept = new Set(manifest.artifacts.map(artifact => artifact.file));
const dropped = releases.filter(entry => entry.repository === manifest.repository).flatMap(entry => entry.artifacts).filter(old => !kept.has(old.file));
for (const old of dropped) rmSync(path.join(vendor, old.file), { force: true });
const updated = [...releases.filter(entry => entry.repository !== manifest.repository), manifest];
writeFileSync(prior, JSON.stringify({ schemaVersion: 1, releases: updated }, null, 2) + '\n');
// Declared versions match what the overrides install, in the root and every workspace package.
const versions = new Map(manifest.artifacts.map(artifact => [artifact.name, artifact.version]));
for (const pkgFile of packageFiles) {
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  for (const field of FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) if (versions.has(name)) pkg[field][name] = versions.get(name);
  }
  if (pkgFile === path.join(root, 'package.json')) {
    pkg.pnpm ??= {}; pkg.pnpm.overrides ??= {};
    for (const old of dropped) if (pkg.pnpm.overrides[old.name] === `file:vendor/${old.file}`) delete pkg.pnpm.overrides[old.name];
    for (const artifact of manifest.artifacts) pkg.pnpm.overrides[artifact.name] = `file:vendor/${artifact.file}`;
  }
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
}
console.log(`Imported and verified ${manifest.artifacts.length} artifacts from ${manifest.repository}`);
