const KEY = "reloj-cr-terminal-id";

export function getTerminalId() {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function useOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
