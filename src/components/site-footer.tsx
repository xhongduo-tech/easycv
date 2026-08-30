import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <Brand />
          <p>让每一段经历，都能抵达对的下一站。</p>
          <span>© 2026 简迹 CV</span>
        </div>
        <div>
          <h3>创建简历</h3>
          <Link href="/explore?track=study">留学申请 CV</Link>
          <Link href="/explore?track=career">毕业求职 CV</Link>
          <Link href="/explore">浏览全部模板</Link>
        </div>
        <div>
          <h3>产品</h3>
          <Link href="/dashboard">个人工作台</Link>
          <Link href="/growth">成长路线建议</Link>
          <Link href="/web-resume">GitHub 网页简历</Link>
          <Link href="/privacy">隐私与 AI 说明</Link>
          <Link href="/terms">用户协议</Link>
        </div>
        <div className="footer-cta">
          <span>准备好了吗？</span>
          <h3>从目标出发，写一份真正匹配的 CV。</h3>
          <Link className="footer-link" href="/explore">
            开始创建 <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
