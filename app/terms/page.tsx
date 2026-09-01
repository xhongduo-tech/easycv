import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "用户协议", description: "简迹 CV 演示版本的使用边界与责任说明。" };

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <SiteHeader />
      <header className={styles.hero}><div className="shell"><p className="eyebrow">用户协议</p><h1>帮助你表达真实经历，不替你做真实性承诺。</h1><p>这是产品开发阶段的演示协议，不构成针对特定申请、招聘、学习选择或法律事项的专业意见。更新于 2026-09-01。</p></div></header>
      <div className={`shell ${styles.content}`}>
        <aside><a href="#scope">服务范围</a><a href="#account">账号安全</a><a href="#pricing">定价与简迹点</a><a href="#content">内容责任</a><a href="#targets">目标资料</a><a href="#publishing">输出与学习提示</a><a href="#admin">管理员边界</a></aside>
        <article className={styles.article}>
          <section id="scope"><h2>服务范围</h2><p>简迹提供账号与访客空间、简历结构、模板、编辑、目标化建议、保存、PDF / 网页输出，以及编辑器内的可选学习提示。系统不承诺录取、录用、面试、证书认可、学分转换或任何特定结果。</p></section>
          <section id="account"><h2>账号与安全</h2><ul><li>用户应妥善保管密码、邮箱、手机号和第三方登录账号，并及时撤销不认识的设备会话。</li><li>不得批量注册、冒用他人身份、绕过验证码或限流，也不得用短信与邮件接口骚扰他人。</li><li>账号删除为不可恢复操作；已由用户自行下载、分享或发布到外部平台的副本不受账号删除控制。</li></ul></section>
          <section id="pricing"><h2>定价与简迹点</h2><ul><li>简历创建、编辑、模板、基础分析及现有导出能力免费；成功的 DeepSeek 增强请求根据实际输入、缓存命中和输出 Token 折算简迹点，而不是按消息次数固定扣点。</li><li>系统在发送前冻结本次最高点数，成功后按实际用量结算并自动退回差额；最终扣点不会超过发送前显示的上限。模型超时、网络或供应商失败、并发繁忙、内容超限、整体结果未通过结构校验或回退基础分析时不扣点。</li><li>简迹采用公开、固定版本的成本价格表和整数向上取整规则。完整公式、示例、当前版本和供应商价格来源见<Link href="/pricing/methodology">计费说明与计算方案</Link>。供应商价格变化只影响未来公布的新版本，不追溯已结算请求。</li><li>点数包为一次性购买，不自动续费；已购点数自到账起 12 个月有效。访客赠点随访客空间存在，注册启动赠点当前不设使用期限。</li><li>当前仅开放免费赠送点数，支付通道尚未启用。正式收款前会另行公布支付服务商、退款、发票和订单争议规则，不会把页面选择伪装成付款成功。</li></ul></section>
          <section id="content"><h2>内容责任</h2><ul><li>用户应核实姓名、成绩、学校、经历、奖项和所有量化结果。</li><li>不得使用产品伪造材料、冒充他人或侵犯第三方权益。</li><li>智能建议只是草稿，接受前应审阅事实与语言。</li></ul></section>
          <section id="targets"><h2>院校与企业资料</h2><p>本平台展示的企业或机构名称，以及经权利审查后展示的标识，仅用于帮助用户识别和选择目标单位。相关商标、标识和名称均归各自权利人所有。除非另有明确书面说明，简迹 CV 与所列企业或机构不存在任何隶属、合作、代理、赞助、认证、授权或背书关系。</p><p>目标画像、岗位分析、版式推荐和简历建议均为独立、非官方的编辑参考，不代表相关企业或机构的招聘标准、意见或录用承诺。用户仍应核对具体项目官网或招聘公告；如权利人认为展示不当，可通过本站公布的联系渠道提出处理请求。</p></section>
          <section id="publishing"><h2>输出与可选学习提示</h2><ul><li>用户自行决定是否把网页简历发布到 GitHub Pages 或其他静态托管服务，并对公开内容、站点权限与后续删除负责。</li><li>学习提示只在编辑器发现相关证据缺口时展示，不代表课程平台、院校或雇主背书。</li><li>资源内容、费用、可用性、考试及证书政策以提供方官方页面为准；未完成内容不得写成已取得证书。</li></ul></section>
          <section id="admin"><h2>管理员能力边界</h2><div className={styles.notice}><strong>产品管理员不拥有宿主电脑控制权。</strong><p>用户角色与内容管理权限由服务端校验；它们必须与服务器 Shell、云账号和数据库运维权限隔离。高风险运维使用独立 IAM、MFA、临时授权和完整审计。</p></div></section>
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}
