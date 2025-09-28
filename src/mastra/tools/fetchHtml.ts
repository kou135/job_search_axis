const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface FetchHtmlResult {
  url: string;
  status: number;
  html: string;
  fetchedAt: string;
}

export async function fetchHtml(url: string): Promise<FetchHtmlResult> {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status} ${response.statusText}) for ${url}`);
  }

  const html = await response.text();
  return {
    url: response.url,
    status: response.status,
    html,
    fetchedAt: new Date().toISOString(),
  };
}
