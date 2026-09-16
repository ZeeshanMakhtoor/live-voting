import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Literary Club — Live Voting",
  description: "Rate each performance live, one at a time.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The audience taps 1-5 repeatedly on a phone; allowing zoom-out on
  // double-tap makes those targets feel unstable, but pinch-zoom stays
  // available because maximumScale is not clamped.
  themeColor: "#f3efe7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
