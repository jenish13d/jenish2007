import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
