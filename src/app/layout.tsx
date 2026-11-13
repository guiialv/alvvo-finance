import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "alvvo finance",
  description: "Gestão financeira, orçamento, investimentos e objetivos em um só lugar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
