#!/usr/bin/env node
import { credentialEnv, onboarding } from './onboarding.js';

try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18)) throw new Error('Node.js 22.18 or newer is required.');
  if (process.argv.length > 2) await onboarding(process.argv.slice(2));
  else {
    const { attelierMcpOptionsFromEnv, runAttelierMcpStdio } = await import('../dist/server.js');
    await runAttelierMcpStdio(attelierMcpOptionsFromEnv(credentialEnv()));
  }
} catch (error) {
  // Do not echo upstream error text: a misconfigured server may reflect credentials.
  const token = process.env.ATTELIER_API_TOKEN;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`attelier-mcp: ${(token ? message.split(token).join('[redacted]') : message).replace(/dir_[A-Za-z0-9_-]{43}/g, '[redacted]')}\n`);
  process.exitCode = 1;
}
