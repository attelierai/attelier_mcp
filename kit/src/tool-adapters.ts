import { ATTE_PUBLIC_TOOLS, type AttePublicTool, type AttePublicToolScope } from "./public-tools.js";

/** A JSON Schema object as the catalog stores it. Kept structural on purpose:
 * the kit never rewrites a schema, it only re-frames it per provider. */
export type AtteJsonSchema = Record<string, unknown>;

export type AtteToolSelection = {
  /** Restrict the emitted declarations to these scopes. Defaults to all. */
  scopes?: readonly AttePublicToolScope[];
  /** Restrict to these exact tool names. Unknown names are an error. */
  names?: readonly string[];
};

export type AtteMcpTool = {
  name: string;
  description: string;
  inputSchema: AtteJsonSchema;
};

export const selectAttePublicTools = (
  selection: AtteToolSelection = {},
): AttePublicTool[] => {
  const byScope = selection.scopes
    ? ATTE_PUBLIC_TOOLS.filter((tool) => selection.scopes!.includes(tool.scope))
    : [...ATTE_PUBLIC_TOOLS];
  if (!selection.names) return byScope;
  return selection.names.map((name) => {
    const tool = byScope.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`${name} is not an Atte public tool in the requested scopes.`);
    return tool;
  });
};

export const toMcpTools = (selection: AtteToolSelection = {}): AtteMcpTool[] =>
  selectAttePublicTools(selection).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
