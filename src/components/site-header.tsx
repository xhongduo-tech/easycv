import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { Brand } from "@/components/brand";
import { AccountMenu } from "@/components/account-menu";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <div className="header-actions">
          <Link className="button button-primary" href="/dashboard?new=1">
            创建简历
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <Link className="button button-ghost header-dashboard" href="/dashboard">
            <FileText size={17} aria-hidden="true" />
            我的简历
          </Link>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
