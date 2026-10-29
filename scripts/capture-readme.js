async page => {
  const fixture = {
  "notes": [
    {
      "key": "films", "source": "builtin-2", "ranked": true,
      "zh": {"title": "想反复重看的电影", "group": "书影音/电影", "description": "同一部电影，在不同年纪会看见不同的自己。", "entries": [["海街日记", "喜欢那些没有被大声说出的关心，和四季慢慢经过的日常。"], ["步履不停", "越长大，越能看见一家人说不出口的话。"], ["帕特森", "提醒自己，普通的一天也值得认真感受。"], ["寻梦环游记", "关于记忆与告别，想和家人再看一次。"]]},
      "en": {"title": "Films I return to", "group": "Books & films/Films", "description": "The same film can reveal a different part of me years later.", "entries": [["Our Little Sister", "Quiet acts of care, with the seasons passing through ordinary days."], ["Still Walking", "As I grow older, I notice more of what this family cannot say."], ["Paterson", "A reminder that an ordinary day is worth paying attention to."], ["Coco", "A story about memory and goodbye that I want to watch with my family."]]}
    },
    {
      "key": "books", "source": "builtin-33", "ranked": false,
      "zh": {"title": "读不下去的书", "group": "书影音/阅读", "description": "放下一本书，也是在辨认自己的需要。", "entries": [["只给结论、不展开思考的书", "我更想知道一个判断是怎样形成的。"], ["把每一种困境都归为不够努力的书", "有些困难需要被理解，而不是被责备。"], ["为了完成阅读数量而选的书", "不再用读完多少本，代替真正的感受。"]]},
      "en": {"title": "Books I cannot finish", "group": "Books & films/Reading", "description": "Putting a book down can help me understand what I need.", "entries": [["Conclusions without a line of thought", "I want to understand how a judgment was formed."], ["Every difficulty blamed on a lack of effort", "Some difficulties need understanding rather than blame."], ["Books chosen only to meet a reading target", "Finishing a number of books is not the same as feeling something."]]}
    },
    {
      "key": "writers", "source": "builtin-5", "ranked": true,
      "zh": {"title": "最喜欢的作家", "group": "书影音/阅读", "description": "喜欢他们观察世界的方式，也允许自己的答案改变。", "entries": [["汪曾祺", "日常的食物、草木和小人物，都值得被温柔地看见。"], ["史铁生", "让我慢下来，重新理解身体、时间与生活。"], ["安妮·埃尔诺", "把个人经验放回更大的世界里。"]]},
      "en": {"title": "Writers I return to", "group": "Books & films/Reading", "description": "Ways of seeing that matter to me. My answers may change.", "entries": [["Wang Zengqi", "Food, plants, and ordinary people deserve a gentle kind of attention."], ["Shi Tiesheng", "His writing makes me slow down and reconsider time and everyday life."], ["Annie Ernaux", "A way of placing personal experience within a larger world."]]}
    },
    {
      "key": "music", "source": "builtin-8", "ranked": true,
      "zh": {"title": "最喜欢的音乐人", "group": "书影音/音乐", "description": "记录声音留下的感觉，不急着替它下定义。", "entries": [["坂本龙一", "适合一个人安静走路的时候听。"], ["窦唯", "声音里有让我愿意停留的空间。"], ["王菲", "有些声音和某个阶段的自己连在一起。"]]},
      "en": {"title": "Musicians I love", "group": "Books & films/Music", "description": "Keeping the feelings a sound leaves behind, without rushing to define them.", "entries": [["Ryuichi Sakamoto", "Music I return to on quiet walks alone."], ["Dou Wei", "There is space in the sound that I want to stay with."], ["Faye Wong", "Some voices remain connected to a particular chapter of my life."]]}
    },
    {
      "key": "places", "source": "builtin-11", "ranked": false,
      "zh": {"title": "最想再次前往的地方", "group": "生活/远行", "description": "不一定很远，重要的是我在那里怎样感受。", "entries": [["日落前的山路", "走得慢一点，终于能听见风。"], ["雨后的植物园", "喜欢叶子上的水光和泥土的气味。"], ["家乡的河堤", "想和爸妈再散一次步。"]]},
      "en": {"title": "Places I want to revisit", "group": "Everyday life/Places", "description": "They do not have to be far away. What matters is how I feel there.", "entries": [["The mountain path before sunset", "Walking slowly enough to hear the wind."], ["The botanical garden after rain", "Water on the leaves and the smell of the earth."], ["The riverbank back home", "Somewhere I want to walk with my parents again."]]}
    },
    {
      "key": "boundaries", "source": "builtin-41", "ranked": false, "overdue": true,
      "zh": {"title": "我讨厌的相处方式", "group": "生活/相处", "description": "记下不喜欢的，也是慢慢建设自己的边界。", "entries": [["把关心变成控制", "建议可以被拒绝，亲近也需要空间。"], ["用玩笑掩盖伤害", "说出不舒服，不代表我不够大方。"], ["只在需要帮忙时出现", "我更珍惜相互关心的关系。"]]},
      "en": {"title": "Ways of relating I dislike", "group": "Everyday life/Boundaries", "description": "Writing down dislikes is also a way to build personal boundaries.", "entries": [["Care that turns into control", "Advice can be declined. Closeness still needs space."], ["Hurt disguised as a joke", "Saying that something hurts does not make me ungenerous."], ["Only showing up to ask for help", "I value relationships with care in both directions."]]}
    },
    {
      "key": "ideas", "source": "builtin-20", "ranked": false,
      "zh": {"title": "我认同的生活观念", "group": "自己/观念", "description": "不是正确答案，而是现阶段愿意认真实践的选择。", "entries": [["给没有结果的时间留一点位置", "散步、发呆、听一张完整的专辑，也有价值。"], ["喜欢不必成为擅长", "愿意投入时间，本身就足够了。"], ["允许自己改变看法", "新的经历，可以带来新的答案。"]]},
      "en": {"title": "Ideas I want to live by", "group": "Self/Ideas", "description": "Not universal answers, just choices I want to practice at this stage of life.", "entries": [["Leave room for time without an outcome", "Walks, daydreaming, and a whole album are worthwhile too."], ["Enjoying something does not require being good at it", "Wanting to spend time with it is enough."], ["Allow my opinions to change", "New experiences can bring different answers."]]}
    },
    {
      "key": "changes", "source": "builtin-44", "ranked": false, "overdue": true,
      "zh": {"title": "改变过看法的事", "group": "自己/观念", "description": "留下变化，才有机会理解自己走过的路。", "entries": [["独处不等于孤单", "慢慢发现，一个人也可以把一天过得很完整。"], ["不必把每个爱好都做成成果", "不再只用产出来衡量喜欢。"], ["承认不知道", "比急着表态，更接近我想要的诚实。"]]},
      "en": {"title": "Things I changed my mind about", "group": "Self/Ideas", "description": "Keeping the changes helps me understand the path I have taken.", "entries": [["Being alone is not the same as feeling lonely", "I am learning that a day alone can still feel complete."], ["Not every interest needs an outcome", "I no longer measure every interest by what it produces."], ["Admitting I do not know", "It feels more honest than rushing to have an opinion."]]}
    },
    {
      "key": "undecided", "source": "builtin-45", "ranked": false,
      "zh": {"title": "我还说不清的感受", "group": "", "description": "先留下一个位置，等下一次品察。", "entries": []},
      "en": {"title": "Feelings I cannot quite name", "group": "", "description": "Leaving a place for the next moment of noticing.", "entries": []}
    }
  ]
};
  const results = [];
  for (const language of ['en', 'zh']) {
    const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    const failures = [];
    tab.on('pageerror', error => failures.push(String(error)));
    try {
      await tab.clock.install({ time: new Date('2026-10-26T12:00:00+08:00') });
      await tab.addInitScript(({ language, fixture }) => {
        localStorage.setItem('tistnote-preferences-v1', JSON.stringify({ language, theme: 'light' }));
        localStorage.setItem('tistnote-introduction-seen-v1', '1');
        window.showDirectoryPicker = async () => {
          const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(language === 'zh' ? '范例资料库' : 'Demo library', { create: true });
          async function write(file, text) {
            const parts = file.split('/'); let directory = root;
            for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
            const stream = await (await directory.getFileHandle(parts.at(-1), { create: true })).createWritable();
            await stream.write(text); await stream.close();
          }
          await write('.tistnote/manifest.json', '{"schema":1}');
          for (const [index, sample] of fixture.notes.entries()) {
            const content = sample[language];
            const id = crypto.randomUUID();
            const createdAt = `2026-02-${String(3 + index).padStart(2, '0')}T04:00:00.000Z`;
            const updatedAt = sample.overdue ? `2026-06-${String(12 + index).padStart(2, '0')}T04:00:00.000Z` : '2026-10-22T04:00:00.000Z';
            const note = { id, title: content.title, description: content.description, tags: [], ranked: sample.ranked, createdAt, updatedAt,
              reviewIntervalMonths: 3, lastReviewedAt: sample.overdue ? null : '2026-10-24T04:00:00.000Z', source: sample.source,
              entries: content.entries.map(([name, reason]) => ({ id: crypto.randomUUID(), name, reason })) };
            const metadata = { ...note, schema: 1 }; delete metadata.title; delete metadata.description; delete metadata.entries;
            let markdown = `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n# ${note.title}\n\n> ${note.description}\n\n<!-- tistnote:entries -->\n\n`;
            for (const [i, entry] of note.entries.entries()) markdown += `${note.ranked ? i + 1 + '.' : '-'} ${entry.name}\n  <!-- tistnote-entry:${entry.id} -->\n  > ${entry.reason}\n\n`;
            await write(`notes/${content.group ? content.group + '/' : ''}${id}.md`, markdown);
            if (note.entries.length) {
              const dates = sample.overdue ? [createdAt, '2026-03-06T04:00:00.000Z', '2026-04-17T04:00:00.000Z', updatedAt]
                : [createdAt, `2026-03-${String(5 + index).padStart(2, '0')}T04:00:00.000Z`, `2026-05-${String(7 + index).padStart(2, '0')}T04:00:00.000Z`, `2026-07-${String(10 + index).padStart(2, '0')}T04:00:00.000Z`, `2026-09-${String(10 + index).padStart(2, '0')}T04:00:00.000Z`, updatedAt];
              for (const [i, at] of dates.entries()) {
                const snapshot = structuredClone(note); snapshot.updatedAt = at;
                if (i < dates.length - 1) snapshot.entries[0].reason = language === 'zh' ? ['最初记下的感受。', '重读后，想多留意一些具体的日常。', '新的经历，让我重新理解这个选择。'][i % 3] : ['My first impression.', 'On returning to this, I notice more of the small details.', 'A new experience has changed how I understand this choice.'][i % 3];
                const version = { id: crypto.randomUUID(), at, kind: 'edit', label: language === 'zh' ? '重新品察' : 'Looking again', note: snapshot };
                await write(`.tistnote/history/${id}/${version.id}.json`, JSON.stringify(version));
              }
              if (!sample.overdue) {
                const version = { id: crypto.randomUUID(), at: note.lastReviewedAt, kind: 'review', label: '', note };
                await write(`.tistnote/history/${id}/${version.id}.json`, JSON.stringify(version));
              }
            }
          }
          return root;
        };
      }, { language, fixture });
      await tab.goto(page.url());
      const zh = language === 'zh';
      const pick = (cn, en) => zh ? cn : en;
      await tab.getByRole('button', { name: pick('创建或打开本地资料库', 'Create or open a local library'), exact: true }).click();
      await tab.getByRole('tree').waitFor();
      if (await tab.getByRole('button', { name: pick('关闭提示', 'Dismiss tip'), exact: true }).count()) await tab.getByRole('button', { name: pick('关闭提示', 'Dismiss tip'), exact: true }).click();
      async function capture(name) {
        await tab.waitForFunction(() => !document.querySelector('.brand').disabled);
        await tab.mouse.move(1, 1);
        await tab.clock.runFor(250);
        const fonts = await tab.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(el => parseFloat(getComputedStyle(el).fontSize)));
        if (Math.min(...fonts) < 13) throw Error('Rendered text below 13px');
        const file = `docs/screenshots/${name}-${language}.png`;
        const png = await tab.screenshot({ path: file, animations: 'disabled' });
        results.push({ file, minFont: Math.min(...fonts), bytes: png.length });
      }
      const films = fixture.notes.find(n => n.key === 'films')[language].title;
      await tab.getByRole('treeitem').filter({ hasText: films }).click();
      await tab.getByRole('heading', { name: films, exact: true, level: 1 }).waitFor();
      await capture('reading');
      await tab.getByRole('button', { name: pick('笔记列表选项', 'Note list options'), exact: true }).click();
      await tab.getByRole('button', { name: pick('画布视图', 'Canvas view'), exact: true }).click();
      const notesCanvas = tab.getByRole('region', { name: pick('我的笔记画布', 'My notes canvas'), exact: true });
      await notesCanvas.waitFor();
      await capture('notes-canvas');
      await tab.getByRole('button', { name: pick('模板库', 'Templates'), exact: true }).click();
      const templates = tab.getByRole('region', { name: pick('模板库画布', 'Template library canvas'), exact: true });
      await templates.waitFor();
      const writers = templates.locator('[data-canvas-node="builtin-5"]');
      await writers.focus(); await writers.click();
      await templates.locator('.graph-popup').waitFor();
      await capture('templates');
      await tab.getByRole('button', { name: pick('历史', 'History'), exact: true }).click();
      const history = tab.locator('.activity-page'); await history.waitFor();
      await history.locator('[data-date="2026-10-22"]').click();
      await history.locator('.activity-record').first().waitFor();
      await tab.setViewportSize({ width: 1440, height: 1250 });
      await capture('history');
      if (failures.length) throw Error(failures.join('\n'));
    } finally { await context.close(); }
  }
  return results;
}
