"use client";

import clsx from "clsx";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, when } from "@/lib/api";
import { homeFor, useSession } from "@/lib/session";
import type { Role } from "@/lib/types";
import Logo, { RolePill } from "./Logo";
import { Badge, EmptyState } from "./ui";

export type NavItem = { href: string; label: string; icon: React.ElementType; badge?: number };
export type NavGroup = { title: string; items: NavItem[] };

/** Short human label per role, used in the rail footer card. */
const ROLE_LABEL: Record<string, string> = {
  admin: "Control tower",
  sender: "Sender workspace",
  transporter: "Fleet workspace",
};

export default function AppShell({
  children,
  nav,
  title,
  subtitle,
  role,
  actions,
}: {
  children: React.ReactNode;
  nav: NavGroup[];
  title: string;
  subtitle?: string;
  role: Role;
  actions?: React.ReactNode;
}) {
  const { user, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const menuRef = useRef<HTMLInputElement | null>(null);

  const loadNotifs = async () => {
    try {
      const res = await api.get<{ items: any[]; unread: number }>("/notifications");
      setNotifs(res.items);
      setUnread(res.unread);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    loadNotifs();
    const t = setInterval(loadNotifs, 45000);
    return () => clearInterval(t);
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  /* command palette / quick jump: expand the rail and focus its filter */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCollapsed(false);
        setMenuOpen(true);
        setTimeout(() => menuRef.current?.focus(), 30);
      }
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    if (!filter.trim()) return nav;
    const q = filter.trim().toLowerCase();
    return nav
      .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [nav, filter]);

  const initials = (user?.full_name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const rail = (
    <div className="flex h-full flex-col bg-rail">
      {/* brand */}
      <div className={clsx("flex items-center gap-2 px-5 pb-2 pt-5", collapsed && "justify-center px-0")}>
        <Link href={homeFor(role)} className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent">
            <Logo showWord={false} size={20} tone="dark" />
          </span>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">
              cargo<span className="font-bold">X</span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            className="ml-auto text-white/40 hover:text-white lg:block"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse menu"
          >
            <Menu size={16} />
          </button>
        )}
        <button className="ml-auto lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} className="text-white/60" />
        </button>
      </div>

      {/* search / quick jump */}
      {!collapsed ? (
        <div className="px-4 pt-2">
          <div className="flex items-center gap-2 rounded-pill border border-rail-line bg-rail-soft px-3 py-2">
            <Search size={14} className="shrink-0 text-white/35" />
            <input
              ref={menuRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onFocus={() => setMenuOpen(true)}
              placeholder="Search here..."
              className="w-full bg-transparent text-[12px] text-white placeholder:text-white/35 focus:outline-none"
            />
            <kbd className="shrink-0 rounded-md border border-rail-line px-1.5 py-0.5 text-[9.5px] text-white/35">
              ⌘K
            </kbd>
          </div>
        </div>
      ) : (
        <button
          className="mx-auto mt-2 grid h-8 w-8 place-items-center rounded-pill border border-rail-line text-white/50 hover:text-white"
          onClick={() => setCollapsed(false)}
          aria-label="Expand menu"
        >
          <Search size={14} />
        </button>
      )}

      {/* nav */}
      <nav className="rail-scroll mt-1 flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.title}>
            {!collapsed && <div className="rail-group">{group.title}</div>}
            <div className="space-y-0.5 pt-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== homeFor(role) && pathname.startsWith(item.href + "/"));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={clsx(
                      "rail-item",
                      active && "rail-item-active",
                      collapsed && "justify-center px-0 py-2",
                    )}
                  >
                    <Icon size={16} className={active ? "text-ink" : "text-white/45"} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span
                            className={clsx(
                              "rounded-pill px-1.5 py-0.5 text-[10px] font-semibold",
                              active ? "bg-ink text-white" : "bg-white/15 text-white",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="rail-item mt-3 justify-center px-0"
            aria-label="Expand menu"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </nav>

      {/* footer card */}
      <div className="border-t border-rail-line p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[11px] font-bold text-ink">
              {initials}
            </span>
            <button onClick={logout} className="text-white/40 hover:text-white" aria-label="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div className="rounded-xl2 bg-rail-soft p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-white">{user?.full_name}</div>
                <div className="truncate text-[10.5px] text-white/40">{ROLE_LABEL[role]}</div>
              </div>
              <button
                onClick={logout}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut size={13} />
              </button>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <RolePill role={role} />
              <span className="text-[10px] text-white/35">
                <ShieldAlert size={10} className="mr-0.5 inline" />
                3 roles
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-shell">
      {/* dark rounded rail (reference dashboard) */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-30 hidden py-3 pl-3 lg:block",
          collapsed ? "w-[84px]" : "w-[248px]",
        )}
      >
        <div className="h-full overflow-hidden rounded-[22px] shadow-rail">{rail}</div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[276px] animate-slide-right overflow-hidden rounded-r-[22px] shadow-lift">
            {rail}
          </div>
        </div>
      )}

      <div className={clsx("transition-[padding] duration-200", collapsed ? "lg:pl-[84px]" : "lg:pl-[248px]")}>
        <main className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4">
          <div className="rounded-[22px] bg-white px-5 pb-6 pt-5 shadow-card sm:px-7">
            {/* header */}
            <header className="mb-5 flex flex-wrap items-start gap-3">
              <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                <Menu size={20} className="text-ink" />
              </button>
              <div className="min-w-0 flex-1">
                {/* phones: wrap onto two lines instead of showing "Available assig…" */}
                <h1 className="text-[19px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:truncate sm:text-[22px]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted sm:truncate sm:text-[12px]">
                    {subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {actions}
                <div className="relative">
                  <button
                    onClick={() => {
                      setNotifOpen((v) => !v);
                      setProfileOpen(false);
                    }}
                    className="relative grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ink-muted transition-colors hover:border-ink/20 hover:text-ink"
                    aria-label="Notifications"
                  >
                    <Bell size={16} />
                    {unread > 0 && (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-11 z-40 w-[min(88vw,360px)] animate-fade-up overflow-hidden rounded-xl2 border border-line bg-white shadow-lift">
                      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                        <span className="text-[13px] font-semibold">Notifications</span>
                        <button
                          className="text-[11px] font-medium text-ink-muted hover:text-ink"
                          onClick={async () => {
                            await api.post("/notifications/read-all");
                            loadNotifs();
                          }}
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-[340px] overflow-y-auto">
                        {notifs.length === 0 ? (
                          <div className="px-4 py-8">
                            <EmptyState title="Nothing yet" body="Operational updates appear here." />
                          </div>
                        ) : (
                          notifs.slice(0, 12).map((n) => (
                            <div
                              key={n.id}
                              className={clsx(
                                "border-b border-line/70 px-4 py-3 last:border-0",
                                !n.read_at && "bg-accent-50/60",
                              )}
                            >
                              <div className="flex items-start gap-2">
                                {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                                <div className="min-w-0">
                                  <div className="text-[12.5px] font-medium leading-snug text-ink">{n.title}</div>
                                  {n.body && (
                                    <div className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">{n.body}</div>
                                  )}
                                  <div className="mt-1 text-[10px] text-ink-faint">{when(n.created_at)}</div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => {
                      setProfileOpen((v) => !v);
                      setNotifOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-pill border border-line bg-white py-1 pl-1 pr-2.5 transition-colors hover:border-ink/20"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[10.5px] font-semibold text-white">
                      {initials}
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block max-w-[130px] truncate text-[11.5px] font-medium leading-tight text-ink">
                        {user?.full_name}
                      </span>
                      <span className="block max-w-[130px] truncate text-[10px] leading-tight text-ink-faint">
                        {user?.email}
                      </span>
                    </span>
                    <ChevronDown size={13} className="text-ink-faint" />
                  </button>
                  {profileOpen && (
                    <div className="absolute right-0 top-11 z-40 w-56 animate-fade-up overflow-hidden rounded-xl2 border border-line bg-white shadow-lift">
                      <div className="border-b border-line px-4 py-3">
                        <div className="text-[12.5px] font-semibold text-ink">{user?.full_name}</div>
                        <div className="truncate text-[11px] text-ink-muted">{user?.email}</div>
                        <div className="mt-1.5">
                          <Badge status={user?.status} />
                        </div>
                      </div>
                      <Link
                        href={`/${role}/settings`}
                        className="flex items-center gap-2 px-4 py-2.5 text-[12.5px] text-ink hover:bg-soft"
                      >
                        <Settings size={14} /> Profile &amp; settings
                      </Link>
                      <button
                        onClick={logout}
                        className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-[12.5px] text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={14} /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
