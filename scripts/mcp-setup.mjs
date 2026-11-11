// Included as setup.mjs in the portable connector package.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) { console.error('Install Node.js 22.18 or newer first.'); process.exit(1); }
const args = process.argv.slice(2);
if (!['claude', 'codex', 'login', 'doctor', '--help'].includes(args[0]) || args.length !== 1) {
  console.error('Usage: node setup.mjs claude|codex|login|doctor|--help'); process.exit(1);
}
const binary = path.join(root, 'node_modules', 'attelier-mcp', 'bin', 'attelier-mcp.js');
const installed = path.join(root, 'node_modules', '.attelier-mcp-installed');
if (!existsSync(binary) || !existsSync(installed)) {
  console.log('Installing the pinned connector dependencies. No account key is needed for this step.');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) { console.error('Dependency installation failed. Check your Node/npm installation and network, then retry.'); process.exit(1); }
  writeFileSync(installed, 'Complete\n');
}
const result = spawnSync(process.execPath, [binary, ...(['claude', 'codex'].includes(args[0]) ? ['setup', args[0]] : args)], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
