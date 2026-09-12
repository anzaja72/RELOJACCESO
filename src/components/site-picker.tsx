"use client";

import type { Site } from "@/lib/types";

export function SitePicker({
  sites,
  value,
  onChange,
}: {
  sites: Site[];
  value: string;
  onChange: (siteId: string) => void;
}) {
  return (
    <select
      className="native-select"
      aria-label="Sede"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.code} · {site.name}
        </option>
      ))}
    </select>
  );
}
