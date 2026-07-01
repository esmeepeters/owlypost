// Seeds three example categories and a handful of public feeds.
// Run with: pnpm seed (reads .env for DATABASE_URL).
import { getStorage } from "../lib/storage/index.ts";
import { isUniqueViolation } from "../lib/storage/postgres.ts";

const SEED: { category: string; sources: { title: string; siteUrl: string; feedUrl: string }[] }[] = [
  {
    category: "News",
    sources: [
      {
        title: "NOS Nieuws",
        siteUrl: "https://nos.nl",
        feedUrl: "https://feeds.nos.nl/nosnieuwsalgemeen",
      },
    ],
  },
  {
    category: "Engineering",
    sources: [
      {
        title: "The Cloudflare Blog",
        siteUrl: "https://blog.cloudflare.com",
        feedUrl: "https://blog.cloudflare.com/rss/",
      },
      {
        title: "The GitHub Blog: Engineering",
        siteUrl: "https://github.blog/engineering/",
        feedUrl: "https://github.blog/engineering/feed/",
      },
    ],
  },
  {
    category: "AI",
    sources: [
      {
        title: "Simon Willison's Weblog",
        siteUrl: "https://simonwillison.net",
        feedUrl: "https://simonwillison.net/atom/everything/",
      },
    ],
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL (e.g. in .env).");
    process.exit(1);
  }
  const storage = getStorage();

  for (const group of SEED) {
    let category = await storage.findCategoryByName(group.category);
    if (!category) {
      category = await storage.insertCategory(group.category);
      console.log(`Created category "${group.category}"`);
    }

    for (const source of group.sources) {
      try {
        await storage.insertSource({
          title: source.title,
          site_url: source.siteUrl,
          feed_url: source.feedUrl,
          category_id: category.id,
        });
        console.log(`  + ${source.title}`);
      } catch (error) {
        if (isUniqueViolation(error)) continue; // already seeded
        throw error;
      }
    }
  }

  console.log("Done. Press 'Fetch now' in the app to pull the first items.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
