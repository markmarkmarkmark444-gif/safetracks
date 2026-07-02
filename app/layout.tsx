import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeTracks HQ",
  description: "Governance OS for the Azimuth Foundation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
