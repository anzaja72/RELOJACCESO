"use client";

import type { Site } from "@/lib/types";

export function SitePicker({
  sites,
  value,
  onChange,
  className = "",
}: {
  sites: Site[];
  value: string;
  onChange: (siteId: string) => void;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Sede
      </span>
      <select
        className="native-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.code} · {site.name} ({site.city})
          </option>
        ))}
      </select>
    </label>
  );
}
