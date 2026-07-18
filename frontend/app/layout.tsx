import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web GIS CAD/GIS Demo",
  description: "Upload, inspect, preview, draw, edit, and export CAD/GIS vector data."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
