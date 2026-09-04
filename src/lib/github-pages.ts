import { strToU8, zipSync } from "fflate";
import { toStandaloneHtml, type WebResumeOptions } from "@/lib/web-resume";
import type { ResumeRecord } from "@/types/resume";

export function toGitHubPagesBundle(resume: ResumeRecord, options: WebResumeOptions = {}) {
  const html = toStandaloneHtml(resume, { ...options, variant: options.variant ?? "interactive" });
  const guide = `# ${resume.title} · GitHub Pages 发布包

这个压缩包由简迹 CV 在你的浏览器中生成，平台没有读取或修改你的 GitHub 仓库。

## 发布步骤

1. 在 GitHub 新建一个公开仓库（例如 \`resume\`）。
2. 解压本包，把 \`index.html\` 和 \`.nojekyll\` 上传到仓库根目录并提交。
3. 打开仓库 Settings → Pages，在 Build and deployment 中选择 “Deploy from a branch”，再选择主分支和根目录，点击 Save。
4. 等待发布完成后，在同一页面点击 Visit site，检查对外访问效果。

发布前，请检查页面中的联系方式和敏感内容；只上传准备公开的页面，不要上传原始资料或 JSON 备份。公开网页可能被搜索、缓存或转存。

参见 [GitHub 官方发布说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
`;
  return zipSync({
    "index.html": strToU8(html),
    ".nojekyll": new Uint8Array(),
    "发布说明.md": strToU8(guide),
  }, { level: 6 });
}
