import Link from "next/link";
import { ArrowUpRight, LayoutDashboard } from "lucide-react";
import { Brand } from "@/components/brand";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="主导航">
          <Link href="/explore?track=study">
            留学申请
          </Link>
          <Link href="/explore?track=career">
            毕业求职
          </Link>
          <Link href="/explore">开始创建</Link>
          <Link href="/growth">成长路线</Link>
          <Link href="/web-resume">网页简历</Link>
          <Link href="/#how-it-works">使用指南</Link>
        </nav>
        <div className="header-actions">
          <Link className="button button-ghost header-dashboard" href="/dashboard">
            <LayoutDashboard size={17} aria-hidden="true" />
            工作台
          </Link>
          <Link className="button button-primary" href="/explore">
            免费创建
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <details className="mobile-menu">
            <summary aria-label="打开导航">
              <span />
              <span />
              <span />
            </summary>
            <div className="mobile-menu-panel">
              <Link href="/explore?track=study">留学申请</Link>
              <Link href="/explore?track=career">毕业求职</Link>
              <Link href="/explore">开始创建</Link>
              <Link href="/growth">成长路线</Link>
              <Link href="/web-resume">网页简历</Link>
              <Link href="/dashboard">我的工作台</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
