"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  FileText,
  Inbox,
  LayoutDashboard,
  ScrollText,
  UserPlus,
} from "lucide-react";
import { APP } from "@/lib/config";

const links = [
  { href: "/", label: "Inicio", icon: Inbox },
  { href: "/kiosk", label: "Kiosco", icon: Camera },
  { href: "/enroll", label: "Enrolar", icon: UserPlus },
  { href: "/admin", label: "Operación", icon: LayoutDashboard },
  { href: "/audit", label: "Auditoría", icon: ScrollText },
  { href: "/docs", label: "API", icon: FileText },
];

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
        <p className="rail-foot">DEMO · no productivo</p>
      </aside>
      <section className="canvas">
        <header className="canvas-bar">
          <div>
            <h1>{title}</h1>
            {meta ? <p>{meta}</p> : null}
          </div>
          <div className="canvas-actions">{actions}</div>
        </header>
        <div className="canvas-body">{children}</div>
      </section>
    </div>
  );
}
