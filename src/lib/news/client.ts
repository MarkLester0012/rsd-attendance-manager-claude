export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

// AI models/labs (incl. Chinese) AND programming context
const QUERY_MODELS_DEV =
  '(Anthropic OR OpenAI OR Claude OR ChatGPT OR "GPT-5" OR Gemini OR Grok OR DeepSeek OR Qwen OR Kimi OR GLM OR Ernie OR Mistral) (coding OR programming OR "software development" OR developer OR "code generation" OR "coding assistant")';

// TechCrunch — same strict models+programming filter, scoped to site
const QUERY_TECHCRUNCH_DEV = 'site:techcrunch.com ' + QUERY_MODELS_DEV;

function buildFeedUrl(query: string): string {
  const q = encodeURIComponent(`${query} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1");
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlEntities(stripCdata(match[1].trim())) : "";
}

function extractSource(xml: string): string {
  const match = xml.match(/<source[^>]*>([\s\S]*?)<\/source>/);
  return match ? decodeXmlEntities(stripCdata(match[1].trim())) : "";
}

function parseFeed(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const url = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const source = extractSource(block);

    if (title && url) {
      // Strip trailing " - <Publisher>" appended by Google News (already shown separately)
      const cleanTitle =
        source && title.endsWith(` - ${source}`)
          ? title.slice(0, -` - ${source}`.length).trim()
          : title;

      items.push({
        title: cleanTitle,
        url,
        source: source || "Unknown",
        publishedAt: pubDate || new Date().toISOString(),
      });
    }
  }

  return items;
}

async function fetchFeed(query: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(buildFeedUrl(query), {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    return parseFeed(await res.text());
  } catch {
    return [];
  }
}

export async function getAINews(): Promise<NewsItem[]> {
  const results = await Promise.all([
    fetchFeed(QUERY_MODELS_DEV),
    fetchFeed(QUERY_TECHCRUNCH_DEV),
  ]);

  const all = results.flat();

  // De-dupe by URL, sort newest first, cap at 15
  const seen = new Set<string>();
  return all
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() -
        new Date(a.publishedAt).getTime()
    )
    .slice(0, 15);
}
