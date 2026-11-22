import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { ToastProvider } from "@/components/ui";

/* Google Fonts are fetched at build time and self-hosted from /_next/static — no runtime CDN call. */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "cargoX — Smarter Rural Logistics. Stronger Connections.",
  description:
    "cargoX coordinates rural freight through forecasting, pooling, fair cost sharing and admin-coordinated dispatch. Right load. Right vehicle. Right time. Fair share.",
  keywords: ["rural logistics", "freight pooling", "agriculture supply chain", "India mandi", "all India logistics", "cargoX"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-shell font-sans antialiased">
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
