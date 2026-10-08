import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simon — Personal AI Companion",
  description: "Offline/online personal AI chat with personality controls and local memory.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
