import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owly Post",
  description: "A personal content radar and weekly digest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
