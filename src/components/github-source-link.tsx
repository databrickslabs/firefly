"use client";

import { usePathname } from "next/navigation";
import { Github, ExternalLink, FileCode, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  blobUrl as buildBlobUrl,
  rawUrl as buildRawUrl,
  type RepoRef,
} from "@/lib/repo-links";

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 466.73 532.09"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
      />
    </svg>
  );
}

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 256 257"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#D97757"
        d="m50.228 170.321l50.357-28.257l.843-2.463l-.843-1.361h-2.462l-8.426-.518l-28.775-.778l-24.952-1.037l-24.175-1.296l-6.092-1.297L0 125.796l.583-3.759l5.12-3.434l7.324.648l16.202 1.101l24.304 1.685l17.629 1.037l26.118 2.722h4.148l.583-1.685l-1.426-1.037l-1.101-1.037l-25.147-17.045l-27.22-18.017l-14.258-10.37l-7.713-5.25l-3.888-4.925l-1.685-10.758l7-7.713l9.397.649l2.398.648l9.527 7.323l20.35 15.75L94.817 91.9l3.889 3.24l1.555-1.102l.195-.777l-1.75-2.917l-14.453-26.118l-15.425-26.572l-6.87-11.018l-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0l10.63 1.426l4.472 3.888l6.61 15.101l10.694 23.786l16.591 32.34l4.861 9.592l2.592 8.879l.973 2.722h1.685v-1.556l1.36-18.211l2.528-22.36l2.463-28.776l.843-8.1l4.018-9.722l7.971-5.25l6.222 2.981l5.12 7.324l-.713 4.73l-3.046 19.768l-5.962 30.98l-3.889 20.739h2.268l2.593-2.593l10.499-13.934l17.628-22.036l7.778-8.749l9.073-9.657l5.833-4.601h11.018l8.1 12.055l-3.628 12.443l-11.342 14.388l-9.398 12.184l-13.48 18.147l-8.426 14.518l.778 1.166l2.01-.194l30.46-6.481l16.462-2.982l19.637-3.37l8.88 4.148l.971 4.213l-3.5 8.62l-20.998 5.184l-24.628 4.926l-36.682 8.685l-.454.324l.519.648l16.526 1.555l7.065.389h17.304l32.21 2.398l8.426 5.574l5.055 6.805l-.843 5.184l-12.962 6.611l-17.498-4.148l-40.83-9.721l-14-3.5h-1.944v1.167l11.666 11.406l21.387 19.314l26.767 24.887l1.36 6.157l-3.434 4.86l-3.63-.518l-23.526-17.693l-9.073-7.972l-20.545-17.304h-1.36v1.814l4.73 6.935l25.017 37.59l1.296 11.536l-1.814 3.76l-6.481 2.268l-7.13-1.297l-14.647-20.544l-15.1-23.138l-12.185-20.739l-1.49.843l-7.194 77.448l-3.37 3.953l-7.778 2.981l-6.48-4.925l-3.436-7.972l3.435-15.749l4.148-20.544l3.37-16.333l3.046-20.285l1.815-6.74l-.13-.454l-1.49.194l-15.295 20.999l-23.267 31.433l-18.406 19.702l-4.407 1.75l-7.648-3.954l.713-7.064l4.277-6.286l25.47-32.405l15.36-20.092l9.917-11.6l-.065-1.686h-.583L44.07 198.125l-12.055 1.555l-5.185-4.86l.648-7.972l2.463-2.593l20.35-13.999z"
      />
    </svg>
  );
}

function ChatGPTIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

// VERIFIED 2026-07-28: this pointed at stikkireddy/firefly-analytics-monorepo, which
// returns 404 from the GitHub API, from github.com, and from raw.githubusercontent.com.
// databrickslabs/firefly is not a fork of it (fork=false, no parent), so it was not a
// rename either -- the reference was simply dead. This component renders in top-nav,
// sso-spn-top-nav and the sso-spn-admin sidebar, so every page with that nav was offering
// users a "view source" link that 404s. Repointed at the repository this code actually
// lives in, with both blob and raw URLs confirmed 200 on main and genie-agent.
const SOURCE_REPO: RepoRef = {
  owner: "databrickslabs",
  repo: "firefly",
  branch: "main",
};

function pathnameToSourcePath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);

  const mapped: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = i > 0 ? segments[i - 1] : null;

    // Replace dynamic segments with their bracket equivalents
    if (
      (prev === "sso-spn" || prev === "databricks-idp") &&
      mapped.length > 0 &&
      mapped[mapped.length - 1] === prev
    ) {
      mapped.push("[orgId]");
    } else if (prev === "organizations") {
      mapped.push("[slug]");
    } else if (prev === "ide" && mapped.includes("[orgId]")) {
      mapped.push("[toolId]");
    } else {
      mapped.push(seg);
    }
  }

  const appPath = mapped.length > 0 ? mapped.join("/") : "";
  return `src/app/${appPath ? appPath + "/" : ""}page.tsx`;
}

export function GitHubSourceLink() {
  const pathname = usePathname();
  const sourcePath = pathnameToSourcePath(pathname);

  const githubUrl = buildBlobUrl(SOURCE_REPO, sourcePath);
  const rawUrl = buildRawUrl(SOURCE_REPO, sourcePath);
  const chatPrompt = `Read and analyze this file from databrickslabs/firefly: ${githubUrl}`;
  const cursorUrl = `https://cursor.com/link/prompt?text=${encodeURIComponent(chatPrompt)}`;
  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(chatPrompt)}`;
  const chatgptUrl = `https://chatgpt.com/?prompt=${encodeURIComponent(chatPrompt)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8">
          <Github className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-mono text-xs text-muted-foreground truncate">
          {sourcePath}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            GitHub Link
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <FileCode className="h-4 w-4" />
            GitHub Raw Link
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          Open with AI
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={cursorUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            <CursorIcon className="h-4 w-4" />
            Open with Cursor
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={claudeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            <ClaudeIcon className="h-4 w-4" />
            Open with Claude
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={chatgptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            <ChatGPTIcon className="h-4 w-4" />
            Open with ChatGPT
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
