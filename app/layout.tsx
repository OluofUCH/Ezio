import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ezio Nigeria",
    template: "%s · Ezio Nigeria",
  },
  description:
    "School management for Nigerian secondary schools, with attendance, report cards, and online or offline computer-based testing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#a8d93e",
};

/**
 * Fonts are loaded with plain <link> tags rather than `next/font/google`.
 *
 * `next/font` fetches the font files at *build* time, which would make a production
 * build fail on a machine with no internet — and the offline-first premise of this
 * platform (PRD §1) means builds may well happen on a school's own hardware. A
 * stylesheet link degrades to the system sans fallback declared in tailwind.config.ts
 * instead of breaking the build.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-screen bg-background text-on-background antialiased">
        {children}
      </body>
    </html>
  );
}
