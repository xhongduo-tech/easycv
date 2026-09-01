import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Calculator, CheckCircle2, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DEEPSEEK_INPUT_TOKEN_UPPER_BOUND, DEEPSEEK_MAX_OUTPUT_TOKENS } from "@/lib/deepseek-advisor";
import {
  AI_CREDIT_PACKS,
  AI_POINT_BILLING_VERSION,
  AI_POINT_COST_ALLOWANCE_MICROS,
  CHECKOUT_AVAILABLE,
  DEEPSEEK_PRICE_VERSION,
  GUEST_AI_TRIALS,
  SIGNUP_AI_CREDITS,
  calculateAiPointCharge,
  estimateDeepSeekCostMicros,
  publicCreditPacks,
  type ModelTokenUsage,
} from "@/lib/pricing";
import styles from "./methodology.module.css";

export const metadata: Metadata = {
  title: "简迹点计费说明与计算方案",
  description: "了解简迹点如何根据 DeepSeek 实际输入、缓存与输出 Token 结算，以及预留上限、失败返还和阶梯价格规则。",
};

const examples: Array<{ name: string; usage: ModelTokenUsage }> = [
  { name: "简单修改", usage: { inputTokens: 4_000, cachedInputTokens: 0, outputTokens: 500 } },
  { name: "章节优化", usage: { inputTokens: 8_000, cachedInputTokens: 0, outputTokens: 2_200 } },
  {
    name: "单次处理上限",
    usage: {
      inputTokens: DEEPSEEK_INPUT_TOKEN_UPPER_BOUND,
      cachedInputTokens: 0,
      outputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
    },
  },
];

export default function PricingMethodologyPage() {
  const packs = publicCreditPacks();
  const cheapestPointYuan = Math.min(
    ...AI_CREDIT_PACKS.map((pack) => pack.priceFen / 100 / pack.credits),
  );
  const modelMarginFloor = (1 - AI_POINT_COST_ALLOWANCE_MICROS / 1_000_000 / cheapestPointYuan) * 100;

  return (
    <main className={styles.page}>
      <SiteHeader />
      <header className={styles.hero}>
        <div className="shell">
          <Link className={styles.back} href="/pricing"><ArrowLeft size={15} />返回定价</Link>
          <p className="eyebrow">计费说明与计算方案</p>
          <h1>每一点为什么扣，<span>都算得清楚。</span></h1>
          <p>简迹不按消息次数收费。成功的 DeepSeek 请求根据实际输入、缓存命中和输出 Token 折算简迹点；发送前显示最高消耗，完成后按实际用量结算。</p>
          {!CHECKOUT_AVAILABLE && <div className={styles.pending}><ShieldCheck size={17} />当前仅开放赠送点数，支付通道尚未启用。</div>}
        </div>
      </header>

      <div className={`shell ${styles.layout}`}>
        <aside aria-label="本页目录">
          <a href="#principle">计费原则</a>
          <a href="#formula">计算公式</a>
          <a href="#examples">计算示例</a>
          <a href="#reservation">预留与返还</a>
          <a href="#packs">套餐与折扣</a>
          <a href="#free">免费范围</a>
          <a href="#version">版本与边界</a>
        </aside>

        <article className={styles.article}>
          <section id="principle">
            <p className="eyebrow">01 · 计费原则</p>
            <h2>按实际资源用量，不按问题个数。</h2>
            <div className={styles.principles}>
              <div><CheckCircle2 size={18} /><span><strong>只为成功结果付点</strong>超时、失败、繁忙、超限或回退基础分析不扣点。</span></div>
              <div><CheckCircle2 size={18} /><span><strong>简单请求自然更少</strong>短输入、短输出通常消耗 1 点，完整优化按实际用量增加。</span></div>
              <div><CheckCircle2 size={18} /><span><strong>不会临时涨价</strong>使用固定峰值价格版本，不把峰谷时段波动转嫁给用户。</span></div>
            </div>
          </section>

          <section id="formula">
            <p className="eyebrow">02 · 计算公式</p>
            <h2>先计算成本基准，再折算整数点数。</h2>
            <p>当前仅对 DeepSeek V4 Flash 文本模型开放计费。成本基准采用公开峰值价格：缓存未命中输入 ¥3 / 百万 Token、缓存命中输入 ¥0.10 / 百万 Token、输出 ¥9 / 百万 Token。</p>
            <div className={styles.formula}><Calculator size={21} /><code>成本基准 = 未缓存输入 × 3 / 1,000,000 + 缓存输入 × 0.1 / 1,000,000 + 输出 × 9 / 1,000,000</code></div>
            <div className={styles.formula}><Calculator size={21} /><code>消耗点数 = max(1, ceil(成本基准 ÷ ¥{(AI_POINT_COST_ALLOWANCE_MICROS / 1_000_000).toFixed(3)}))</code></div>
            <p className={styles.note}>“成本基准”是简迹固定计费表，不等同于供应商某一时段的实时发票。缓存命中会降低用量成本，峰谷时段不会造成同样 Token 数临时涨价。</p>
          </section>

          <section id="examples">
            <p className="eyebrow">03 · 计算示例</p>
            <h2>从一句修改到完整优化，扣点不同。</h2>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>使用情况</th><th>输入 Token</th><th>输出 Token</th><th>成本基准</th><th>简迹点</th></tr></thead>
                <tbody>{examples.map((example) => {
                  const costMicros = estimateDeepSeekCostMicros("deepseek-v4-flash", example.usage);
                  return <tr key={example.name}>
                    <td>{example.name}</td>
                    <td>{example.usage.inputTokens.toLocaleString("zh-CN")}</td>
                    <td>{example.usage.outputTokens.toLocaleString("zh-CN")}</td>
                    <td>约 ¥{(costMicros / 1_000_000).toFixed(4)}</td>
                    <td><strong>{calculateAiPointCharge("deepseek-v4-flash", example.usage)} 点</strong></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className={styles.note}>示例按缓存未命中计算；实际有缓存命中时，成本基准和最终扣点可能更低。单次请求的服务端硬上限为 {DEEPSEEK_INPUT_TOKEN_UPPER_BOUND.toLocaleString("zh-CN")} 输入 Token 与 {DEEPSEEK_MAX_OUTPUT_TOKENS.toLocaleString("zh-CN")} 输出 Token。</p>
          </section>

          <section id="reservation">
            <p className="eyebrow">04 · 预留与返还</p>
            <h2>先冻结上限，成功后多退。</h2>
            <ol>
              <li>系统根据最终发送内容和最大输出长度计算本次最高点数。</li>
              <li>发送前只冻结这个上限，冻结不等于最终消费。</li>
              <li>DeepSeek 返回后，根据可信的实际 Token 用量计算最终点数。</li>
              <li>未使用的冻结点数在同一次账务结算中自动退回。</li>
              <li>最终扣点绝不超过发送前显示的上限；失败请求全额返还。</li>
            </ol>
          </section>

          <section id="packs">
            <p className="eyebrow">05 · 套餐与折扣</p>
            <h2>多买更便宜，但计费公式不变。</h2>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>点数包</th><th>点数</th><th>价格</th><th>每点价格</th><th>相对轻量包</th></tr></thead>
                <tbody>{packs.map((pack) => <tr key={pack.id}>
                  <td>{pack.name}</td><td>{pack.credits.toLocaleString("zh-CN")}</td><td>{pack.priceLabel}</td><td>{pack.unitPriceLabel}</td><td>{pack.savingPercent ? `省 ${pack.savingPercent}%` : "基准"}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p>最低每点售价约 ¥{cheapestPointYuan.toFixed(4)}，每点允许承载的模型成本为 ¥{(AI_POINT_COST_ALLOWANCE_MICROS / 1_000_000).toFixed(3)}，因此最优惠套餐仍保留约 {modelMarginFloor.toFixed(1)}% 的模型毛利空间。它还需覆盖免费赠点、失败调用、托管、数据库、支付、税费、安全、客服和持续开发，并不等同于净利润率。</p>
          </section>

          <section id="free">
            <p className="eyebrow">06 · 免费范围</p>
            <h2>基础简历能力继续免费。</h2>
            <p>创建、编辑、自动保存、16 套模板、目标画像、JD 证据地图、基础规则检查，以及 PDF、ATS 文本和网页导出均不消耗简迹点。访客赠送 {GUEST_AI_TRIALS} 点；注册并验证登录身份后另赠 {SIGNUP_AI_CREDITS} 点，无需绑卡。</p>
          </section>

          <section id="version">
            <p className="eyebrow">07 · 版本与边界</p>
            <h2>价格变化不会悄悄追溯。</h2>
            <ul>
              <li>简迹点规则版本：<code>{AI_POINT_BILLING_VERSION}</code></li>
              <li>DeepSeek 峰值价格版本：<code>{DEEPSEEK_PRICE_VERSION}</code></li>
              <li>本页更新时间：2026-09-01</li>
              <li>供应商价格调整时，只更新未来请求的计费版本，不追溯已结算记录。</li>
            </ul>
            <p>价格来源：<a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/" target="_blank" rel="noreferrer">DeepSeek 官方定价说明</a>。本页解释计算方法，具体服务边界以<Link href="/terms">用户协议</Link>和<Link href="/privacy">隐私与 AI 说明</Link>为准。</p>
          </section>
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}
