"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP } from "@/lib/config";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/kiosk", label: "Kiosco" },
  { href: "/enroll", label: "Enrolar" },
  { href: "/admin", label: "Dashboard" },
  { href: "/docs", label: "API" },
];

export function NavLinks({ tone = "light" }: { tone?: "light" | "dark" }) {
  const pathname = usePathname();
  return (
    <header className={`app-nav ${tone}`}>
      <Link href="/" className="brand">
        <span className="brand-mark">RC</span>
        <span>
          <strong>{APP.name}</strong>
          <small>{APP.rfp}</small>
        </span>
      </Link>
      <nav>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? "active" : ""}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
