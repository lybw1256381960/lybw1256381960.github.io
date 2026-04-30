# lybw1256381960.github.io
# 林韦婧个人主页

这是林韦婧的专业个人网站，定位为「广东工业大学工业设计工程25级学生 / 服务设计与用户研究方向」的在线作品集。网站基于 GitHub Pages 静态部署，采用高级蓝绿色弥散风视觉系统，展示教育背景、实践经历、能力结构、项目作品、荣誉成果与联系方式。

## 技术栈

- HTML5：语义化结构、SEO 元数据、Open Graph、JSON-LD Person 结构化数据
- CSS3：响应式 Grid/Flex 布局、蓝绿色弥散背景、毛玻璃质感、无障碍焦点态、微动效
- JavaScript：移动端导航、滚动显隐、当前导航高亮、mailto 联系表单
- 媒体资源：从考研作品集 PDF 中导出并压缩头像、封面与项目缩略图

## 内容结构与数据规划

| 模块 | 已填充数据点 | SEO/体验处理 |
| --- | --- | --- |
| Hero | 姓名、当前身份、研究方向、核心定位、作品集入口 | 使用 `h1` 承载核心关键词，提供 PDF 作品集外链 |
| 关于我 | 个人简介、设计理念、研究兴趣、核心关注方向 | 以段落和标签组织，突出服务设计与用户研究 |
| 教育背景 | 广东工业大学工业设计工程25级、福建理工大学产品设计本科、绩点与排名、主修课程 | 使用时间线结构，保留准确起止日期 |
| 实践经历 | 厦门新锐创意电子科技有限公司产品外观设计、院学生会执行主席 | 使用列表描述职责与成果 |
| 技能专长 | 用户研究、服务设计、产品与交互表达、软件工具、数字服务与协作 | 将软件熟练度从作品集转换为可读标签 |
| 项目作品 | 竹构美好、第二次生命、麦卦、穿膛蜂炮射无人机 | 每个项目包含名称、方向标签、简介、角色/方法/成果、优化后的项目图 |
| 荣誉成果 | ODA 东方设计奖、华夏奖、中国包装创意设计大赛、奖学金、RCCSE 核心期刊收录 | 以卡片呈现时间、奖项与成果 |
| 联系方式 | 邮箱、电话、微信、GitHub、PDF 作品集 | 外部链接使用 `target="_blank"` 与 `rel="noopener noreferrer"` |

## 项目结构

```text
lybw1256381960.github.io/
├── index.html
├── styles.css
├── script.js
├── README.md
└── assets/
    ├── lin-weijing-portfolio.pdf
    ├── lwj-avatar.jpg
    ├── portfolio-cover.jpg
    ├── project-bamboo-service.jpg
    ├── project-second-life.jpg
    ├── project-maigua-nfc.jpg
    └── project-drone-service.jpg
```

## 本地预览

这个网站是纯静态页面，可直接打开 `index.html` 预览。也可以在仓库根目录启动任意静态服务器：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 部署

仓库推送到 GitHub 后，可通过 GitHub Pages 部署：

1. 进入仓库 `Settings`。
2. 打开 `Pages`。
3. Source 选择 `main` 分支和根目录。
4. 等待部署完成后访问 `https://lybw1256381960.github.io/`。

## 维护说明

- 页面内容主要维护在 `index.html`。
- 视觉系统主要维护在 `styles.css` 的 `:root` 变量和各模块样式。
- 表单和导航交互维护在 `script.js`。
- 如需替换作品集图片，建议导出为 JPG/WebP，并保持单张图片在 150KB 左右以保证加载速度。
