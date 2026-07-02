import type { Metadata } from "next";
import { Oswald, Lexend } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Swish | The Home Court",
  description: "Find pick-up basketball games near you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${lexend.variable} h-full antialiased`}
    >
      <head>
        {/* Material Symbols isn't on next/font, so it's loaded directly */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-background text-on-background font-body selection:bg-primary-container selection:text-on-primary-container"
        suppressHydrationWarning={true}
      >
        {children}
      </body>
    </html>
  );
}
