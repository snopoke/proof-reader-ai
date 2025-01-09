import * as core from '@actions/core';
import parseDiff, { File } from "parse-diff";
import { generateAICommentsForMarkdownFiles } from "./generateAICommentsForMarkdownFiles";
import { getGithubClient } from "./getGithubClient";

const GITHUB_TOKEN: string = core.getInput('GITHUB_TOKEN', {required: true});
const OPENAI_API_KEY: string = core.getInput('OPENAI_API_KEY', {required: true});
const OPENAI_API_MODEL: string = core.getInput('OPENAI_API_MODEL', {required: true});
const filePattern = core.getInput('file-pattern', {required: false});
const promptPrefix = core.getInput('prompt-prefix', {required: false});

const githubCli = getGithubClient(GITHUB_TOKEN);

async function main() {
  const prDetails = await githubCli.getPRDetails();

  const diff = await githubCli.getDiff(
    prDetails.owner,
    prDetails.repo,
    prDetails.pull_number
  );

  if (!diff) {
    console.log("No diff found");
    return;
  }

  const parsedDiff = parseDiff(diff);
  const regex = new RegExp(filePattern);
  const filteredDiff = parsedDiff.filter((file) => {
    return regex.test(file.to ?? "");
  });

  if (!filteredDiff.length) {
    console.log("No files matched");
    return;
  }

  const comments = await generateAICommentsForMarkdownFiles({
    parsedDiff: filteredDiff,
    apiKey: OPENAI_API_KEY,
    model: OPENAI_API_MODEL,
    promptPrefix,
  });

  if (comments.length > 0) {
    await githubCli.createReviewComment(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number,
      comments
    );
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
