import { cpSync, mkdirSync } from 'node:fs';
const target = new URL('../kit/skills/', import.meta.url);
mkdirSync(target, { recursive: true });
cpSync(new URL('../skills/', import.meta.url), target, { recursive: true });
