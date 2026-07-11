import { ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildGenieOneUrl } from '@/lib/genie-attribution';

export type GenieAttributionProps = {
  genieOneUrl?: string | null;
  workspaceHost: string;
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
  genieOneUrl,
  workspaceHost,
  workspaceId,
  links = [],
  variant = 'inline',
  className,
}: GenieAttributionProps) {
  const oneUrl =
    genieOneUrl ?? buildGenieOneUrl(workspaceHost, workspaceId) ?? null;
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
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/90">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          Powered by Genie
        </span>
        {oneUrl && (
          <>
            <span aria-hidden>•</span>
            <a
              href={oneUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-foreground"
            >
              Genie One
              <ExternalLink className="size-4 shrink-0" aria-hidden />
            </a>
          </>
        )}
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
