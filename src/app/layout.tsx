import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="sticky top-0 z-50 bg-white border-b border-[var(--border)] px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Link href="/" className="font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity">
              MealPlanner
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <Link href="/recipes" className="hidden sm:inline text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Recipes</Link>
              <Link href="/plans" className="hidden sm:inline text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Plans</Link>
              <Link href="/recipes" className="sm:hidden text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Recipes</Link>
              <Link href="/plans" className="sm:hidden text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Plans</Link>
              <Link
                href="/ingest"
                className="text-xs sm:text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors"
              >
                + Import
              </Link>
              {session ? (
                <div className="flex items-center gap-2">
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name ?? "User avatar"}
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs font-medium">
                      {(session.user.name ?? session.user.email ?? "U")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm text-[var(--muted)] hidden sm:inline">
                    {session.user.name ?? session.user.email}
                  </span>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/login" });
                    }}
                  >
                    <button
                      type="submit"
                      className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </nav>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
