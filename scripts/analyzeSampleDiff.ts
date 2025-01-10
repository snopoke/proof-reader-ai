import fs from "fs";
import path from "path";
import {generateAICommentsForMarkdownFiles} from "../src/generateAICommentsForMarkdownFiles";
import parseDiff from "parse-diff";
import {PRComment} from "../src/getGithubClient";

const article = fs
  .readFileSync(path.resolve(__dirname, "./article.diff"))
  .toString();

const existingComments = [
  new PRComment(1, "user1", null, 3, "article/creating-a-blog-article-reviewer-with-ai.mdx", "Consider breaking this long sentence into two shorter ones for clarity"),
  new PRComment(2, "user1", null, 4, "article/other", "other comment"),
]

const parsedDiff = parseDiff(article);

generateAICommentsForMarkdownFiles({
  parsedDiff: parsedDiff,
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY as string,
  promptPrefix: "Your task is to review pull requests on a technical blog.",
  existingComments,
}).then(console.log);
