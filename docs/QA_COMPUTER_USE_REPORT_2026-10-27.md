# 品记全面功能验收报告

执行日期：2026-10-27—2026-10-28。对应[检查计划](QA_COMPUTER_USE_PLAN_2026-10-27.md)。

## 验收结论

**本轮结论：未通过全面发布验收。** 78项均已归档状态，其中通过 49 项、失败 2 项、部分通过 23 项、受限 4 项。部分通过代表只完成所述子用例，不能等同完整通过；受限项目没有执行。未用既有自动化、源码推测或模拟移动系统替代本轮操作。

已验证新建/编辑/日志/取消的主要流程、分组与画布、模板覆盖、回顾、历史、备份恢复、图片输出和删除链路。已执行场景未观察到永久丢失原笔记，但取消编辑首次失败和英文错误提示未本地化需要处理。另有边界用例尚未闭环，因此不能宣称所有功能都无问题。

## 环境与数据范围

- 主测：Windows发布版 `release/tistnote.exe`，版本0.2.0，发布源 `f0558b3`。工作区HEAD为 `c63e220`。当前未提交的“编辑时隐藏品交”属于开发版本差异，未将旧发布包显示品交直接记为回归。
- 界面点击、输入、拖拽、滚动和重启使用 Computer Use / @oai/sky；文件读取仅核对输出、备份、历史及测试文件完整性。
- 仅操作 `output/computer-use-2026-10-27/` 下独立测试库；未改动用户原有 `example/` 或既有未提交产品修改。本轮不修复代码、不打包、不提交或发布。
- 已有用户许可的删除仅针对指定测试模板、空组、条目和副本。其余测试数据及完整备份保留。完整备份28个文件逐字节一致；永久删除副本后其余20个笔记/历史文件逐字节保持。
- 实际截图包含1442×992桌面及约496/503×992窄屏；截图不等于逐元素CSS字号量测，18px规则仍有量测缺口。
- 本地证据索引为 `output/computer-use-2026-10-27/EVIDENCE_INDEX.md`。截图、无障碍树、PNG和字节比较JSON保存在忽略的output目录，没有上传。

## 已发现的问题

### BUG-02 · P2 · 取消编辑首次还原失败

步骤：打开恢复测试库 → 编辑笔记 → 更换分组并修改说明 → 取消编辑 → 放弃更新。预期退出编辑并恢复原状态；首次实际返回 `failed to persist temporary file: 拒绝访问 (os error 5)` 并停留编辑。输入未被静默丢弃；再次确认后成功恢复原文与分组。**这是一次实际失败，尚不能稳定复现，也不能确定是路径处理、文件占用还是环境原因。** 证据：`C11-discard-result.png`、`C11-retry-result.png`。建议优先定位并增加该路径的回归验证。

### BUG-03 · P3 · 英文错误提示夹中文

步骤：设置English → 打开独立损坏测试库。实际顶部错误含“元数据无法读取”等中文，而其余界面为英文。原损坏文件字节完整，问题影响错误信息一致性。证据：`B11-corrupt-vault-result.png`。

## 待复核观察，不能直接视为产品缺陷

- **OBS-01：重名提示重复出现。** 在UIA抓取/重新聚焦期间重复弹出；Esc后改为唯一名称可恢复。需要排除工具焦点影响。后续重复Markdown导入的同名提示可正常关闭。
- **拖拽边界：** Windows条目拖拽和列表跨组拖拽未可靠得到预期结果；按钮、Alt+方向键及画布跨组移动已成功。画布同级分组下沿拖放一次被识别为移入；未确认稳定命中排序区域，不能据此断言排序逻辑错误。
- **版本差异：** 发布包编辑时仍显示品交；本地开发修改尚待浏览器现场验证后再构建，见C13。

## 修复跟进（2026-10-28）

本节为原始摸排后的代码修复与自动化回归，不改变上面的原始现场结果或78项统计，也不代表全面发布验收已通过。

| 问题 | 修复与验证 | 当前边界 |
|---|---|---|
| BUG-02 取消编辑首次还原失败 | 用Windows读句柄暂时禁止替换，复现相同的 `failed to persist temporary file: ... os error 5`。共享原子写入函数对Windows错误5/32/33最多重试5次，总等待约575ms，复用已刷盘临时文件。重试前比对原文件字节，检测到外部更新即停止并提示冲突。瞬时占用释放后成功；持续占用、只读和外部更新时原文件不被覆盖，临时文件不残留。既有取消编辑测试同时验证原内容、分组、时间及历史恢复。 | 修复了可复现的瞬时文件占用失败路径；原始现场是哪一个进程占用文件仍未确认。真实权限不足或持续占用仍应报错，不强制覆盖。 |
| BUG-03 英文报错夹中文 | 资料库警告展示先拆出文件名，再翻译诊断正文。新增测试覆盖英文与中文切换、中文文件名、原始解析细节及多行诊断保留。 | 没有翻译用户文件名或笔记内容；未知底层诊断保持原样。 |

检查结果：

- `npm test`：59项通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：28项通过，包含新增3项Windows文件占用回归。
- `npm run build`：通过。
- `git diff --check`：通过。
- `cargo fmt --check`：全库存在此前已有的格式差异（canvas.rs、lib.rs、storage.rs的未修改段落），本次没有为此全库重排。

OBS-01重名提示重复和原生HTML拖拽仍为待复核观察：源码中可见窗口重新聚焦会重试保存，拖拽处理及Tauri允许HTML拖拽的配置已存在，尚不足以确认工具操作以外的缺陷。本次未给这些观察添加未经验证的行为改动。已有“编辑时隐藏品交”的工作区修改保留。

本次未重跑Computer Use全面验收，也未重新打包、推送GitHub或发布Pages；原有发布包尚不含本次修复。用户的example目录及其中未提交数据未作修改。

## 原始逐项结果

| ID | 模块 | 状态 | 实际操作与未覆盖部分 | 证据编号 |
|---|---|---|---|---|
| A01 | 启动 | 通过 | 发布版可启动，选择独立空目录成功，空库有写笔记和模板入口。 | B01-empty-vault |
| A02 | 介绍 | 通过 | 品牌入口逐页检查第1至6页，左右翻页和末页开始按钮可用，主题绿Logo与文案可读。 | A02-intro-page2.png、A02-intro-page3.png、A02-intro-page4.png、A02-intro-page5.png、A02-intro-page6.png、A02-start-writing.png |
| A03 | 设置引导 | 通过 | 设置中的引导页可重新打开，关闭后可继续操作。 | A03-settings-introduction.txt、A03-close-introduction.txt |
| A04 | 提示 | 受限 | Windows客户端无网页顶部提示；浏览器Computer Use此前因无法可靠识别当前URL而终止，关闭与重开保留尚未实测。 |  |
| A05 | 语言 | 失败 | 中文、英文及跟随系统切换与重启保持正常，笔记原文不被翻译；英文界面打开损坏库时错误提示仍夹有中文，见BUG-03。 | A05-english-switched.png、B02-restarted.png、B11-corrupt-vault-result.png |
| A06 | 外观 | 通过 | 浅色、深色及跟随系统均观察到对应外观，菜单与弹窗可读；英文/浅色和后续跟随系统偏好重启保持。 | A06-light-applied.png、A06-theme-options.png、B02-restarted.png、R3-A07-narrow-settings.png |
| A07 | 窗口布局 | 部分通过 | 完成1442×992宽屏与503×992窄屏真实窗口截图；阅读、编辑、周期菜单、设置可重排，设置底部可滚动到达，未见横向裁切。截图像素不能代替实际CSS计算字号；18px下限的逐元素渲染值尚未量测。 | R3-B10-open-note.png、R3-A07-narrow-editor.png、R3-A07-settings-bottom.png |
| A08 | 独立滚动 | 通过 | 长内容上下滚动时工具栏、导航和笔记列表保持位置。 | A08-before-scroll / A08-after-scroll |
| B01 | 新资料库 | 通过 | 发布版可启动，选择独立空目录成功，空库有写笔记和模板入口。 | B01-empty-vault |
| B02 | 打开与重启 | 通过 | 两轮实际关闭并重新启动Windows进程，7篇笔记、分组、内容和偏好保持；个人模板与命名里程碑已重新打开核对。启动状态收窄后显示笔记列表，无编辑工具强制打开。 | B02-restarted.png、R3-B02-restarted-full-vault.png、R3-B02-narrow-startup-list.png、R3-H03-milestone-reopened.png |
| B03 | 切库与名称 | 通过 | 独立空库、恢复库、主测试库与损坏库之间切换，内容隔离；设置显示当前库名和路径，画布根节点使用库名。 | B03-main-reopened.png、R3-restored-open.png、R3-A07-long-name-settings.png |
| B04 | 文件管理器 | 通过 | 已通过实际界面验证引导页重开、设置引导入口、正确资料库文件夹打开。 | B04-test-explorer.png |
| B05 | 完整备份 | 通过 | 补测含7篇笔记、18份历史、个人模板、分组目录与canvas.json的完整资料库备份，28份输出逐字节与源库一致；运行锁未复制。 | R3-B05-full-backup-success.txt、R3-B05-byte-comparison.json |
| B06 | 恢复备份 | 通过 | 通过原生界面生成完整备份并恢复到独立新库；3 篇 Markdown 及7份历史 JSON 逐字节一致。 | B06-restore-result.png |
| B07 | Markdown 导入 | 通过 | 有效兼容Markdown从文件选择器导入为独立笔记；本轮重复导入同一文件被“标题重复”提示阻止，7篇笔记保持，原文件不覆盖。 | B07-import-result.png、R3-B07-repeat-preview.png |
| B08 | 无效导入 / 恢复 | 部分通过 | 损坏JSON前置信息导入被拒，提示 metadata key must be a string，计数保持6且已有笔记保留；超大/非品记/重复ID边界待测。 | B08-import-error-visible.png |
| B09 | 多窗口锁 | 通过 | 同时打开两个本地构建访问相同资料库，后打开窗口提示已在另一窗口打开，并阻止进入写入；范围仅Windows单机。 | B01-empty-vault.txt |
| B10 | 外部更新 | 部分通过 | 记事本实际改名和说明后，应用重新打开读取正确；已进入但未修改的编辑会话遇到第二次外部更新，会退出编辑并提示“已加载外部修改，并记录到历史”。有本地未保存输入的并发冲突未完成验证。 | R3-B10-open-note.png、R3-B10-stale-editor.png |
| B11 | 损坏保护 | 通过 | 单独损坏库显示具体文件解析警告，invalid.md与原始损坏样本逐字节一致，未覆盖或重写。 | B11-corrupt-vault-result.png |
| C01 | 新建与默认名 | 通过 | 未命名连续新建有括号序号；标题 Enter 到主题说明；中文英文 emoji 和多段长理由已保存、浏览显示正常。 | C01-numbered-note / C02-enter-description / C09-commit-reading |
| C02 | 标题接续 | 通过 | 未命名连续新建有括号序号；标题 Enter 到主题说明；中文英文 emoji 和多段长理由已保存、浏览显示正常。 | C01-numbered-note / C02-enter-description / C09-commit-reading |
| C03 | 全库唯一标题 | 部分通过 | 同库重名被阻止，原记录保留，Esc 后改唯一标题可恢复。提示再次出现的原因待复核。 | C03-duplicate-warning / C03-unique-title-recovered |
| C04 | 内容输入 | 通过 | 未命名连续新建有括号序号；标题 Enter 到主题说明；中文英文 emoji 和多段长理由已保存、浏览显示正常。 | C01-numbered-note / C02-enter-description / C09-commit-reading |
| C05 | 条目录入与整理 | 部分通过 | 条目Enter新增、按钮上移、Alt+Up排序正常，内容绑定保留；原生客户端条目拖拽没有改变顺序，待网页交叉复核。 | C05-keyboard-reordered.png |
| C06 | 排名模式 | 通过 | 有排名与无排名切换保留条目与顺序；无排名阅读显示圆点，复制出的分享图片也显示圆点而非序号。 | C06-unranked-applied.png、C06-reading-unranked.png、R3-I07-pasted-image.png |
| C07 | 撤销重做 | 通过 | 撤销后描述恢复原文；重做后恢复临时更新。 | C07-undo-success.txt |
| C08 | 自动保存 | 通过 | 连续中文/英文长文本输入后显示已保存，切换笔记、完成提交和重启后内容仍在；自动历史可见，未观察到残留待保存状态。 | C09-commit-reading.png、C09-empty-log-submitted.txt、R3-B02-restarted-full-vault.png |
| C09 | 完成编辑 | 通过 | 填写日志与空日志均可提交；无修改取消直接浏览；初始 / 自动 / 编辑日志 / 回顾历史可见，未强制提交。 | C09-empty-log-submitted / C10-cancel-no-changes / H01-review-and-log-history |
| C10 | 无修改取消 | 通过 | 填写日志与空日志均可提交；无修改取消直接浏览；初始 / 自动 / 编辑日志 / 回顾历史可见，未强制提交。 | C09-empty-log-submitted / C10-cancel-no-changes / H01-review-and-log-history |
| C11 | 有修改取消 | 失败 | 有更新时取消出现确认，继续编辑可用；首次放弃更新返回os error 5并停留编辑状态，重试才成功恢复原文与分组。未观察到静默丢弃输入，原因尚未定位。 | C11-discard-result.png、C11-retry-result.png |
| C12 | 复制笔记 | 通过 | 复制后标题自动追加(copy)，内容及周期保留，新笔记独立ID，历史目录仅新建初始版本，不复制命名里程碑。 | C12-duplicated.png |
| C13 | 浏览 / 编辑边界 | 部分通过 | 发布版浏览和编辑控件分离，阅读无输入字段；该旧包编辑时仍显示品交。当前工作区隐藏品交的修改尚未进入发布包，开发预览补测受浏览器运行时限制。 | R3-A07-narrow-editor.png、R3-B10-open-note.png |
| D01 | 搜索 | 通过 | 已实际搜索标题“喜欢与讨厌”、说明“虚构的测试品单”、条目名“续集”、理由“克制的表达”，均命中对应笔记；无匹配有空态，清除恢复。 | D01-entry-search.png、D01-no-results.png、R3-D01-title-match.png、R3-D01-description-match.png、R3-D01-reason-match.png |
| D02 | 标签 | 通过 | 标签输入去重已验证；本轮组合理由搜索+电影标签命中，电影/Design多选按并集匹配，去掉电影只留Design后无结果；收起筛选仍有圆点及“筛选中”状态，清除后恢复7篇。 | D02-tag-filter.png、R3-D02-multiple-tags.png、R3-D02-incompatible-tag.png、R3-D02-filter-hidden.png、R3-D02-cleared.png |
| D03 | 列表模式与排序 | 通过 | 实际验证默认精简、详细模式、最近修改与按主题排序；切按主题后顺序正确变化，空标记保留在条目行。 | R2-D03-title-sort.png / D03-details-view.png |
| D04 | 分组创建 | 通过 | 新建根组和子组成功；空名称禁用、../非法路径拒绝，本轮重复创建CUA生活显示“分组名称已存在”，没有增加重复目录。 | D04-invalid-rejected.png、R3-D04-duplicate-result.png |
| D05 | 重命名分组 | 通过 | 父组重命名后子组与2篇笔记跟随，笔记文件字节不变。 | D05-renamed.png |
| D06 | 笔记移动 | 部分通过 | 下拉选择跨层级移动成功；首次列表拖拽无变化，待复测；移回根目录待测。 | D06-move-committed.png |
| D07 | 分组移动 | 通过 | 画布将父组拖到自己的子组时仅调整画布位置，未建立循环目录；随后父组拖入另一分组成功，子组与2份笔记随目录移动，7份笔记字节均保持一致。 | R3-D07-cycle-protection.png、R3-D07-group-moved.png |
| D08 | 树与右键 | 通过 | 已验证二级组右键新建笔记的归属（前轮）；本轮补测父组收起/展开、全部折叠、空白根目录右键“新建笔记/新建分组”、Esc关闭菜单，原笔记仍在。 | D08-context-new-note.png、R3-D08-parent-collapsed.png、R3-D08-root-context.png、R3-D08-collapse-all.png |
| E01 | 笔记画布 | 通过 | 根节点使用当前资料库名称，未分组笔记直连根，父子分组层次正确。 | E01-notes-canvas.png |
| E02 | 圆点状态 | 通过 | 空笔记空心、内容笔记实心绿、自定义周期自然到期后右上小绿点与无障碍 Review due 状态一致。 | E02-review-due-canvas.png |
| E03 | 画布导航 | 部分通过 | 按钮缩放、拖动平移、居中及滚轮缩放已实际完成；滚轮缩到35%后按钮正确禁用，文字保持可读。画布内搜索/标签定位尚未单独执行。 | E03-pan.png、E03-center.png、R3-E03-wheel-zoom.png |
| E04 | 位置与重开 | 部分通过 | 笔记和分组手动位置可调整，画布布局写入canvas.json且切换库后可恢复；逐节点重启位置比对未完成。 | E04-note-position-drag.png、E06-group-position.png、R3-restored-open.png |
| E05 | 画布跨组 | 部分通过 | 画布笔记跨组移动已观察到本地路径和列表同步，组右键菜单可新建；节点拖回根目录及组内右键新建的全部组合尚未完成。 | E05-canvas-group-move.png、E05-canvas-group-context.png、E05-canvas-create-group.png、E05-back-to-list.png |
| E06 | 分组排序 | 部分通过 | 分组画布位置可拖动，整组子节点随行；本轮尝试拖同级组下沿实际成为移入，未能可靠命中排序区域，排序持久性/键盘排序未通过实测。不能直接认定代码缺陷。 | E06-group-position.png、R3-E06-drop-after-peer.png |
| E07 | 画布重置 | 通过 | 刷新画布成功；建立手动位置后点击恢复自动布局，二次确认后节点回原自动位置；3篇Markdown字节不变。 | R2-E07-custom-position.png / R2-E07-auto-layout-applied.png |
| F01 | 模板画布 | 通过 | 默认模板画布显示根节点、标签分支、46份模板；空心/实心有品区分正确，详情可打开，点击空白处关闭。窄屏画布可拖动浏览，已保存截图。 | R3-F01-template-canvas.png、R3-F04-random-one.png、R3-F01-closed-stable.txt |
| F02 | 模板卡片 | 部分通过 | 卡片模式切换、关键词过滤、更多中的编辑保存及开始填写已执行；模板卡片标签组合筛选未单独补齐。 | F01-template-card.png、F02-template-start.png、R3-J04-template-card.png、R3-F05-saved.png |
| F03 | 模板覆盖 | 通过 | 空模板不计覆盖；完成1/45模板后导航及库内均为2.2%，节点变实心绿。 | F03-coverage-result.png |
| F04 | 随机一品 | 通过 | 连续随机得到电影角色、日常习惯两个不同模板；输入无匹配词后随机按钮禁用且不报错；筛选“作家”后随机只打开作家模板。 | R3-F04-random-one.png、R3-F04-random-two.png、R3-F04-no-results.png、R3-F04-filter-random.png |
| F05 | 个人模板 | 部分通过 | 从笔记提取个人模板并编辑标题保存；本轮再次编辑说明保存成功，JSON仅主题结构、无原答案及理由，保留无排名和建议条目数；从空白新建模板尚未执行。 | F05-template-saved.png、R3-F05-template-edit.png、R3-F05-saved.png |
| F06 | 已有模板主题 | 部分通过 | 有品模板显示 View note，打开原笔记，笔记总数保持5；同标题非模板关联情况待测。 | F06-open-existing.png |
| G01 | 周期预设 | 通过 | 1分钟测试及3个月预设前轮已保存并重开验证；本轮逐一选择1天、3天、1周、2周，实际Markdown分别写入day/week正确数值；两周提交后重新进入编辑仍保持，月度其他数值仅检查菜单可见。 | G01-review-options.png、R3-G01-one-day.png、R3-G01-three-days.txt、R3-G01-one-week.txt、R4-G01-two-weeks.png、R4-G01-reopened-period.png |
| G02 | 自定义周期 | 通过 | 已实际应用并保存5分钟自定义周期（前轮）；本轮补测0、-1、1.5、空值、1201个月，应用按钮均禁用并提示整数范围；取消草稿后仍为3个月，Markdown周期不变。 | G02-custom-applied.png、R3-G02-fraction.png、R3-G02-cancelled.png |
| G03 | 到期提醒 | 通过 | 一分钟预设及自定义5分钟均自然到期；列表、内容按钮、画布三个位置显示到期标记。 | E02-review-due-canvas.png |
| G04 | 回顾确认 | 通过 | 到期确认清除提醒，随后未到期再次确认也更新时间；两次操作不改变内容updatedAt和条目，回顾历史存在。前轮已验证列表/按钮、画布到期状态。 | R3-G04-due-confirmed.png、R3-G04-early-confirmed.png、H01-review-and-log-history.png |
| H01 | 笔记历史 | 通过 | 填写日志与空日志均可提交；无修改取消直接浏览；初始 / 自动 / 编辑日志 / 回顾历史可见，未强制提交。 | C09-empty-log-submitted / C10-cancel-no-changes / H01-review-and-log-history |
| H02 | 版本比较 | 部分通过 | 版本比较已显示新增条目、说明及标签差异；尚未逐项构造标题、理由、排序及各种周期差异，不能据此覆盖全部字段。 | H02-content-comparison.png |
| H03 | 里程碑 | 通过 | 已创建命名里程碑；经过关闭重启进程及多次切库后，重新打开历史仍显示“CUA里程碑·导入后校验”，可定位并比较。 | H03-history-check.png、R3-H03-milestone-reopened.png |
| H04 | 恢复版本 | 部分通过 | 恢复旧版内容后旧历史仍在，上次回顾确认时间保持；恢复时遇到跨笔记重名或外部冲突的边界未完成。 | H04-restored-version.png |
| H05 | 全局历史 | 通过 | 全局贡献图区分新增/更新/回顾，选择空日期显示空态、今日显示7新增3更新2回顾，活动可打开笔记。年份菜单仅列出有数据的2026；跨年度历史样本未覆盖。 | H05-global-history.png、H05-empty-day.png、H05-open-history-note.png、R3-H05-year-overview.png |
| I01 | 品交入口 | 部分通过 | 阅读状态品交下拉的展品和求品均能打开，关闭按钮可回到笔记；当前开发版编辑时隐藏品交另见C13，分享弹窗Esc路径未单独核验。 | I01-trade-menu.png、I05-invite-private.png、R3-I07-share-dialog.png、R3-share-closed.txt |
| I02 | 署名 | 通过 | 匿名与具名分别显示恰当前导文本；长中英署名在保存PNG中完整，签名不改笔记原文。 | I02-share-anonymous.png、I02-signed.png、I02-invite-signed.png、R3-I07-export-opened.png |
| I03 | 公开字段 | 部分通过 | 标签开关生效，取消全选禁用输出；具名/匿名和无排名输出正确。日期、主题说明、理由逐个开关以及节选保持原序号未全部完成。 | I03-tags-included.png、I03-deselect-all.png、R3-I07-pasted-image.png |
| I04 | 长图 / 分页 | 部分通过 | 长邀请文字在长图和分页模式均生成，第二页可切换；长理由、emoji极端组合及超限提示未全覆盖。 | I04-long-invitation.png、I04-paged-preview.png、I04-page-two.png |
| I05 | 求品隐私 | 通过 | 求品预览与分页仅显示主题、邀请语及可选说明；对照测试笔记，未出现自己的答案、理由、历史或路径。 | I05-invite-private.png、I04-long-invitation.png、I04-page-two.png |
| I06 | 页脚与二维码 | 部分通过 | 展品与求品使用不同页脚文案，预览、保存PNG、剪贴板图中二维码均真实可见；本机无现成离线解码器，未完成扫码读取URL。 | I05-invite-private.png、R3-I07-export-opened.png、R3-I07-pasted-image.png |
| I07 | 图片输出 | 通过 | 应用保存的PNG（1000×620）已通过画图实际打开，长署名、中英内容、页脚及二维码完整；重新复制匿名无排名图片并在画图Ctrl+V成功，2个条目及页脚与预览一致。 | R3-I07-pasted-image.png、R3-I07-export-opened.png |
| J01 | 回收站入口 | 通过 | 回收站仅在设置按钮网格最后，入口可进入独立回收站页面。 | J01-trash-page.png |
| J02 | 删除与还原 | 部分通过 | 经用户执行前确认，测试空笔记移入回收站后计数5→4，恢复后5；历史与重名恢复边界待测。 | J02-restored.png |
| J03 | 永久删除 | 通过 | 动作前明确确认后，仅将指定副本移入回收站并永久删除；警告明确包含全部历史且不可撤销。回收站变空、笔记7→6，副本ID相关文件全部消失，其余20份笔记/历史字节保持。 | R4-J03-trash.png、R4-J03-permanent-warning.png、R4-J03-permanent-deleted.png、R4-J03-others-preserved.json |
| J04 | 删除模板 / 分组 / 条目 | 通过 | 动作前分别获用户确认：删除个人模板后7篇笔记及历史字节不变；删除副本内“橙色与深蓝”仅去掉该条目，提交后保留另一条；0篇笔记的指定空分组删除成功、7篇笔记仍在。未操作非空分组删除。 | R4-J04-template-deleted.png、R4-J04-files-preserved.json、R4-J04-entry-deleted.png、R4-J04-group-delete-prompt.png |
| K01 | 本地安装入口 | 部分通过 | Windows客户端的安装菜单隐藏Windows自身入口，保留Android稳定下载链接；网页同时展示两个下载入口及Android隐藏自身入口需对应平台补测。 | K01-native-install-links.png |
| K02 | iOS 主屏幕 | 受限 | 当前无iOS/iPadOS真机，未执行添加到主屏幕、独立存储提醒及平台隐藏验证；未用模拟UA冒充真机。 |  |
| K03 | 安卓系统集成 | 受限 | 当前无可用Android设备或正在运行的模拟器；系统文件选择、返回键、分享图片与覆盖更新均未执行。 |  |
| K04 | 网页真实文件 | 受限 | 网页真实文件夹授权及多标签并发未完成；浏览器此前URL识别失败，且本轮Computer Use规则不允许代为操作安全/隐私权限提示。 |  |
| K05 | 不联网与故障 | 部分通过 | 本地正常编辑/备份/恢复已执行，损坏文件保护与外部更新已验证；未修改系统网络/安全设置做断网或写保护测试，有未保存输入时外部冲突仍需专项验证。 | B11-corrupt-vault-result.png、R3-B10-open-note.png、R3-B05-full-backup-success.txt |

## 受限与补测要求

- 浏览器Computer Use此前因无法可靠识别Chrome当前URL而终止；没有更换自动化绕过该限制。网页提示关闭、开发版编辑边界、真实文件夹和多标签锁尚不能通过。后续若恢复浏览器能力，按A04/C13/K04继续。
- iOS/iPadOS与Android缺少可用真实运行环境。K02/K03必须在对应设备完成；不以桌面窄屏代替系统集成验收。
- 二维码已在保存与剪贴板图中看到，但尚未扫码解码目标URL。完整字号量测、极端长图、未保存输入冲突、恢复重名、拖拽排序等缺口逐项保留在部分通过行中。

## 建议处理顺序

1. 定位BUG-02取消编辑还原失败，复测有分组变化、自动保存和外部更新的取消路径。
2. 修正BUG-03英文错误提示，复核重名提示与拖拽边界；在当前开发版验证编辑时无品交。
3. 补完表中部分通过子用例、真实浏览器存储与移动设备测试，再作发布验收。

## 执行说明

原生文件选择器和应用窗口存在几何缓存、子窗口及焦点抓取差异。遇到错误后均重新观察/绑定再操作，未把工具定位错误计为产品缺陷。已有用户文档没有修改；打开记事本时新建独立标签编辑测试Markdown。输出图片在Windows画图实际打开，剪贴板图亦实际粘贴核验。
