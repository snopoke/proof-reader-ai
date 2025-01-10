import { File } from "parse-diff";
import OpenAI from "openai";
import { PRComment } from "./getGithubClient";

function createPrompt(promptPrefix: string, diff: string, existingComments: PRComment[]): string {
  return `${promptPrefix}
Instructions:
- Do not explain what you're doing.
- Provide the response in following JSON format, And return only the json:

[
    {
        "comment": "<comment targeting one line>",
        "startLineNumber": <line_number for the start of the comment. Must be the same as endLineNumber for single line comments>,
        "endLineNumber": <line_number for the end of the comment. Must be the same as startLineNumber for single line comments>,
        "suggestion": "<The text to replace the existing line with. Leave empty, when no suggestion is applicable, must be related to the comment>",
    }
]

- returned result must only contain valid json
- Propose change to text and code
- Fix typo, grammar and spelling
- Focus on major issues rather than minor stylistic issues
- No more than one comment per line
- One comment can address several issues
- Comments can span multiple lines (use startLineNumber and endLineNumber)
- Do not comment on lines that already have comments or repeat feedback that has already been given
- Provide comments and suggestions ONLY if there is something to improve or fix, otherwise return an empty array

Git diff of the article to review:

\`\`\`diff
${diff}
\`\`\`

Existing comments:${existingComments.length === 0 ? " None" : 
`\`\`\`json
${JSON.stringify(existingComments, null, 2)}
\`\`\``}`;
}
export const getComments = async (result: ReviewItem[], path: string) => {
  const comments = result.map((item: any) => {
    let comment: Record<string, any> = {
      line: item.endLineNumber,
      path,
      body: `${item.comment}${
        item.suggestion
          ? `
  \`\`\`suggestion
  ${item.suggestion}
  \`\`\``
          : ""
      }`,
    };
    if (item.startLineNumber !== item.endLineNumber) {
      comment.start_line = item.startLineNumber;
    }
    return comment;
  });

  return comments;
};

async function getAIResponse(
  prompt: string,
  model: string,
  apiKey: string
): Promise<ReviewItem[]> {
  const openai = new OpenAI({
    apiKey,
  });
  const queryConfig = {
    model,
    temperature: 0.2,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  };

  try {
    const response = await openai.chat.completions.create({
      ...queryConfig,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "review-comments",
          schema: {
            type: "object",
            properties: {
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    comment: { type: "string" },
                    suggestion: { type: "string" },
                    startLineNumber: { type: "number" },
                    endLineNumber: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
    });

    const res =
      response.choices[0].message?.content
        ?.trim()
        .replace(/^```json/g, "")
        .replace(/```$/g, "") || "[]";

    try {
      return JSON.parse(res).comments;
    } catch (error) {
      console.log("Could not parse the prompt result:", res);
      return [];
    }
  } catch (error) {
    console.error("Error:", error);
    return [];
  }
}

type ReviewItem = {
  comment: string;
  suggestion: string;
  lineNumber: number;
};

export async function generateAICommentsForDiff({
  promptPrefix,
  diff,
  path,
  apiKey,
  model,
  existingComments,
}: {
  promptPrefix: string,
  diff: string,
  path: string;
  model: string;
  apiKey: string;
  existingComments: PRComment[];
}): Promise<Array<{ body: string; path: string; line: number }>> {
  const prompt = createPrompt(promptPrefix, diff, existingComments);
  const aiResponse = await getAIResponse(prompt, model, apiKey);
  return await getComments(aiResponse, path);
}

export async function generateAICommentsForMarkdownFiles({
  parsedDiff,
  apiKey,
  model,
  promptPrefix,
  existingComments
}: {
  parsedDiff: File[];
  apiKey: string;
  model: string;
  promptPrefix: string;
  existingComments: PRComment[];
}): Promise<Array<{ body: string; path: string; line: number }>> {
  const comments: Array<{ body: string; path: string; line: number }> = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue; // Ignore deleted files
    const fileComments = existingComments.filter(comment => comment.path == file.to);
    for (const chunk of file.chunks) {
      const chunkStart = chunk.newStart, chunkEnd = chunk.newStart + chunk.newLines -1;
      const chunkComments = fileComments.filter(comment => comment.line >= chunkStart && comment.line <= chunkEnd);
      const diff = `${chunk.content}
  ${chunk.changes
    // @ts-expect-error - ln and ln2 exists where needed
    .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
    .join("\n")}`;
      const newComments = await generateAICommentsForDiff({
        apiKey,
        diff,
        promptPrefix,
        model,
        path: file.to!,
        existingComments: chunkComments,
      });
      if (newComments && newComments.length > 0) {
        comments.push(...newComments);
      }
    }
  }
  return comments;
}
