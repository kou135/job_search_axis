# Mastra Docs Notes

## Installation
- Source: @mastra/mcp-docs-server/README.md
- Command to launch MCP docs server locally: `npx -y @mastra/mcp-docs-server`
- Cursor MCP config example:
  ```json
  {
    "mcpServers": {
      "mastra": {
        "command": "npx",
        "args": ["-y", "@mastra/mcp-docs-server"]
      }
    }
  }
  ```
- Claude Code setup: `claude mcp add mastra-docs -- npx -y @mastra/mcp-docs-server`

## Minimal Agent & Workflow Example
- Source: .docs/organized/code-examples/quick-start.md
- Agent definition pattern:
  ```typescript
  import { openai } from '@ai-sdk/openai';
  import { Agent } from '@mastra/core';

  export const catOne = new Agent({
    name: 'cat-one',
    instructions: 'Domain specific guidance...',
    model: openai('gpt-4o'),
  });
  ```
- Workflow composition pattern with typed steps:
  ```typescript
  import { createWorkflow, createStep } from '@mastra/core/workflows';
  import { z } from 'zod';

  const logCatName = createStep({
    id: 'logCatName',
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.object({ rawText: z.string() }),
    execute: async ({ inputData }) => ({ rawText: `Hello ${inputData.name}` }),
  });

  export const logCatWorkflow = createWorkflow({
    id: 'log-cat-workflow',
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.object({ rawText: z.string() }),
    steps: [logCatName],
  })
    .then(logCatName)
    .commit();
  ```
- Running the sample agent + workflow:
  ```typescript
  const agentCat = mastra.getAgent('catOne');
  const result = await agentCat.generate('Prompt', { output: specieSchema });
  await mastra.getWorkflow('logCatWorkflow').createRunAsync();
  ```
