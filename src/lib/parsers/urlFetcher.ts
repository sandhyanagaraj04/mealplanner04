// Fetches a URL and extracts recipe content.
// Priority order:
//   1. schema.org Recipe JSON-LD  (highest confidence — structured data)
//   2. Visible text extraction    (lower confidence — falls through to textExtractor)
//
// Security notes (see LIMITATIONS.md):
//   - Private IP ranges are blocked
//   - Only http/https schemes are accepted
//   - Maximum response size: 5 MB
//   - Timeout: 10 seconds

import { parse as parseHtml } from "node-html-parser";
import type { ExtractedContent, ParseWarning } from "@/types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Security ─────────────────────────────────────────────────────────────────

const PRIVATE_IP_RE =
  /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|::1|fc00:|fd[0-9a-f]{2}:)/i;

function isPrivateHostname(hostname: string): boolean {
  // Resolve numeric IPs; hostnames like "localhost" are also blocked
  if (hostname === "localhost") return true;
  if (PRIVATE_IP_RE.test(hostname)) return true;
  return false;
}

type ValidateUrlResult =
  | { ok: true; url: URL }
  | { ok: false; error: string };

function validateUrl(rawUrl: string): ValidateUrlResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are supported" };
  }
  if (isPrivateHostname(url.hostname)) {
    return { ok: false, error: "Private/internal host addresses are not allowed" };
  }
  return { ok: true, url };
}

// ─── Video host detection ─────────────────────────────────────────────────────
// These hosts serve HTML but contain no parseable recipe content. Detected early
// so the user gets a clear message rather than a confusing low-confidence result.

const VIDEO_HOSTNAMES = new Set([
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "www.vimeo.com",
  "vimeo.com",
  "player.vimeo.com",
  "www.tiktok.com",
  "tiktok.com",
  "vm.tiktok.com",
  "www.twitch.tv",
  "twitch.tv",
  "clips.twitch.tv",
  "www.dailymotion.com",
  "dailymotion.com",
]);

function isVideoUrl(url: URL): boolean {
  if (VIDEO_HOSTNAMES.has(url.hostname)) return true;
  // Instagram /reel/ and /p/ paths are video-first
  if (
    (url.hostname === "www.instagram.com" || url.hostname === "instagram.com") &&
    /^\/(reel|p)\//.test(url.pathname)
  ) {
    return true;
  }
  return false;
}

// ─── Schema.org JSON-LD extraction ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaNode = Record<string, any>;

function findAllRecipeNodes(jsonld: unknown, found: SchemaNode[] = []): SchemaNode[] {
  if (!jsonld || typeof jsonld !== "object") return found;

  const node = jsonld as SchemaNode;

  if (Array.isArray(jsonld)) {
    for (const child of jsonld) findAllRecipeNodes(child, found);
    return found;
  }

  if (Array.isArray(node["@graph"])) {
    for (const child of node["@graph"]) findAllRecipeNodes(child, found);
    return found;
  }

  const type = node["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    found.push(node);
  }

  return found;
}

function findRecipeNode(jsonld: unknown): SchemaNode | null {
  const all = findAllRecipeNodes(jsonld);
  return all[0] ?? null;
}

function extractServingsNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw > 0 ? raw : null;
  const match = String(raw).match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0]);
  return n > 0 ? n : null;
}

function extractInstructionText(raw: unknown): string {
  if (!raw) return "";

  if (typeof raw === "string") return raw.trim();

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (typeof item === "object" && item !== null) {
          // HowToStep: { @type: "HowToStep", text: "…" }
          return String(item.text ?? item.name ?? "").trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as SchemaNode;
    return String(obj.text ?? obj.name ?? "").trim();
  }

  return "";
}

function extractIngredientLines(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return [];
}

function extractFromJsonLd(scripts: string[]): {
  node: SchemaNode | null;
  totalFound: number;
} {
  let totalFound = 0;
  for (const src of scripts) {
    try {
      const parsed = JSON.parse(src);
      const nodes = findAllRecipeNodes(parsed);
      totalFound += nodes.length;
      if (nodes.length > 0 && totalFound === nodes.length) {
        // First script block that had recipes — return first recipe
        return { node: nodes[0], totalFound };
      }
    } catch {
      // Malformed JSON-LD — skip
    }
  }
  return { node: null, totalFound };
}

// ─── Plain-text extraction from HTML ──────────────────────────────────────────
// Used when schema.org data is absent. Looks for ingredient/instruction blocks
// by examining heading text and the lists/paragraphs that follow them.

const INGREDIENT_HEADER_RE = /^ingredients?/i;
const INSTRUCTION_HEADER_RE = /^(instructions?|directions?|method|steps?|preparation)/i;

function extractSectionsFromHtml(html: string): {
  title: string | null;
  ingredientLines: string[];
  instructionText: string;
} {
  const root = parseHtml(html);

  // Remove script, style, nav, footer, aside noise
  root.querySelectorAll("script, style, nav, footer, aside, header").forEach((el) => el.remove());

  const title =
    root.querySelector('h1')?.text?.trim() ??
    root.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ??
    null;

  // Find headings that look like "Ingredients" and "Instructions"
  const headings = root.querySelectorAll("h1, h2, h3, h4");

  let ingredientNode: ReturnType<typeof root.querySelector> | null = null;
  let instructionNode: ReturnType<typeof root.querySelector> | null = null;

  for (const h of headings) {
    const text = h.text.trim();
    if (!ingredientNode && INGREDIENT_HEADER_RE.test(text)) ingredientNode = h;
    if (!instructionNode && INSTRUCTION_HEADER_RE.test(text)) instructionNode = h;
  }

  const ingredientLines: string[] = [];
  if (ingredientNode) {
    // Collect li/p siblings until the next heading
    let sibling = ingredientNode.nextElementSibling;
    while (sibling) {
      const tag = sibling.tagName?.toLowerCase();
      if (tag && /^h[1-6]$/.test(tag)) break;
      if (tag === "ul" || tag === "ol") {
        sibling.querySelectorAll("li").forEach((li) => {
          const t = li.text.trim();
          if (t) ingredientLines.push(t);
        });
      } else if (tag === "p") {
        const t = sibling.text.trim();
        if (t) ingredientLines.push(...t.split("\n").map((l) => l.trim()).filter(Boolean));
      }
      sibling = sibling.nextElementSibling;
    }
  }

  const instructionParts: string[] = [];
  if (instructionNode) {
    let sibling = instructionNode.nextElementSibling;
    while (sibling) {
      const tag = sibling.tagName?.toLowerCase();
      if (tag && /^h[1-6]$/.test(tag)) break;
      const t = sibling.text.trim();
      if (t) instructionParts.push(t);
      sibling = sibling.nextElementSibling;
    }
  }

  return { title, ingredientLines, instructionText: instructionParts.join("\n\n") };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export interface FetchResult {
  rawContent: string;
  extracted: ExtractedContent;
}

export async function fetchUrl(rawUrl: string): Promise<FetchResult> {
  const validated = validateUrl(rawUrl);
  if (!validated.ok) {
    const warn: ParseWarning = {
      code: validated.error.includes("Private") ? "URL_PRIVATE_HOST" : "URL_FETCH_FAILED",
      message: validated.error,
      field: null,
      context: rawUrl,
    };
    return {
      rawContent: "",
      extracted: {
        method: "schema_org",
        title: null,
        servings: null,
        ingredientLines: [],
        instructionText: "",
        baseConfidence: 0,
        warnings: [warn],
      },
    };
  }

  const { url } = validated;

  // Video hosts serve HTML but never contain parseable recipe content.
  if (isVideoUrl(url)) {
    return {
      rawContent: "",
      extracted: {
        method: "schema_org",
        title: null,
        servings: null,
        ingredientLines: [],
        instructionText: "",
        baseConfidence: 0,
        warnings: [
          {
            code: "URL_VIDEO_DETECTED",
            message:
              "This URL points to a video page. Recipe text cannot be extracted from video content. " +
              "Paste the recipe text directly instead.",
            field: null,
            context: rawUrl,
          },
        ],
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MealPlannerBot/1.0; recipe-import)",
        Accept: "text/html",
      },
    });

    clearTimeout(timer);

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      const warn: ParseWarning = {
        code: "URL_NOT_HTML",
        message: `URL returned content-type "${contentType}", expected text/html.`,
        field: null,
        context: rawUrl,
      };
      return {
        rawContent: "",
        extracted: {
          method: "schema_org",
          title: null,
          servings: null,
          ingredientLines: [],
          instructionText: "",
          baseConfidence: 0,
          warnings: [warn],
        },
      };
    }

    // Read with size cap
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let partial = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BYTES) {
        partial = true;
        chunks.push(value.slice(0, MAX_BYTES - (totalBytes - value.byteLength)));
        break;
      }
      chunks.push(value);
    }

    html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc);
        merged.set(c, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    const extraWarnings: ParseWarning[] = [];
    if (partial) {
      extraWarnings.push({
        code: "URL_FETCH_PARTIAL",
        message: "Page exceeded 5 MB and was truncated. The recipe may be incomplete.",
        field: null,
        context: rawUrl,
      });
    }

    // ── Try schema.org JSON-LD first ────────────────────────────────────────
    const root = parseHtml(html);
    const scripts = root
      .querySelectorAll('script[type="application/ld+json"]')
      .map((s) => s.text);

    const { node: schemaRecipe, totalFound } = extractFromJsonLd(scripts);

    if (schemaRecipe) {
      const ingredientLines = extractIngredientLines(schemaRecipe["recipeIngredient"]);
      const instructionText = extractInstructionText(schemaRecipe["recipeInstructions"]);

      if (totalFound > 1) {
        extraWarnings.push({
          code: "URL_MULTIPLE_RECIPES",
          message: `${totalFound} recipes found on this page — only the first was imported. ` +
            `Import the others separately if needed.`,
          field: null,
          context: rawUrl,
        });
      }

      return {
        rawContent: html,
        extracted: {
          method: "schema_org",
          title: schemaRecipe["name"] ?? null,
          servings: extractServingsNumber(schemaRecipe["recipeYield"]),
          ingredientLines,
          instructionText,
          baseConfidence: 0.95,
          warnings: extraWarnings,
        },
      };
    }

    // ── Fallback: heading-based text extraction ──────────────────────────────
    const { title, ingredientLines, instructionText } = extractSectionsFromHtml(html);
    const noData = ingredientLines.length === 0 && !instructionText;

    extraWarnings.push({
      code: "URL_NO_STRUCTURED_DATA",
      message:
        "No schema.org Recipe data found. Used heading-based text extraction — review carefully.",
      field: null,
      context: rawUrl,
    });

    return {
      rawContent: html,
      extracted: {
        method: "section_headers",
        title,
        servings: null,
        ingredientLines,
        instructionText,
        baseConfidence: noData ? 0.1 : 0.55,
        warnings: extraWarnings,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const warn: ParseWarning = {
      code: isTimeout ? "URL_TIMEOUT" : "URL_FETCH_FAILED",
      message: isTimeout
        ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s.`
        : `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      field: null,
      context: rawUrl,
    };
    return {
      rawContent: "",
      extracted: {
        method: "schema_org",
        title: null,
        servings: null,
        ingredientLines: [],
        instructionText: "",
        baseConfidence: 0,
        warnings: [warn],
      },
    };
  }
}
