async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 960 } });
  try {
    const tab = await context.newPage();
    await tab.addInitScript(() => {
      localStorage.setItem('tistnote-preferences-v1', JSON.stringify({ language: 'en', theme: 'light' }));
      localStorage.setItem('tistnote-introduction-seen-v1', '1');
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(window.qaLibrary ?? 'view-A', { create: true });
    });
    await tab.goto('http://127.0.0.1:1420/');
    await tab.getByRole('button', { name: 'Create or open a local library', exact: true }).click();
    const seed = async () => {
      await tab.getByRole('button', { name: 'Write a new note', exact: true }).click();
      await tab.getByRole('button', { name: 'Cancel editing', exact: true }).click();
    };
    const canvas = async () => {
      await tab.getByRole('button', { name: 'Note list options', exact: true }).click();
      await tab.getByRole('button', { name: 'Canvas view', exact: true }).click();
      await tab.locator('.note-canvas').waitFor();
    };
    const file = name => tab.evaluate(async name => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
      return JSON.parse(await (await (await root.getDirectoryHandle('.tistnote')).getFileHandle('canvas.json')).getFile().then(f => f.text()));
    }, name);
    const switchLibrary = async name => {
      await tab.evaluate(name => { window.qaLibrary = name; }, name);
      await tab.locator('.rail').getByRole('button', { name: 'Settings', exact: true }).click();
      await tab.getByRole('dialog').getByRole('button', { name: 'Create / switch library', exact: true }).click();
      await tab.getByRole('dialog').waitFor({ state: 'hidden' });
    };
    await seed(); await canvas();
    if ((await file('view-A')).noteView !== 'canvas') throw Error('View was not written into library A');
    await tab.reload(); await tab.locator('.note-canvas').waitFor();
    await switchLibrary('view-B'); await seed();
    if (await tab.locator('.note-canvas').count()) throw Error('Library B inherited A view');
    await canvas();
    await tab.getByRole('button', { name: 'List view', exact: true }).click();
    await tab.locator('.file-tree').waitFor();
    if ((await file('view-B')).noteView !== 'list') throw Error('List view was not persisted');
    await tab.reload(); await tab.locator('.file-tree').waitFor();
    if (await tab.locator('.note-canvas').count()) throw Error('List view did not survive reload');
    await switchLibrary('view-A'); await tab.locator('.note-canvas').waitFor();
    if ((await file('view-A')).noteView !== 'canvas') throw Error('Library A preference was overwritten');
    return { storage: 'isolated real browser file handles', canvasReload: true, listReload: true, perLibrary: true };
  } finally { await context.close(); }
}
