"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "url" | "text";

const VIDEO_HOSTNAME_PATTERNS = [
  /^(www\.)?youtube\.com$/,
  /^youtu\.be$/,
  /^(www\.)?vimeo\.com$/,
  /^(www\.)?tiktok\.com$/,
  /^vm\.tiktok\.com$/,
  /^(www\.)?twitch\.tv$/,
  /^(www\.)?dailymotion\.com$/,
];

function isVideoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (VIDEO_HOSTNAME_PATTERNS.some((re) => re.test(u.hostname))) return true;
    if (
      /^(www\.)?instagram\.com$/.test(u.hostname) &&
      /^\/(reel|p)\//.test(u.pathname)
    ) {
      return true;
    }
  } catch {
    // not a valid URL yet — no warning
  }
  return false;
}

export default function IngestPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoWarning = mode === "url" && url.trim().length > 0 && isVideoUrl(url.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body = mode === "url" ? { type: "url", url } : { type: "text", text };
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(`/ingest/${data.data.ingestionId}/review`);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    !videoWarning &&
    (mode === "url" ? url.trim().length > 0 : text.trim().length >= 10);

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div>
        <h1 className="text-2xl font-bold">Import a Recipe</h1>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Paste a URL or the raw recipe text. We&apos;ll parse it and let you review before saving.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-[var(--border)] rounded-lg w-fit">
        {(["url", "text"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {m === "url" ? "From URL" : "Paste Text"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "url" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="url" className="text-sm font-medium">
              Recipe URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/my-recipe"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              disabled={loading}
              autoFocus
            />
            {videoWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <strong>Video URL detected.</strong> Recipe text cannot be extracted from video
                pages. If this recipe has a written version, paste the text directly using{" "}
                <button
                  type="button"
                  className="underline font-medium"
                  onClick={() => { setMode("text"); setUrl(""); }}
                >
                  Paste Text
                </button>{" "}
                instead.
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="text" className="text-sm font-medium">
              Recipe text
            </label>
            <p className="text-xs text-[var(--muted)]">
              Include an &ldquo;Ingredients&rdquo; heading and an &ldquo;Instructions&rdquo; heading
              for the best results. The parser works best with clearly structured text.
            </p>
            <textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Spaghetti Bolognese\nServes 4\n\nIngredients\n2 tbsp olive oil\n500g ground beef\n...\n\nInstructions\n1. Heat oil..."}
              rows={12}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 resize-y"
              disabled={loading}
              autoFocus
            />
            <p className="text-xs text-[var(--muted)]">{text.length} characters</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="self-end rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Parsing…" : "Parse & Review →"}
        </button>
      </form>
    </div>
  );
}
