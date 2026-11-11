/**
 * `@atte/kit` — Atte's tools, skills, prompts and policies.
 *
 * Boundary rule: this package must not depend on any UI, HTTP, storage or
 * service package. It depends only on `@attelier/*-schema`. The app's API, the
 * harness and Attelier MCP import the same declarations from here, so a tool
 * is authored once and reaches every surface.
 */
export * from "@atte/kit/tool-catalog";
export * from "@atte/kit/feature-registry";
export * from "@atte/kit/skill-registry";
export * from "@atte/kit/skill-loader";
export * from "@atte/kit/use-case-registry";
export * from "@atte/kit/skill-retrieval";
export * from "@atte/kit/project-tool-utils";
export * from "@atte/kit/project-tool-policy";
export * from "@atte/kit/creative-router";
export * from "@atte/kit/system-prompts";
export * from "@atte/kit/language";
export * from "@atte/kit/mcp-contract";
export * from "@atte/kit/mcp-tool-catalog";
export * from "@atte/kit/compile-edit-boundary";
export * from "@atte/kit/lower-third-presets";
export * from "@atte/kit/public-tools";
export * from "@atte/kit/public-boundary";
export * from "@atte/kit/tool-adapters";
