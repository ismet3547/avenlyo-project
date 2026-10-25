import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avenlyo AI Studio",
  description: "İşletmeniz için lokal yapay zeka ajanları oluşturun.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
