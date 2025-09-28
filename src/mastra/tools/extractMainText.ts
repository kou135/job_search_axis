import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface ExtractedArticle {
  title: string;
  text: string;
  byline?: string;
  length?: number;
}

export function extractMainText(html: string, url: string): ExtractedArticle {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    return { title: "", text: "" };
  }

  return {
    title: article.title ?? "",
    text: article.textContent ?? "",
    byline: article.byline ?? undefined,
    length: article.length ?? undefined,
  };
}
