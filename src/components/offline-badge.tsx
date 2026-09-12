"use client";

import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function OfflineBadge({
  online,
  queued,
  syncing,
}: {
  online: boolean;
  queued: number;
  syncing?: boolean;
}) {
  if (online && queued === 0 && !syncing) {
    return (
      <span className="status-chip online">
        <Wifi className="size-3.5" />
        En línea
      </span>
    );
  }
  if (online && (queued > 0 || syncing)) {
    return (
      <span className="status-chip sync">
        <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Sincronizando" : `${queued} en cola`}
      </span>
    );
  }
  return (
    <span className="status-chip offline">
      <WifiOff className="size-3.5" />
      Sin red{queued ? ` · ${queued} guardadas` : ""}
    </span>
  );
}
