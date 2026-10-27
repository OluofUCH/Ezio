import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

type SearchParams = { next?: string; as?: string };

export default async function LoginPage({
  searchParams,
}: {
  // A Promise in Next 15 — awaited rather than destructured directly.
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  /**
   * `next` comes from the middleware redirect, so it is attacker-influenceable via a
   * crafted link. Only same-origin absolute paths are honoured — anything starting
   * `//` or with a scheme is discarded, which is what stops this being an open
   * redirect that lands a student on a look-alike login page after "signing in".
   */
  const requested = params.next ?? "";
  const safeNext =
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.includes(":")
      ? requested
      : null;

  const initialTab = params.as === "staff" ? "staff" : "student";

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      {/* Left: the form */}
      <div className="relative z-10 flex w-full flex-col justify-center bg-surface px-margin-mobile py-12 shadow-[24px_0_40px_rgba(0,0,0,0.06)] md:px-margin-desktop lg:w-1/2 lg:px-[120px]">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container text-on-surface shadow-sm">
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden
            >
              school
            </span>
          </div>
          <span className="font-headline-md text-headline-md font-bold text-on-surface">
            Ezio Nigeria
          </span>
        </div>

        <LoginForm initialTab={initialTab} nextPath={safeNext} />
      </div>

      {/* Right: brand panel. Decorative, so hidden below lg rather than reflowed. */}
      <div
        className="relative hidden w-1/2 overflow-hidden bg-surface-container lg:block"
        aria-hidden
      >
        {/**
         * Served from `public/`, not referenced by filesystem path: `next/image` resolves
         * `src` as a URL, so an absolute `C:\...` path 404s in dev and breaks the build.
         * The source file was a `.jfif`, which is plain JPEG with an unusual extension —
         * copied to `public/auth-image.jpg` so the correct content type is sent and the
         * image optimiser recognises it.
         *
         * `fill` + `object-cover` rather than fixed dimensions: this panel is half the
         * viewport at any window size, and an intrinsically-sized image would either
         * letterbox or overflow. `priority` because it is the largest element above the
         * fold on the app's entry screen.
         */}
        <Image
          src="/auth-image.jpg"
          alt=""
          fill
          sizes="50vw"
          priority
          className="object-cover"
        />
      </div>
    </div>
  );
}
