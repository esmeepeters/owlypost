import { Nav } from "@/components/nav";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-8">{children}</main>
    </>
  );
}
