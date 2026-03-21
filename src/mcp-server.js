#!/usr/bin/env node

/**
 * MCP (Model Context Protocol) server for SEO Analyzer.
 * Exposes analyze_seo and compare_seo as tools.
 *
 * Run: node src/mcp-server.js
 * Communicates over stdio using JSON-RPC 2.0 (MCP transport).
 */

const { analyzeSEO, compareSEO } = require("./analyzer");
const readline = require("readline");

const SERVER_INFO = {
  name: "seo-analyzer",
  version: "1.0.0",
};

const TOOLS = [
  {
    name: "analyze_seo",
    description:
      "Analyze the SEO of a webpage. Returns overall score, per-category scores, issues, and recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the webpage to analyze",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "compare_seo",
    description:
      "Compare the SEO of two webpages side by side. Returns scores and a category-by-category comparison.",
    inputSchema: {
      type: "object",
      properties: {
        url1: {
          type: "string",
          description: "First URL to compare",
        },
        url2: {
          type: "string",
          description: "Second URL to compare",
        },
      },
      required: ["url1", "url2"],
    },
  },
];

// ── JSON-RPC helpers ────────────────────────────────────────────────────────

function jsonRpcResponse(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

// ── Handle MCP requests ─────────────────────────────────────────────────────

async function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return jsonRpcResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      return null; // no response needed

    case "tools/list":
      return jsonRpcResponse(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === "analyze_seo") {
        if (!args.url) {
          return jsonRpcResponse(id, {
            content: [{ type: "text", text: "Error: url parameter is required" }],
            isError: true,
          });
        }
        try {
          const result = await analyzeSEO(args.url);
          return jsonRpcResponse(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (err) {
          return jsonRpcResponse(id, {
            content: [{ type: "text", text: `Analysis failed: ${err.message}` }],
            isError: true,
          });
        }
      }

      if (toolName === "compare_seo") {
        if (!args.url1 || !args.url2) {
          return jsonRpcResponse(id, {
            content: [{ type: "text", text: "Error: url1 and url2 parameters are required" }],
            isError: true,
          });
        }
        try {
          const result = await compareSEO(args.url1, args.url2);
          return jsonRpcResponse(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (err) {
          return jsonRpcResponse(id, {
            content: [{ type: "text", text: `Comparison failed: ${err.message}` }],
            isError: true,
          });
        }
      }

      return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Stdio transport ─────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  try {
    const msg = JSON.parse(line);
    const response = await handleRequest(msg);
    if (response) {
      process.stdout.write(response + "\n");
    }
  } catch (err) {
    const errResp = jsonRpcError(null, -32700, `Parse error: ${err.message}`);
    process.stdout.write(errResp + "\n");
  }
});

process.stderr.write("SEO Analyzer MCP server running on stdio\n");
