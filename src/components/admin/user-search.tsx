"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserSearchProps {
  onSelect: (userId: string, userEmail: string) => void;
  placeholder?: string;
  className?: string;
  selectedUsers?: string[]; // For multi-select mode
  multiSelect?: boolean;
}

interface UserResult {
  id: string;
  email: string;
  name: string | null;
}

export function UserSearch({
  onSelect,
  placeholder = "Search users by email...",
  className,
  selectedUsers = [],
  multiSelect = false,
}: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch users as user types
  useEffect(() => {
    const fetchUsers = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/admin/search-users?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
        }
      } catch (error) {
        console.error("Error searching users:", error);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  const handleSelect = (user: UserResult) => {
    onSelect(user.id, user.email);
    if (!multiSelect) {
      setQuery("");
      setResults([]);
      setShowDropdown(false);
    } else {
      setQuery("");
    }
  };

  const filteredResults = results.filter(
    (user) => !selectedUsers.includes(user.id)
  );

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {showDropdown && (query.length >= 2) && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              Searching...
            </div>
          ) : filteredResults.length > 0 ? (
            <div className="py-1">
              {filteredResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelect(user)}
                  className="w-full px-4 py-2 text-left hover:bg-accent transition-colors flex items-center gap-3"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.email}</p>
                    {user.name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {user.name}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : query.length >= 2 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No users found matching &quot;{query}&quot;
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
