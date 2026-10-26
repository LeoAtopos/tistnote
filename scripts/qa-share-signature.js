async page => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { newNote, uid } = await import('/src/model.ts');
    const note = newNote();
    note.title = '我最喜欢的作家';
    note.entries = [
      ['鲁迅', '清醒而有力量的文字。'],
      ['史铁生', '在生命的困境里，仍然看见辽阔。'],
      ['迟子建', '日常与山川，都有自己的温度。'],
    ].map(([name, reason]) => ({ id: uid(), name, reason }));
    localStorage.setItem('tistnote-introduction-seen-v1', '1');
    localStorage.setItem('tistnote-development-preview-v1', JSON.stringify({
      vault: { path: '署名测试资料库', notes: [{ note, revision: 'signature-qa', group: '' }], trash: [], templates: [], warnings: [], groups: [] }, history: {},
    }));
  });
  await page.reload();
  const open = async name => {
    await page.getByRole('button', { name: '品交', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    return page.getByRole('dialog', { name, exact: true });
  };
  const savePreview = async (dialog, label) => {
    await dialog.getByRole('button', { name: /^保存(?:全部)?图片/ }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => ![...document.querySelectorAll('dialog button')].find(el => /^保存(?:全部)?图片/.test(el.textContent)).disabled);
    await dialog.locator('.share-image').evaluate(el => el.decode());
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /^保存(?:全部)?图片/ }).click();
    await (await download).saveAs(`output/playwright/signature-${label}.png`);
  };
  for (const [name, mode] of [['展品', 'share'], ['求品', 'invite']]) {
    const dialog = await open(name);
    const input = dialog.getByRole('textbox', { name: '署名（选填）' });
    check(await input.inputValue() === '', 'Identity must default to anonymous');
    await input.fill('小林');
    await savePreview(dialog, `${mode}-named`);
    await page.screenshot({ path: `output/playwright/signature-${mode}-1440.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await dialog.evaluate(el => ({
      minFont: Math.min(...[...el.querySelectorAll('label,input,textarea,legend,button,p')].filter(n => n.getClientRects().length).map(n => parseFloat(getComputedStyle(n).fontSize))),
      overflow: el.scrollWidth > el.clientWidth,
    }));
    check(audit.minFont >= 18 && !audit.overflow, 'Narrow screen font or overflow regression');
    await page.screenshot({ path: `output/playwright/signature-${mode}-390.png` });
    await input.fill('');
    await savePreview(dialog, `${mode}-anonymous`);
    await dialog.getByRole('button', { name: '关闭对话框', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const rendering = await page.evaluate(async () => {
    const { renderShare } = await import('/src/share.ts');
    const { newNote, uid } = await import('/src/model.ts');
    const note = newNote();
    note.title = '在不同季节里，我反复读过的那些作家与他们留下来的生活片段'.repeat(3);
    note.entries = [{ id: uid(), name: '秘密作家', reason: '绝不能出现在求品中的私人理由。'.repeat(120) }];
    const opts = { selected: [note.entries[0].id], reasons: true, description: false, tags: true, date: true, invitation: false, message: '你最珍视哪些文字？', signature: '认真读书也认真生活的品友'.repeat(3).slice(0, 40), format: 'pages' };
    const original = CanvasRenderingContext2D.prototype.fillText;
    const runs = [];
    try {
      for (const invitation of [false, true]) {
        for (const signature of [opts.signature, '   ']) {
          const drawn = [];
          CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
            drawn.push({ text, x, y, width: this.measureText(text).width, font: this.font, canvasWidth: this.canvas.width, canvasHeight: this.canvas.height });
            return original.call(this, text, x, y, ...rest);
          };
          const images = await renderShare(note, { ...opts, invitation, signature });
          if (drawn.some(line => line.x + line.width > line.canvasWidth - 50 || line.y + 32 > line.canvasHeight)) throw Error('Clipped signature or content');
          if (invitation && drawn.some(line => line.text.includes('秘密作家') || line.text.includes('私人理由'))) throw Error('Invitation leaked answers');
          if (!signature.trim() && drawn.some(line => line.text.includes('认真读书'))) throw Error('Anonymous image leaked previous name');
          const headings = drawn.filter(line => line.y === 48);
          if (headings.length !== images.length) throw Error('Every page must repeat attribution');
          if (!invitation && images.length < 3) throw Error('Long signature pagination not exercised');
          const body = drawn.filter(line => line.font.includes('32px'));
          if (body.some(line => line.y < 200 && !line.text.includes('品记'))) throw Error('Header overlaps body');
          runs.push({ invitation, anonymous: !signature.trim(), pages: images.length, clipped: false });
        }
      }
    } finally { CanvasRenderingContext2D.prototype.fillText = original; }
    return runs;
  });
  return { ui: 'named/anonymous for both modes, live PNG export, 1440 and 390 widths', rendering };
}
