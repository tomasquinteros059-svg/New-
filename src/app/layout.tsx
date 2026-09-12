import type { Metadata, Viewport } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Relevo",
  description: "Cola de trabajo con capacidad: quién está libre, qué falta hacer.",
};

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  width: "device-width",
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${archivo.variable} ${publicSans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
