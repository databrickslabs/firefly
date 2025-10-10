"use client";

import React from "react";
import { cn } from "@/lib/utils";

type SectionLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface TocItem {
  id: string;
  title: string;
  level: SectionLevel;
  items?: TocItem[];
}

interface SectionContextValue {
  level: SectionLevel;
  registerSection?: (item: TocItem) => void;
  unregisterSection?: (id: string) => void;
}

const SectionContext = React.createContext<SectionContextValue>({ level: 1 });

export function useSection() {
  return React.useContext(SectionContext);
}

interface SectionProps {
  id?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
  headingClassName?: string;
}

/**
 * Section component that automatically manages heading levels based on nesting depth.
 * Each nested Section increases the heading level (h1 -> h2 -> h3, etc.)
 *
 * @example
 * <Section id="overview" title="Overview">
 *   <p>Some content</p>
 *   <Section id="sub-section" title="Sub Section">
 *     <p>Nested content with automatic h3</p>
 *   </Section>
 * </Section>
 */
export function Section({
  id,
  title,
  children,
  className,
  headingClassName,
}: SectionProps) {
  const { level: parentLevel, registerSection, unregisterSection } = useSection();
  const currentLevel = Math.min((parentLevel + 1) as SectionLevel, 6) as SectionLevel;

  // Register this section with the TOC
  React.useEffect(() => {
    if (id && title && registerSection) {
      registerSection({
        id,
        title,
        level: currentLevel,
      });
    }
    return () => {
      if (id && unregisterSection) {
        unregisterSection(id);
      }
    };
  }, [id, title, currentLevel, registerSection, unregisterSection]);

  return (
    <SectionContext.Provider value={{ level: currentLevel, registerSection, unregisterSection }}>
      <section id={id} className={cn("mb-16", className)}>
        {title && (
          <SectionHeading className={headingClassName}>
            {title}
          </SectionHeading>
        )}
        {children}
      </section>
    </SectionContext.Provider>
  );
}

interface SectionHeadingProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * SectionHeading component that renders the appropriate heading tag (h1-h6)
 * based on the current section nesting level.
 */
export function SectionHeading({ children, className }: SectionHeadingProps) {
  const { level } = useSection();

  // Map level to appropriate Tailwind classes
  const headingClasses: Record<SectionLevel, string> = {
    1: "text-4xl font-bold mb-4",
    2: "text-3xl font-bold mb-4",
    3: "text-2xl font-semibold mb-4 mt-8",
    4: "text-xl font-semibold mb-3 mt-6",
    5: "text-lg font-semibold mb-2 mt-4",
    6: "text-base font-semibold mb-2 mt-4",
  };

  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

  return (
    <Tag className={cn(headingClasses[level], className)}>
      {children}
    </Tag>
  );
}

interface ContentBlockProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * ContentBlock component for wrapping paragraph content with consistent spacing
 */
export function ContentBlock({ children, className }: ContentBlockProps) {
  return <div className={cn("mb-4 leading-relaxed", className)}>{children}</div>;
}

interface HighlightBoxProps {
  variant?: "info" | "warning" | "success" | "danger" | "note";
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * HighlightBox component for callouts, warnings, and important information
 */
export function HighlightBox({
  variant = "info",
  title,
  children,
  className,
}: HighlightBoxProps) {
  const variants = {
    info: "border-blue-500 bg-blue-50",
    warning: "border-yellow-500 bg-yellow-50",
    success: "border-green-500 bg-green-50",
    danger: "border-red-500 bg-red-50",
    note: "border-purple-500 bg-purple-50",
  };

  const titleColors = {
    info: "text-blue-900",
    warning: "text-yellow-900",
    success: "text-green-900",
    danger: "text-red-900",
    note: "text-purple-900",
  };

  const contentColors = {
    info: "text-blue-800",
    warning: "text-yellow-800",
    success: "text-green-800",
    danger: "text-red-800",
    note: "text-purple-800",
  };

  return (
    <div className={cn("border-l-4 p-4 mb-6", variants[variant], className)}>
      {title && (
        <h3 className={cn("font-semibold mb-2", titleColors[variant])}>
          {title}
        </h3>
      )}
      <div className={contentColors[variant]}>{children}</div>
    </div>
  );
}

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

/**
 * CodeBlock component for displaying code snippets
 */
export function CodeBlock({ children, className, title }: CodeBlockProps) {
  return (
    <div className={cn("bg-gray-50 p-4 rounded-lg border mb-6", className)}>
      {title && <div className="text-sm font-semibold mb-2 text-gray-700">{title}</div>}
      <pre className="text-sm overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );
}

interface SectionContainerProps {
  children: React.ReactNode;
  showToc?: boolean;
  tocTitle?: string;
}

/**
 * SectionContainer wraps your content and provides automatic TOC generation
 * Wrap your entire docs content with this component.
 */
export function SectionContainer({
  children,
  showToc = true,
  tocTitle = "On This Page",
}: SectionContainerProps) {
  const [sections, setSections] = React.useState<TocItem[]>([]);

  const registerSection = React.useCallback((item: TocItem) => {
    setSections((prev) => {
      // Remove any existing entry with same id
      const filtered = prev.filter((s) => s.id !== item.id);
      // Add new entry
      return [...filtered, item].sort((a, b) => {
        // Sort by DOM order
        const aEl = document.getElementById(a.id);
        const bEl = document.getElementById(b.id);
        if (!aEl || !bEl) return 0;
        return aEl.compareDocumentPosition(bEl) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
    });
  }, []);

  const unregisterSection = React.useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Build hierarchical structure from flat list
  const buildHierarchy = (items: TocItem[]): TocItem[] => {
    const result: TocItem[] = [];
    const stack: TocItem[] = [];

    for (const item of items) {
      const newItem = { ...item, items: [] };

      // Find parent - items with level one less than current
      while (stack.length > 0 && stack[stack.length - 1].level >= newItem.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        result.push(newItem);
      } else {
        const parent = stack[stack.length - 1];
        if (!parent.items) parent.items = [];
        parent.items.push(newItem);
      }

      stack.push(newItem);
    }

    return result;
  };

  const tocItems = buildHierarchy(sections);

  return (
    <SectionContext.Provider value={{ level: 1, registerSection, unregisterSection }}>
      <div className="flex gap-8">
        <article className="flex-1 max-w-4xl">{children}</article>
        {showToc && tocItems.length > 0 && (
          <aside className="hidden lg:block w-64 shrink-0">
            <AutoToc items={tocItems} title={tocTitle} />
          </aside>
        )}
      </div>
    </SectionContext.Provider>
  );
}

interface AutoTocProps {
  items: TocItem[];
  title?: string;
}

/**
 * AutoToc component that renders the table of contents with active section tracking
 */
function AutoToc({ items, title = "On This Page" }: AutoTocProps) {
  const [activeId, setActiveId] = React.useState<string>("");

  React.useEffect(() => {
    const scrollContainer = document.querySelector("main");

    const observer = new IntersectionObserver(
      (entries) => {
        const intersectingEntries = entries.filter((entry) => entry.isIntersecting);
        if (intersectingEntries.length > 0) {
          const topEntry = intersectingEntries.reduce((prev, current) => {
            return current.boundingClientRect.top < prev.boundingClientRect.top
              ? current
              : prev;
          });
          setActiveId(topEntry.target.id);
        }
      },
      {
        root: scrollContainer,
        rootMargin: "-100px 0px -80% 0px",
        threshold: [0, 0.1, 0.2, 0.5, 1],
      }
    );

    const flattenItems = (items: TocItem[]): TocItem[] => {
      return items.flatMap((item) => [item, ...(item.items ? flattenItems(item.items) : [])]);
    };

    const allItems = flattenItems(items);

    allItems.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      allItems.forEach(({ id }) => {
        const element = document.getElementById(id);
        if (element) {
          observer.unobserve(element);
        }
      });
    };
  }, [items]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const scrollContainer = document.querySelector("main");
      if (scrollContainer) {
        const offset = 100;
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop =
          elementRect.top - containerRect.top + scrollContainer.scrollTop;

        scrollContainer.scrollTo({
          top: relativeTop - offset,
          behavior: "smooth",
        });
      }
    }
  };

  const isActiveOrHasActiveChild = (item: TocItem): boolean => {
    if (item.id === activeId) return true;
    if (item.items) {
      return item.items.some((subItem) => isActiveOrHasActiveChild(subItem));
    }
    return false;
  };

  const renderItems = (items: TocItem[], level = 0) => {
    return items.map(({ id, title, items: subItems }) => {
      const isActive = activeId === id;
      const hasActiveChild = subItems
        ? subItems.some((item) => isActiveOrHasActiveChild(item))
        : false;
      const shouldShowSubItems = subItems && (isActive || hasActiveChild);

      return (
        <div key={id} className={level > 0 ? "ml-3" : ""}>
          <a
            href={`#${id}`}
            onClick={(e) => handleClick(e, id)}
            className={cn(
              "block py-1 transition-all duration-200 border-l-2 pl-3 -ml-px",
              isActive
                ? "border-orange-500 text-orange-600 font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300",
              level > 0 && "text-sm"
            )}
          >
            {title}
          </a>
          {shouldShowSubItems && (
            <div className="mt-1 space-y-1">{renderItems(subItems!, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="sticky top-20">
      <h3 className="font-semibold mb-4 text-sm uppercase text-muted-foreground">
        {title}
      </h3>
      <nav className="space-y-2 text-sm">{renderItems(items)}</nav>
    </div>
  );
}
