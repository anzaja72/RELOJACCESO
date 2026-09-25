// Identidad del kiosco en este navegador: la emite /api/v1/terminals/activate.
const TOKEN_KEY = "reloj-cr-terminal-token";
const ID_KEY = "reloj-cr-terminal-id";
const SITE_KEY = "reloj-cr-terminal-site";

export type TerminalBinding = { token: string; terminalId: string; siteId: string };

export function getTerminal(): TerminalBinding | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const terminalId = window.localStorage.getItem(ID_KEY);
  const siteId = window.localStorage.getItem(SITE_KEY);
  return token && terminalId && siteId ? { token, terminalId, siteId } : null;
}

export function setTerminal(binding: TerminalBinding) {
  window.localStorage.setItem(TOKEN_KEY, binding.token);
  window.localStorage.setItem(ID_KEY, binding.terminalId);
  window.localStorage.setItem(SITE_KEY, binding.siteId);
}

export function clearTerminal() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(SITE_KEY);
}

export function getTerminalId() {
  if (typeof window === "undefined") return "server";
  return window.localStorage.getItem(ID_KEY) ?? "";
}

export function useOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
