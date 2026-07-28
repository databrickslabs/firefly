/**
 * One place that knows how to build a GitHub URL.
 *
 * The URL *shapes* were duplicated across components, and one of them drifted: while
 * `github-source-link.tsx` derived its blob URL from a GITHUB_REPO constant, it built its
 * raw URL from a second, separately hardcoded copy of the same owner/repo. Changing the
 * constant would have moved one link and silently left the other pointing at the old
 * repository — the kind of half-applied edit that is invisible until a user clicks.
 *
 * Deliberately NOT unified here: WHICH repository and branch each caller wants. Those are
 * not one fact. The docs "edit this page" links target the branch the docs are published
 * from, and the source-view links may legitimately target a different upstream. Collapsing
 * them into a single constant would be a behaviour change disguised as a refactor, so each
 * caller still states its own `RepoRef` and this module only removes the duplicated
 * string-building.
 */

export type RepoRef = {
  /** GitHub owner, e.g. "databrickslabs". */
  owner: string;
  /** Repository name, e.g. "firefly". */
  repo: string;
  /** Branch these links should point at. */
  branch: string;
};

/** Percent-encode each path segment, leaving the separators intact. */
export function encodeRepoPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Human-facing file view: github.com/<owner>/<repo>/blob/<branch>/<path> */
export function blobUrl(ref: RepoRef, path: string): string {
  return `https://github.com/${ref.owner}/${ref.repo}/blob/${ref.branch}/${encodeRepoPath(path)}`;
}

/** Web editor: github.com/<owner>/<repo>/edit/<branch>/<path> */
export function editUrl(ref: RepoRef, path: string): string {
  return `https://github.com/${ref.owner}/${ref.repo}/edit/${ref.branch}/${encodeRepoPath(path)}`;
}

/**
 * Raw file contents. Derived from the same `ref` as blobUrl, which is the point: these two
 * used to be built from separate copies of the owner and repo and could disagree.
 */
export function rawUrl(ref: RepoRef, path: string): string {
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/refs/heads/${ref.branch}/${encodeRepoPath(path)}`;
}
