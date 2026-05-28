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

const DEFAULT_OG =
  "https://flyimob.com/og/comparativo-v3.jpg";

export const metadata: Metadata = {
  metadataBase: new URL("https://flyimob.com"),

  title: "FlyImob",
  description:
    "Plataforma inteligente para comparação de imóveis.",

  openGraph: {
    title: "FlyImob",
    description:
      "Plataforma inteligente para comparação de imóveis.",
    type: "website",
    images: [
      {
        url: DEFAULT_OG,
        width: 1200,
        height: 630,
        alt: "FlyImob",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "FlyImob",
    description:
      "Plataforma inteligente para comparação de imóveis.",
    images: [DEFAULT_OG],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}