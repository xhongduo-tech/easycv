"use client";
/* eslint-disable @next/next/no-img-element -- OAuth avatar hosts are user/provider controlled and are not proxied by this Vinext app. */

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Coins, FileText, LogIn, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AccountMenu({ compact = false, returnTo = "/dashboard" }: { compact?: boolean; returnTo?: string }) {
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement>(null);
  // A cached session may arrive before hydration; keep the first render identical to SSR.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const session = authClient.useSession();
  const user = session.data?.user as (NonNullable<typeof session.data>["user"] & { role?: string }) | undefined;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  if (!hydrated || session.isPending) return <span className="account-menu account-menu-loading" aria-label="正在读取登录状态"><span className="account-avatar" /></span>;
  if (!user) {
    return <Link className="button button-ghost" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`} aria-label="登录账号">{!compact && <LogIn size={17} aria-hidden="true" />}<span>登录</span></Link>;
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <details ref={menuRef} className="account-menu" onKeyDown={(event) => {
      if (event.key === "Escape" && menuRef.current?.open) {
        menuRef.current.open = false;
        menuRef.current.querySelector("summary")?.focus();
        event.preventDefault();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
    }}>
      <summary className="account-trigger" aria-label="打开账号菜单">
        <span className="account-avatar">{user.image ? <img src={user.image} alt="" /> : initials(user.name)}</span>
        {!compact && <span className="account-label"><strong>{user.name}</strong><small>{displayEmail(user.email)}</small></span>}
      </summary>
      <div className="account-popover">
        <div className="account-summary"><span className="account-avatar">{user.image ? <img src={user.image} alt="" /> : initials(user.name)}</span><div><strong>{user.name}</strong><small>{displayEmail(user.email)}</small></div></div>
        <Link className="account-menu-item" href="/dashboard"><FileText size={16} /> 我的简历</Link>
        <Link className="account-menu-item" href="/account#credits"><Coins size={16} /> 简迹点</Link>
        <Link className="account-menu-item" href="/account"><Settings size={16} /> 账号与安全</Link>
        {user.role === "admin" && <Link className="account-menu-item" href="/admin/users"><ShieldCheck size={16} /> 用户管理</Link>}
        <div className="account-menu-divider" />
        <button className="account-menu-item" type="button" onClick={() => void signOut()}><LogOut size={16} /> 退出登录</button>
      </div>
    </details>
  );
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || <UserRound size={16} />;
}

function displayEmail(email: string) {
  return email.endsWith(".invalid") ? "已验证账号" : email;
}
