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
          <p>本页描述当前版本的实际行为，以及面向真实用户启用第三方模型前必须完成的保护措施。更新于 2026-08-31。</p>
        </div>
      </header>
      <div className={`shell ${styles.content}`}>
        <aside>
          <a href="#current">当前版本</a>
          <a href="#storage">数据保存</a>
          <a href="#ai">智能建议</a>
          <a href="#public">公开网页</a>
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
              <li>访客空间和建议限流只保存随机会话标识、散列后的网络标识与时间，不把完整 CV 写入用量表。</li>
              <li>选择外部模型时会保存同意版本、用途、目标简历、模型提供者与时间，不保存当次 CV 正文副本。</li>
            </ul>
          </section>
          <section id="ai">
            <h2>智能建议</h2>
            <div className={styles.notice}>
              <strong>默认不会把 CV 发送给第三方模型。</strong>
              <p>正文会发送到本平台 API 保存并进行基础检查。只有服务端已配置模型、你主动勾选“大模型”并点击优化后，本次相关简历内容与目标才会发送给模型服务商。</p>
            </div>
            <p>概览分析会从结构化字段中移除姓名、邮箱、电话、教育/经历所在地和网站链接；分章节分析只发送目标章节与必要上下文。逐条改写只允许模型处理当前选中的岗位要求与可定位原文，返回结果还会经过本地事实校验。模型请求设置为不存储响应，但服务商的数据处理仍受其协议与账号设置约束。真实用户上线前，平台还需补充撤回同意，并完成个人信息保护法/GDPR 专项评估。</p>
          </section>
          <section id="public">
            <h2>GitHub Pages 与外部学习资源</h2>
            <ul>
              <li>网页简历导出默认隐藏邮箱、电话和所在地；只有用户明确勾选后才包含这些字段。</li>
              <li>下载的 <code>index.html</code> 由用户自行上传和管理。GitHub Pages 通常公开可访问，平台无法替用户撤回已经发布的副本。</li>
              <li>编辑器中的可选学习提示只链接课程或提供方官方页面；打开外部页面后适用对方的隐私政策、Cookie 与账号规则。</li>
            </ul>
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
