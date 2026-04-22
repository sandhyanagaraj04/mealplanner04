import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meal Planner",
  description: "Plan your weekly meals",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="sticky top-0 z-50 bg-white border-b border-[var(--border)] px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Link href="/" className="font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity">
              MealPlanner
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/recipes" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Recipes</Link>
              <Link href="/plans" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Plans</Link>
              <Link
                href="/ingest"
                className="text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded-lg transition-colors"
              >
                + Import
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
