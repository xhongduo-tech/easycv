"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AccountMenu } from "@/components/account-menu";
import type { SiteHeaderVariant } from "@/components/site-header";
import styles from "./site-header.module.css";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function HeaderActions({ variant }: { variant: SiteHeaderVariant }) {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const session = authClient.useSession();

  if (variant === "workspace") return <div className={styles.actions}><AccountMenu compact returnTo={pathname || "/dashboard"} /></div>;

  if (!hydrated || session.isPending) {
    return <div className={styles.actions} aria-label="正在读取登录状态" aria-busy="true"><span className={styles.loadingAccount} /><span className={styles.loadingAction} /></div>;
  }

  return (
    <div className={styles.actions}>
      {session.data?.user ? <>
        <Link className={styles.primaryAction} href="/dashboard">进入工作台</Link>
        <AccountMenu compact />
      </> : <>
        <Link className={styles.loginAction} href="/auth/login?returnTo=%2Fdashboard">登录</Link>
        <Link className={styles.primaryAction} href="/dashboard?new=1">免费开始</Link>
      </>}
    </div>
  );
}

export function HeaderMobileNavigation({ links }: { links: { href: string; label: string }[] }) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details ref={menuRef} className={styles.mobileMenu} onKeyDown={(event) => {
      if (event.key === "Escape" && menuRef.current?.open) {
        menuRef.current.open = false;
        menuRef.current.querySelector("summary")?.focus();
        event.preventDefault();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
    }}>
      <summary className={styles.menuTrigger}>菜单 <ChevronDown size={12} aria-hidden="true" /></summary>
      <nav className={styles.mobileNavigation} aria-label="产品导航" onClick={() => { if (menuRef.current) menuRef.current.open = false; }}>
        {links.map(({ href, label }) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
    </details>
  );
}
