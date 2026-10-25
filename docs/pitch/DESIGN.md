---
name: 品记项目提案
description: 沿用品记视觉的本地滚动图文文档；仅约束 docs/pitch。
colors:
  green: "#344f42"
  deep: "#263e33"
  ink: "#2b342d"
  muted: "#596456"
  paper: "#fafaf7"
  cream: "#f1efe5"
  line: "#d4dbcf"
  tint: "#e9eee5"
  plum: "#5e455b"
  white: "#fffefb"
  primary-hover: "#233d2e"
  focus: "#a75420"
typography:
  display:
    fontFamily: '"STZhongsong", "华文中宋", "Songti SC", "Noto Serif CJK SC", serif'
    fontSize: "62px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"STZhongsong", "华文中宋", "Songti SC", "Noto Serif CJK SC", serif'
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.035em"
  title:
    fontFamily: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.6
  body:
    fontFamily: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  square: "0px"
  button: "4px"
spacing:
  compact: "12px"
  paragraph: "18px"
  narrow-gutter: "24px"
  medium-gutter: "40px"
  wide-gutter: "64px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "15px 23px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  shot-action:
    backgroundColor: "transparent"
    textColor: "{colors.green}"
    rounded: "{rounded.button}"
    padding: "8px 14px"
  share-switch:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  viewer-close:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "9px 18px"
---

# Design System: 品记项目提案

## Overview

**Creative North Star: "品记的纸页"**

沿用品记的深绿、暖白和清晰中文。短句说明产品，真实应用截图呈现笔记、版本与分享；两幅生活场景插图只承担情境。

本文件仅约束 docs/pitch 的产品截图版。应用界面取自当前代码的显式开发预览，载入虚构范例1；分享图片由应用实际导出。当前像素、样式与行为以 index.html、pitch.css、pitch.js 和 assets/manifest.json 为准。应用本身的设计系统未改动。

**Key Characteristics:**
- 先给产品定义与价值，再用真实画面说明操作。
- 截图保留可读字号，宽图局部滚动，不缩成微型文字。
- 当前截图可原像素展开，分享模式切换真实图片。
- 开发预览、虚构范例与 AI 场景图各自明确标注。

## Colors

### Primary

green 用于主要操作、选中状态和书写章节；primary-hover 用于主要操作悬停。deep 保留为来源色，不新增深色章节。

### Secondary

plum 仅区分第二位虚构人物的回应。

### Neutral

ink 承担正文，muted 用于图注与说明，paper 是页面底纸，line 分隔区域。tint 用于悬停和浅色区域；cream 与 white 保留在原配色中。focus 提供键盘焦点。截图内部颜色忠于应用原样，不作为本提案新增的组件规则。

## Typography

标题使用本机宋体回退，正文与控件优先微软雅黑。根字号 20px；正文 22px，次要正文 20px，图注与来源 18px，正文行距 1.85。不加载在线字体。

封面标题为 62px，1200 / 900 / 680px 断点下分别为 54 / 46 / 44px。章节标题 44px，1200 / 680px 以下为 40 / 34px。截图展开按钮 20px，查看器标题 24px、关闭按钮 22px；窄屏查看器标题 22px。

**The Readable Chinese Rule.** 所有可读文字至少 18 CSS px；截图按来源字号与显示比例核对，不用缩字适应空间。

笔记与历史截图按原像素显示。窄屏分享导出图原宽 1000px、原最小字号 28px，显示宽 660px，最小等效字号为 18.48px。查看器按原始图片尺寸显示。

## Layout

主容器最大宽度 1360px，宽屏内边距 64px，1200px 以下为 40px，680px 以下为 24px。截图阶段保留简明版的阅读顺序，不改变应用布局。

- 1100px 以上：首屏为文字与 600px 截图列，列间距 40px。
- 1100px 以下：首屏单列，截图区最大宽度 700px；分享说明仍可双列。
- 680px 以下：首屏截图横向占满页面，切换为应用窄窗口实拍；分享说明单列。历史使用变化明细局部截图，分享使用实际导出的 PNG。
- 宽截图在自己的区域内滚动；历史与分享截图区最高 820px，不引起整页横向溢出。

图注与展开按钮在截图外。宽图的说明保留“可横向滚动”，截图内容不作重排或改写。

## Elevation & Depth

页面通过底色、细线和间隔分层。截图边框为 1px，图片保持原样。查看器使用深色遮罩与浅纸色窗口；不把截图内部的应用阴影和装饰推广为提案组件规范。

## Shapes

主要按钮圆角 4px，截图查看器圆角 8px。品牌图标延用应用来源。截图滚动框不制作仿窗口标题栏；图中的标题栏、控件和边框均由应用实际渲染。

## Components

**产品截图。** 首屏笔记、历史比较、邀请和答案分享均为图片。每张图保留文字替代、来源图注、展开按钮。picture 为窄屏与打印选择实际捕获的替代图，不使用 CSS 重绘产品内容。

**截图滚动区。** 可通过键盘聚焦，具有区域名称。超过可用宽高时在框内滚动，不对整张界面做缩小。

**原尺寸查看器。** 原生 dialog 承担聚焦和 Esc 行为；工具栏显示截图标题与关闭按钮，内部图片保持自然尺寸，可横向、纵向滚动。没有模拟产品操作。

**分享模式。** 原生按钮在“只发问题／分享答案”两张真实截图之间切换，以深绿和 aria-pressed 表达选中状态。邀请导出图不含自己的答案。

**其他操作。** 保留页内锚点、浏览器打印与原生依据展开区。无个人输入保存与网络请求。按钮、链接、展开标题有 3px 焦点轮廓和 5px 偏移。

**图片来源。** 六张界面截图取自当前应用的显式开发预览，数据为虚构范例1。两张 PNG 使用应用“保存全部图片”实际下载。两幅生活场景为 AI 生成，图注与 assets/manifest.json 保留来源记录。

**动效与打印。** 默认平滑锚点滚动，减少动效偏好时直接跳转。打印采用 A4、16mm 页边距，隐藏导航与操作控件；截图改用窄图和实际导出图，保持文字下限。没有标题动画或图片缩放动画。

## Do's and Don'ts

### Do:
- Do 延用品记图标、深绿与暖白，只更新提案本身。
- Do 核对文字的实际显示尺寸，包括截图中的文字。
- Do 保留截图来源、区域、虚构数据及 AI 图注。
- Do 修改源文件后重新打包，保持单文件与源文件一致。

### Don't:
- Don't 用重绘 DOM 冒充应用截图。
- Don't 为适应栏宽将截图文字缩到 18px 以下。
- Don't 加入在线字体、远程图片、账号或追踪依赖。
- Don't 把开发预览或虚构资料库包装成真实用户反馈。

