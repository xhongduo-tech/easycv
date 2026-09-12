import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { Brand } from "@/components/brand";
import { AccountMenu } from "@/components/account-menu";

export function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <div className="header-identity"><Brand />{minimal && <span className="header-description">个人材料工作室</span>}</div>
        <div className="header-actions">
          <Link className="button button-ghost header-dashboard" href="/dashboard" aria-label="我的简历">
            <FileText size={17} aria-hidden="true" />
            <span>我的简历</span>
          </Link>
          <Link className="header-pricing" href="/pricing">定价</Link>
          <div className="header-account"><AccountMenu compact={!minimal} /></div>
          <Link className={`button ${minimal ? "button-secondary" : "button-primary"}`} href="/dashboard?new=1">
            创建简历 <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
