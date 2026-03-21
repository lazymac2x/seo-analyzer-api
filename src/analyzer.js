const cheerio = require("cheerio");
const https = require("https");
const http = require("http");
const { URL } = require("url");

// ── Fetch HTML ──────────────────────────────────────────────────────────────

function fetchPage(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Too many redirects"));

    const parsed = new URL(targetUrl);
    const client = parsed.protocol === "https:" ? https : http;

    const startTime = Date.now();
    const req = client.get(
      targetUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SEOAnalyzerBot/1.0; +https://github.com/lazymac2x/seo-analyzer-api)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "identity",
        },
        timeout: 15000,
        rejectUnauthorized: false,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, targetUrl).href;
          return fetchPage(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const html = Buffer.concat(chunks).toString("utf-8");
          const elapsed = Date.now() - startTime;
          resolve({
            html,
            statusCode: res.statusCode,
            headers: res.headers,
            fetchTimeMs: elapsed,
            finalUrl: targetUrl,
            htmlSizeBytes: Buffer.byteLength(html, "utf-8"),
          });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out after 15 seconds"));
    });
    req.on("error", reject);
  });
}

// ── Analysis helpers ────────────────────────────────────────────────────────

function scoreRange(value, ideal, tolerance) {
  if (value === null || value === undefined) return 0;
  const diff = Math.abs(value - ideal);
  if (diff <= tolerance) return 100;
  return Math.max(0, Math.round(100 - ((diff - tolerance) / tolerance) * 100));
}

function analyzeTitle($) {
  const el = $("title");
  const text = el.first().text().trim();
  const length = text.length;
  const issues = [];
  const recommendations = [];

  if (!text) {
    issues.push("Missing <title> tag");
    recommendations.push("Add a descriptive title tag between 30-60 characters");
    return { text: null, length: 0, score: 0, issues, recommendations };
  }
  if (length < 30) {
    issues.push(`Title too short (${length} chars, recommended 30-60)`);
    recommendations.push("Expand the title to include primary keywords");
  }
  if (length > 60) {
    issues.push(`Title too long (${length} chars, may be truncated in SERPs)`);
    recommendations.push("Shorten title to 60 characters or fewer");
  }
  if ($("title").length > 1) {
    issues.push("Multiple <title> tags found");
    recommendations.push("Keep only one title tag per page");
  }

  const score = text ? scoreRange(length, 50, 20) : 0;
  return { text, length, score, issues, recommendations };
}

function analyzeMetaDescription($) {
  const el = $('meta[name="description"]');
  const content = el.attr("content")?.trim() || null;
  const length = content ? content.length : 0;
  const issues = [];
  const recommendations = [];

  if (!content) {
    issues.push("Missing meta description");
    recommendations.push("Add a compelling meta description between 120-160 characters");
    return { content: null, length: 0, score: 0, issues, recommendations };
  }
  if (length < 120) {
    issues.push(`Meta description too short (${length} chars)`);
    recommendations.push("Expand description to at least 120 characters");
  }
  if (length > 160) {
    issues.push(`Meta description too long (${length} chars, may be truncated)`);
    recommendations.push("Shorten to 160 characters or fewer");
  }

  const score = content ? scoreRange(length, 140, 30) : 0;
  return { content, length, score, issues, recommendations };
}

function analyzeHeadings($) {
  const hierarchy = {};
  const issues = [];
  const recommendations = [];

  for (let i = 1; i <= 6; i++) {
    const tag = `h${i}`;
    const els = $(tag);
    hierarchy[tag] = {
      count: els.length,
      texts: els
        .map((_, el) => $(el).text().trim().substring(0, 120))
        .get()
        .slice(0, 10),
    };
  }

  const h1Count = hierarchy.h1.count;
  if (h1Count === 0) {
    issues.push("Missing H1 tag");
    recommendations.push("Add exactly one H1 tag containing the primary keyword");
  } else if (h1Count > 1) {
    issues.push(`Multiple H1 tags found (${h1Count})`);
    recommendations.push("Use only one H1 per page");
  }

  if (hierarchy.h1.count === 0 && hierarchy.h2.count > 0) {
    issues.push("H2 tags present without H1");
    recommendations.push("Add an H1 before using H2 tags");
  }

  // Check for skipped levels
  const levels = [1, 2, 3, 4, 5, 6];
  let lastUsed = 0;
  for (const lvl of levels) {
    if (hierarchy[`h${lvl}`].count > 0) {
      if (lvl - lastUsed > 1 && lastUsed > 0) {
        issues.push(`Heading level skipped: H${lastUsed} -> H${lvl}`);
        recommendations.push(`Add H${lastUsed + 1} between H${lastUsed} and H${lvl}`);
      }
      lastUsed = lvl;
    }
  }

  const totalHeadings = Object.values(hierarchy).reduce((s, h) => s + h.count, 0);
  let score = 100;
  if (h1Count === 0) score -= 40;
  if (h1Count > 1) score -= 20;
  if (totalHeadings === 0) score -= 30;
  score -= issues.length * 5;

  return { hierarchy, totalHeadings, score: Math.max(0, score), issues, recommendations };
}

function analyzeImages($) {
  const images = $("img");
  const total = images.length;
  let missingAlt = 0;
  let emptyAlt = 0;
  const missingAltSrcs = [];

  images.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined || alt === null) {
      missingAlt++;
      const src = $(el).attr("src") || $(el).attr("data-src") || "unknown";
      if (missingAltSrcs.length < 10) missingAltSrcs.push(src);
    } else if (alt.trim() === "") {
      emptyAlt++;
    }
  });

  const issues = [];
  const recommendations = [];

  if (missingAlt > 0) {
    issues.push(`${missingAlt} image(s) missing alt attribute`);
    recommendations.push("Add descriptive alt text to all images for accessibility and SEO");
  }

  let score = total === 0 ? 100 : Math.round(((total - missingAlt) / total) * 100);
  return { total, missingAlt, emptyAlt, missingAltSrcs, score, issues, recommendations };
}

function analyzeLinks($, pageUrl) {
  const parsed = new URL(pageUrl);
  const links = $("a[href]");
  let internal = 0;
  let external = 0;
  let nofollow = 0;
  let broken = 0; // hrefs that are empty or just #

  links.each((_, el) => {
    const href = $(el).attr("href")?.trim();
    const rel = $(el).attr("rel") || "";

    if (!href || href === "#" || href.startsWith("javascript:")) {
      broken++;
      return;
    }

    if (rel.includes("nofollow")) nofollow++;

    try {
      const linkUrl = new URL(href, pageUrl);
      if (linkUrl.hostname === parsed.hostname) {
        internal++;
      } else {
        external++;
      }
    } catch {
      internal++; // relative paths
    }
  });

  const total = links.length;
  const issues = [];
  const recommendations = [];

  if (internal === 0) {
    issues.push("No internal links found");
    recommendations.push("Add internal links to improve site structure and crawlability");
  }
  if (external === 0 && total > 5) {
    issues.push("No external links found");
    recommendations.push("Consider linking to authoritative external resources");
  }
  if (broken > 0) {
    issues.push(`${broken} empty or invalid href attributes found`);
  }

  const score = total === 0 ? 50 : Math.min(100, Math.round(70 + (internal > 0 ? 15 : 0) + (external > 0 ? 15 : 0)));
  return { total, internal, external, nofollow, broken, score, issues, recommendations };
}

function analyzeOpenGraph($) {
  const tags = {};
  const required = ["og:title", "og:description", "og:image", "og:url", "og:type"];

  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) tags[prop] = content;
  });

  // Also check Twitter cards
  const twitterTags = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) twitterTags[name] = content;
  });

  const missing = required.filter((t) => !tags[t]);
  const issues = [];
  const recommendations = [];

  if (Object.keys(tags).length === 0) {
    issues.push("No Open Graph tags found");
    recommendations.push("Add og:title, og:description, og:image, og:url, and og:type");
  } else if (missing.length > 0) {
    issues.push(`Missing OG tags: ${missing.join(", ")}`);
    recommendations.push(`Add the missing Open Graph tags: ${missing.join(", ")}`);
  }

  if (Object.keys(twitterTags).length === 0) {
    issues.push("No Twitter Card meta tags found");
    recommendations.push("Add twitter:card, twitter:title, twitter:description for better social sharing");
  }

  const completeness = Math.round(((required.length - missing.length) / required.length) * 100);
  return {
    ogTags: tags,
    twitterTags,
    completeness,
    missing,
    score: completeness,
    issues,
    recommendations,
  };
}

function analyzeTechnical($, headers, htmlSizeBytes) {
  const issues = [];
  const recommendations = [];

  // Viewport
  const viewport = $('meta[name="viewport"]').attr("content") || null;
  if (!viewport) {
    issues.push("Missing viewport meta tag");
    recommendations.push('Add <meta name="viewport" content="width=device-width, initial-scale=1">');
  }

  // Canonical
  const canonical = $('link[rel="canonical"]').attr("href") || null;
  if (!canonical) {
    issues.push("Missing canonical URL");
    recommendations.push("Add a canonical link to prevent duplicate content issues");
  }

  // Language
  const lang = $("html").attr("lang") || null;
  if (!lang) {
    issues.push("Missing lang attribute on <html>");
    recommendations.push('Add lang attribute (e.g., <html lang="en">)');
  }

  // Charset
  const charset =
    $('meta[charset]').attr("charset") ||
    $('meta[http-equiv="Content-Type"]').attr("content") ||
    null;

  // Robots
  const robots = $('meta[name="robots"]').attr("content") || null;

  // Favicon
  const favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    null;
  if (!favicon) {
    issues.push("No favicon detected");
    recommendations.push("Add a favicon for better branding and browser tab appearance");
  }

  // HTML size
  const sizeKB = Math.round(htmlSizeBytes / 1024);
  if (sizeKB > 200) {
    issues.push(`HTML size is large (${sizeKB} KB)`);
    recommendations.push("Consider reducing HTML size for faster initial page load");
  }

  // Resource counts
  const scripts = $("script[src]").length;
  const stylesheets = $('link[rel="stylesheet"]').length;
  const inlineStyles = $("style").length;
  const iframes = $("iframe").length;

  if (scripts > 15) {
    issues.push(`High number of external scripts (${scripts})`);
    recommendations.push("Reduce or defer external scripts to improve load time");
  }

  let score = 100;
  score -= issues.length * 8;

  return {
    viewport,
    canonical,
    lang,
    charset,
    robots,
    favicon,
    htmlSizeKB: sizeKB,
    resources: { scripts, stylesheets, inlineStyles, iframes },
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}

function analyzeSchema($) {
  const schemas = [];
  const issues = [];
  const recommendations = [];

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const types = Array.isArray(data) ? data.map((d) => d["@type"]) : [data["@type"]];
      schemas.push(...types.filter(Boolean).map((t) => ({ format: "JSON-LD", type: t })));
    } catch {
      // malformed JSON-LD
    }
  });

  // Microdata
  $("[itemtype]").each((_, el) => {
    const type = $(el).attr("itemtype");
    if (type) schemas.push({ format: "Microdata", type });
  });

  // RDFa
  $("[typeof]").each((_, el) => {
    const type = $(el).attr("typeof");
    if (type) schemas.push({ format: "RDFa", type });
  });

  if (schemas.length === 0) {
    issues.push("No structured data (Schema.org) detected");
    recommendations.push("Add JSON-LD structured data for rich search results");
  }

  const score = schemas.length > 0 ? 100 : 0;
  return { schemas: schemas.slice(0, 20), count: schemas.length, score, issues, recommendations };
}

function analyzeContent($) {
  // Strip scripts and styles
  const clone = $.root().clone();
  clone.find("script, style, noscript").remove();
  const text = clone.text().replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  const issues = [];
  const recommendations = [];

  if (wordCount < 300) {
    issues.push(`Low word count (${wordCount})`);
    recommendations.push("Aim for at least 300 words of meaningful content for better SEO");
  }

  const score = wordCount >= 300 ? 100 : Math.round((wordCount / 300) * 100);
  return { wordCount, readingTimeMin, score: Math.min(100, score), issues, recommendations };
}

// ── Main analyze function ───────────────────────────────────────────────────

async function analyzeSEO(targetUrl) {
  // Normalize URL
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }

  const page = await fetchPage(targetUrl);
  const $ = cheerio.load(page.html);

  const title = analyzeTitle($);
  const metaDescription = analyzeMetaDescription($);
  const headings = analyzeHeadings($);
  const images = analyzeImages($);
  const links = analyzeLinks($, page.finalUrl);
  const openGraph = analyzeOpenGraph($);
  const technical = analyzeTechnical($, page.headers, page.htmlSizeBytes);
  const schema = analyzeSchema($);
  const content = analyzeContent($);

  // Weighted overall score
  const weights = {
    title: 15,
    metaDescription: 10,
    headings: 10,
    images: 8,
    links: 7,
    openGraph: 10,
    technical: 20,
    schema: 10,
    content: 10,
  };

  const scores = {
    title: title.score,
    metaDescription: metaDescription.score,
    headings: headings.score,
    images: images.score,
    links: links.score,
    openGraph: openGraph.score,
    technical: technical.score,
    schema: schema.score,
    content: content.score,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const overallScore = Math.round(
    Object.entries(weights).reduce((sum, [key, w]) => sum + scores[key] * w, 0) / totalWeight
  );

  // Collect all issues and recommendations
  const allIssues = [
    ...title.issues,
    ...metaDescription.issues,
    ...headings.issues,
    ...images.issues,
    ...links.issues,
    ...openGraph.issues,
    ...technical.issues,
    ...schema.issues,
    ...content.issues,
  ];

  const allRecommendations = [
    ...title.recommendations,
    ...metaDescription.recommendations,
    ...headings.recommendations,
    ...images.recommendations,
    ...links.recommendations,
    ...openGraph.recommendations,
    ...technical.recommendations,
    ...schema.recommendations,
    ...content.recommendations,
  ];

  // Grade
  let grade;
  if (overallScore >= 90) grade = "A";
  else if (overallScore >= 80) grade = "B";
  else if (overallScore >= 70) grade = "C";
  else if (overallScore >= 60) grade = "D";
  else grade = "F";

  return {
    url: page.finalUrl,
    analyzedAt: new Date().toISOString(),
    statusCode: page.statusCode,
    fetchTimeMs: page.fetchTimeMs,
    overallScore,
    grade,
    scores,
    details: {
      title,
      metaDescription,
      headings,
      images,
      links,
      openGraph,
      technical,
      schema,
      content,
    },
    summary: {
      totalIssues: allIssues.length,
      issues: allIssues,
      recommendations: allRecommendations,
    },
  };
}

async function compareSEO(url1, url2) {
  const [result1, result2] = await Promise.all([analyzeSEO(url1), analyzeSEO(url2)]);

  const comparison = {};
  for (const key of Object.keys(result1.scores)) {
    comparison[key] = {
      url1: result1.scores[key],
      url2: result2.scores[key],
      winner: result1.scores[key] > result2.scores[key] ? url1 : result2.scores[key] > result1.scores[key] ? url2 : "tie",
    };
  }

  return {
    comparedAt: new Date().toISOString(),
    results: [result1, result2],
    comparison,
    overallWinner:
      result1.overallScore > result2.overallScore
        ? url1
        : result2.overallScore > result1.overallScore
          ? url2
          : "tie",
  };
}

module.exports = { analyzeSEO, compareSEO };
