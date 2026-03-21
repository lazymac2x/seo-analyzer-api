const express = require("express");
const cors = require("cors");
const { analyzeSEO, compareSEO } = require("./analyzer");

const app = express();
const PORT = process.env.PORT || 3400;

app.use(cors());
app.use(express.json());

// ── Health check ────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    name: "seo-analyzer-api",
    version: "1.0.0",
    endpoints: {
      analyze_get: "GET /api/v1/analyze?url=<url>",
      analyze_post: "POST /api/v1/analyze { url }",
      compare: "POST /api/v1/compare { url1, url2 }",
    },
  });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── GET /api/v1/analyze ─────────────────────────────────────────────────────

app.get("/api/v1/analyze", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing required query parameter: url" });

  try {
    const result = await analyzeSEO(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});

// ── POST /api/v1/analyze ────────────────────────────────────────────────────

app.post("/api/v1/analyze", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing required body field: url" });

  try {
    const result = await analyzeSEO(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});

// ── POST /api/v1/compare ───────────────────────────────────────────────────

app.post("/api/v1/compare", async (req, res) => {
  const { url1, url2 } = req.body;
  if (!url1 || !url2) return res.status(400).json({ error: "Missing required body fields: url1, url2" });

  try {
    const result = await compareSEO(url1, url2);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Comparison failed: ${err.message}` });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`SEO Analyzer API running on http://localhost:${PORT}`);
});

module.exports = app;
