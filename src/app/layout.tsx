import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
