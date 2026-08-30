import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "隐私与 AI 说明",
  description: "简迹 CV 的数据使用、保存与智能建议原则。",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <SiteHeader />
      <header className={styles.hero}>
        <div className="shell">
          <p className="eyebrow">隐私与 AI 说明</p>
          <h1>你的经历属于你，建议不能越过事实。</h1>
          <p>本页描述当前演示版本的实际行为，以及接入真实用户和第三方模型前必须完成的保护措施。更新于 2026-08-30。</p>
        </div>
      </header>
      <div className={`shell ${styles.content}`}>
        <aside>
          <a href="#current">当前版本</a>
          <a href="#storage">数据保存</a>
          <a href="#ai">智能建议</a>
          <a href="#rights">用户权利</a>
        </aside>
        <article className={styles.article}>
          <section id="current">
            <h2>当前演示版本</h2>
            <p>当前应用为每个浏览器创建随机、HttpOnly 的私有访客会话，并在服务端校验简历所有权。清除 Cookie 后可能无法重新访问原草稿；请勿填写身份证件、详细住址、健康、财务等非必要高度敏感信息。</p>
          </section>
          <section id="storage">
            <h2>数据保存</h2>
            <ul>
              <li>简历正文、目标、模板与修订号保存在平台 D1 数据库，而不是只留在本地设备。</li>
              <li>每次保存生成版本快照，用于并发冲突判断和后续恢复能力。</li>
              <li>当前删除采用软删除；正式上线前需补充可验证的账号导出、彻底删除与保留期限。</li>
              <li>普通日志不记录完整 CV 或联系方式。</li>
            </ul>
          </section>
          <section id="ai">
            <h2>智能建议</h2>
            <div className={styles.notice}>
              <strong>当前不会把 CV 发送给第三方 AI。</strong>
              <p>正文会发送到本平台 API，由确定性规则检查；只有你主动点击时才会把草稿追加到对应经历，原文会保留。</p>
            </div>
            <p>未来接入外部模型前，产品必须说明发送的数据、接收方、用途和保留方式，并在传输前获得用户明确同意。</p>
          </section>
          <section id="rights">
            <h2>用户权利</h2>
            <p>生产版本应支持查看、导出、更正、删除个人数据，以及撤回 AI 使用同意。涉及中国与海外用户时，需在真实数据进入系统前完成个人信息保护法、GDPR 及跨境传输专项法律评估。</p>
          </section>
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}
