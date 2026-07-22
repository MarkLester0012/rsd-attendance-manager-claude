import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "RSD Attendance Manager",
  description:
    "Attendance and leave management system for Ring System Development",
  icons: {
    icon: [
      { url: "/rsd-icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");document.documentElement.classList.add(t==="light"?"light":"dark");}catch(e){document.documentElement.classList.add("dark");}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            theme="system"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
