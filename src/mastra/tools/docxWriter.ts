import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";

import type { Summary } from "../../schemas.js";

async function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function loadExistingParagraphs(docPath: string): Promise<Paragraph[]> {
  if (!existsSync(docPath)) {
    return [];
  }

  const buffer = await fs.readFile(docPath);
  const { value } = await mammoth.extractRawText({ buffer });
  const lines = value.split(/\r?\n/u).map((line) => line.trimEnd());

  return lines.map((line) => new Paragraph(line || ""));
}

function createCompanySection(company: string, summaries: Summary[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(
    new Paragraph({
      text: `Company: ${company}`,
      heading: HeadingLevel.HEADING_1,
    })
  );

  for (const summary of summaries) {
    paragraphs.push(new Paragraph({ text: "" }));
    paragraphs.push(
      new Paragraph({
        text: summary.title,
        heading: HeadingLevel.HEADING_3,
      })
    );

    const published = summary.publishedAt ?? "N/A";
    const fit = summary.fitScore.toFixed(2);
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun(`Published: ${published} | fit: ${fit}`),
        ],
      })
    );

    for (const bullet of summary.bullets.slice(0, 5)) {
      paragraphs.push(
        new Paragraph({
          text: bullet,
          bullet: {
            level: 0,
          },
        })
      );
    }
  }

  paragraphs.push(new Paragraph({ text: "" }));

  return paragraphs;
}

export async function appendSummariesToDocx(
  docPath: string,
  company: string,
  summaries: Summary[]
): Promise<void> {
  if (summaries.length === 0) {
    return;
  }

  const absolutePath = resolve(docPath);
  await ensureDir(absolutePath);

  const existingParagraphs = await loadExistingParagraphs(absolutePath);
  const newParagraphs = createCompanySection(company, summaries);

  const document = new Document({
    sections: [
      {
        properties: {},
        children: [...existingParagraphs, ...newParagraphs],
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  const tmpPath = `${absolutePath}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, absolutePath);
}
