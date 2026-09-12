import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-simple">
        <div>
          <Brand />
          <p>让每一段真实经历，被好好看见。</p>
        </div>
        <nav aria-label="页脚导航">
          <Link href="/dashboard">我的简历</Link>
          <Link href="/dashboard?new=1">创建简历</Link>
          <Link href="/pricing">定价与简迹点</Link>
          <Link href="/pricing/methodology">计费说明</Link>
          <Link href="/privacy">隐私与 AI 说明</Link>
          <Link href="/terms">用户协议</Link>
        </nav>
        <span>© 2026 简迹 CV</span>
      </div>
    </footer>
  );
}
