import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileCheck2, Gauge, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import { PricingSection } from "@/components/pricing-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { GUEST_AI_TRIALS, SIGNUP_AI_CREDITS } from "@/lib/pricing";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "定价",
  description: "简历编辑与导出永久免费，DeepSeek 增强优化按实际 Token 用量折算简迹点，不订阅、不自动续费。",
};

const freeCapabilities = [
  "创建、编辑与自动保存简历",
  "16 套专业模板与实时 A4 预览",
  "院校、企业与岗位目标画像",
  "JD 证据地图与基础规则检查",
  "PDF、ATS 文本与网页简历导出",
  "事实安全门与逐条确认修改",
];

export default function PricingPage() {
  return (
    <main className={styles.page}>
      <SiteHeader />
      <PricingSection headingLevel="h1" />

      <section className={styles.explain}>
        <div className="shell">
          <header><p className="eyebrow">为什么这样收费</p><h2>简单请求少扣，复杂请求按实际用量结算。</h2></header>
          <div className={styles.reasonGrid}>
            <Reason icon={WalletCards} title="不做订阅" text="求职和申请有明显的阶段性。简迹点不会按月自动扣款，也不会因为忘记取消而产生下一期费用。" />
            <Reason icon={Gauge} title="按实际用量" text="成功请求按输入、缓存命中与输出 Token 折算简迹点；不会因为一句简单修改和一次完整优化都算同样价格。" />
            <Reason icon={RefreshCcw} title="多买更便宜" text="大点数包降低支付、服务和容量规划的边际成本，因此把节省直接反映到每点单价中。" />
          </div>
        </div>
      </section>

      <section className={styles.freeDetails}>
        <div className={`shell ${styles.freeGrid}`}>
          <div>
            <p className="eyebrow">免费层不是试用品</p>
            <h2>不用简迹点，也能完成并导出一份专业简历。</h2>
            <p>我们只对额外的模型生成收费，避免把最基础的求职工具锁在付费墙后。</p>
            <Link className="button button-primary" href="/dashboard?new=1">免费创建简历 <ArrowRight size={16} /></Link>
          </div>
          <ul>{freeCapabilities.map((item) => <li key={item}><CheckCircle2 size={17} />{item}</li>)}</ul>
        </div>
      </section>

      <section className={styles.faq}>
        <div className="shell">
          <header><p className="eyebrow">简迹点规则</p><h2>购买前，先把关键边界说清楚。</h2></header>
          <div className={styles.faqGrid}>
            <Faq question="简迹点怎样计算？">成功请求按 DeepSeek 返回的实际输入、缓存输入和输出 Token，以固定峰值价格表计算成本基准，再除以每点 ¥0.034 的成本额度并向上取整，最低 1 点。<br /><Link href="/pricing/methodology">查看完整公式、示例与版本说明</Link></Faq>
            <Faq question="哪些情况不会扣点？">模型超时、网络失败、内容过大、并发繁忙、供应商拒绝、整体结果未通过结构校验，以及透明回退到基础分析时都不扣点。个别草稿未通过事实检查时会替换为安全写作框架，但有效的模型评分与建议仍按实际用量结算。</Faq>
            <Faq question="免费赠送多少点？">访客态赠送 {GUEST_AI_TRIALS} 简迹点且不结转；注册并验证登录身份后，账户固定另获 {SIGNUP_AI_CREDITS} 简迹点。同一身份 730 天内只能领取一次；免费编辑、基础分析与导出不消耗简迹点。</Faq>
            <Faq question="点数会自动续费吗？">不会。所有点数包都是一次性购买，不绑定订阅。付费点数自到账起 12 个月有效，页面会明确显示到期日。</Faq>
            <Faq question="发送前为什么显示一个上限？">模型输出长度无法事先精确知道。系统先冻结按当前内容计算的最高点数，完成后按实际 Token 结算并退回差额；绝不会超过发送前确认的上限。</Faq>
            <Faq question="Codex 材料任务也消耗简迹点吗？">目前为限额试点，开启后不扣简迹点，每日可创建的任务数以工作台显示为准。这里的 Token 折点规则适用于 DeepSeek 章节优化。后续如调整收费，会在启动任务前说明。</Faq>
            <Faq question="现在可以付款吗？">套餐与计费规则已经锁定，免费赠点已开放。支付通道需完成商户与回调配置后才会开放；当前不会收款，也不会制造虚假的购买成功状态。</Faq>
          </div>
          <div className={styles.trustNote}><ShieldCheck size={18} /><span><strong>隐私规则不因付费改变。</strong> 只有你主动启用增强优化时，经过脱敏的必要内容才会发送给 DeepSeek。</span><Link href="/privacy">查看隐私与 AI 说明</Link></div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function Reason({ icon: Icon, title, text }: { icon: typeof FileCheck2; title: string; text: string }) {
  return <article><span><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>;
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return <details><summary>{question}<span aria-hidden="true">＋</span></summary><p>{children}</p></details>;
}
