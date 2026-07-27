import type { ChatMessage } from '@chat-template/core';

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;
const MARKDOWN_LINK_RE = /\[[^\]]*\]\((https?:\/\/[^)]+)\)/gi;

export function isGenieServerName(name?: string): boolean {
  if (!name) return false;
  return /genie/i.test(name);
}

export function isGenieToolPart(
  part: ChatMessage['parts'][number],
): part is Extract<ChatMessage['parts'][number], { type: 'dynamic-tool' }> {
  if (part.type !== 'dynamic-tool') return false;
  const server = part.callProviderMetadata?.databricks?.mcpServerName?.toString();
  if (isGenieServerName(server)) return true;
  const toolName = part.toolName ?? '';
  return /genie/i.test(toolName);
}

export function messageUsesGenie(parts: ChatMessage['parts']): boolean {
  return parts.some(isGenieToolPart);
}

function normalizeUrl(url: string): string {
  return url.replace(/[.,;]+$/g, '');
}

function isNavigableGenieLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractMarkdownLinks(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const url = match[1];
    if (url && isNavigableGenieLink(url)) {
      urls.push(normalizeUrl(url));
    }
  }
  return urls;
}

function collectUrls(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 12 || value == null) return;

  if (typeof value === 'string') {
    extractMarkdownLinks(value).forEach((url) => out.add(url));
    const matches = value.match(URL_RE);
    matches?.forEach((match) => {
      const normalized = normalizeUrl(match);
      if (isNavigableGenieLink(normalized)) {
        out.add(normalized);
      }
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, out, depth + 1));
    return;
  }

  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        /(url|link|href|dashboard|visualization|citation)/i.test(key) &&
        typeof nested === 'string' &&
        nested.startsWith('http')
      ) {
        out.add(normalizeUrl(nested));
      }
      collectUrls(nested, out, depth + 1);
    }
  }
}

export function extractGenieLinks(output: unknown): string[] {
  const urls = new Set<string>();
  collectUrls(output, urls);
  return [...urls];
}

export function collectGenieLinksFromMessage(
  parts: ChatMessage['parts'],
): string[] {
  const urls = new Set<string>();
  for (const part of parts) {
    if (isGenieToolPart(part) && part.output != null) {
      extractGenieLinks(part.output).forEach((url) => urls.add(url));
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      extractGenieLinks(part.text).forEach((url) => urls.add(url));
    }
    if (part.type === 'source-url' && typeof part.url === 'string') {
      urls.add(normalizeUrl(part.url));
    }
  }
  return [...urls];
}
