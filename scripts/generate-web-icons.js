// Run with playwright-cli run-code --filename scripts/generate-web-icons.js while the dev server is open.
async page => {
  for (const [size, path] of [[180, 'public/apple-touch-icon.png'], [192, 'public/app-icon-192.png'], [512, 'public/app-icon-512.png']]) {
    const download = page.waitForEvent('download');
    await page.evaluate(async size => {
      const image = new Image(); image.src = new URL('app-icon.svg', document.baseURI).href; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d', {alpha:false});
      context.fillStyle = '#344f42'; context.fillRect(0, 0, size, size); context.drawImage(image, 0, 0, size, size);
      const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'icon.png'; link.click();
    }, size);
    await (await download).saveAs(path);
  }
  return { icons: [180, 192, 512], source: 'public/app-icon.svg', background: '#344f42' };
}
