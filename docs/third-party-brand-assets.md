# 第三方品牌资产台账

更新日期：2026-08-31

本台账约束简迹 CV 在“目标企业选择”场景中使用第三方企业标识。企业名称可用于准确指称用户选择的目标单位；图形 Logo 只有在权利证据明确覆盖当前商业 Web 产品场景后，才能进入 `approvedTargetBrandAssets` 白名单。

## 准入规则

每个获准资产必须同时满足以下条件：

1. 素材来自企业官方网站、官方品牌中心或权利人直接提供的文件；
2. 存在书面许可，或官方公开条款明确允许在商业 Web 产品的单位选择/目录场景中展示；
3. 台账记录目标 ID、原始来源、适用条款、允许场景、署名要求、审核日期、到期日（如有）与 SHA-256；
4. 文件本地存放于 `public/brands/targets/`，不从运行时 Logo 聚合服务或未知 CDN 拉取；
5. 保持官方比例、颜色和留白，不裁切、不重绘、不添加滤镜，动画只作用于承载卡片；
6. 企业名称始终与标识相邻，不使用“合作企业”“官方适配”“企业认可”等会造成关联误解的文案；
7. 许可缺失、过期、范围不清或图片加载失败时，必须回退为非品牌色的中性字标。

## 当前白名单

暂无。现有 85 个求职目标均使用中性字标；代码不会加载第三方 Logo 文件。

## 已审查但未准入的常见来源

| 来源 | 审查结论 | 处理方式 |
| --- | --- | --- |
| [Simple Icons LICENSE](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md) / [免责声明](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md) | 项目 CC0 不代表每个品牌标识已获商标许可；CC0 也不授予商标权 | 不作为统一授权来源 |
| [腾讯媒体资源](https://www.tencent.com/zh-cn/newsroom/media-resources/brand-and-usage-guides/) | 面向媒体报道，未覆盖本产品场景 | 使用中性字标 |
| [阿里巴巴 Logo 资源](https://home.alibabagroup.com/en-US/resource-logos) | 仅限合资格媒体编辑使用，其他用途需书面许可 | 使用中性字标 |
| [美团媒体资源](https://www.meituan.com/media) | 仅限个人或编辑用途 | 使用中性字标 |
| [快手素材库](https://www.kuaishou.com/official/material-lib) | 授权范围为宣传推广快手产品 | 使用中性字标 |
| [工商银行品牌规范](https://www.icbc.com.cn/ICBCLtd/%E5%85%B3%E4%BA%8E%E6%88%91%E8%A1%8C/%E9%9B%86%E5%9B%A2%E5%93%81%E7%89%8C/jcgf.htm) | 未经许可不得复制或使用标识 | 使用中性字标 |
| [华为知识产权政策](https://consumer.huawei.com/cn/legal/intellectual-property/) | Logo 使用要求事先书面许可 | 使用中性字标 |
| [Apple 商标规则](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html) | 宣传与网页使用 Logo 需要明确许可 | 使用中性字标 |
| [Microsoft 商标规则](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks) | 图形 Logo 需要明确许可 | 使用中性字标 |
| [Google 品牌规则](https://about.google/brand-resource-center/guidance/) | 未给本商业选择器提供通用 Logo 许可 | 使用中性字标 |
| [Oracle Logo 规则](https://www.oracle.com/legal/logos/) | Logo 需要书面授权 | 使用中性字标 |

## 新增资产模板

获得许可后，先补齐以下记录，再将文件和映射一并提交：

| 字段 | 内容 |
| --- | --- |
| Target ID |  |
| 本地文件 | `/brands/targets/<target-id>.svg` |
| 官方素材来源 |  |
| 品牌规范 / 许可文件 |  |
| 允许场景 |  |
| 必须署名 |  |
| 审核日期 |  |
| 到期日期 |  |
| SHA-256 |  |
| 审核人 |  |

本台账是产品发布门禁，不是法律意见。涉及新市场、Logo 墙、营销物料或付费广告时，需要重新审查使用范围。
