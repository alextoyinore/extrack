import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export type FilterOption = { value: string; label: string };

export type ListFilter = {
  id: string;
  value: string;
  options: FilterOption[];
  ariaLabel: string;
  onChange: (value: string) => void;
};

export function matchesSearch(
  query: string,
  ...parts: Array<string | number | undefined | null>
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((part) => String(part ?? "").toLowerCase().includes(needle));
}

export function uniqueOptions(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => (value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

export default function ListToolbar({
  search,
  onSearch,
  searchPlaceholder,
  searchLabel,
  filters = [],
  compactSearch = false,
  className = "",
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  searchLabel?: string;
  filters?: ListFilter[];
  compactSearch?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(!compactSearch || Boolean(search));

  useEffect(() => {
    if (search) setExpanded(true);
  }, [search]);

  const showSearch = !compactSearch || expanded || Boolean(search);

  return (
    <div className={`list-toolbar ${className}`.trim()}>
      {showSearch ? (
        <label className="list-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel || searchPlaceholder}
            autoFocus={compactSearch}
          />
          {(search || compactSearch) && (
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                onSearch("");
                if (compactSearch) setExpanded(false);
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>
      ) : (
        <button
          type="button"
          className="icon-button"
          onClick={() => setExpanded(true)}
          aria-label={searchLabel || "Search"}
        >
          <Search size={17} />
        </button>
      )}
      {filters.map((filter) => (
        <label className="list-filter" key={filter.id}>
          <select
            value={filter.value}
            aria-label={filter.ariaLabel}
            onChange={(event) => filter.onChange(event.target.value)}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
      ))}
    </div>
  );
}
