---
name: 品记功能全景图
description: 用范例截图浏览品记各项功能的离线脑图文档
colors:
  green: "#344f42"
  primary-hover: "#233d2e"
  ink: "#2b342d"
  muted: "#596456"
  paper: "#fafaf7"
  field: "#fffefb"
  line: "#cbd5c6"
  structure: "#8b9c86"
  connector: "#9caf94"
  tint: "#e9eee5"
  focus: "#a75420"
typography:
  display:
    fontFamily: '"STZhongsong","华文中宋","Songti SC",serif'
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"STZhongsong","华文中宋","Songti SC",serif'
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: '"Microsoft YaHei","PingFang SC",system-ui,sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: '"Microsoft YaHei","PingFang SC",system-ui,sans-serif'
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: '"Microsoft YaHei","PingFang SC",system-ui,sans-serif'
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: '"Microsoft YaHei","PingFang SC",system-ui,sans-serif'
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  node: "4px"
  control: "5px"
  narrow-dialog: "7px"
  dialog: "10px"
spacing:
  tight: "9px"
  control-gap: "12px"
  narrow-inset: "20px"
  content-inset: "28px"
  map-gap: "34px"
  branch-gap: "42px"
  wide-inset: "48px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 17px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 17px"
  feature-node:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.node}"
    padding: "9px 12px"
  feature-node-selected:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.green}"
  search-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  shot-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  shot-tab-selected:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
---

# Design System: 品记功能全景图

## Overview

**Creative North Star: "品记的纸页"**

延续现有品记提案的深绿、暖白和中文阅读层级。真实应用截图承担功能证据，细线表达脑图的父子关系；页面本身只提供查找、展开和连续浏览。

本文件仅约束 `docs/product-map`。实际样式与行为以 `map.css`、`map.js`、`index.html` 为准；不修改正式应用或既有提案的设计系统。功能与截图对应由 `features.json`、`assets/manifest.json` 保存，单文件 HTML 由打包脚本生成。

**Key Characteristics:**
- 功能节点用短句，截图配操作路径、具体范例和简短说明。
- 图片保持自然尺寸，超出窗口时局部滚动，不缩小界面文字。
- 宽屏使用双侧脑图，窄屏保留同一层级的纵向树。
- 开发预览、虚构资料和仅展示入口的桌面能力明确说明。

## Colors

沿用单一深绿主色，暖白作阅读底纸，灰绿细线提供层级。

### Primary

green 用于根节点、主要操作、当前截图标签和已选功能；primary-hover 用于主要操作悬停。focus 仅承担键盘焦点提示。

### Neutral

ink 承担正文，muted 承担路径、计数、图注和来源。paper 为页面与查看器底色，field 为搜索框底色；tint 用于悬停、选中底色和截图滚动区。line 分隔区域，structure 描述可操作边界，connector 连接脑图层级。截图内部颜色保持应用原样，不转化为本页面的组件色。

## Typography

标题使用本机宋体回退，正文与控件优先微软雅黑。不加载在线字体。页面主标题按宽度使用 40 / 36 / 32px；功能查看器标题使用 34 / 28px。分支标题 24px、600 字重；功能节点 22px，计数和来源 18px。说明正文为 20–22px，功能补充说明最大宽度为 75ch。

根节点名称使用 38px，较窄的双侧布局为 34px，纵向布局为 30px。主要按钮默认 22px，查看器与工具区控制多为 20px，窄屏查看器控制为 18px。

**The Readable Chinese Rule.** 所有可读文字至少 18 CSS px；图内文字也按实际显示尺寸检查。产品截图宽度等于图片自然宽度，不能用缩放适应窗口。

## Layout

主内容最大宽度 1660px，宽屏水平内边距 48px。脑图由两侧功能树与中间 170px 根节点列构成，列间距 34px；每侧三个分支，分支之间 42px。分支标题与叶节点并列，标题宽度为 145px，极宽窗口增加为 165px。桌面根节点从脑图顶部留出 200px，使其完整进入首屏。

1150px 及以下保留双侧结构，但每个分支内部改为标题在上、叶节点在下；根节点列改为 130px。700px 及以下变为纵向树，根节点在最前，两侧分支按既定阅读顺序接续，页边距 20px，文字不缩小。脑图连线通过实际节点位置计算；窄屏使用层级竖线，不保留跨页曲线。

查看器宽度为视口减去 48px、最大 1540px；窄屏为视口减去 16px。打开时采用纵向 flex，头部和尾部固定在窗口内，功能内容独立滚动。截图另有可聚焦的双向滚动区域，宽屏最高 70vh、窄屏最高 62vh。多张截图以可换行标签切换。

## Elevation & Depth

脑图页面依靠留白、底色与细线分层，不为节点添加阴影。查看器使用深色遮罩和柔和投影（`0 24px 90px #15281a40`），提供受保护的截图阅读空间。截图边框只区分图片与文档，不重绘应用窗口。

## Shapes

功能节点与图片框使用轻圆角，常规控制使用稍大的圆角；根节点和桌面查看器使用更完整的圆角，窄屏查看器略收紧。连接线细而连续，既不承担装饰，也不替代标题。图标来自应用资产或同一笔触的内联 SVG。

## Components

**脑图分支。** 原生 details / summary 提供展开与收起。标题下展示功能数与转向箭头；展开全部、收起全部只改变当前可见结构。宽屏标题通过短横线连接叶节点竖线。

**功能节点。** 文字按钮打开功能查看器，悬停和当前项使用浅绿底色。`aria-haspopup="dialog"` 说明目标，`aria-current` 标记正在查看的功能。查找按功能标题、分支、路径、范例和说明匹配，保留父级并显示空结果状态。

**截图查看器。** 原生 dialog 提供聚焦范围与 Esc 返回。头部显示所在分支和返回入口，尾部持续提供上一功能、当前位置及下一功能。截图标签以 `aria-pressed` 表示选中。URL 片段可直接打开某一功能；关闭后焦点回到来源按钮。

**原尺寸截图。** 图片不设置最大宽度，不按容器比例缩放。图注明示图片尺寸及双向滚动；原图可下载。38 张界面截图来自当前代码的显式开发预览，另有 2 张应用实际导出 PNG；全部使用虚构范例1。

**按钮与输入。** 主要操作为深绿实底，普通操作为透明底、细边框。搜索框有前置放大镜、独立输入焦点和清晰占位；无结果时显示恢复方向。键盘焦点使用 3px 轮廓与 4px 偏移，禁用按钮保留语义和可见文字。

**来源说明。** 页末原生展开区记录虚构人物、开发预览、截图日期与桌面文件操作的实际验证边界。页面不模拟备份等系统对话框，不把灰色入口写成已完成的桌面操作。

**动效。** 只有分支箭头短暂旋转；减少动效偏好时取消过渡。截图切换与滚动位置复位直接完成，不制作产品操作动画。

## Do's and Don'ts

### Do:
- Do 保留现有品记图标、深绿和暖白，只扩展本功能文档。
- Do 保持至少 18px 的实际文字尺寸，包括原尺寸截图中的文字。
- Do 用真实捕获的界面与实际导出图说明功能，保留来源和验证边界。
- Do 修改源文件后重新打包，使单文件 HTML 与源文件一致。

### Don't:
- Don't 缩小整张截图来适应栏宽，或用重绘界面代替截图。
- Don't 把范例人物和开发预览包装成真实用户与正式桌面运行证据。
- Don't 引入在线字体、远程脚本、图片、账号或追踪依赖。
- Don't 将本页面的脑图与查看器布局推广为正式应用界面的规则。
