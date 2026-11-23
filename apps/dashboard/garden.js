const $ = s => document.querySelector(s);
const selected = new Map();
let data, loading = false, practiceCommand = 'PRACTICE';
function el(tag, cls, text) { const n = document.createElement(tag); if(cls) n.className=cls; if(text !== undefined) n.textContent=text; return n; }
const statusText = { complete:'Tended today', held:'Streak protected', partial:'Taking root', in_progress:'A fresh day', missed:'A fresh day' };
function plant(p, x, y) {
  if(!p) return '';
  if(p.stage==='seed') return `<ellipse cx="${x}" cy="${y}" rx="8" ry="3" fill="#ad8262"/><path d="M${x-3} ${y-2}q3-6 7 0" fill="#c6a37a"/>`;
  const step = ['seed','sprout','leaves','developing','mature'].indexOf(p.stage);
  const h = 17 + step*17;
  let art = `<path d="M${x} ${y}Q${x-5} ${y-h/2} ${x} ${y-h}" stroke="#496344" stroke-width="3" fill="none"/>`;
  for(let i=0;i<step+1;i++) {
    const yy=y-10-i*12, dir=i%2?1:-1;
    art += `<path d="M${x} ${yy}q${dir*27} -24 ${dir*29} -4q${-dir*12} 10 ${-dir*29} 4" fill="${i%2?'#7d995b':'#587c4b'}"/><path d="M${x} ${yy}l${dir*22} -8" stroke="#a4b77d" stroke-width=".7"/>`;
  }
  if(step>=3 && p.species==='strawberry') {
    for(const d of [-12,10]) art+=`<path d="M${x} ${y-h+14}l${d} 12" stroke="#4c7047" fill="none"/><path d="M${x+d-6} ${y-h+23}q6-8 12 0q-2 15-6 15q-5-3-6-15" fill="${step===4?'#bd534b':'#f2e2c8'}"/><path d="M${x+d-5} ${y-h+22}l5 3 5-3" stroke="#496b46" fill="none"/>`;
  } else if(step>=3 && p.species!=='basil') {
    const color=p.species==='lavender'?'#8f75ad':'#c58ca0';
    for(const d of [-13,0,14]) { art+=`<path d="M${x} ${y-5}Q${x+d} ${y-h/2} ${x+d} ${y-h}" stroke="#57714c" stroke-width="2" fill="none"/>`;
      if(p.species==='lavender') for(let i=0;i<5;i++) art+=`<ellipse cx="${x+d+(i%2?2:-2)}" cy="${y-h-i*4}" rx="4" ry="5" fill="${color}"/>`;
      else { for(let i=0;i<7;i++) art+=`<ellipse cx="${x+d}" cy="${y-h-7}" rx="3" ry="9" fill="${color}" transform="rotate(${i*51} ${x+d} ${y-h})"/>`;art+=`<circle cx="${x+d}" cy="${y-h}" r="5" fill="#9c6d3f"/>`; }
    }
  }
  return art;
}
function bed(member, index) {
  const box=member.garden.boxes[index], id=`wood-${member.id}-${index}`;
  let plants='';const positions=[[150,158],[226,171],[302,185],[375,197]];
  box.slots.forEach((pid,i)=> { plants+=plant(member.garden.plants.find(p=>p.id===pid),...positions[i]); });
  const wrap=el('div','bed-wrap');
  // SVG uses only fixed artwork and validated server-generated numeric positions/UUIDs.
  wrap.innerHTML=`<svg class="garden-bed" viewBox="0 0 520 300" role="img" aria-label="Garden box"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#b48056"/><stop offset=".5" stop-color="#a36d44"/><stop offset="1" stop-color="#815132"/></linearGradient><linearGradient id="${id}-soil" x2="0" y2="1"><stop stop-color="#534333"/><stop offset="1" stop-color="#75543b"/></linearGradient><filter id="${id}-noise"><feTurbulence baseFrequency=".22" numOctaves="3" seed="5" result="raw"/><feColorMatrix in="raw" type="saturate" values="0" result="n"/><feComposite in="n" in2="SourceGraphic" operator="in"/><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs><ellipse cx="261" cy="256" rx="200" ry="26" fill="#5c5141" opacity=".13"/><path d="M58 202L166 134L468 190L357 264Z" fill="#8a6241"/><path d="M73 202L169 146L451 195L355 252Z" fill="url(#${id}-soil)" filter="url(#${id}-noise)"/><path d="M58 202L357 264V290L58 228Z" fill="url(#${id})"/><path d="M357 264L468 190V215L357 290Z" fill="#7b5036"/><path d="M58 202L166 134L468 190L457 197L168 146L72 204L357 252L457 197L468 190L357 264Z" fill="#b98c64"/><path d="M60 216L355 278M365 270l94-61" stroke="#563b2d" opacity=".3"/><path d="M88 211l225 47M96 224l162 34" stroke="#d2a77c" opacity=".38"/><g fill="#654a35"><circle cx="77" cy="215" r="2"/><circle cx="340" cy="272" r="2"/><circle cx="374" cy="264" r="2"/></g>${plants}</svg>`;
  if(box.slots.every(x=>!x)) wrap.append(el('p','empty-soil',index===0?'Ready for your first seed.':'A fresh patch, earned by you.'));
  return wrap;
}
function renderMember(member) {
  let index=Math.min(selected.get(member.id)??0,member.garden.boxes.length-1);
  const card=el('article','plot');
  const head=el('div','plot-heading'),identity=el('div','identity');
  const label=el('div'),titleRow=el('div','patch-title-row');
  titleRow.append(el('h2','patch-title',member.patchName??`${member.nickname}’s patch`));
  const nameButton=el('button','name-patch');
  nameButton.type='button';nameButton.setAttribute('aria-label','Edit patch name');nameButton.title='Edit patch name';
  nameButton.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5M4 15l5 5"/></svg>';
  nameButton.onclick=()=>{ $('#patch-name').value=member.patchName??''; updatePatchCommand(); $('#name-dialog').showModal(); $('#patch-name').focus(); };titleRow.append(nameButton);
  label.append(titleRow,el('span','owner-name',member.nickname));
  identity.append(el('span','avatar',Array.from(member.nickname)[0]),label);
  head.append(identity,el('span',`status-tag ${member.today.status}`,statusText[member.today.status]??'A fresh day'));const scene=el('div','landscape');scene.append(bed(member,index));card.append(head,scene);
  if(member.garden.boxCount>1){const nav=el('div','bed-caption');for(const dir of [-1,1]) { const b=el('button','',dir===-1?'‹':'›');b.setAttribute('aria-label',dir===-1?'Previous garden box':'Next garden box');b.disabled=index+dir<0||index+dir>=member.garden.boxCount;b.onclick=()=>{selected.set(member.id,index+dir);card.replaceWith(renderMember(member));}; if(dir===1) nav.append(el('span','',`Box ${index+1} of ${member.garden.boxCount}`));nav.append(b);}card.append(nav);}
  const info=el('div','plot-info'),stats=el('div','stats');
  for(const [value,label] of [[`${member.streak} ${member.streak===1?'day':'days'}`,'current streak'],[`${member.today.count} / ${member.today.goal}`,'words practiced today']]) {const part=el('div');part.append(el('span','stat-value',value),el('span','stat-label',label));stats.append(part);}
  const meter=el('div','meter');meter.setAttribute('aria-label',`${member.today.count} of ${member.today.goal} words practiced`);for(let i=0;i<member.today.goal;i++)meter.append(el('span',i<member.today.count?'filled':''));
  const week=el('div','week');for(const day of member.week){const item=el('div',`day ${day.status}`);item.title=`${day.date}: ${statusText[day.status]??day.status}`;item.append(el('span','',day.status==='complete'?'✓':day.status==='held'?'◒':day.status==='partial'?'·':''),el('span','',new Intl.DateTimeFormat('en',{weekday:'narrow',timeZone:'UTC'}).format(new Date(`${day.date}T12:00:00Z`))));week.append(item);}
  info.append(stats,meter,week);card.append(info);return card;
}
function render(value){data=value;practiceCommand=value.practiceCommand??'PRACTICE';$('#daily-count').textContent=`${value.tendedToday} / ${value.total}`;$('#practice-days').textContent=value.totalPracticeDays;
  $('#plots').classList.toggle('single',value.total===1);$('#plots').replaceChildren(...value.members.map(renderMember));
  if(!value.total)$('#plots').append(el('p','loading','Our garden is waiting for its first gardener.'));

  $('#activity').replaceChildren(...value.members.map(m=>{const li=el('li'),copy=el('span'),name=el('strong','',m.nickname);copy.append(name,document.createTextNode(m.today.status==='complete'?' tended their garden today.':m.today.status==='held'?' protected their streak with a little practice.':m.today.count?` has practiced ${m.today.count} words today.`:' has a fresh day ahead.'));li.append(el('span','activity-flower',m.today.status==='complete'?'✿':m.today.status==='held'?'◒':'✧'),copy);return li;}));
  $('#updated').textContent=`Updated ${new Intl.DateTimeFormat('en',{hour:'numeric',minute:'2-digit'}).format(new Date(value.updatedAt))} · Refreshes every 30 seconds`;
  if(value.webPractice){ $('.practice-note p').textContent='A few words, a little growth. Practice Korean in your private chat.'; $('#copy').textContent='Open practice'; $('#copy').onclick=()=>location.assign('/practice'); return; }
  $('.practice-note p strong').textContent=practiceCommand;$('#copy').textContent=`Copy ${practiceCommand}`;
}
async function refresh(){if(loading)return;loading=true;$('#refresh').disabled=true;try{const response=await fetch('/api/garden',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();render(await response.json());$('#notice').hidden=true;}catch{$('#notice').textContent=data?'The garden couldn’t refresh. Showing the last saved view; try again shortly.':'The garden isn’t available right now. Check that Jingu is running, then refresh.';$('#notice').hidden=false;if(!data)$('#plots').replaceChildren(el('p','loading','Your garden will appear when the connection returns.'));}finally{loading=false;$('#refresh').disabled=false;}}
$('#refresh').onclick=refresh;$('#about').onclick=$('#privacy-note').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();$('#help-dialog').addEventListener('click',e=>{if(e.target===$('#help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(practiceCommand);$('#copy-status').textContent='Copied. Paste it into your Jingu conversation.';}catch{$('#copy-status').textContent=`Type ${practiceCommand} in your Jingu conversation.`;}};
refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

function updatePatchCommand(){
  const name=$('#patch-name').value.trim();
  const valid=name.length>0&&name.length<=40&&/^[\p{L}\p{M} '’!&-]+$/u.test(name)&&/\p{L}/u.test(name);
  $('#patch-command').textContent=`${''}PATCH ${name||'Moon Garden'}`;
  $('#copy-patch').disabled=!valid;
  $('#name-error').textContent=name&&!valid?'Use letters, spaces, apostrophes, hyphens, & or !.':'';
  $('#patch-copy-status').textContent='';
}
$('#patch-name').addEventListener('input',updatePatchCommand);
$('#close-name').onclick=()=>$('#name-dialog').close();
$('#copy-patch').onclick=async()=>{try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Jingu-Request':'practice'},body:JSON.stringify({id:crypto.randomUUID(),text:$('#patch-command').textContent})});if(!r.ok)throw Error();$('#patch-copy-status').textContent='Name submitted. Your garden will refresh shortly.';}catch{$('#patch-copy-status').textContent='Could not save. Finish any pending practice message and try again.';}};
