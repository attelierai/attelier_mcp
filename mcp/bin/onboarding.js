import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const production = 'https://api.attelier.ai';
export const tokenFile = () => path.resolve(process.env.ATTELIER_API_TOKEN_FILE || path.join(homedir(), '.config', 'attelier', 'mcp-token'));

export function credentialEnv() {
  if (process.env.ATTELIER_API_TOKEN?.trim()) return process.env;
  // Implicit saved credentials belong to production. Custom servers must opt in.
  if (!process.env.ATTELIER_API_TOKEN_FILE && (process.env.ATTELIER_API_URL || production).replace(/\/+$/, '') !== production) return process.env;
  const file = tokenFile();
  let info;
  try { info = statSync(file); } catch (error) { if (error.code === 'ENOENT' && !process.env.ATTELIER_API_TOKEN_FILE) return process.env; throw new Error('Cannot read ATTELIER_API_TOKEN_FILE. Run login or check the configured file.'); }
  if (!info.isFile() || info.size > 4096) throw new Error('The token file must be a small regular file.');
  if (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())) throw new Error('The token file must belong to you and have permissions 0600.');
  return { ...process.env, ATTELIER_API_TOKEN: readFileSync(file, 'utf8').trim() };
}

async function hiddenToken() {
  if (process.env.ATTELIER_API_TOKEN?.trim()) return process.env.ATTELIER_API_TOKEN.trim();
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Run login in an interactive terminal, or supply ATTELIER_API_TOKEN through your secret manager.');
  process.stderr.write('Paste your App key (dir_…, hidden), then Enter: ');
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const finish = (error) => {
      process.stdin.off('data', data); process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n');
      error ? reject(error) : resolve(value.trim());
    };
    const data = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003' || character === '\u0004') return finish(new Error('Login cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (/^[A-Za-z0-9_-]$/.test(character)) value += character;
        if (value.length > 4096) return finish(new Error('Invalid App key.'));
      }
    };
    process.stdin.on('data', data);
  });
}

async function check(env) {
  const { AttelierMcpServer, attelierMcpOptionsFromEnv } = await import('../dist/server.js');
  const server = new AttelierMcpServer({ ...attelierMcpOptionsFromEnv(env), requestTimeoutMs: 20000 });
  await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'attelier-mcp-doctor', version: '1' } } });
  const result = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  console.log(`Connected: ${result.tools.length} tools available. No generation or rendering started.`);
}

export async function onboarding(args) {
  const [command, client, ...extra] = args;
  if (command === '--help' || command === 'help') {
    console.log('Attelier MCP\n\nlogin          Save an App key securely (hidden prompt; replaces the saved key)\nsetup claude   Register in Claude Code for this user\nsetup codex    Register in Codex\ndoctor         Check authentication, tools and optional media dependencies\n\nWithout arguments: serve MCP over stdio.\nGuide: https://docs.attelier.ai/mcp/'); return;
  }
  if (command === 'login' && !client) {
    const token = await hiddenToken();
    if (!/^dir_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Use an App key beginning dir_ from Account → API Keys, not an atai_ API Console key.');
    await check({ ...process.env, ATTELIER_API_TOKEN: token });
    const file = tokenFile(); const directory = path.dirname(file);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.mcp-token-${randomUUID()}`);
    writeFileSync(temporary, `${token}\n`, { mode: 0o600, flag: 'wx' }); renameSync(temporary, file);
    console.log('App key saved in your private token file. It is not copied into client configuration.'); return;
  }
  if (command === 'doctor' && !client) {
    await check(credentialEnv());
    for (const executable of ['ffmpeg', 'ffprobe']) {
      const found = spawnSync(executable, ['-version'], { stdio: 'ignore' }).status === 0;
      console.log(`${found ? 'OK' : 'Optional dependency missing'}: ${executable}${found ? '' : ' (needed for local media inspection/rendering; remote tools remain available)'}`);
    } return;
  }
  if (command === 'setup' && ['claude', 'codex'].includes(client) && !extra.length) {
    const cli = process.platform === 'win32' ? `${client}.exe` : client;
    const existing = spawnSync(cli, ['mcp', 'get', 'attelier'], { stdio: 'pipe' });
    if (existing.error) throw new Error(`Install ${client} and make it available on PATH first.`);
    if (existing.status === 0) throw new Error(`An attelier server is already configured. Inspect it with ${client} mcp get attelier; to replace it, remove that entry explicitly and run setup again.`);
    // Store paths only, never the credential. Both clients can start independently of a shell export.
    const apiUrl = process.env.ATTELIER_API_URL || production;
    const { attelierMcpOptionsFromEnv } = await import('../dist/server.js');
    attelierMcpOptionsFromEnv({ ATTELIER_API_URL: apiUrl, ATTELIER_API_TOKEN: 'configuration-check' });
    const binary = fileURLToPath(new URL('./attelier-mcp.js', import.meta.url));
    const commandArgs = ['mcp', 'add', ...(client === 'claude' ? ['--scope', 'user'] : []), 'attelier', '--env', `ATTELIER_API_URL=${apiUrl}`, '--env', `ATTELIER_API_TOKEN_FILE=${tokenFile()}`, '--', process.execPath, binary];
    const result = spawnSync(cli, commandArgs, { stdio: 'pipe' });
    // Client output may include an unrelated saved credential; do not echo it.
    if (result.status !== 0) throw new Error(`${client} could not register attelier. Inspect its MCP configuration and retry; existing configuration has not been removed.`);
    console.log(`Attelier registered in ${client}. Run login if needed, restart ${client}, then check /mcp. Keep this connector folder in place.`); return;
  }
  throw new Error('Unknown command. Use --help, login, setup claude, setup codex, or doctor.');
}
