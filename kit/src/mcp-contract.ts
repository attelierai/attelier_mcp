/**
 * The MCP wire contract Attelier speaks, declared in the kit so the API's HTTP
 * transport, the `attelier-mcp` stdio server and the harness all pin the same
 * version without depending on each other.
 */
export const ATTE_MCP_PROTOCOL_VERSION = "2025-06-18";
export const ATTE_MCP_SERVER_VERSION = "0.31.0";

/** Server identity reported by `initialize` on the public stdio surface. */
export const ATTELIER_MCP_SERVER_NAME = "attelier-mcp";
