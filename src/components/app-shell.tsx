"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Camera,
  FileText,
  Inbox,
  LayoutDashboard,
  LogIn,
  ScrollText,
  Settings,
  UserPlus,
  Users,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { clearSession, getSessionUser, getToken } from "@/lib/client-session";
import { APP } from "@/lib/config";

const links = [
  { href: "/", label: "Inicio", icon: Inbox },
  { href: "/kiosk", label: "Kiosco", icon: Camera },
  { href: "/enroll", label: "Enrolar", icon: UserPlus },
  { href: "/admin", label: "Operación", icon: LayoutDashboard },
  { href: "/people", label: "Personas", icon: Users },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/ai", label: "Pregunta", icon: Sparkles },
  { href: "/audit", label: "Auditoría", icon: ScrollText },
  { href: "/settings", label: "Ajustes", icon: Settings },
  { href: "/docs", label: "API", icon: FileText },
];

// Pantallas que no exigen sesión: inicio, login, kiosco (usa token de terminal) y docs.
const PUBLIC_PATHS = ["/", "/login", "/kiosk", "/docs"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

export function AppShell({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getSessionUser>>(null);
  const [allowed, setAllowed] = useState(isPublic(pathname));

  useEffect(() => {
    setUser(getSessionUser());
    if (isPublic(pathname) || getToken()) {
      setAllowed(true);
      return;
    }
    setAllowed(false);
    const next = window.location.pathname + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [pathname, router]);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-brand">
          <span className="rail-avatar">RC</span>
          <div>
            <strong>{APP.name}</strong>
            <small>{APP.rfp}</small>
          </div>
        </div>
        <nav className="rail-nav">
          {links.map((link) => {
            const Icon = link.icon;
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rail-link shade ${active ? "active" : ""}`}
              >
                <Icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <p className="rail-foot">
          Oferta software v1
          <br />
          <span className="pill" style={{ marginTop: 8 }}>PoC browser</span>
        </p>
      </aside>
      <section className="canvas">
        <header className="canvas-bar">
          <div>
            <h1>{title}</h1>
            {meta ? <p>{meta}</p> : null}
          </div>
          <div className="canvas-actions">
            {actions}
            {user ? (
              <button
                type="button"
                className="native-select shade"
                onClick={() => {
                  clearSession();
                  setUser(null);
                  router.push("/login");
                }}
              >
                {user.name} · salir
              </button>
            ) : (
              <Link href="/login" className="rail-link shade" style={{ minHeight: 34 }}>
                <LogIn className="size-4" />
                Entrar
              </Link>
            )}
          </div>
        </header>
        <div className="canvas-body">
          {allowed ? children : <p className="muted">Redirigiendo a inicio de sesión…</p>}
        </div>
      </section>
    </div>
  );
}
