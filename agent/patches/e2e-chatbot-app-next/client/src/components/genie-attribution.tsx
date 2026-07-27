import { ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * `workspaceHost` / `workspaceId` are retained because callers pass them and
 * they identify the workspace for display, but there is deliberately no longer a
 * link built from them. See the note on the removed attribution link below.
 */
export type GenieAttributionProps = {
  workspaceHost?: string;
  workspaceId?: string;
  links?: string[];
  variant?: 'inline' | 'footer' | 'compact';
  className?: string;
};

function linkLabel(url: string, index: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/dashboard')) {
      return 'AI/BI dashboard';
    }
    if (parsed.pathname.includes('/genie/')) {
      return 'Genie Agent';
    }
    const path = parsed.pathname.split('/').filter(Boolean).slice(-2).join('/');
    return path || parsed.hostname || `Related link ${index + 1}`;
  } catch {
    return `Related link ${index + 1}`;
  }
}

export function GenieAttribution({
  links = [],
  variant = 'inline',
  className,
}: GenieAttributionProps) {
  const uniqueLinks = [...new Set(links.filter((link) => link.startsWith('http')))];

  return (
    <div
      className={cn(
        'text-muted-foreground',
        variant === 'footer' && 'border-t border-border/60 pt-2',
        className,
      )}
      data-testid="genie-attribution"
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1',
          variant === 'compact' || variant === 'footer' ? 'text-sm' : 'text-base',
        )}
      >
        {/*
          Attribution is plain text on purpose. There used to be a "Genie One"
          link here, and it was wrong twice over: the audience for this panel is
          guest users who have no Databricks workspace access, so the link led
          somewhere they cannot open; and once the agent defaults to a Genie
          space, "Genie One" names a backend that never saw the question. A dead
          link labelled with the wrong backend is worse than no link.
        */}
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/90">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          Powered by Genie
        </span>
      </div>
      {uniqueLinks.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-xs">
          {uniqueLinks.map((url, index) => (
            <li key={`${url}-${index}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
              >
                {linkLabel(url, index)}
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
