import { JSDOM, VirtualConsole } from "jsdom";

export function extractLinksFromSearch(
  html: string,
  baseUrl: string,
  selector: string,
  limit: number
): string[] {
  const urls: string[] = [];
  if (limit <= 0) {
    return urls;
  }

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", () => {});

  const dom = new JSDOM(html, { url: baseUrl, virtualConsole });
  const nodes = dom.window.document.querySelectorAll(selector);

  for (const node of nodes) {
    if (!(node instanceof dom.window.HTMLAnchorElement)) {
      continue;
    }
    const href = node.getAttribute("href");
    if (!href) {
      continue;
    }

    const absoluteUrl = new URL(href, baseUrl).toString();
    if (!urls.includes(absoluteUrl)) {
      urls.push(absoluteUrl);
      if (urls.length >= limit) {
        break;
      }
    }
  }

  return urls;
}
