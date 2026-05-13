export type NewsItem = {
  title: string;
  source: string;
  url?: string | null;
  publishedAt: Date;
  summary?: string | null;
};

export interface NewsProvider {
  scan(): Promise<NewsItem[]>;
}

class MockNewsProvider implements NewsProvider {
  async scan(): Promise<NewsItem[]> {
    return [
      {
        title: "Mock marche: volatilite surveillee sur indices et crypto",
        source: "mock",
        publishedAt: new Date(),
        summary:
          "Provider mock actif. Configure NEWS_API_URL et NEWS_API_KEY pour brancher une source externe.",
      },
    ];
  }
}

class HttpNewsProvider implements NewsProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async scan(): Promise<NewsItem[]> {
    const response = await fetch(this.apiUrl, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`News provider failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { articles?: Array<Record<string, unknown>> };
    return (payload.articles ?? []).map((article) => ({
      title: String(article.title ?? "Actualite marche"),
      source: String(article.source ?? article.provider ?? "external"),
      url: article.url ? String(article.url) : null,
      publishedAt: article.publishedAt ? new Date(String(article.publishedAt)) : new Date(),
      summary: article.summary ? String(article.summary) : article.description ? String(article.description) : null,
    }));
  }
}

export function getNewsProvider(): NewsProvider {
  if (process.env.NEWS_API_URL && process.env.NEWS_API_KEY) {
    return new HttpNewsProvider(process.env.NEWS_API_URL, process.env.NEWS_API_KEY);
  }

  return new MockNewsProvider();
}
