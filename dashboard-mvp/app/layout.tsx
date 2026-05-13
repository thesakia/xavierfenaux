import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xavier Fenaux - Dashboard Marche",
  description: "Dashboard prive de suivi des setups a surveiller.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
