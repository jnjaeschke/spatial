import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** Fetches a public Bugzilla bug through the configured moz MCP server. */
export async function fetchBugMarkdown(url: string, bug: number, signal?: AbortSignal): Promise<string> {
  const client = new Client({ name: "spatial", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  try {
    await client.connect(transport, { signal });
    const result = await client.callTool({ name: "get_bugzilla_bug", arguments: { bug_id: bug } }, undefined, { signal });
    const content = result.content as { type: string; text?: string }[] | undefined;
    const text = content?.find((item) => item.type === "text")?.text;
    if (result.isError || !text) throw new Error(text ?? `Bugzilla MCP returned no text for bug ${bug}`);
    return text;
  } finally {
    await client.close();
  }
}
