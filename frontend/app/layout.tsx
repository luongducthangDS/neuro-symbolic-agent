import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compliance Agent — An Phát Finance",
  description:
    "Neuro-symbolic agent kiểm tra tuân thủ tín dụng: GraphRAG + Text-to-SQL + symbolic verifier",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="bg-gray-100 min-h-screen antialiased">{children}</body>
    </html>
  );
}
