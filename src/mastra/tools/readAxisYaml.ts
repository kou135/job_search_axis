import mammoth from "mammoth";
import { parse } from "yaml";

import { AxisSchema, type Axis } from "../../schemas.js";

const AXIS_BLOCK_REGEX = /<!--\s*AXIS-START\s*-->([\s\S]*?)<!--\s*AXIS-END\s*-->/i;

function assertAxisBlock(content: string | undefined, docPath: string): string {
  if (!content) {
    throw new Error(`AXIS ブロックが見つかりませんでした: ${docPath}`);
  }
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error(`AXIS ブロックが空です: ${docPath}`);
  }
  return trimmed;
}

export async function readAxisFromDocx(docPath: string): Promise<Axis> {
  const { value: rawText } = await mammoth.extractRawText({ path: docPath });

  const match = AXIS_BLOCK_REGEX.exec(rawText);
  const yamlFragment = assertAxisBlock(match?.[1], docPath);

  let rawAxis: unknown;
  try {
    rawAxis = parse(yamlFragment);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`AXIS YAML の解析に失敗しました (${docPath}): ${reason}`);
  }

  return AxisSchema.parse(rawAxis);
}
