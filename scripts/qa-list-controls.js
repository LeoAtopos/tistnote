async (page) => {
  if (!new URL(page.url()).searchParams.has("preview")) throw Error("Use an isolated development preview session");
  await page.evaluate(() => localStorage.removeItem("tistnote-development-preview-v1"));
  await page.reload();
  const check = (condition, message) => {
    if (!condition) throw Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 960 });
  await page
    .getByRole("button", { name: "创建或打开本地资料库", exact: true })
    .click();
  const title = page.getByRole("textbox", { name: "笔记主题", exact: true });
  const saved = () =>
    page
      .locator(".save-state")
      .filter({ hasText: /^已保存$/ })
      .waitFor();
  const create = async (name, tags) => {
    await page.getByRole("button", { name: "新建笔记", exact: true }).click();
    await title.fill(name);
    await page
      .getByRole("textbox", { name: "笔记标签", exact: true })
      .fill(tags);
    await saved();
  };
  await create("想反复重看的电影", "电影");
  await create("喜欢的设计作品", "设计");
  await page.getByRole("button", { name: "添加一个选择", exact: true }).click();
  await page.locator(".entry-body input").first().fill("计算机 · 白芝麻");
  await saved();
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  const duplicate = page.getByRole("dialog", { name: "标题重复", exact: true });
  check(await title.inputValue() === "未命名笔记（1）", "Second blank note did not receive a numbered title");
  check(await duplicate.count() === 0, "New blank note was blocked by duplicate title");
  const blankRecords = await page.evaluate(() => JSON.parse(localStorage.getItem("tistnote-development-preview-v1")).vault.notes.filter(r => r.note.title.startsWith("未命名笔记")));
  check(blankRecords.length === 2 && blankRecords.some(r => r.note.title === "未命名笔记"), "New creation replaced the original blank note");
  const noBlankHistory = await page.evaluate(ids => {
    const state = JSON.parse(localStorage.getItem("tistnote-development-preview-v1"));
    return ids.every(id => !state.history[id]?.length);
  }, blankRecords.map(r => r.note.id));
  check(noBlankHistory, "Blank numbering created initial content history");
  await title.fill("暂存空笔记");
  await saved();
  check(
    (await page.locator(".note-card").count()) === 4,
    "Both blank notes should be retained",
  );

  await title.fill("想反复重看的电影");
  await duplicate.waitFor();
  const storedTitles = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("tistnote-development-preview-v1"),
    ).vault.notes.map((r) => r.note.title),
  );
  check(
    new Set(storedTitles).size === 4 && storedTitles.includes("暂存空笔记"),
    "Duplicate rename reached storage",
  );
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await title.fill("暂存空笔记");
  await saved();

  await page.getByRole("button", { name: /^模板库$/, exact: true }).click();
  await page
    .locator(".template-card")
    .filter({
      has: page.getByRole("heading", { name: "想反复重看的电影", exact: true }),
    })
    .getByRole("button", { name: "开始填写" })
    .click();
  check(await title.inputValue() === "想反复重看的电影（1）", "Template collision did not receive a numbered title");
  check(await duplicate.count() === 0, "Template creation was blocked by duplicate title");
  await page.getByRole("button", { name: /^笔记/ }).first().click();
  check((await page.locator(".note-card").count()) === 5, "Template should create a distinct new note");
  check(
    (await page.getByRole("textbox", { name: "搜索", exact: true }).count()) ===
      0,
    "Search should start collapsed",
  );
  check(
    (await page.locator(".tag-filter").count()) === 0,
    "Tags should start collapsed",
  );
  check(
    (await page
      .locator(".note-card p, .note-card time, .note-card-foot")
      .count()) === 0,
    "Compact mode contains extra text",
  );
  check(
    (await page.locator(".empty-mark").count()) === 4,
    "Only empty notes should show the marker",
  );
  await page.getByRole("button", {name:"笔记列表选项", exact:true}).click();
  await page
    .getByRole("button", { name: "切换为详细展示", exact: true })
    .click();
  check(
    (await page.locator(".note-card time").count()) === 5,
    "Detailed mode lost dates",
  );
  await page.getByRole("button", {name:"笔记列表选项", exact:true}).click();
  await page
    .getByRole("button", { name: "切换为精简展示", exact: true })
    .click();

  await page
    .getByRole("button", { name: "搜索与标签筛选", exact: true })
    .click();
  await page.getByRole("textbox", { name: "搜索", exact: true }).fill("白芝麻");
  check(
    (await page.locator(".note-card").count()) === 1,
    "Search no longer finds entries",
  );
  await page
    .getByRole("button", { name: "搜索与标签筛选", exact: true })
    .click();
  check(
    (await page.getByRole("textbox", { name: "搜索", exact: true }).count()) ===
      0,
    "Search did not collapse",
  );
  await page.getByRole("button", {name:"搜索与标签筛选", exact:true}).click();
  await page.getByRole("button", {name:"清除筛选", exact:true}).click();
  await page
    .locator(".tag-filter")
    .getByRole("button", { name: "电影", exact: true })
    .click();
  check((await page.locator(".note-card").count()) === 2, "Tag filter failed");
  await page.getByRole("button", {name:"搜索与标签筛选", exact:true}).click();
  await page.getByRole("button", {name:"搜索与标签筛选", exact:true}).click();
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  check(
    (await page.locator(".note-card").count()) === 5,
    "Clear filters did not restore notes",
  );

  await page.getByRole("button", {name:"搜索与标签筛选", exact:true}).click();
  const audit = async () =>
    page.evaluate(() => {
      const visible = (el) =>
        el.getClientRects().length &&
        getComputedStyle(el).visibility !== "hidden";
      const texts = [...document.querySelectorAll("body *")].filter(
        (el) =>
          visible(el) &&
          ([...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
          ) ||
            el.matches("input,textarea,select")),
      );
      const small = texts
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 18)
        .map((el) => ({
          text: el.textContent.slice(0, 30),
          font: getComputedStyle(el).fontSize,
        }));
      const markers = [...document.querySelectorAll(".empty-mark")]
        .filter(visible)
        .map((el) => {
          const heading = el.parentElement
            .querySelector("h2")
            .getBoundingClientRect();
          const mark = el.getBoundingClientRect();
          return (
            Math.abs(heading.top - mark.top) < 10 &&
            mark.right <= window.innerWidth
          );
        });
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        minimumFont: Math.min(
          ...texts.map((el) => parseFloat(getComputedStyle(el).fontSize)),
        ),
        small,
        markers,
      };
    });
  const desktop = await audit();
  check(
    !desktop.small.length &&
      desktop.scrollWidth <= desktop.width &&
      desktop.markers.every(Boolean),
    "Desktop font/layout check failed: " + JSON.stringify(desktop),
  );
  await page.screenshot({
    path: "output/playwright/compact-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await audit();
  check(
    !narrow.small.length &&
      narrow.scrollWidth <= narrow.width &&
      narrow.markers.every(Boolean),
    "Narrow font/layout check failed: " + JSON.stringify(narrow),
  );
  await page.screenshot({
    path: "output/playwright/compact-narrow.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "搜索与标签筛选", exact: true })
    .click();
  await page.getByRole("textbox", { name: "搜索", exact: true }).fill("电影");
  await page.screenshot({
    path: "output/playwright/compact-search-narrow.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();

  await page.screenshot({
    path: "output/playwright/compact-tags-narrow.png",
    fullPage: true,
  });
  const expanded = await audit();
  check(
    !expanded.small.length && expanded.scrollWidth <= expanded.width,
    "Expanded filters overflow or have small fonts",
  );
  await page.reload();
  await page.getByRole("button", { name: /^笔记/ }).first().click();
  check(
    (await page.locator(".note-list.compact").count()) === 1,
    "Compact is not the default after reload",
  );
  return {
    duplicateCreate: "numbered; both blank notes retained",
    duplicateRename: "blocked without overwriting",
    duplicateTemplate: "numbered; original retained",
    modes: "switchable; compact default",
    filters: "collapse, search, tags, clear verified",
    desktop,
    narrow,
    expanded,
  };
}
