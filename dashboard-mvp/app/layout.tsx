import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xavier Fenaux - Dashboard Marche",
  description: "Dashboard privé de suivi des setups à surveiller.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
