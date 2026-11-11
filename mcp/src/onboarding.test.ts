import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const binary = fileURLToPath(new URL('../bin/attelier-mcp.js', import.meta.url));
const token = `dir_${'a'.repeat(43)}`;
const run = (args: string[], env: NodeJS.ProcessEnv) => new Promise<{code:number|null; out:string}>((resolve, reject) => {
  const child = spawn(process.execPath, [binary, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => out += chunk);
  child.on('error', reject); child.on('close', code => resolve({code,out}));
});

test('login, stored credential and doctor cross real filesystem and HTTP without paid calls or token output', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'attelier-onboarding-'));
  const methods: string[] = [];
  let rejectAuth = false;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); methods.push(body.method);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader('content-type', 'application/json');
    if (rejectAuth) { res.statusCode = 401; res.end(JSON.stringify({error:{message:`Expired ${token}`}})); }
    else res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method === 'tools/list' ? {tools:[{name:'list_projects'}]} : {}}));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as {port:number};
  const file = path.join(home, '.config', 'attelier', 'mcp-token');
  const env = { PATH:process.env.PATH, HOME:home, ATTELIER_API_URL:`http://127.0.0.1:${address.port}`, ATTELIER_API_TOKEN_FILE:file };
  try {
    const logged = await run(['login'], {...env, ATTELIER_API_TOKEN:token});
    assert.equal(logged.code,0,logged.out); assert.ok(!logged.out.includes(token));
    assert.equal(readFileSync(file,'utf8').trim(),token); assert.equal(statSync(file).mode & 0o777,0o600);
    const doctor = await run(['doctor'],env); assert.equal(doctor.code,0,doctor.out); assert.match(doctor.out,/Connected:/); assert.ok(!doctor.out.includes(token));
    if (spawnSync('script', ['--version'], { stdio: 'ignore' }).status === 0) {
      const interactive = await new Promise<{code:number|null; out:string}>((resolve, reject) => {
        const quote = (value:string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
        const child = spawn('script', ['-q', '-e', '-c', quote(process.execPath) + ' ' + quote(binary) + ' login', '/dev/null'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', sent = false;
        const collect = (chunk:Buffer) => { out += chunk.toString(); if (!sent && out.includes('hidden), then Enter:')) { sent = true; child.stdin.write(token + '\r'); } };
        child.stdout.on('data', collect); child.stderr.on('data', collect);
        child.on('error', reject); child.on('close', code => resolve({code,out}));
      });
      assert.equal(interactive.code,0,interactive.out); assert.ok(!interactive.out.includes(token), 'hidden prompt must never echo the key');
    }
    const before = methods.length;
    const implicit = await run(['doctor'], {PATH:env.PATH, HOME:home, ATTELIER_API_URL:env.ATTELIER_API_URL});
    assert.equal(implicit.code,1); assert.equal(methods.length,before,'saved production key must not go to a custom endpoint implicitly');
    rejectAuth = true;
    const failed = await run(['doctor'],env); assert.equal(failed.code,1); assert.ok(!failed.out.includes(token));
    const invalid = await run(['login'],{...env,ATTELIER_API_TOKEN:'atai_wrong'}); assert.equal(invalid.code,1); assert.equal(readFileSync(file,'utf8').trim(),token);
    chmodSync(file,0o644); const unsafe = await run(['doctor'],env); assert.equal(unsafe.code,1); assert.match(unsafe.out,/0600/);
    assert.ok(methods.length >= 5); assert.ok(methods.every(method => ['initialize','tools/list'].includes(method)));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(home,{recursive:true,force:true}); }
});

for (const client of ['codex','claude']) test(`setup uses the actual ${client} CLI and preserves an existing server`, async (context) => {
  if (spawnSync(client,['--version'],{stdio:'ignore'}).status !== 0) { context.skip(`${client} unavailable`); return; }
  const home = mkdtempSync(path.join(tmpdir(), `attelier-${client}-`));
  const env = { PATH:process.env.PATH, HOME:home, CODEX_HOME:path.join(home,'.codex'), CLAUDE_CONFIG_DIR:path.join(home,'.claude') };
  mkdirSync(env.CODEX_HOME); mkdirSync(env.CLAUDE_CONFIG_DIR);
  // Keep unrelated configuration through registration and duplicate detection.
  if(client === 'codex') writeFileSync(path.join(env.CODEX_HOME,'config.toml'),'[mcp_servers.unrelated]\ncommand = "echo"\nargs = ["keep"]\n');
  try {
    const configured = await run(['setup',client],env); assert.equal(configured.code,0,configured.out);
    const get = spawnSync(client,['mcp','get','attelier'],{env,encoding:'utf8'}); assert.equal(get.status,0,get.stderr); assert.match(get.stdout,/ATTELIER_API_TOKEN_FILE/); assert.ok(!get.stdout.includes(token));
    const duplicate = await run(['setup',client],env); assert.equal(duplicate.code,1); assert.match(duplicate.out,/already configured/);
    const after = spawnSync(client,['mcp','get','attelier'],{env,encoding:'utf8'}); assert.equal(after.stdout,get.stdout);
    if(client === 'codex') assert.match(readFileSync(path.join(env.CODEX_HOME,'config.toml'),'utf8'),/mcp_servers.unrelated/);
  } finally { rmSync(home,{recursive:true,force:true}); }
});
