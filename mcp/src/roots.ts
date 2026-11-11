import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A host that runs this bridge for someone else (Atte in hosted Studio) sets ATTELIER_MCP_ROOT to
 *  that person's working folder, and local file access stays inside it. On a person's own machine it
 *  is unset and their home and the current folder are open to the tools they call. */
export const hostRoot = (): string | undefined => {
  const value = process.env.ATTELIER_MCP_ROOT?.trim();
  return value ? path.resolve(value) : undefined;
};

export const allowedRoots = (): string[] => {
  const root = hostRoot();
  return root ? [root] : [os.homedir(), process.cwd()];
};

/** The real location of a path, following symlinks through its nearest existing ancestor. */
export const realPath = (file: string): string => {
  if (existsSync(file)) return realpathSync(file);
  const parent = path.dirname(file);
  return parent === file ? file : path.join(realPath(parent), path.basename(file));
};

export const isInside = (file: string, roots: readonly string[]): boolean => {
  const actual = realPath(file);
  return roots.some((root) => { const real = realPath(root); return actual === real || actual.startsWith(real + path.sep); });
};
