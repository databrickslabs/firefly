"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  title: string;
  items?: TocItem[];
}

interface DocsTocProps {
  items: TocItem[];
}

export function DocsToc({ items }: DocsTocProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const scrollContainer = document.querySelector('main');

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with highest intersection ratio that is intersecting
        const intersectingEntries = entries.filter(entry => entry.isIntersecting);
        if (intersectingEntries.length > 0) {
          // Sort by position (top-most visible section)
          const topEntry = intersectingEntries.reduce((prev, current) => {
            return current.boundingClientRect.top < prev.boundingClientRect.top ? current : prev;
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

    // Flatten items to observe all sections including nested ones
    const flattenItems = (items: TocItem[]): TocItem[] => {
      return items.flatMap((item) => [
        item,
        ...(item.items ? flattenItems(item.items) : []),
      ]);
    };

    const allItems = flattenItems(items);

    // Observe all sections
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
      // Find the scrollable container (the main element with overflow-y-auto)
      const scrollContainer = document.querySelector('main');
      if (scrollContainer) {
        const offset = 100; // Account for sticky header + some padding

        // Get the element's position relative to the scrollable container
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top + scrollContainer.scrollTop;

        scrollContainer.scrollTo({
          top: relativeTop - offset,
          behavior: "smooth",
        });
      }
    }
  };

  // Helper function to check if an item or any of its children is active
  const isActiveOrHasActiveChild = (item: TocItem): boolean => {
    if (item.id === activeId) return true;
    if (item.items) {
      return item.items.some(subItem => isActiveOrHasActiveChild(subItem));
    }
    return false;
  };

  const renderItems = (items: TocItem[], level = 0) => {
    return items.map(({ id, title, items: subItems }) => {
      const isActive = activeId === id;
      const hasActiveChild = subItems ? subItems.some(item => isActiveOrHasActiveChild(item)) : false;
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
        On This Page
      </h3>
      <nav className="space-y-2 text-sm">{renderItems(items)}</nav>
    </div>
  );
}
