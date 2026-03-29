<p align="center"><img src="logo.png" width="120" alt="logo"></p>

[![lazymac API Store](https://img.shields.io/badge/lazymac-API%20Store-blue?style=flat-square)](https://lazymac2x.github.io/lazymac-api-store/) [![Gumroad](https://img.shields.io/badge/Buy%20on-Gumroad-ff69b4?style=flat-square)](https://coindany.gumroad.com/) [![MCPize](https://img.shields.io/badge/MCP-MCPize-green?style=flat-square)](https://mcpize.com/mcp/seo-analyzer-api)

# SEO Analyzer API

Analyze any webpage for SEO scores, issues, and actionable recommendations. No external API keys needed — just pass a URL.

## Features

- **Overall SEO Score** (0-100) with letter grade (A-F)
- **12 analysis categories**: title, meta description, headings, images, links, Open Graph, technical SEO, Schema.org, content quality, and more
- **Side-by-side comparison** of two URLs
- **MCP server** for AI assistant integration
- Zero external dependencies — uses only HTML parsing via cheerio

## Quick Start

```bash
npm install
npm start
# Server runs on http://localhost:3400
```

## API Endpoints

### GET /api/v1/analyze

```bash
curl "http://localhost:3400/api/v1/analyze?url=https://example.com"
```

### POST /api/v1/analyze

```bash
curl -X POST http://localhost:3400/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### POST /api/v1/compare

```bash
curl -X POST http://localhost:3400/api/v1/compare \
  -H "Content-Type: application/json" \
  -d '{"url1": "https://github.com", "url2": "https://gitlab.com"}'
```

## Response Example

```json
{
  "url": "https://example.com",
  "overallScore": 72,
  "grade": "C",
  "scores": {
    "title": 100,
    "metaDescription": 0,
    "headings": 60,
    "images": 100,
    "links": 70,
    "openGraph": 0,
    "technical": 76,
    "schema": 0,
    "content": 30
  },
  "summary": {
    "totalIssues": 6,
    "issues": ["..."],
    "recommendations": ["..."]
  }
}
```

## MCP Server

Use as an MCP tool in Claude Desktop, Cursor, or any MCP-compatible client:

```json
{
  "mcpServers": {
    "seo-analyzer": {
      "command": "node",
      "args": ["/path/to/seo-analyzer-api/src/mcp-server.js"]
    }
  }
}
```

**Tools:**
- `analyze_seo` — Full SEO analysis of a single URL
- `compare_seo` — Compare two URLs side by side

## Docker

```bash
docker build -t seo-analyzer-api .
docker run -p 3400:3400 seo-analyzer-api
```

## Analysis Categories

| Category | Weight | What it checks |
|----------|--------|---------------|
| Title | 15% | Presence, length (30-60 chars), duplicates |
| Meta Description | 10% | Presence, length (120-160 chars) |
| Headings | 10% | H1 presence/uniqueness, hierarchy, nesting |
| Images | 8% | Alt text presence on all images |
| Links | 7% | Internal/external ratio, broken hrefs |
| Open Graph | 10% | og:title, og:description, og:image, og:url, og:type, Twitter cards |
| Technical | 20% | Viewport, canonical, lang, charset, favicon, HTML size, resource count |
| Schema.org | 10% | JSON-LD, Microdata, RDFa structured data |
| Content | 10% | Word count, reading time |

## License

MIT
