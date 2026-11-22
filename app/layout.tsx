import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./sl.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "StreamLounge — Your Stream. Your Community. Your Earnings.",
    template: "%s · StreamLounge",
  },
  description:
    "StreamLounge is a creator monetization platform for live streamers: on-screen QR superchats, paid alerts read aloud, voice notes and overlays for OBS and Streamlabs. Powered by Lumvik Solutions.",
  applicationName: "StreamLounge",
  authors: [{ name: "Lumvik Solutions" }],
  publisher: "Lumvik Solutions",
  openGraph: {
    title: "StreamLounge",
    description: "Your Stream. Your Community. Your Earnings. Superchats, alerts and overlays for live creators.",
    type: "website",
    siteName: "StreamLounge",
  },
  robots: { index: true, follow: true },
};

export const viewport = { themeColor: "#0b0c0d" };

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
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col bg-[#0b0c0d]`}>
        {children}
      </body>
    </html>
  );
}
