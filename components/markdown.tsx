import React from "react";

// Minimal markdown renderer for model-written digest prose: paragraphs,
// **bold**, *italic*, `code` and [links](url). Deliberately tiny — the digest
// fields are short prose, not arbitrary documents — and renders to React
// nodes, so no raw HTML is ever injected.
const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function renderInline(text: string): React.ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-neutral-100 px-1 text-sm">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      // Only render http(s) links: the digest prose is model-generated, so a
      // "javascript:" href would be an injection vector. Others fall back to
      // plain text (the link label).
      if (isHttpUrl(link[2])) {
        return (
          <a
            key={index}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            {link[1]}
          </a>
        );
      }
      return link[1];
    }
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="mt-3 leading-relaxed first:mt-0">
          {renderInline(paragraph.replace(/\n/g, " ").trim())}
        </p>
      ))}
    </>
  );
}
