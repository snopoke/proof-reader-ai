import { readFileSync } from "fs";
import { Octokit } from "@octokit/rest";

interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
}

export class PRComment {
  id: number;
  user: string;
  start_line: number | null;
  line: number;
  path: string;
  body: string;

  constructor(id: number, user: string, start_line: number | null, line: number, path: string, body: string) {
    this.id = id;
    this.user = user;
    this.start_line = start_line;
    this.line = line;
    this.path = path;
    this.body = body;
  }

  toJSON() {
    return {
      id: this.id,
      user: this.user,
      startLineNumber: this.start_line || this.line,
      endLineNumber: this.line,
      body: this.body,
    };
  }
}

export const getGithubClient = (githubToken: string) => {
  const octokit = new Octokit({ auth: githubToken });

  async function getPRDetails(): Promise<PRDetails> {
    const { repository, number } = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8")
    );
    return {
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: number,
    };
  }

  async function getDiff(
    owner: string,
    repo: string,
    pull_number: number
  ): Promise<string | null> {
    const response = await octokit.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: { format: "diff" },
    });
    // @ts-expect-error - response.data is a string
    return response.data;
  }

  async function getComments(
    owner: string,
    repo: string,
    pull_number: number
  ): Promise<PRComment[]> {
    const response = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number,
    });
    return response.data.filter(comment => {
      return comment.line !== undefined;
    }).map((comment) => new PRComment(
      comment.id,
      comment.user.login,
      comment.start_line || null,
      comment.line!,
      comment.path,
      comment.body,
    ));
  }

  async function createReviewComment(
    owner: string,
    repo: string,
    pull_number: number,
    comments: Array<{ body: string; path: string; line: number }>
  ): Promise<void> {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number,
      comments,
      event: "COMMENT",
    });
  }

  return {
    getPRDetails,
    getDiff,
    createReviewComment,
    getComments,
  };
};
