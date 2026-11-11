import {
  ATTE_PUBLIC_TOOLS,
  ATTE_PUBLIC_TOOL_NAMES,
  mcpTool,
  type McpToolDefinition,
  type McpToolScope,
} from "./mcp-tool-catalog.js";

export type AttePublicToolScope = McpToolScope;
export type AttePublicTool = McpToolDefinition & { audience: "public" };

export { ATTE_PUBLIC_TOOLS, ATTE_PUBLIC_TOOL_NAMES };

export const attePublicTool = (name: string): AttePublicTool | undefined => {
  const tool = mcpTool(name);
  return tool?.audience === "public" ? tool as AttePublicTool : undefined;
};
