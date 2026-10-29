"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/client/api";
import { isNavLinkActive, type NavGroup, type NavItem, type NavLink } from "@/src/modules/shared/navigation";

type AppShellProps = {
  nav: NavItem[];
  /** Brand strapline under the product name, e.g. "Admin Portal". */
  portalLabel: string;
  /** Displayed in the account menu. */
  userName: string;
  userMeta: string;
  /** Which logout endpoint to call — the two session types have separate cookies. */
  logoutPath: "/api/auth/staff/logout" | "/api/auth/student/logout";
  primaryAction?: { label: string; href: string; icon?: string };
  children: ReactNode;
};

/**
 * The persistent sidebar + top bar frame, per the design system's "Fluid Sidebar"
 * (fixed 260px, floating look) with the documented mobile behaviour: it collapses into
 * a hamburger-driven drawer and horizontal margins shrink to 16px.
 *
 * Not used by the exam runner. That screen is a deliberately linear, transactional flow
 * with no navigation shell — a student mid-exam should have nowhere to click away to.
 */
export function AppShell({
  nav,
  portalLabel,
  userName,
  userMeta,
  logoutPath,
  primaryAction,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // A navigation is the natural moment to close the drawer; doing it here rather than
  // in each link's onClick also covers back/forward and programmatic pushes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
      .filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !drawerRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setDrawerOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [drawerOpen]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await api.post(logoutPath);
    } catch (err) {
      // A failed logout still needs to get the user out of the authenticated UI: the
      // cookie may already be gone (expired token), and stranding them on a dashboard
      // that 401s every fetch is worse than a best-effort redirect.
      setLogoutError(errorMessage(err));
    } finally {
      // `refresh()` clears the router cache so a cached authenticated page cannot be
      // revealed by pressing Back after signing out.
      router.replace("/login");
      router.refresh();
    }
  }

  const navLinks = (
    <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
      <ul className="space-y-1">
        {nav.map((item) => (
          <li key={"children" in item ? item.id : item.href}>
            {"children" in item
              ? <NavigationGroup item={item} pathname={pathname} />
              : <NavigationLink item={item} pathname={pathname} />}
          </li>
        ))}
      </ul>
    </nav>
  );

  const sidebarBody = (
    <>
      <div className="mb-6 flex items-center gap-3 border-b border-border-subtle px-2 pb-4 pr-12 pt-2 md:pr-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container">
          <Icon name="school" filled className="text-on-surface" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-headline-md text-headline-md font-bold leading-tight text-on-surface">
            Ezio
          </p>
          <p className="truncate font-label-sm text-label-sm text-on-surface-variant">
            {portalLabel}
          </p>
        </div>
      </div>

      {primaryAction ? (
        <Link href={primaryAction.href} className="btn-primary mb-6 w-full">
          <Icon name={primaryAction.icon ?? "add"} size={20} />
          {primaryAction.label}
        </Link>
      ) : null}

      {navLinks}

      <div className="mt-auto space-y-1 border-t border-border-subtle pt-4">
        <div className="px-4 py-2">
          <p className="truncate font-label-md text-label-md font-bold text-on-surface">
            {userName}
          </p>
          <p className="truncate font-label-sm text-label-sm text-on-surface-variant">
            {userMeta}
          </p>
        </div>
        {logoutError ? (
          <p className="px-4 pb-1 font-label-sm text-label-sm text-error">
            {logoutError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 font-label-md text-label-md text-on-surface-variant transition-all hover:bg-surface-container-low hover:text-on-surface disabled:opacity-60"
        >
          {loggingOut ? <Spinner size={20} /> : <Icon name="logout" />}
          {loggingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#main-content" inert={drawerOpen || undefined} className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-surface focus-visible:px-4 focus-visible:py-3 focus-visible:text-on-surface">Skip to content</a>
      {/* Desktop sidebar */}
      <aside inert={drawerOpen || undefined} className="fixed left-0 top-0 z-20 hidden h-screen w-sidebar-width flex-col gap-2 border-r border-border-subtle bg-surface p-4 shadow-xl md:flex">
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation"
            className="absolute left-0 top-0 flex h-full w-[min(300px,85vw)] flex-col gap-2 overflow-y-auto overscroll-contain bg-surface p-4 shadow-2xl motion-safe:animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 min-h-11 min-w-11 rounded-full p-2 text-on-surface-variant hover:bg-surface-container"
              aria-label="Close navigation"
            >
              <Icon name="close" size={20} />
            </button>
            {sidebarBody}
          </aside>
        </div>
      ) : null}

      <div inert={drawerOpen || undefined} className="flex min-w-0 w-full flex-1 flex-col md:ml-sidebar-width">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border-subtle bg-surface px-margin-mobile shadow-sm md:px-margin-desktop">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="-ml-2 min-h-11 min-w-11 rounded-lg p-2 text-on-surface transition-colors hover:bg-surface-container md:hidden"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls="mobile-navigation"
            >
              <Icon name="menu" />
            </button>
            <span className="font-headline-md text-headline-md font-extrabold text-on-surface">
              Ezio
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-[40vw] truncate font-label-md text-label-md text-on-surface-variant sm:inline">
              {userName}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-surface-container font-label-md text-label-md font-bold text-on-surface-variant">
              {initials(userName)}
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 scroll-mt-20 p-margin-mobile md:p-margin-desktop">
          <div className="mx-auto w-full max-w-container-max">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavigationLink({ item, pathname }: { item: NavLink; pathname: string }) {
  const active = isNavLinkActive(pathname, item);
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 font-label-md text-label-md transition-colors motion-safe:active:scale-[0.98] ${active
        ? "border-s-4 border-primary-container bg-primary-container/20 font-bold text-on-surface"
        : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}>
      <Icon name={item.icon} filled={active} className={`shrink-0 ${active ? "text-primary" : "text-on-surface-variant"}`} />
      <span className="min-w-0 break-words">{item.label}</span>
    </Link>
  );
}

function NavigationGroup({ item, pathname }: { item: NavGroup; pathname: string }) {
  const id = useId();
  const active = item.children.some((child) => isNavLinkActive(pathname, child));
  const [expanded, setExpanded] = useState(active);
  useEffect(() => { setExpanded(active); }, [active, pathname]);
  return (
    <div>
      <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-3 text-start font-label-md text-label-md transition-colors hover:bg-surface-container-low ${active ? "font-bold text-on-surface" : "text-on-surface-variant"}`}>
        <Icon name={item.icon} filled={active} className={`shrink-0 ${active ? "text-primary" : "text-on-surface-variant"}`} />
        <span className="min-w-0 flex-1 break-words">{item.label}</span>
        <Icon name={expanded ? "expand_less" : "expand_more"} size={20} className="shrink-0" />
      </button>
      <ul id={id} hidden={!expanded} className="my-2 ms-4 space-y-1 border-s border-border-subtle ps-2">
        {item.children.map((child) => <li key={child.href}><NavigationLink item={child} pathname={pathname} /></li>)}
      </ul>
    </div>
  );
}

/** `Adebayo Oluwaseun` → `AO`. Avatar fallback; the reference screens use photos. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
