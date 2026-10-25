(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  document.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-share]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    byId('invitation-content').hidden=button.dataset.share!=='invite';
    byId('answer-content').hidden=button.dataset.share!=='answer';
  }));
  const viewer=byId('screenshot-dialog');
  document.querySelectorAll('[data-open-shot]').forEach(button=>button.addEventListener('click',()=>{
    const figure=button.closest('.product-shot');
    const image=figure.querySelector('img');
    const full=byId('screenshot-image');
    full.src=image.currentSrc||image.src;
    full.alt=image.alt;
    byId('screenshot-title').textContent=figure.dataset.shotTitle;
    viewer.showModal();
  }));
  byId('close-screenshot').addEventListener('click',()=>viewer.close());
  byId('print-button').addEventListener('click',()=>window.print());
})();

