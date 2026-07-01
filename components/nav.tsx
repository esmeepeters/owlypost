import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/sources", label: "Sources" },
  { href: "/digests", label: "Digests" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-3 text-sm">
        <span className="font-semibold text-accent">🦉 Owly Post</span>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-neutral-600 hover:text-neutral-900"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
