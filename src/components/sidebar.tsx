"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";

// Same icons (SVG paths) as the prototype.
const ICONS = {
  tablero: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  contactos:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  pipeline: "M3 3h5v18H3zM10 3h5v12h-5zM17 3h4v8h-4z",
  conversaciones: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z",
  cobros: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  automatizaciones: "M13 2 3 14h9l-1 8 10-12h-9z",
  integraciones: "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
  api: "M16 18l6-6-6-6M8 6l-6 6 6 6",
} as const;

type NavItem = { href: string; label: string; icon: keyof typeof ICONS } | { section: string };

const NAV: NavItem[] = [
  { href: "/tablero", label: "Tablero", icon: "tablero" },
  { href: "/contactos", label: "Contactos", icon: "contactos" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/conversaciones", label: "Conversaciones", icon: "conversaciones" },
  { href: "/cuentas-de-cobro", label: "Cuentas de cobro", icon: "cobros" },
  { href: "/automatizaciones", label: "Automatizaciones", icon: "automatizaciones" },
  { section: "Conexiones" },
  { href: "/ajustes", label: "WhatsApp y API", icon: "integraciones" },
  { href: "/docs/api", label: "Documentación API", icon: "api" },
];

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-[17px] shrink-0" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

type SidebarProps = {
  /** Unread badge for Conversaciones (server component streamed in a Suspense boundary). */
  conversationsBadge: ReactNode;
  /** User name + "Cerrar sesión" (desktop footer). */
  footer: ReactNode;
  /** Compact sign-out button shown in the brand row on mobile, where the footer is hidden. */
  mobileSignOut: ReactNode;
};

export function Sidebar({ conversationsBadge, footer, mobileSignOut }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col bg-sidebar text-sidebar-foreground min-[900px]:sticky min-[900px]:top-0 min-[900px]:h-screen min-[900px]:w-[232px]">
      <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-4 text-[15px] font-bold text-white">
        <BrandLogo />
        <div className="leading-tight">
          CRM SEO
          <small className="block text-[11.5px] font-medium text-sidebar-muted">Valentina · Consultoría SEO</small>
        </div>
        <div className="ml-auto min-[900px]:hidden">{mobileSignOut}</div>
      </div>

      <nav aria-label="Principal" className="flex overflow-x-auto min-[900px]:flex-col min-[900px]:overflow-visible">
        {NAV.map((item) => {
          if ("section" in item) {
            return (
              <div key={item.section} className="hidden px-[18px] pt-4 pb-1.5 text-[11px] tracking-[.06em] text-sidebar-section uppercase min-[900px]:block">
                {item.section}
              </div>
            );
          }
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-[11px] border-b-[3px] border-transparent px-[18px] py-[9px] font-medium whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent",
                "min-[900px]:border-b-0 min-[900px]:border-l-[3px]",
                active && "border-sidebar-primary bg-sidebar-accent text-white",
              )}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.href === "/conversaciones" ? conversationsBadge : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden border-t border-sidebar-border px-[18px] py-3.5 text-xs text-sidebar-muted min-[900px]:block">{footer}</div>
    </aside>
  );
}
