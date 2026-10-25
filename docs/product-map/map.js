(() => {
  const {branches,features,shots}=window.PRODUCT_MAP;
  const $=id=>document.getElementById(id);
  const dialog=$('feature-dialog'),search=$('search');
  let active=null,shotIndex=0,returnFocus=null;
  const chevron='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  for(const [i,branch] of branches.entries()){
    const detail=document.createElement('details');
    detail.className='map-branch';detail.open=true;detail.dataset.branch=branch.id;
    const summary=document.createElement('summary');
    summary.innerHTML=`${branch.title}<span class="branch-count">${branch.features.length} 个功能 ${chevron}</span>`;
    const list=document.createElement('ul');list.className='node-list';
    for(const id of branch.features){
      const f=features.find(f=>f.id===id),li=document.createElement('li'),button=document.createElement('button');
      button.className='feature-node';button.dataset.feature=id;button.textContent=f.title;
      button.setAttribute('aria-haspopup','dialog');
      button.addEventListener('click',()=>openFeature(id,button));li.append(button);list.append(li);
    }
    detail.append(summary,list);detail.addEventListener('toggle',drawConnections);
    $(i<3?'left-branches':'right-branches').append(detail);
  }
  function drawConnections(){
    const map=$('mindmap'),svg=map.querySelector('.connections'),box=map.getBoundingClientRect(),root=$('root-node').getBoundingClientRect();
    svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);svg.replaceChildren();
    if(matchMedia('(max-width:700px)').matches)return;
    for(const detail of map.querySelectorAll('.map-branch:not([hidden])')){
      const left=detail.closest('.left'),target=detail.querySelector('summary').getBoundingClientRect();
      const x1=(left?root.left:root.right)-box.left,y1=root.top+root.height/2-box.top;
      const x2=(left?target.right:target.left)-box.left,y2=target.top+target.height/2-box.top;
      const middle=(x1+x2)/2,path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',`M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`);svg.append(path);
    }
  }
  function selectShot(index){
    shotIndex=index;const f=features.find(f=>f.id===active),item=f.shots[index],shot=shots[item.id];
    const image=$('product-image');image.src=shot.src;image.alt=`${f.title}：${item.title}，范例1的实际产品界面`;
    image.width=shot.width;image.height=shot.height;
    $('shot-caption').textContent=`${item.title} · ${shot.width} × ${shot.height} · 原尺寸，可横向和纵向滚动`;
    $('original-link').href=shot.src;
    $('original-link').download=`品记-${item.id}.png`;
    for(const [i,button] of [...$('shot-tabs').children].entries())button.setAttribute('aria-pressed',String(i===index));
    const viewport=document.querySelector('.shot-viewport');viewport.scrollTo({left:0,top:0,behavior:'instant'});
  }
  function openFeature(id,trigger=null,changeHash=true){
    const index=features.findIndex(f=>f.id===id);if(index<0)return;
    if(!dialog.open)returnFocus=trigger||document.activeElement;
    active=id;const f=features[index],branch=branches.find(b=>b.features.includes(id));
    $('breadcrumb').textContent=`品记 / ${branch.title}`;
    $('feature-title').textContent=f.title;$('feature-value').textContent=f.value;$('feature-path').textContent=f.path;
    $('feature-case').textContent=f.example;
    $('feature-points').replaceChildren(...f.points.map(text=>{const li=document.createElement('li');li.textContent=text;return li}));
    $('feature-limit').hidden=!f.limit;$('feature-limit').textContent=f.limit||'';
    $('shot-tabs').replaceChildren(...f.shots.map((item,i)=>{const b=document.createElement('button');b.textContent=item.title;b.addEventListener('click',()=>selectShot(i));return b}));
    $('previous-feature').disabled=index===0;$('next-feature').disabled=index===features.length-1;
    $('tour-position').textContent=`${index+1} / ${features.length}`;
    document.querySelectorAll('.feature-node').forEach(b=>b.setAttribute('aria-current',String(b.dataset.feature===id)));
    selectShot(0);if(!dialog.open)dialog.showModal();document.querySelector('.viewer-content').scrollTo({top:0,behavior:'instant'});
    if(changeHash)history.replaceState(null,'',`#${id}`);
  }
  function closeFeature(){dialog.close();history.replaceState(null,'',location.pathname+location.search);returnFocus?.focus({preventScroll:true});}
  $('close-viewer').addEventListener('click',closeFeature);
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeFeature()});
  $('start-tour').addEventListener('click',e=>openFeature(features[0].id,e.currentTarget));
  $('previous-feature').addEventListener('click',()=>openFeature(features[features.findIndex(f=>f.id===active)-1]?.id));
  $('next-feature').addEventListener('click',()=>openFeature(features[features.findIndex(f=>f.id===active)+1]?.id));
  const total=`${branches.length} 个分支 · ${features.length} 项功能 · ${Object.keys(shots).length} 张截图`;
  $('map-count').textContent=total;
  search.addEventListener('input',()=>{
    const query=search.value.trim().toLocaleLowerCase();let count=0;
    for(const branch of branches){
      const detail=document.querySelector(`[data-branch="${branch.id}"]`);let found=0;
      for(const id of branch.features){const f=features.find(f=>f.id===id),node=detail.querySelector(`[data-feature="${id}"]`);const match=!query||[branch.title,f.title,f.value,f.path,f.example,...f.points].join(' ').toLocaleLowerCase().includes(query);node.closest('li').hidden=!match;if(match){found++;count++}}
      detail.hidden=found===0;if(query)detail.open=true;
    }
    $('empty').hidden=count>0;$('root-node').hidden=count===0;$('map-count').textContent=query?`找到 ${count} 项功能`:total;drawConnections();
  });
  $('expand-all').addEventListener('click',()=>{document.querySelectorAll('.map-branch').forEach(el=>el.open=true)});
  $('collapse-all').addEventListener('click',()=>{document.querySelectorAll('.map-branch').forEach(el=>el.open=false)});
  new ResizeObserver(drawConnections).observe($('mindmap'));
  window.addEventListener('hashchange',()=>{if(location.hash)openFeature(decodeURIComponent(location.hash.slice(1)),null,false);else if(dialog.open)closeFeature()});
  if(location.hash)openFeature(decodeURIComponent(location.hash.slice(1)),null,false);
  document.fonts.ready.then(drawConnections);
})();
