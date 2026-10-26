import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "IT Helpdesk | Uppingham", template: "%s | Uppingham IT" },
  description: "Internal IT service desk for Uppingham School.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
