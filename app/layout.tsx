import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "StreamLounge — viewer interactions for live streamers",
    template: "%s · StreamLounge",
  },
  description:
    "StreamLounge lets your viewers trigger alerts on your stream: messages read aloud, voice notes, soundboard clips, AI stickers, spin wheels and tasks. Works with OBS.",
  applicationName: "StreamLounge",
  openGraph: {
    title: "StreamLounge",
    description:
      "Viewer-triggered alerts for live streamers. Messages, voice notes, soundboard, stickers, spin wheel and tasks, straight into OBS.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0E1F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
