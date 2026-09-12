"use client";

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
    return <span className="pill">En línea</span>;
  }
  if (online) {
    return <span className="pill">{syncing ? "Sincronizando" : `${queued} en cola`}</span>;
  }
  return <span className="pill warn">Sin red{queued ? ` · ${queued}` : ""}</span>;
}
