import Link from "next/link";
import { ArrowUpRight, FileText, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="主导航">
          <span><Sparkles size={14} aria-hidden="true" /> AI 简历助手</span>
        </nav>
        <div className="header-actions">
          <Link className="button button-ghost header-dashboard" href="/dashboard">
            <FileText size={17} aria-hidden="true" />
            我的简历
          </Link>
          <Link className="button button-primary" href="/dashboard?new=1">
            创建简历
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
