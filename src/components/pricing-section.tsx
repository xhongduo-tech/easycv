import Link from "next/link";
import { Check, Coins, ShieldCheck, Sparkles } from "lucide-react";
import {
  CHECKOUT_AVAILABLE,
  publicCreditPacks,
  PURCHASE_CREDIT_VALIDITY_DAYS,
  SIGNUP_AI_CREDITS,
} from "@/lib/pricing";
import styles from "./pricing-section.module.css";

export function PricingSection({
  compact = false,
  headingLevel = "h2",
}: {
  compact?: boolean;
  headingLevel?: "h1" | "h2";
}) {
  const packs = publicCreditPacks();
  const Heading = headingLevel;
  return (
    <section className={`${styles.section} ${compact ? styles.compact : ""}`} id="pricing" aria-labelledby="pricing-heading">
      <div className="shell">
        <header className={styles.heading}>
          <div>
            <p className="eyebrow">简单、透明的定价</p>
            <Heading id="pricing-heading">基础功能免费，增强优化按次使用。</Heading>
          </div>
          <p>不订阅、不自动续费。只有 DeepSeek 生成有效分析并在服务端完成结算，才消耗 1 次额度；可应用草稿还会单独经过事实安全检查。</p>
        </header>

        <article className={styles.freeBand}>
          <span className={styles.freeIcon}><ShieldCheck size={22} aria-hidden="true" /></span>
          <div>
            <span>永久免费</span>
            <h3>先把简历完整做好，再决定是否使用增强优化</h3>
            <p>简历创建与编辑、16 套模板、目标画像、JD 证据地图、基础检查，以及 PDF / ATS 文本 / 网页导出均免费且无水印。</p>
          </div>
          <div className={styles.freeAction}>
            <strong>¥0</strong>
            <Link className="button button-dark" href="/dashboard?new=1">免费开始</Link>
          </div>
        </article>

        <div className={styles.packIntro}>
          <div><Sparkles size={17} aria-hidden="true" /><strong>增强优化额度包</strong></div>
          <span>注册并验证登录身份后赠 {SIGNUP_AI_CREDITS} 次 · 无需绑卡</span>
        </div>
        <div className={styles.packGrid}>
          {packs.map((pack) => (
            <article key={pack.id} className={pack.id === "standard" ? styles.featured : ""}>
              <div className={styles.packTop}>
                <h3><Coins size={17} aria-hidden="true" />{pack.name}</h3>
                {pack.badge && <small>{pack.badge}</small>}
              </div>
              <div className={styles.priceLine}>
                <strong>{pack.priceLabel}</strong>
                <span>一次性价格</span>
              </div>
              <div className={styles.creditCount}>{pack.credits}<span>次增强优化</span></div>
              <p>{pack.description}</p>
              <div className={styles.unitLine}>
                <span>{pack.unitPriceLabel}</span>
                {pack.savingPercent > 0 && <strong>比轻量包省 {pack.savingPercent}%</strong>}
              </div>
              <ul>
                <li><Check size={14} />每次含评分、建议与最多 3 条草稿</li>
                <li><Check size={14} />失败、超时或回退基础分析不扣</li>
                <li><Check size={14} />购买额度 {Math.round(PURCHASE_CREDIT_VALIDITY_DAYS / 30)} 个月有效</li>
              </ul>
              {CHECKOUT_AVAILABLE ? (
                <Link className="button button-primary" href={`/account?pack=${pack.id}#credits`}>选择 {pack.name}</Link>
              ) : (
                <span className={styles.pending}>价格已锁定 · 支付通道接入中</span>
              )}
            </article>
          ))}
        </div>
        <p className={styles.rule}><ShieldCheck size={15} />1 次额度 = 1 次成功的 DeepSeek 章节优化或定向改写；修改内容后重新生成会再次计 1 次。</p>
      </div>
    </section>
  );
}
