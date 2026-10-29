async page => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { newNote, uid } = await import('/src/model.ts');
    const note = newNote();
    note.title = '一路记下的偏好与感受';
    note.entries = Array.from({ length: 35 }, (_, i) => ({ id: uid(), name: `第${i + 1}个选择`, reason: '记下当时的感受，也给以后的自己留下一些线索。' }));
    localStorage.setItem('tistnote-introduction-seen-v1', '1');
    localStorage.setItem('tistnote-development-preview-v1', JSON.stringify({ vault: { path: '长图测试', notes: [{ note, revision: 'long-qa', group: '' }], trash: [], templates: [], warnings: [], groups: [] }, history: {} }));
  });
  await page.reload();
  await page.getByRole('button', { name: '品交', exact: true }).click();
  await page.getByRole('button', { name: '展品', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '展品', exact: true });
  const format = dialog.getByRole('combobox', { name: '图片形式' });
  const ready = async () => {
    await page.waitForFunction(() => {
      const save = [...document.querySelectorAll('dialog button')].find(el => /^保存(?:全部)?图片/.test(el.textContent));
      return save && !save.disabled;
    });
    await dialog.locator('.share-image').evaluate(el => el.decode());
  };
  check(await format.inputValue() === 'long', 'Long image is not the default');
  await dialog.getByRole('textbox', { name: '署名（选填）' }).fill('小林');
  await ready();
  const dimensions = await dialog.locator('.share-image').evaluate(el => ({ width: el.naturalWidth, height: el.naturalHeight }));
  check(dimensions.width === 1000 && dimensions.height > 4000, 'Long list was not exported at full height');
  check(await dialog.locator('.preview-nav').count() === 0, 'Long image should not show page navigation');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '保存图片', exact: true }).click();
  await (await download).saveAs('output/playwright/share-long.png');
  await page.screenshot({ path: 'output/playwright/share-long-1440.png' });
  await dialog.locator('.image-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: 'output/playwright/share-long-bottom-1440.png' });
  await format.selectOption('pages');
  await ready();
  check(await dialog.locator('.share-image').evaluate(el => el.naturalHeight <= 1400), 'Paged image exceeded page height');
  await dialog.getByRole('button', { name: '下一页', exact: true }).click();
  await format.selectOption('long');
  await ready();
  check(await dialog.locator('.share-image').getAttribute('alt') === '一路记下的偏好与感受的展品长图', 'Format switch did not reset page');
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate(el => { el.scrollTop = 0; });
  const layout = await dialog.evaluate(el => ({ font: parseFloat(getComputedStyle(el.querySelector('select')).fontSize), overflow: el.scrollWidth > el.clientWidth }));
  check(layout.font >= 13 && !layout.overflow, 'Narrow layout regressed');
  await page.screenshot({ path: 'output/playwright/share-long-390.png' });
  const drawing = await page.evaluate(async () => {
    const { renderShare, MAX_LONG_HEIGHT } = await import('/src/share.ts');
    const { note } = JSON.parse(localStorage.getItem('tistnote-development-preview-v1')).vault.notes[0];
    const opts = { selected: note.entries.map(e => e.id), reasons: true, description: false, tags: false, date: false, invitation: false, message: '你会怎样选择？', signature: '小林', format: 'long' };
    const original = CanvasRenderingContext2D.prototype.fillText;
    const drawn = [];
    let images;
    try {
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
        drawn.push({ text, x, y, width: this.measureText(text).width, height: this.canvas.height, canvasWidth: this.canvas.width });
        return original.call(this, text, x, y, ...rest);
      };
      images = await renderShare(note, opts);
    } finally { CanvasRenderingContext2D.prototype.fillText = original; }
    if (images.length !== 1 || drawn.some(line => line.text.includes('上页条目续'))) throw Error('Long image was split');
    if (!drawn.some(line => line.text === '35. 第35个选择')) throw Error('Last entry lost');
    if (drawn.some(line => line.x + line.width > line.canvasWidth - 50 || line.y + 32 > line.height)) throw Error('Long image clipped');
    const invite = await renderShare(note, { ...opts, invitation: true });
    if (invite.length !== 1) throw Error('Invitation format failed');
    note.entries = Array.from({ length: 300 }, (_, i) => ({ id: `large-${i}`, name: `选项${i}`, reason: '很长的理由。'.repeat(10) }));
    const huge = { ...opts, selected: note.entries.map(e => e.id) };
    let error = '';
    try { await renderShare(note, huge); } catch (e) { error = String(e); }
    if (!error.includes('分页图片')) throw Error('Oversized long image did not fail with actionable guidance');
    const fallback = await renderShare(note, { ...huge, format: 'pages' });
    if (fallback.length < 10) throw Error('Paged fallback failed');
    return { continuous: images.length === 1, lastEntry: true, clipped: false, limit: MAX_LONG_HEIGHT, overflowError: error, fallbackPages: fallback.length };
  });
  return { dimensions, layout, drawing, formatSwitch: 'long → pages → long' };
}
