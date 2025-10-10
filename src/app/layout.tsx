import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FireFly Analytics",
  description: "A reference implementation of building a Analytics + AI platform using Databricks as the backend",
  openGraph: {
    title: "FireFly Analytics",
    description: "A reference implementation of building a Analytics + AI platform using Databricks as the backend",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "FireFly Analytics Logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FireFly Analytics",
    description: "A reference implementation of building a Analytics + AI platform using Databricks as the backend",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full overflow-hidden`}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
