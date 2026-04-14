import type { Adapter, AdapterContext, AdapterResult } from "../../shared/types";
import { failureResult, successResult } from "../../core/result";

interface GitHubSearchRepoResponse {
  items: Array<{
    full_name: string;
    html_url: string;
    description: string | null;
    stargazers_count: number;
  }>;
}

interface GitHubSearchIssuesResponse {
  items: Array<{
    number: number;
    title: string;
    html_url: string;
    state: string;
    comments: number;
    created_at: string;
    repository_url: string;
  }>;
}

interface GitHubSearchUsersResponse {
  items: Array<{
    login: string;
    html_url: string;
    avatar_url: string;
    type: string;
  }>;
}

interface GitHubRepoResponse {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  homepage: string | null;
  topics: string[];
  visibility: string;
}

interface GitHubUserResponse {
  login: string;
  html_url: string;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}

const GH_API = "https://api.github.com";
const HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "fast-browser/0.1"
};

export function createGithubAdapter(): Adapter {
  return {
    manifest: {
      id: "github",
      displayName: "GitHub",
      version: "1.1.0",
      platform: "github",
      description: "Search GitHub repositories, issues, users, and view repo/user details.",
      homepage: "https://github.com",
      defaultTtlMs: 300_000,
      commands: [
        {
          name: "search",
          description: "Search public repositories.",
          args: [
            {
              name: "query",
              type: "string",
              required: true,
              description: "Search query.",
              defaultValue: "fast browser"
            }
          ],
          example: "fast-browser site github/search --query \"fast browser\"",
          cacheable: true
        },
        {
          name: "search-issues",
          description: "Search issues and pull requests.",
          args: [
            {
              name: "query",
              type: "string",
              required: true,
              description: "Search query (e.g. 'is:issue is:open bilibili').",
              defaultValue: "is:issue is:open"
            },
            {
              name: "type",
              type: "string",
              required: false,
              description: "Filter by type: 'issue' or 'pr'.",
              defaultValue: "issue"
            }
          ],
          example: "fast-browser site github/search-issues --query \"is:issue is:open fast-browser\"",
          cacheable: true
        },
        {
          name: "search-users",
          description: "Search GitHub users.",
          args: [
            {
              name: "query",
              type: "string",
              required: true,
              description: "Search query.",
              defaultValue: "developer"
            }
          ],
          example: "fast-browser site github/search-users --query \"open source contributor\"",
          cacheable: true
        },
        {
          name: "repo",
          description: "Get repository details.",
          args: [
            {
              name: "owner",
              type: "string",
              required: true,
              description: "Repository owner.",
              defaultValue: "torvalds"
            },
            {
              name: "repo",
              type: "string",
              required: true,
              description: "Repository name.",
              defaultValue: "linux"
            }
          ],
          example: "fast-browser site github/repo --owner torvalds --repo linux",
          cacheable: true
        },
        {
          name: "user",
          description: "Get user profile details.",
          args: [
            {
              name: "username",
              type: "string",
              required: true,
              description: "GitHub username.",
              defaultValue: "torvalds"
            }
          ],
          example: "fast-browser site github/user --username torvalds",
          cacheable: true
        },
        {
          name: "trending",
          description: "Get trending repositories (most starred in last 7 days).",
          args: [
            {
              name: "language",
              type: "string",
              required: false,
              description: "Filter by programming language (e.g. 'typescript', 'python').",
              defaultValue: ""
            }
          ],
          example: "fast-browser site github/trending --language typescript",
          cacheable: true
        }
      ]
    },
    async execute(commandName: string, params: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult> {
      const startedAt = Date.now();

      try {
        if (commandName === "search") {
          return executeSearch(params, startedAt);
        }
        if (commandName === "search-issues") {
          return executeSearchIssues(params, startedAt);
        }
        if (commandName === "search-users") {
          return executeSearchUsers(params, startedAt);
        }
        if (commandName === "repo") {
          return executeRepo(params, startedAt);
        }
        if (commandName === "user") {
          return executeUser(params, startedAt);
        }
        if (commandName === "trending") {
          return executeTrending(params, startedAt);
        }
        return failureResult("github", commandName, new Error("Unsupported command"), Date.now() - startedAt);
      } catch (error) {
        return failureResult("github", commandName, error, Date.now() - startedAt);
      }
    }
  };
}

async function executeSearch(params: Record<string, unknown>, startedAt: number): Promise<AdapterResult> {
  const query = String(params.query ?? "");
  const data = await fetchJson<GitHubSearchRepoResponse>(
    `${GH_API}/search/repositories?q=${encodeURIComponent(query)}&per_page=10`
  );
  return successResult(
    "github",
    "search",
    {
      items: data.items.map((item) => ({
        fullName: item.full_name,
        url: item.html_url,
        description: item.description,
        stars: item.stargazers_count
      }))
    },
    Date.now() - startedAt
  );
}

async function executeSearchIssues(params: Record<string, unknown>, startedAt: number): Promise<AdapterResult> {
  const query = String(params.query ?? "is:issue is:open");
  const type = params.type === "pr" ? "pr" : "issue";
  const searchType = type === "pr" ? "is:pr" : "is:issue";
  const fullQuery = `${query} ${searchType}`;
  const data = await fetchJson<GitHubSearchIssuesResponse>(
    `${GH_API}/search/issues?q=${encodeURIComponent(fullQuery)}&per_page=20`
  );
  return successResult(
    "github",
    "search-issues",
    {
      type,
      query: fullQuery,
      total: data.items.length,
      items: data.items.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
        state: item.state,
        comments: item.comments,
        createdAt: item.created_at,
        repo: item.repository_url.replace(`${GH_API}/repos/`, "")
      }))
    },
    Date.now() - startedAt
  );
}

async function executeSearchUsers(params: Record<string, unknown>, startedAt: number): Promise<AdapterResult> {
  const query = String(params.query ?? "");
  const data = await fetchJson<GitHubSearchUsersResponse>(
    `${GH_API}/search/users?q=${encodeURIComponent(query)}&per_page=20`
  );
  return successResult(
    "github",
    "search-users",
    {
      query,
      total: data.items.length,
      items: data.items.map((item) => ({
        login: item.login,
        url: item.html_url,
        avatarUrl: item.avatar_url,
        type: item.type
      }))
    },
    Date.now() - startedAt
  );
}

async function executeRepo(params: Record<string, unknown>, startedAt: number): Promise<AdapterResult> {
  const owner = String(params.owner ?? "");
  const repo = String(params.repo ?? "");
  if (!owner || !repo) {
    throw new Error("owner and repo are required");
  }
  const data = await fetchJson<GitHubRepoResponse>(`${GH_API}/repos/${owner}/${repo}`);
  return successResult(
    "github",
    "repo",
    {
      fullName: data.full_name,
      description: data.description,
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      language: data.language,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      homepage: data.homepage,
      topics: data.topics,
      visibility: data.visibility,
      url: `https://github.com/${owner}/${repo}`
    },
    Date.now() - startedAt
  );
}

async function executeUser(params: Record<string, unknown>, startedAt: number): Promise<AdapterResult> {
  const username = String(params.username ?? "");
  if (!username) {
    throw new Error("username is required");
  }
  const data = await fetchJson<GitHubUserResponse>(`${GH_API}/users/${username}`);
  return successResult(
    "github",
    "user",
    {
      login: data.login,
      url: data.html_url,
      avatarUrl: data.avatar_url,
      bio: data.bio,
      publicRepos: data.public_repos,
      followers: data.followers,
      following: data.following,
      createdAt: data.created_at
    },
    Date.now() - startedAt
  );
}

async function executeTrending(params: Record<string, unknown>, startedAt: number): Promise<AdapterResult> {
  const language = String(params.language ?? "");
  const dateRange = "created:>2026-03-16"; // last 7 days
  const sort = "stars";
  const order = "desc";
  let query = dateRange;
  if (language) {
    query += ` language:${language}`;
  }
  const data = await fetchJson<GitHubSearchRepoResponse>(
    `${GH_API}/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=${order}&per_page=20`
  );
  return successResult(
    "github",
    "trending",
    {
      language: language || "all",
      dateRange: "last 7 days",
      total: data.items.length,
      items: data.items.map((item) => ({
        fullName: item.full_name,
        url: item.html_url,
        description: item.description,
        stars: item.stargazers_count
      }))
    },
    Date.now() - startedAt
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}
