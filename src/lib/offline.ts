import { openDB, type IDBPDatabase } from "idb";
import { api } from "@/lib/api-client";
import type { Employee, FaceTemplate, QueuedPunch, SyncItem } from "@/lib/types";

const DB_NAME = "reloj-cr";
const DB_VERSION = 1;

type BioDB = {
  queue: {
    key: string;
    value: QueuedPunch;
  };
  templates: {
    key: string;
    value: {
      siteId: string;
      employees: Employee[];
      templates: FaceTemplate[];
      updatedAt: string;
    };
  };
};

let dbPromise: Promise<IDBPDatabase<BioDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<BioDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("queue")) {
          database.createObjectStore("queue", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("templates")) {
          database.createObjectStore("templates", { keyPath: "siteId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueuePunch(item: SyncItem) {
  const record: QueuedPunch = {
    ...item,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  await (await db()).put("queue", record);
  return record;
}

export async function listQueued(): Promise<QueuedPunch[]> {
  const rows = await (await db()).getAll("queue");
  return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeQueued(id: string) {
  await (await db()).delete("queue", id);
}

export async function cacheGallery(
  siteId: string,
  employees: Employee[],
  templates: FaceTemplate[],
) {
  await (await db()).put("templates", {
    siteId,
    employees,
    templates,
    updatedAt: new Date().toISOString(),
  });
}

export async function readGallery(siteId: string) {
  return (await (await db()).get("templates", siteId)) ?? null;
}

export async function flushQueue(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const queued = await listQueued();
  if (queued.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }
  try {
    const result = await api.sync(queued);
    const done = new Set([...result.accepted, ...result.duplicates]);
    for (const id of done) await removeQueued(id);
    const leftover = await listQueued();
    return {
      synced: result.accepted.length,
      failed: leftover.length,
      remaining: leftover.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync failed";
    const store = await db();
    for (const item of queued) {
      await store.put("queue", {
        ...item,
        attempts: item.attempts + 1,
        lastError: message,
      });
    }
    return { synced: 0, failed: queued.length, remaining: queued.length };
  }
}
