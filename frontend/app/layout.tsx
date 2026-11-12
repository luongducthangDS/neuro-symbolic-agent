import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compliance Agent — An Phát Finance",
  description: "Neuro-symbolic AI: GraphRAG + Text-to-SQL + Symbolic Verifier cho kiểm tra tuân thủ tín dụng",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
