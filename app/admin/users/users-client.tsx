"use client";
/* eslint-disable @next/next/no-img-element -- OAuth avatar hosts are user/provider controlled and are not proxied by this Vinext app. */

import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCog,
  UsersRound,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-utils";
import styles from "../admin.module.css";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string;
  banned?: boolean | null;
  banReason?: string | null;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean;
  createdAt: Date;
};

const pageSize = 25;
const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AdminUsersClient() {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const viewer = authClient.useSession();
  const viewerRole = (viewer.data?.user as (NonNullable<typeof viewer.data>["user"] & { role?: string }) | undefined)?.role;
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await authClient.admin.listUsers({ query: {
      limit: pageSize,
      offset: page * pageSize,
      sortBy: "createdAt",
      sortDirection: "desc",
      ...(submittedQuery ? { searchValue: submittedQuery, searchField: "email" as const, searchOperator: "contains" as const } : {}),
    } });
    setLoading(false);
    if (result.error) return setError(authErrorMessage(result.error.code, result.error.message));
    setUsers((result.data?.users ?? []) as ManagedUser[]);
    setTotal(result.data?.total ?? 0);
  }, [page, submittedQuery]);

  useEffect(() => {
    if (viewerRole !== "admin") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetching begins only after the authenticated role hydrates.
    void load();
  }, [load, viewerRole]);

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setSubmittedQuery(query.trim());
  }

  async function setRole(user: ManagedUser, role: "user" | "admin") {
    setBusy(user.id); setError(""); setMessage("");
    const result = await authClient.admin.setRole({ userId: user.id, role });
    setBusy("");
    if (result.error) return setError(authErrorMessage(result.error.code, result.error.message));
    setMessage(`${user.name} 的角色已更新为${role === "admin" ? "管理员" : "用户"}`);
    void load();
  }

  async function toggleBan(user: ManagedUser) {
    setBusy(user.id); setError(""); setMessage("");
    const result = user.banned
      ? await authClient.admin.unbanUser({ userId: user.id })
      : await authClient.admin.banUser({ userId: user.id, banReason: "管理员手动停用" });
    setBusy("");
    if (result.error) return setError(authErrorMessage(result.error.code, result.error.message));
    setMessage(`${user.name} 已${user.banned ? "恢复" : "停用"}`);
    void load();
  }

  if (!hydrated || viewer.isPending) return <AdminState loading />;
  if (!viewer.data?.user || viewerRole !== "admin") return <AdminState />;
  const currentUserId = viewer.data.user.id;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className={styles.page}>
      <SiteHeader variant="workspace" title="用户管理" />
      <section className={styles.adminShell}>
        <div className="shell">
          <div className={styles.adminHeader}>
            <div><div className={styles.modeBadge}><ShieldCheck size={14} /> 管理员已验证</div><h1>用户管理</h1><p>查询账号、调整角色并停用异常用户。管理员不能停用自己。</p></div>
            <Link className="button button-secondary" href="/admin"><ArrowLeft size={15} /> 返回概览</Link>
          </div>

          <nav className={styles.adminNav}><Link href="/admin">运行概览</Link><Link className={styles.adminNavActive} href="/admin/users">用户管理</Link></nav>
          {error && <div className={styles.error} role="alert">{error}</div>}
          {message && <div className={styles.success} role="status"><CheckCircle2 size={15} /> {message}</div>}

          <div className={styles.adminToolbar}>
            <form onSubmit={search}><label><Search size={16} /><span className="sr-only">按邮箱搜索用户</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按邮箱搜索" /></label><button className="button button-primary" type="submit">搜索</button></form>
            <div><span><UsersRound size={15} /> 共 {total} 位用户</span><button className="button button-secondary" type="button" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? styles.spin : ""} size={15} /> 刷新</button></div>
          </div>

          <section className={`${styles.recentPanel} ${styles.usersPanel}`}>
            {loading ? <div className={styles.loading}><LoaderCircle className={styles.spin} size={26} /><strong>正在读取用户</strong></div> : users.length ? (
              <div className={styles.tableWrap}><table><thead><tr><th>用户</th><th>登录标识</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>{users.map((user) => (
                <tr key={user.id}>
                  <td><div className={styles.userIdentity}><span>{user.image ? <img src={user.image} alt="" /> : user.name.slice(0, 1)}</span><div><strong>{user.name}</strong><small>{user.id.slice(0, 8)}</small></div></div></td>
                  <td><div className={styles.userLogin}><strong>{displayEmail(user.email)}</strong><div className={styles.methodPills}>{!user.email.endsWith(".invalid") && <span>邮箱</span>}{user.email.includes("@wechat.") && <span>微信</span>}{user.phoneNumberVerified && <span>手机</span>}</div></div></td>
                  <td><span className={styles.rolePill} data-role={user.role ?? "user"}>{user.role === "admin" ? "管理员" : "用户"}</span></td>
                  <td><span className={styles.userStatus} data-status={user.banned ? "banned" : "active"}>{user.banned ? "已停用" : "正常"}</span></td>
                  <td>{new Date(user.createdAt).toLocaleDateString("zh-CN")}</td>
                  <td><div className={styles.rowActions}><button type="button" disabled={busy === user.id || user.id === currentUserId} onClick={() => void setRole(user, user.role === "admin" ? "user" : "admin")}><UserCog size={14} /> {user.role === "admin" ? "降为用户" : "设为管理员"}</button><button type="button" data-danger={!user.banned} disabled={busy === user.id || user.id === currentUserId} onClick={() => void toggleBan(user)}>{user.banned ? <ShieldCheck size={14} /> : <Ban size={14} />}{user.banned ? "恢复" : "停用"}</button></div></td>
                </tr>
              ))}</tbody></table></div>
            ) : <div className={styles.panelEmpty}><UsersRound size={23} /> 没有匹配的用户</div>}
          </section>

          <div className={styles.pagination}><button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /> 上一页</button><span>第 {page + 1} / {totalPages} 页</span><button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页 <ChevronRight size={15} /></button></div>
        </div>
      </section>
      <SiteFooter variant="workspace" />
    </main>
  );
}

function AdminState({ loading = false }: { loading?: boolean }) {
  return <main className={styles.page}><SiteHeader variant="workspace" title="用户管理" /><section className={styles.adminState}>{loading ? <LoaderCircle className={styles.spin} size={28} /> : <ShieldOff size={34} />}<h1>{loading ? "正在验证管理权限" : "无权访问"}</h1>{!loading && <><p>请使用管理员账号登录后再访问用户管理。</p><Link className="button button-primary" href="/auth/login?returnTo=%2Fadmin%2Fusers">管理员登录</Link></>}</section></main>;
}

function displayEmail(email: string) { return email.endsWith(".invalid") ? "受保护的第三方标识" : email; }
