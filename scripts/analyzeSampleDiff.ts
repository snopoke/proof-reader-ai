import fs from "fs";
import path from "path";
import {generateAICommentsForDiff} from "../src/generateAICommentsForMarkdownFiles";
import parseDiff from "parse-diff";

const article = fs
  .readFileSync(path.resolve(__dirname, "./article.diff"))
  .toString();

const parsedDiff = parseDiff(article);
const file = parsedDiff[0];
for (const chunk of file.chunks) {
  const diff = `${chunk.content}
${chunk.changes
    .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
    .join("\n")}`;
  generateAICommentsForDiff({
    diff: diff,
    path: "article.md",
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY as string,
    promptPrefix: "Your task is to review pull requests on a technical blog.",
    strictMatch: true,
  }).then(console.log);
}
