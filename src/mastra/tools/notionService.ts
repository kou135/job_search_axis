import { Client } from "@notionhq/client";
import type {
  BlockObjectRequest,
  BlockObjectResponse,
  BlockObjectRequestWithoutChildren,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

import type { Summary } from "../../schemas.js";

const AXIS_PAGE_TITLE = "00_JobSearchAxis";
const DEFAULT_AXIS_YAML = `roles: ["ソフトウェアエンジニア"]\nindustries: ["Fintech","B2B SaaS"]\nkeywords: ["TypeScript","LLM","Mastra"]\n`;

function assertPage(result: PageObjectResponse | PartialPageObjectResponse): PageObjectResponse {
  if (!("id" in result)) {
    throw new Error("Notion API: invalid page response");
  }
  return result as PageObjectResponse;
}

function textFromRichText(richText: { plain_text: string }[]): string {
  return richText.map((t) => t.plain_text).join("");
}

export class NotionService {
  private readonly client: Client;
  constructor(private readonly rootPageId: string, private readonly token: string) {
    this.client = new Client({ auth: token });
  }

  async ensureAxisPage(): Promise<string> {
    try {
      const existing = await this.findChildPageByTitle(AXIS_PAGE_TITLE);
      if (existing) {
        return existing;
      }

      const created = await this.client.pages.create({
        parent: { page_id: this.rootPageId },
        properties: {
          title: [
            {
              type: "text",
              text: { content: AXIS_PAGE_TITLE },
            },
          ],
        },
        children: [
          {
            type: "code",
            code: {
              language: "yaml",
              rich_text: [
                {
                  type: "text",
                  text: { content: DEFAULT_AXIS_YAML },
                },
              ],
            },
          },
        ],
      });

      return assertPage(created).id;
    } catch (error) {
      throw new Error(
        `Notion API に接続できませんでした。ネットワーク設定を確認してください。詳細: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async getAxisYaml(axisPageId: string): Promise<string> {
    const blocks = await this.listAllBlocks(axisPageId);
    let codeBlock = blocks.find(
      (block) => block.type === "code" && block.code?.language === "yaml"
    );

    if (!codeBlock || codeBlock.type !== "code") {
      await this.client.blocks.children.append({
        block_id: axisPageId,
        children: [
          {
            object: "block",
            type: "code",
            code: {
              language: "yaml",
              rich_text: [
                {
                  type: "text",
                  text: { content: DEFAULT_AXIS_YAML },
                },
              ],
            },
          },
        ],
      });

      const updatedBlocks = await this.listAllBlocks(axisPageId);
      codeBlock = updatedBlocks.find(
        (block) => block.type === "code" && block.code?.language === "yaml"
      );
    }

    if (!codeBlock || codeBlock.type !== "code") {
      throw new Error("Axis page に YAML コードブロックが見つかりませんでした");
    }

    return textFromRichText(codeBlock.code.rich_text);
  }

  async ensureCompanyPage(company: string): Promise<string> {
    const existing = await this.findChildPageByTitle(company);
    if (existing) {
      return existing;
    }

    try {
      const created = await this.client.pages.create({
        parent: { page_id: this.rootPageId },
        properties: {
          title: [
            {
              type: "text",
              text: { content: company },
            },
          ],
        },
      });

      return assertPage(created).id;
    } catch (error) {
      throw new Error(
        `Notion API でページを作成できませんでした。ネットワーク設定を確認してください。詳細: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async appendSummaries(companyPageId: string, headingDate: string, summaries: Summary[]) {
    if (summaries.length === 0) {
      return;
    }

    const children: BlockObjectRequest[] = [
      this.headingBlock(headingDate),
      ...summaries.flatMap((summary) => this.toggleBlock(summary)),
    ];

    await this.appendBlocksInChunks(companyPageId, children);
  }

  private headingBlock(dateText: string): BlockObjectRequest {
    return {
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: dateText },
          },
        ],
      },
    };
  }

  private toggleBlock(summary: Summary): BlockObjectRequest {
    const linkText = {
      type: "text" as const,
      text: {
        content: summary.title,
        link: { url: summary.url },
      },
    };

    const paragraph: BlockObjectRequestWithoutChildren = {
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Published: ${summary.publishedAt ?? "N/A"} | fit: ${summary.fitScore.toFixed(2)}`,
            },
          },
        ],
      },
    };

    const bulletBlocks: BlockObjectRequestWithoutChildren[] = summary.bullets.slice(0, 5).map((bullet) => ({
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          {
            type: "text",
            text: { content: bullet },
          },
        ],
      },
    }));

    return {
      type: "toggle",
      toggle: {
        rich_text: [linkText],
        children: [paragraph, ...bulletBlocks],
      },
    };
  }

  private async findChildPageByTitle(title: string): Promise<string | undefined> {
    try {
      const children = await this.listAllBlocks(this.rootPageId);
      const childPage = children.find(
        (block) => block.type === "child_page" && block.child_page?.title === title
      );
      return childPage?.id;
    } catch (error) {
      throw new Error(
        `Notion API で子ページを検索できませんでした。ネットワーク設定を確認してください。詳細: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async listAllBlocks(blockId: string): Promise<BlockObjectResponse[]> {
    const results: BlockObjectResponse[] = [];
    let cursor: string | undefined;

    try {
      do {
        const response = await this.client.blocks.children.list({
          block_id: blockId,
          page_size: 100,
          start_cursor: cursor,
        });

        results.push(
          ...response.results.filter(
            (block): block is BlockObjectResponse => block.object === "block"
          )
        );

        cursor = response.next_cursor ?? undefined;
      } while (cursor);
    } catch (error) {
      throw new Error(
        `Notion API からブロック一覧を取得できませんでした。ネットワーク設定を確認してください。詳細: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return results;
  }

  private async appendBlocksInChunks(blockId: string, blocks: BlockObjectRequest[]) {
    const CHUNK_SIZE = 90;
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      const chunk = blocks.slice(i, i + CHUNK_SIZE);
      try {
        await this.client.blocks.children.append({
          block_id: blockId,
          children: chunk,
        });
      } catch (error) {
        throw new Error(
          `Notion API へブロックを追加できませんでした。ネットワーク設定を確認してください。詳細: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }
}
