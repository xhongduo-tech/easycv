import Link from "next/link";
import { Brand } from "@/components/brand";
import { HeaderActions, HeaderMobileNavigation } from "@/components/site-header-actions";
import styles from "./site-header.module.css";

export type SiteHeaderVariant = "marketing" | "workspace";

const marketingLinks = [
  { href: "/#opportunities", label: "产品介绍" },
  { href: "/#templates", label: "简历版式" },
  { href: "/pricing", label: "价格说明" },
];

export function SiteHeader({ variant = "marketing", title = "我的简历" }: {
  variant?: SiteHeaderVariant;
  title?: string;
}) {
  return (
    <header className={`site-header ${styles.header}`} data-site-header={variant}>
      <div className={`shell ${styles.inner}`}>
        <div className={styles.identity}>
          <Brand />
          {variant === "workspace" && (
            <nav className={styles.location} aria-label="当前位置">
              {title !== "我的简历" && <><Link href="/dashboard">我的简历</Link><span className={styles.divider} aria-hidden="true">/</span></>}
              <span aria-current="page">{title}</span>
            </nav>
          )}
        </div>
        {variant === "marketing" && <>
          <nav className={styles.navigation} aria-label="产品导航">
            {marketingLinks.map(({ href, label }) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
          <HeaderMobileNavigation links={marketingLinks} />
        </>}
        <HeaderActions variant={variant} />
      </div>
    </header>
  );
}
