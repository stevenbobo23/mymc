// ---------------- 背包数据 ----------------
const inv={
  hot:new Array(9).fill(null),
  store:new Array(27).fill(null),
  armor:new Array(4).fill(null),
  craft2:new Array(4).fill(null),
  craft3:new Array(9).fill(null)
};
let cursor=null; // {id,count}
const slotEls=[]; // {el,area,idx}
function getSlot(ref){
  switch(ref.area){
    case 'hot':return inv.hot[ref.idx];
    case 'store':return inv.store[ref.idx];
    case 'armor':return inv.armor[ref.idx];
    case 'craft2':return inv.craft2[ref.idx];
    case 'craft3':return inv.craft3[ref.idx];
    case 'fin':return curFurn?curFurn.state.in:null;
    case 'ffuel':return curFurn?curFurn.state.fuel:null;
    case 'fout':return curFurn?curFurn.state.out:null;
    case 'chest':return curChest?curChest.state.slots[ref.idx]:null;
    case 'ench':return curEnch?curEnch.slot:null;
  }
  return null;
}
function setSlot(ref,v){
  switch(ref.area){
    case 'hot':inv.hot[ref.idx]=v;break;
    case 'store':inv.store[ref.idx]=v;break;
    case 'armor':inv.armor[ref.idx]=v;break;
    case 'craft2':inv.craft2[ref.idx]=v;break;
    case 'craft3':inv.craft3[ref.idx]=v;break;
    case 'fin':if(curFurn)curFurn.state.in=v;break;
    case 'ffuel':if(curFurn)curFurn.state.fuel=v;break;
    case 'fout':if(curFurn)curFurn.state.out=v;break;
    case 'chest':if(curChest)curChest.state.slots[ref.idx]=v;break;
    case 'ench':if(curEnch)curEnch.slot=v;break;
  }
}
function maxStackOf(id){return ITEMS[id]?(ITEMS[id].maxStack||64):64;}
function addItemToInv(id,count){
  const max=maxStackOf(id);
  function tryStack(arr){
    for(let i=0;i<arr.length&&count>0;i++){
      const s=arr[i];
      if(s&&s.id===id&&s.count<max){const m=Math.min(max-s.count,count);s.count+=m;count-=m;}
    }
  }
  function tryEmpty(arr){
    for(let i=0;i<arr.length&&count>0;i++){
      if(!arr[i]){const m=Math.min(max,count);arr[i]={id,count:m};count-=m;}
    }
  }
  tryStack(inv.hot);tryStack(inv.store);tryEmpty(inv.hot);tryEmpty(inv.store);
  updateHotbar();refreshPanels();updateTasks();
  return count;
}
function hasItem(id){
  for(const s of inv.hot)if(s&&s.id===id)return true;
  for(const s of inv.store)if(s&&s.id===id)return true;
  for(const s of inv.armor)if(s&&s.id===id)return true;
  return false;
}
function hasAny(ids){return ids.some(hasItem);}

// ---------------- 槽位 UI ----------------
function makeSlot(area,idx){
  const el=document.createElement('div');
  el.className='slot'+(area==='armor'?' armor-slot':'');
  el.dataset.area=area;el.dataset.idx=idx;
  const cv=document.createElement('canvas');cv.width=16;cv.height=16;
  el.appendChild(cv);
  const sp=document.createElement('span');sp.className='cnt';
  el.appendChild(sp);
  el.addEventListener('click',()=>handleSlotAction({area:el.dataset.area,idx:+el.dataset.idx},{}));
  el.addEventListener('contextmenu',e=>{e.preventDefault();handleSlotAction({area:el.dataset.area,idx:+el.dataset.idx},{single:true});});
  let lpT=null,lp=false;
  el.addEventListener('touchstart',e=>{
    e.preventDefault();e.stopPropagation();
    lp=false;
    lpT=setTimeout(()=>{lp=true;handleSlotAction({area:el.dataset.area,idx:+el.dataset.idx},{single:true});},420);
  },{passive:false});
  el.addEventListener('touchend',e=>{
    e.preventDefault();
    clearTimeout(lpT);
    if(!lp)handleSlotAction({area:el.dataset.area,idx:+el.dataset.idx},{});
  },{passive:false});
  slotEls.push({el,area,idx});
  return el;
}
function handleSlotAction(ref,opts){
  opts=opts||{};
  if(ref.area==='out2'){takeCraft(inv.craft2);refreshAll();return;}
  if(ref.area==='out3'){takeCraft(inv.craft3);refreshAll();return;}
  const slot=getSlot(ref);
  if(ref.area==='fout'){
    if(slot){
      if(!cursor){cursor=slot;setSlot(ref,null);sfx.pickup();}
      else if(cursor.id===slot.id&&cursor.count+slot.count<=maxStackOf(slot.id)){
        cursor.count+=slot.count;setSlot(ref,null);sfx.pickup();
      }
    }
    refreshAll();return;
  }
  if(ref.area==='armor'){
    if(cursor){
      const it=ITEMS[cursor.id];
      if(it&&it.type==='armor'&&it.armorSlot===ref.idx){
        if(!slot){setSlot(ref,{id:cursor.id,count:1});cursor.count--;if(cursor.count<=0)cursor=null;sfx.equip();}
        else{const tmp=slot;setSlot(ref,{id:cursor.id,count:1});cursor=tmp;sfx.equip();}
        onArmorChanged();
      }
    }else if(slot){
      cursor=slot;setSlot(ref,null);onArmorChanged();
    }
    refreshAll();return;
  }
  if(!cursor&&slot){
    if(opts.single&&slot.count>1){
      const half=Math.ceil(slot.count/2);
      cursor={id:slot.id,count:half};
      slot.count-=half;
      if(slot.count<=0)setSlot(ref,null);
    }else{cursor=slot;setSlot(ref,null);}
  }
  else if(cursor&&!slot){
    if(opts.single){setSlot(ref,{id:cursor.id,count:1});cursor.count--;if(cursor.count<=0)cursor=null;}
    else{setSlot(ref,cursor);cursor=null;}
  }
  else if(cursor&&slot){
    if(opts.single){
      if(slot.id===cursor.id&&slot.count<maxStackOf(slot.id)){
        slot.count++;cursor.count--;if(cursor.count<=0)cursor=null;
      }else if(slot.id!==cursor.id){setSlot(ref,cursor);cursor=slot;}
    }
    else if(slot.id===cursor.id&&slot.count<maxStackOf(slot.id)){
      const mv=Math.min(cursor.count,maxStackOf(slot.id)-slot.count);
      slot.count+=mv;cursor.count-=mv;
      if(cursor.count<=0)cursor=null;
    }else{
      setSlot(ref,cursor);cursor=slot;
    }
  }
  refreshAll();
}
function renderSlotEl(rec){
  const el=rec.el,cv=el.querySelector('canvas'),sp=el.querySelector('.cnt');
  const ctx=cv.getContext('2d');
  let slot=null,ghost=0;
  if(rec.area==='out2'||rec.area==='out3'){
    const grid=rec.area==='out2'?inv.craft2:inv.craft3;
    const r=matchRecipe(grid);
    slot=r?{id:r.out.id,count:r.out.count}:null;
  }else{
    slot=getSlot({area:rec.area,idx:rec.idx});
  }
  ctx.clearRect(0,0,16,16);
  el.classList.toggle('enchGlint',!!(slot&&slot.ench)); // 附魔的装备闪紫光
  if(slot){
    drawItemIcon(ctx,slot.id);
    sp.textContent=slot.count>1?(slot.count>=999?'∞':slot.count):'';
  }else{
    sp.textContent='';
    if(rec.area==='armor'){
      const kinds=['helmet','chest','legs','boots'];
      ctx.globalAlpha=0.35;
      armorIcon(kinds[rec.idx],'#555')(ctx);
      ctx.globalAlpha=1;
    }
  }
}
function refreshPanels(){
  for(const rec of slotEls){
    if(!rec.el.isConnected)continue;
    renderSlotEl(rec);
  }
  updateCursorEl();
  if(curEnch&&$('enchPanel')&&!$('enchPanel').classList.contains('hidden'))updateEnchInfo();
}
function refreshAll(){
  refreshPanels();updateHotbar();updateTasks();
}
function updateCursorEl(){
  const ce=$('cursor'),cv=$('cursorCv'),sp=$('cursorCnt');
  if(cursor){
    ce.classList.remove('hidden');
    drawItemIcon(cv.getContext('2d'),cursor.id);
    sp.textContent=cursor.count>1?(cursor.count>=999?'∞':cursor.count):'';
  }else ce.classList.add('hidden');
}
document.addEventListener('mousemove',e=>{
  const ce=$('cursor');
  ce.style.left=(e.clientX+6)+'px';ce.style.top=(e.clientY+6)+'px';
});
document.addEventListener('touchstart',e=>{
  const t=e.changedTouches[0];
  const ce=$('cursor');
  ce.style.left=(t.clientX+6)+'px';ce.style.top=(t.clientY+6)+'px';
},{passive:true});

// ---------------- 合成 ----------------
function matchRecipe(grid){
  const n=Math.sqrt(grid.length)|0;
  const counts={};let total=0;
  for(const s of grid)if(s){counts[s.id]=(counts[s.id]||0)+s.count;total+=s.count;}
  const anyItem=total>0;
  if(!anyItem)return null;
  for(const r of RECIPES){
    if(r.mode&&r.mode!==gameMode)continue; // 模式专属配方（如空岛）
    if(r.type==='shapeless'){
      let need=0,ok=true;
      for(const k in r.ing){need+=r.ing[k];}
      if(need!==total)continue;
      for(const k in r.ing){if((counts[k]||0)!==r.ing[k]){ok=false;break;}}
      if(!ok)continue;
      for(const k in counts){if(!r.ing[k]){ok=false;break;}}
      if(ok)return r;
    }else{
      if(matchShaped(grid,n,r))return r;
    }
  }
  return null;
}
function matchShaped(grid,n,r){
  const rows=r.pat.length,cols=r.pat[0].length;
  if(rows>n||cols>n)return false;
  // 网格中每个格子必须恰好与图案(可平移/镜像)一致
  for(let oy=0;oy<=n-rows;oy++)for(let ox=0;ox<=n-cols;ox++){
    if(tryPat(grid,n,r,ox,oy,false))return true;
    if(tryPat(grid,n,r,ox,oy,true))return true;
  }
  return false;
}
function tryPat(grid,n,r,ox,oy,mirror){
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const s=grid[y*n+x];
    const id=s?s.id:0;
    let ch=' ';
    const gx=x-ox,gy=y-oy;
    if(gx>=0&&gx<r.pat[0].length&&gy>=0&&gy<r.pat.length){
      const cc=mirror?r.pat[0].length-1-gx:gx;
      ch=r.pat[gy][cc];
    }
    const want=ch===' '?0:r.key[ch];
    if(id!==(want||0))return false;
  }
  return true;
}
function takeCraft(grid){
  // 一键合成：点一次成品，把材料能合成的全部合成出来
  let crafted=0,guard=0;
  while(guard++<9999){
    const r=matchRecipe(grid);
    if(!r)break;
    const res=r.out;
    if(cursor&&!(cursor.id===res.id&&cursor.count+res.count<=maxStackOf(res.id)))break;
    if(r.type==='shaped'){
      for(let i=0;i<grid.length;i++){
        const s=grid[i];
        if(s){s.count--;if(s.count<=0)grid[i]=null;}
      }
    }else{
      for(const k in r.ing){
        let need=r.ing[k];
        for(let i=0;i<grid.length&&need>0;i++){
          const s=grid[i];
          if(s&&s.id===+k){
            const mv=Math.min(s.count,need);s.count-=mv;need-=mv;
            if(s.count<=0)grid[i]=null;
          }
        }
      }
    }
    if(!cursor)cursor={id:res.id,count:res.count};
    else cursor.count+=res.count;
    crafted++;
  }
  if(crafted>0){
    sfx.craft();
    if(crafted>1)showToast('一次合成了 '+crafted+' 批！');
    refreshAll();
  }
}

// ---------------- 熔炉 ----------------
const furnStates={};
let curFurn=null;
function getFurnState(x,y,z){
  const key=x+','+y+','+z;
  if(!furnStates[key])furnStates[key]={in:null,fuel:null,out:null,burn:0,burnMax:1,prog:0};
  return furnStates[key];
}
// ---------------- 箱子 ----------------
const chestStates={}; // "x,y,z" -> {slots:[27]}
let curChest=null;
function getChestState(x,y,z){
  const key=x+','+y+','+z;
  if(!chestStates[key])chestStates[key]={slots:new Array(27).fill(null)};
  return chestStates[key];
}
function canFurnOut(st,outId){
  return !st.out||(st.out.id===outId&&st.out.count<maxStackOf(outId));
}
function updateFurnaces(dt){
  for(const key in furnStates){
    const st=furnStates[key];
    const outId=st.in?SMELT[st.in.id]:0;
    if(st.burn>0){
      st.burn-=dt;
      if(outId&&canFurnOut(st,outId)){
        st.prog+=dt/4;
        if(st.prog>=1){
          st.prog=0;
          st.in.count--;if(st.in.count<=0)st.in=null;
          if(!st.out)st.out={id:outId,count:1};else st.out.count++;
          sfx.smelt();
        }
      }
    }else{
      st.prog=0;
      if(outId&&st.fuel&&FUEL[st.fuel.id]&&canFurnOut(st,outId)){
        const v=FUEL[st.fuel.id];
        st.fuel.count--;if(st.fuel.count<=0)st.fuel=null;
        st.burn=v*4;st.burnMax=v*4;
      }
    }
  }
}
function updateFurnaceUI(){
  if($('furnacePanel').classList.contains('hidden')||!curFurn)return;
  const st=curFurn.state;
  $('furnProg').style.height=Math.round(st.prog*100)+'%';
  $('furnFire').style.opacity=st.burn>0?1:0.25;
}

// ---------------- HUD: 快捷栏/生命/护甲 ----------------
const hudSlots=[];
function buildHudHotbar(){
  const hb=$('hotbar');
  hb.innerHTML='';
  hudSlots.length=0;
  for(let i=0;i<9;i++){
    const el=document.createElement('div');
    el.className='slot';el.dataset.idx=i;
    const cv=document.createElement('canvas');cv.width=16;cv.height=16;
    el.appendChild(cv);
    const sp=document.createElement('span');sp.className='cnt';
    el.appendChild(sp);
    el.addEventListener('click',()=>{player.sel=i;sfx.select();updateHotbar();});
    hb.appendChild(el);
    hudSlots.push({el,cv,sp});
  }
  hb.addEventListener('touchstart',e=>{
    const s=e.target.closest('.slot');
    if(s){e.preventDefault();player.sel=+s.dataset.idx;sfx.select();updateHotbar();}
  },{passive:false});
}
function updateHotbar(){
  if(typeof showHeldItem==='function')showHeldItem(); // 切槽时刷新手持武器模型
  for(let i=0;i<9;i++){
    const rec=hudSlots[i];
    if(!rec)continue;
    const s=inv.hot[i];
    const ctx=rec.cv.getContext('2d');
    ctx.clearRect(0,0,16,16);
    if(s){drawItemIcon(ctx,s.id);rec.sp.textContent=s.count>1?(s.count>=999?'∞':s.count):'';}
    else rec.sp.textContent='';
    rec.el.classList.toggle('sel',i===player.sel);
    rec.el.classList.toggle('enchGlint',!!(s&&s.ench)); // 快捷栏也闪紫光
  }
}
function drawBarIcon(ctx,x,kind,filled){
  // kind: 'heart'|'armor'; filled: 0空 1半 2满
  const pat=kind==='heart'?
    ['0110110','1111111','1111111','0111110','0011100','0001000']:
    ['11011','11111','11111','01110'];
  const sc=kind==='heart'?2:3;
  const full=kind==='heart'?'#e02525':'#9ab4c0';
  const empty='#2a2a2a';
  const w=pat[0].length;
  for(let r=0;r<pat.length;r++)for(let c=0;c<w;c++){
    if(pat[r][c]!=='1')continue;
    let col=empty;
    if(filled===2)col=full;
    else if(filled===1)col=(c<w/2)?full:empty;
    ctx.fillStyle=col;
    ctx.fillRect(x+c*sc,2+r*sc,sc,sc);
  }
}
function updateHearts(){
  const cv=$('heartsCv'),ctx=cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  for(let i=0;i<10;i++){
    const v=player.hp-i*2;
    drawBarIcon(ctx,i*18,'heart',v>=2?2:(v===1?1:0));
  }
}
function updateArmorBar(){
  const cv=$('armorCv'),ctx=cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  const a=totalArmor();
  if(a<=0)return;
  for(let i=0;i<10;i++){
    const v=a-i*2;
    if(v<=0)continue;
    drawBarIcon(ctx,i*18,'armor',v>=2?2:(v===1?1:0));
  }
}
function onArmorChanged(){
  updateArmorBar();drawPaperDoll();updateTasks();
}

// ---------------- 皮肤 ----------------
const SKINS=[
  {name:'史蒂夫',skin:'#d8a07a',hair:'#6b4f2a',shirt:'#3a8ea5',pants:'#4a4a8a',shoes:'#5a5a5a',eye:'#222'},
  {name:'艾利克斯',skin:'#e8b48c',hair:'#c96a2e',shirt:'#5a8a4a',pants:'#7a5a8a',shoes:'#8a6a4a',eye:'#2a5a2a'},
  {name:'僵尸',skin:'#5a8a5a',hair:'#3a5a3a',shirt:'#3a6a6a',pants:'#4a4a7a',shoes:'#4a4a4a',eye:'#1a2a1a'},
  {name:'苦力怕',skin:'#6aaa5a',hair:'#4a7a3a',shirt:'#6aaa5a',pants:'#5a9a4a',shoes:'#4a7a3a',eye:'#111'},
  {name:'末影人',skin:'#1a1a1a',hair:'#0a0a0a',shirt:'#1a1a1a',pants:'#1a1a1a',shoes:'#111',eye:'#a05ae0'},
  {name:'Herobrine',skin:'#d8a07a',hair:'#4a3a22',shirt:'#3a8ea5',pants:'#4a4a8a',shoes:'#5a5a5a',eye:'#fff'},
  {name:'猪猪',skin:'#e8a0b0',hair:'#d88a9a',shirt:'#e8a0b0',pants:'#d88a9a',shoes:'#c87a8a',eye:'#222'},
  {name:'村民',skin:'#c89878',hair:'#6a5a3a',shirt:'#8a6a4a',pants:'#5a4a3a',shoes:'#4a3a2a',eye:'#3a5a2a'}
];
let skinIdx=0;
function curSkin(){return SKINS[skinIdx]||SKINS[0];}

// ---------------- 纸娃娃 ----------------
function drawPaperDoll(){
  const cv=$('dollCv');if(!cv)return;
  const ctx=cv.getContext('2d');
  const s=4; // 16x32 逻辑像素
  ctx.clearRect(0,0,64,128);
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x*s,y*s,w*s,h*s);}
  function shadeRect(x,y,w,h,c){
    rect(x,y,w,h,c);
    ctx.fillStyle='rgba(0,0,0,0.18)';
    ctx.fillRect(x*s,(y+h-1)*s,w*s,s);
    ctx.fillRect((x+w-1)*s,y*s,s,h*s);
  }
  const armor=inv.armor;
  const matOf=i=>armor[i]?ITEMS[armor[i].id].mat:null;
  const colOf=i=>{const m=matOf(i);return m?MAT_COLOR[m]:null;};
  const sk=curSkin();
  // 腿(底层)
  shadeRect(4,16,4,10,colOf(2)||sk.pants);
  shadeRect(8,16,4,10,colOf(2)||sk.pants);
  // 靴子
  shadeRect(4,26,4,4,colOf(3)||sk.shoes);
  shadeRect(8,26,4,4,colOf(3)||sk.shoes);
  // 身体
  shadeRect(4,8,8,8,colOf(1)||sk.shirt);
  // 手臂
  shadeRect(2,8,2,8,colOf(1)||sk.skin);
  shadeRect(12,8,2,8,colOf(1)||sk.skin);
  // 头
  shadeRect(4,0,8,8,colOf(0)||sk.skin);
  if(!armor[0]){
    rect(6,3,1,2,sk.eye);rect(9,3,1,2,sk.eye);
    rect(4,0,8,2,sk.hair);
  }else{
    ctx.fillStyle='rgba(255,255,255,0.25)';
    ctx.fillRect(4*s,0,8*s,1*s);
  }
}

// ---------------- 任务引导 ----------------
const SURVIVAL_TASKS=[
  {t:'砍树：获得橡木原木',c:()=>hasItem(B_LOG)},
  {t:'合成橡木木板',c:()=>hasItem(B_PLANKS)},
  {t:'合成木棍',c:()=>hasItem(I.stick)},
  {t:'制作工作台',c:()=>hasItem(B_TABLE)},
  {t:'做一把木镐',c:()=>hasItem(I.wood_pickaxe)},
  {t:'挖到圆石',c:()=>hasItem(B_COBBLE)},
  {t:'制作熔炉',c:()=>hasItem(B_FURNACE)},
  {t:'烧炼出铁锭',c:()=>hasItem(I.iron_ingot)},
  {t:'获得一件铁甲',c:()=>hasAny([I.iron_helmet,I.iron_chest,I.iron_legs,I.iron_boots])},
  {t:'深入地下挖到钻石 (y<16)',c:()=>hasItem(I.diamond)},
  {t:'制作一件钻石甲',c:()=>hasAny([I.diamond_helmet,I.diamond_chest,I.diamond_legs,I.diamond_boots])},
  {t:'挖远古残骸烧成碎片 (y<12)',c:()=>hasItem(I.netherite_scrap)},
  {t:'合成下界合金锭',c:()=>hasItem(I.netherite_ingot)},
  {t:'升级下界合金甲！',c:()=>hasAny([I.netherite_helmet,I.netherite_chest,I.netherite_legs,I.netherite_boots])},
  {t:'升级一件下界合金工具（镐/斧/剑/锹/锄头）⛏️',c:()=>hasAny([I.netherite_pickaxe,I.netherite_axe,I.netherite_sword,I.netherite_shovel,I.netherite_hoe])},
  {t:'骑一次快乐恶魂 ☁️（右键点它）',c:()=>rodeGhast},
  {t:'夜晚打嘎吱怪：获得树脂团',c:()=>hasItem(I.resin_clump)},
  {t:'合成树脂块 🧡',c:()=>hasItem(B_RESIN)},
  {t:'打僵尸：获得腐肉 🧟',c:()=>hasItem(I.rotten_flesh)},
  {t:'挖到红石粉 (y<22，需铁镐)',c:()=>hasItem(I.redstone)},
  {t:'合成一个活塞 ⚙️（手拿红石粉点它）',c:()=>hasItem(B_PISTON)},
  {t:'打水边史莱姆：获得黏液球',c:()=>hasItem(I.slimeball)},
  {t:'合成粘性活塞（能推能拉）',c:()=>hasItem(B_STICKY)},
  {t:'用4条线织出羊毛',c:()=>hasItem(B_WOOL)},
  {t:'做一扇木门 🚪（右键开关）',c:()=>hasItem(B_DOOR)},
  {t:'做一张床 🛏️（晚上睡觉到天亮）',c:()=>hasItem(B_BED)},
  {t:'找到白桦林：砍白桦木 🌳',c:()=>hasItem(B_BIRCH_LOG)},
  {t:'找到花林：采一丛花 🌸',c:()=>hasItem(B_FLOWER)},
  {t:'爬上一座石头山顶 ⛰️（y≥38）',c:()=>player.pos.y>=38&&getBlock(Math.floor(player.pos.x),Math.floor(player.pos.y)-1,Math.floor(player.pos.z))===B_STONE},
  {t:'去云杉林：砍云杉原木 🌲',c:()=>hasItem(B_SPRUCE_LOG)},
  {t:'去丛林：砍丛林原木 🌴',c:()=>hasItem(B_JUNGLE_LOG)},
  {t:'去金合欢草原：砍金合欢原木 🌾',c:()=>hasItem(B_ACACIA_LOG)},
  {t:'去深色森林：砍深色橡木原木 🌑',c:()=>hasItem(B_DARK_LOG)},
  {t:'去樱花林：砍樱花原木 🌸',c:()=>hasItem(B_CHERRY_LOG)},
  {t:'集齐全部7种原木！🏆',c:()=>hasItem(B_LOG)&&hasItem(B_BIRCH_LOG)&&hasItem(B_SPRUCE_LOG)&&hasItem(B_JUNGLE_LOG)&&hasItem(B_ACACIA_LOG)&&hasItem(B_DARK_LOG)&&hasItem(B_CHERRY_LOG)},
  {t:'挖到黑曜石 🖤（y<10，需钻石镐）',c:()=>hasItem(B_OBSIDIAN)},
  {t:'做下界传送门，去下界 🔥',c:()=>curDim==='nether'},
  {t:'在下界挖到远古残骸（下界很多！）',c:()=>curDim==='nether'&&hasItem(B_DEBRIS)},
  {t:'做末地传送门，去末地 🌌',c:()=>curDim==='end'},
  {t:'打败末影人：获得末影珍珠 💜',c:()=>hasItem(I.ender_pearl)},
  {t:'用锄头把草地耕成农田 🟫',c:()=>tilledLand},
  {t:'在农田上种下小麦 🌱',c:()=>plantedSeeds},
  {t:'收获小麦，做出面包 🍞',c:()=>hasItem(I.bread)},
  {t:'做一个箱子，把宝贝存起来 📦',c:()=>hasItem(B_CHEST)},
  {t:'在附魔台给装备附魔一次 ✨',c:()=>enchantedOnce},
  {t:'找到一个村庄 🏠',c:()=>foundVillage},
  {t:'打败铁傀儡，拿到铁锭 💪',c:()=>golemKilled},
  {t:'挖到绿宝石，跟村民换个好吃的 💚',c:()=>tradedWithVillager},
  {t:'扔末影珍珠传送一次！',c:()=>usedPearl},
  {t:'做一把弓 🏹（3木棍+3线）',c:()=>hasItem(I.bow)},
  {t:'打碎一个末影水晶 💥（不然龙会回血）',c:()=>crystalsBroken>0},
  {t:'做出一件无尽贪婪装备 💜（打末影龙也能掉无尽贪婪锭）',c:()=>hasAny([I.infinity_sword,I.infinity_helmet,I.infinity_chest,I.infinity_legs,I.infinity_boots,I.dragon_egg_sword,I.infinity_shovel,I.infinity_hoe,I.infinity_axe,I.cosmos_sword,I.infinity_bucket,I.infinity_bow,I.infinity_spear,I.gun_infinity])},
  {t:'打败末影龙！🐉 拿到龙蛋',c:()=>dragonKilled}
];
let TASKS=SURVIVAL_TASKS; // 当前任务链（生存 / 空岛模式切换）
// 🏝️ 空岛挑战任务链：从一棵树开始，把浮岛建成堡垒
const SKY_TASKS=[
  {t:'砍下第一棵树的原木 🪵（左键树干）',c:()=>hasItem(B_LOG)},
  {t:'打树叶收集树苗 🌱（树叶 5% 掉落）',c:()=>hasItem(I.sapling)},
  {t:'种下一棵树苗（手持树苗，右键草地）',c:()=>plantedSaplings>=1},
  {t:'种第二棵——等着小树长大 🌳',c:()=>plantedSaplings>=2},
  {t:'用木板合成工作台 🔨',c:()=>hasItem(B_TABLE)},
  {t:'造出熔炉 ⚒️（8 圆石围一圈）',c:()=>hasItem(B_FURNACE)},
  {t:'用 4 圆石风化出泥土，向外扩展浮岛 🏝️',c:()=>Object.keys(blockDiff).length>=5},
  {t:'在岛上安家：造一张床 🛏️（3羊毛+3木板）',c:()=>hasItem(B_BED)},
  {t:'把浮岛扩建到 30 块方块的堡垒 🏰',c:()=>Object.keys(blockDiff).length>=30},
  {t:'🎉 空岛大师！完成所有挑战',c:()=>Object.keys(blockDiff).length>=30&&hasItem(B_BED)&&plantedSaplings>=2}
];
function updateTasks(){
  let changed=false;
  for(const t of TASKS){
    if(!t.done&&t.c()){t.done=true;changed=true;}
  }
  if(changed){sfx.craft();}
  const el=$('tasks');
  let html='<div class="t-title">'+(gameMode==='skyblock'?'🏝️ 空岛挑战':'📜 目标')+'</div>';
  for(const t of TASKS)html+='<div class="'+(t.done?'done':'todo')+'">'+t.t+'</div>';
  const placeName=curDim==='overworld'?biomeName(biomeAt(Math.floor(player.pos.x),Math.floor(player.pos.z))):DIM_NAMES[curDim];
  html+='<div style="margin-top:6px;color:#9fd48a;font-size:11px">🌱 种子 '+SEED+' · 📍 '+placeName+'</div>';
  html+='<div style="color:#9fd48a;font-size:11px">无限世界 · 自动保存'+(NET&&NET.open?' · 👥联机中('+(Object.keys(NET.players).length+1)+'人)':'')+'</div>';
  el.innerHTML=html;
}
function toggleTasks(){
  const el=$('tasks');
  if(!el)return;
  if(el.style.display==='none'){updateTasks();el.style.display='block';}
  else el.style.display='none';
}
function onWorldChanged(){updateTasks();}

// ---------------- 提示 ----------------
let toastT=null;
function showToast(msg){
  const el=$('toast');
  el.textContent=msg;
  el.style.opacity=1;
  if(toastT)clearTimeout(toastT);
  toastT=setTimeout(()=>{el.style.opacity=0;},1600);
}

// ---------------- 面板管理 ----------------
function buildPanels(){
  buildHudHotbar();
  buildBook();
  const bh=$('btnBookHud');
  if(bh){
    bh.addEventListener('click',()=>{if(anyPanelOpen())closeAllPanels();else openBook();});
    bh.addEventListener('touchstart',e=>{e.preventDefault();if(anyPanelOpen())closeAllPanels();else openBook();},{passive:false});
  }
  const as=$('armorSlots');
  for(let i=0;i<4;i++)as.appendChild(makeSlot('armor',i));
  const cg=$('craftGrid');
  for(let i=0;i<4;i++)cg.appendChild(makeSlot('craft2',i));
  $('craftOut').appendChild(makeSlot('out2',0));
  fillGrid($('invGrid'),'store',27);
  fillGrid($('invHotbar'),'hot',9);
  const tg=$('tableGrid');
  for(let i=0;i<9;i++)tg.appendChild(makeSlot('craft3',i));
  $('tableOut').appendChild(makeSlot('out3',0));
  fillGrid($('tableInvGrid'),'store',27);
  fillGrid($('tableHotbar'),'hot',9);
  $('furnInSlot').appendChild(makeSlot('fin',0));
  $('furnFuelSlot').appendChild(makeSlot('ffuel',0));
  $('furnOutSlot').appendChild(makeSlot('fout',0));
  fillGrid($('furnInvGrid'),'store',27);
  fillGrid($('furnHotbar'),'hot',9);
  fillGrid($('chestGrid'),'chest',27);
  fillGrid($('chestInvGrid'),'store',27);
  fillGrid($('chestHotbar'),'hot',9);
  $('enchSlot').appendChild(makeSlot('ench',0));
  fillGrid($('enchInvGrid'),'store',27);
  fillGrid($('enchHotbar'),'hot',9);
  $('btnDoEnch').addEventListener('click',()=>doEnchant());
  rebuildCreativeGrid(); // 创造物品库（开关模组后会重建）
  // 背包内皮肤切换
  const updSkin2=()=>{$('skinName2').textContent=curSkin().name;};
  $('skinPrev2').addEventListener('click',()=>{skinIdx=((skinIdx-1)%SKINS.length+SKINS.length)%SKINS.length;updSkin2();drawPaperDoll();});
  $('skinNext2').addEventListener('click',()=>{skinIdx=(skinIdx+1)%SKINS.length;updSkin2();drawPaperDoll();});
  updSkin2();
  document.querySelectorAll('.closeX').forEach(b=>{
    b.addEventListener('click',()=>closeAllPanels());
    b.addEventListener('touchstart',e=>{e.preventDefault();closeAllPanels();},{passive:false});
  });
}
function fillGrid(el,area,n){
  for(let i=0;i<n;i++)el.appendChild(makeSlot(area,i));
}
function openPanel(id){
  hide('invPanel');hide('tablePanel');hide('furnacePanel');hide('bookPanel');hide('mpPanel');hide('cmdPanel');hide('chestPanel');hide('enchPanel');
  show(id);
  refreshPanels();drawPaperDoll();
  unlockPointer();mining=false;
}
function openInventory(){
  $('creativeArea').classList.toggle('hidden',gameMode!=='creative');
  $('skinName2').textContent=curSkin().name;
  openPanel('invPanel');
}
function openTable(){openPanel('tablePanel');}
function openFurnace(x,y,z){curFurn={x,y,z,state:getFurnState(x,y,z)};openPanel('furnacePanel');}
function openChest(x,y,z){curChest={x,y,z,state:getChestState(x,y,z)};openPanel('chestPanel');}
// ---------------- 附魔 ----------------
let curEnch=null,enchantedOnce=false;
function enchTarget(slot){
  if(!slot)return null;
  const it=ITEMS[slot.id];if(!it)return null;
  if(it.type==='tool')return it.toolType==='sword'?{k:'sharp',n:'锋利⚔️',d:'攻击 +2/级'}:{k:'eff',n:'效率⛏️',d:'挖得更快/级'};
  if(it.type==='armor')return {k:'prot',n:'保护🛡️',d:'防御 +1/级'};
  if(it.id===I.bow)return {k:'power',n:'力量🏹',d:'箭伤害 +2/级'};
  return null;
}
function enchLevel(slot,k){return slot&&slot.ench?(slot.ench[k]||0):0;}
function updateEnchInfo(){
  const el=$('enchInfo');if(!el||!curEnch)return;
  const s=curEnch.slot;
  if(!s){el.textContent='放入武器/工具/盔甲/弓';return;}
  const tg=enchTarget(s);
  if(!tg){el.textContent='「'+ITEMS[s.id].name+'」不能附魔哦';return;}
  const lv=enchLevel(s,tg.k);
  el.textContent=ITEMS[s.id].name+' · '+tg.n+' '+lv+'/3级（'+tg.d+'）'+(lv>=3?' · 已满级！':' · 点附魔升一级');
}
function openEnchant(x,y,z){curEnch={x,y,z,slot:null};openPanel('enchPanel');updateEnchInfo();}
function doEnchant(){
  if(!curEnch)return;
  const s=curEnch.slot;
  if(!s){showToast('先把要附魔的装备放进上面的格子里');return;}
  const tg=enchTarget(s);
  if(!tg){showToast('这个不能附魔哦，试试武器/工具/盔甲/弓');return;}
  const lv=enchLevel(s,tg.k);
  if(lv>=3){showToast('已经满级啦！（3级最强）');return;}
  if(gameMode!=='creative'&&!takeItemFromInv(I.diamond,1)){showToast('需要 1 颗💎钻石才能附魔！');return;}
  if(!s.ench)s.ench={};
  s.ench[tg.k]=lv+1;
  sfx.equip();
  enchantedOnce=true;updateTasks();
  showToast('✨ 附魔成功！'+ITEMS[s.id].name+'获得 '+tg.n+' '+(lv+1)+'级！');
  refreshAll();updateEnchInfo();
}
function openBook(){openPanel('bookPanel');}
// ---------------- 指令系统（管理员=房主） ----------------
function applyGameMode(m,silent){
  gameMode=m;
  const fd=$('btnFlyDown');
  if(fd)fd.classList.toggle('hidden',gameMode!=='creative');
  const gh=$('gunHud'),gb=$('gunBoard');
  if(gh)gh.style.display=gameMode==='shooter'?'block':'none';
  if(gb)gb.style.display=gameMode==='shooter'?'block':'none';
  if(gameMode==='shooter')updateGunHud();
  if(!silent)showToast(m==='creative'?'🧱 已切换到创造模式：无限物品 · 飞行 · 不掉血':(m==='shooter'?'🔫 枪战模式：1-4 切枪 · R 换弹 · 左键射击 · 先到 10 杀获胜':'⚒ 已切换到生存模式：有血量和怪物'));
  updateTasks();saveGame();
}
function isAdmin(){return !NET.open||NET.isHost;} // 单人=管理员；联机只有房主是管理员
function openCmd(){
  if(gameState!=='playing')return;
  openPanel('cmdPanel');
  const inp=$('cmdInput');inp.value='';
  setTimeout(()=>inp.focus(),80);
}
function runCommand(){
  const raw=$('cmdInput').value.trim();
  if(!raw)return;
  const cmd=raw.replace(/^\//,'').toLowerCase();
  if(!isAdmin()){showToast('🚫 只有房主（管理员）才能用指令！');closeAllPanels();return;}
  if(cmd==='help'||cmd==='帮助'){
    showToast('指令：/gamemode creative 创造 · /gamemode survival 生存 · /summon 僵尸 生成生物 · /time day 白天');return;
  }
  // /summon xxx 生成生物（管理员）
  const MOB_NAMES={cow:'cow',牛:'cow',奶牛:'cow',turtle:'turtle',乌龟:'turtle',海龟:'turtle',
    hghast:'hghast',ghast:'hghast',快乐恶魂:'hghast',恶魂:'hghast',creaking:'creaking',嘎吱怪:'creaking',
    zombie:'zombie',僵尸:'zombie',slime:'slime',史莱姆:'slime',enderman:'enderman',末影人:'enderman',小黑:'enderman',
    dragon:'dragon',末影龙:'dragon',龙:'dragon',villager:'villager',村民:'villager',
    golem:'golem',铁傀儡:'golem',铁人:'golem',
    pig:'pig',猪:'pig',小猪:'pig',sheep:'sheep',羊:'sheep',小羊:'sheep',绵羊:'sheep',
    chicken:'chicken',鸡:'chicken',小鸡:'chicken',spider:'spider',蜘蛛:'spider',
    skeleton:'skeleton',骷髅:'skeleton',小白:'skeleton',creeper:'creeper',苦力怕:'creeper',爬行者:'creeper',
    warden:'warden',坚守者:'warden',监守者:'warden',guardian:'guardian',守卫者:'guardian'};
  if(cmd.indexOf('summon ')===0||cmd.indexOf('生成 ')===0){
    const name=cmd.replace(/^summon |^生成 /,'').trim();
    const mt=MOB_NAMES[name];
    if(!mt){showToast('❓ 没有这种生物。可以生成：牛 乌龟 快乐恶魂 嘎吱怪 僵尸 史莱姆 末影人');return;}
    const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
    const sx=Math.floor(player.pos.x+fx*3),sz=Math.floor(player.pos.z+fz*3);
    const sy=mt==='hghast'?player.pos.y+3:surfaceY(sx,sz)+1;
    spawnMob(mt,sx,sz,sy);
    showToast('✨ 生成了一只'+name+'！');
    closeAllPanels();return;
  }
  // 结构定位指令：/城市 /神殿 /矿洞 /海殿
  if(cmd==='city'||cmd==='城市'||cmd==='远古城市'||cmd==='古城'){
    showToast(cityHint());closeAllPanels();return;
  }
  if(cmd==='神殿'||cmd==='沙漠神殿'||cmd==='temple'){
    showToast(templeHint());closeAllPanels();return;
  }
  if(cmd==='矿洞'||cmd==='矿'||cmd==='mine'){
    showToast(mineHint());closeAllPanels();return;
  }
  if(cmd==='海底神殿'||cmd==='海殿'||cmd==='monument'){
    showToast(monumentHint());closeAllPanels();return;
  }
  // /time day|night 调时间（管理员）
  if(cmd==='time day'||cmd==='白天'){dayTime=0.35;showToast('☀️ 天亮了！');closeAllPanels();return;}
  if(cmd==='time night'||cmd==='晚上'||cmd==='黑夜'){dayTime=0.72;showToast('🌙 天黑了！');closeAllPanels();return;}
  let m=null;
  if(cmd==='gamemode creative'||cmd==='gamemode c'||cmd==='gamemode 1'||cmd==='creative'||cmd==='创造'||cmd==='创造模式')m='creative';
  if(cmd==='gamemode survival'||cmd==='gamemode s'||cmd==='gamemode 0'||cmd==='survival'||cmd==='生存'||cmd==='生存模式')m='survival';
  if(m){
    applyGameMode(m);
    if(NET.open&&NET.isHost)netBroadcast({t:'gm',v:m}); // 告诉朋友们世界换模式了
    if(NET.open&&NET.isHost&&NET.roomId)netFetch('/mode',{method:'POST',body:JSON.stringify({roomId:NET.roomId,mode:m})}).catch(()=>{}); // 同步房间列表模式
    closeAllPanels();return;
  }
  showToast('❓ 不认识这个指令，试试 /gamemode creative 或 /help');
}
// ---------------- 配方图鉴 ----------------
function itemCell(id,count){
  const c=document.createElement('div');c.className='bk-cell';
  const cv=document.createElement('canvas');cv.width=16;cv.height=16;
  if(id)drawItemIcon(cv.getContext('2d'),id);
  c.appendChild(cv);
  if(count>1){const s=document.createElement('span');s.className='n';s.textContent='×'+count;c.appendChild(s);}
  return c;
}
function buildBook(){
  const list=$('bookList');
  if(!list||list.childElementCount>0)return;
  let lastGroup='';
  for(const r of RECIPES){
    if(r.group!==lastGroup){
      lastGroup=r.group;
      const g=document.createElement('div');g.className='bk-group';g.textContent=lastGroup||'基础';
      list.appendChild(g);
    }
    const row=document.createElement('div');row.className='bk-row';
    const matCount={};
    if(r.type==='shaped'){
      const rows=r.pat.length,cols=r.pat[0].length;
      const pat=document.createElement('div');pat.className='bk-pat';
      pat.style.gridTemplateColumns='repeat('+cols+',24px)';
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const ch=r.pat[y][x];
        const id=ch===' '?0:r.key[ch];
        if(id)matCount[id]=(matCount[id]||0)+1;
        pat.appendChild(itemCell(id));
      }
      row.appendChild(pat);
    }else{
      const ing=document.createElement('div');ing.className='bk-ing';
      for(const k in r.ing){
        const id=+k;matCount[id]=r.ing[k];
        ing.appendChild(itemCell(id,r.ing[k]));
      }
      row.appendChild(ing);
    }
    const ar=document.createElement('div');ar.className='bk-arrow';ar.textContent='➜';
    row.appendChild(ar);
    const out=document.createElement('div');out.className='bk-out';
    out.appendChild(itemCell(r.out.id,r.out.count));
    const nm=document.createElement('div');nm.className='bk-name';
    const it=ITEMS[r.out.id];
    let matTxt=[];
    for(const k in matCount){matTxt.push((ITEMS[k]?ITEMS[k].name:'?')+'×'+matCount[k]);}
    nm.innerHTML='<b>'+(it?it.name:'?')+(r.out.count>1?' ×'+r.out.count:'')+'</b><br><span class="bk-mat">'+matTxt.join(' + ')+'</span>';
    out.appendChild(nm);
    row.appendChild(out);
    list.appendChild(row);
  }
}
function closeAllPanels(){
  const was=anyPanelOpen();
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur(); // 收起键盘焦点，T键下次还能开
  hide('invPanel');hide('tablePanel');hide('furnacePanel');hide('bookPanel');hide('mpPanel');hide('cmdPanel');hide('chestPanel');hide('enchPanel');
  curFurn=null;curChest=null;curEnch=null;
  if(was&&gameState==='playing'&&!isTouch&&!player.dead){
    setTimeout(()=>{
      if(!anyPanelOpen()&&gameState==='playing'&&!player.dead)lockPointer();
    },60);
  }
}

// ---------------- 🛒 村民交易（绿宝石经济） ----------------
const TRADES=[
  {g:'buy', give:{id:()=>I.emerald,n:1}, get:{id:()=>I.bread,n:3}},
  {g:'buy', give:{id:()=>I.emerald,n:1}, get:{id:()=>I.carrot,n:4}},
  {g:'buy', give:{id:()=>I.emerald,n:1}, get:{id:()=>I.potato,n:4}},
  {g:'buy', give:{id:()=>I.emerald,n:3}, get:{id:()=>I.diamond,n:1}},
  {g:'buy', give:{id:()=>I.emerald,n:5}, get:{id:()=>I.diamond_sword,n:1}},
  {g:'buy', give:{id:()=>I.emerald,n:6}, get:{id:()=>I.diamond_helmet,n:1}},
  {g:'buy', give:{id:()=>I.emerald,n:8}, get:{id:()=>I.diamond_chest,n:1}},
  {g:'buy', give:{id:()=>I.emerald,n:15}, get:{id:()=>I.infinity_ingot,n:1}},
  {g:'buy', give:{id:()=>I.emerald,n:40}, get:{id:()=>B_INFINITY_BLOCK,n:1}},
  {g:'sell', give:{id:()=>I.wheat,n:4}, get:{id:()=>I.emerald,n:1}},
  {g:'sell', give:{id:()=>I.rotten_flesh,n:8}, get:{id:()=>I.emerald,n:1}},
  {g:'sell', give:{id:()=>I.leather,n:3}, get:{id:()=>I.emerald,n:1}},
  {g:'sell', give:{id:()=>B_COBBLE,n:16}, get:{id:()=>I.emerald,n:1}},
  {g:'sell', give:{id:()=>I.iron_ingot,n:2}, get:{id:()=>I.emerald,n:1}},
  {g:'sell', give:{id:()=>I.slimeball,n:4}, get:{id:()=>I.emerald,n:1}},
];
function openTrade(){
  openPanel('tradePanel');
  renderTrade();
}
function renderTrade(){
  const list=$('tradeList');
  list.innerHTML='';
  let lastG='';
  for(const t of TRADES){
    if(t.g!==lastG){
      lastG=t.g;
      const g=document.createElement('div');g.className='bk-group';
      g.textContent=t.g==='buy'?'💚 用绿宝石买':'📦 卖东西换绿宝石';
      list.appendChild(g);
    }
    const gid=t.give.id(),rid=t.get.id();
    const row=document.createElement('div');row.className='bk-row trade-row';
    row.appendChild(itemCell(gid,t.give.n));
    const ar=document.createElement('span');ar.className='bk-arrow';ar.textContent='→';row.appendChild(ar);
    const out=document.createElement('div');out.className='bk-out';out.appendChild(itemCell(rid,t.get.n));row.appendChild(out);
    const nm=document.createElement('span');nm.style.fontSize='13px';nm.textContent=ITEMS[rid]?ITEMS[rid].name:'';row.appendChild(nm);
    const btn=document.createElement('button');btn.className='trade-btn';btn.textContent='换！';
    btn.disabled=countItemTotal(gid)<t.give.n;
    btn.addEventListener('click',()=>{
      if(!takeItemsTotal(gid,t.give.n)){showToast('东西不够哦！');renderTrade();return;}
      giveItemToInv(rid,t.get.n);
      sfx.pickup();
      spawnBlockParticles(player.pos.x,player.pos.y+1.5,player.pos.z,'rgb(42,216,74)');
      showToast('💚 成交！'+ITEMS[rid].name+' ×'+t.get.n);
      tradedWithVillager=true;updateTasks();
      renderTrade();
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// ---------------- 创造物品库（可重建：模组开关后刷新） ----------------
// ---------------- 创造物品库（可重建，模组开关后刷新） ----------------
function rebuildCreativeGrid(){
  const cgr=$('creativeGrid');
  if(!cgr)return;
  const giveItem=id=>{
    cursor={id:id,count:maxStackOf(id)};
    sfx.pickup();refreshAll();
  };
  cgr.innerHTML='';
  for(const id in ITEMS){
    const it=ITEMS[id];
    if(!it||!it.name)continue;
    if(it.hideInCreative)continue;
    if(it.mod&&!modsOn[it.mod])continue; // 模组没开就不显示
    const el=document.createElement('div');
    el.className='slot';el.title=it.name;
    const cv=document.createElement('canvas');cv.width=16;cv.height=16;
    drawItemIcon(cv.getContext('2d'),it.id);
    el.appendChild(cv);
    el.addEventListener('click',()=>giveItem(it.id));
    // 触屏：轻点=拿取；滑动=滚动列表（不在 touchstart 拦截，不然滑不动）
    let tsx=0,tsy=0;
    el.addEventListener('touchstart',e=>{const t=e.changedTouches[0];tsx=t.clientX;tsy=t.clientY;},{passive:true});
    el.addEventListener('touchend',e=>{
      const t=e.changedTouches[0];
      if(Math.hypot(t.clientX-tsx,t.clientY-tsy)<12){e.preventDefault();giveItem(it.id);}
    },{passive:false});
    cgr.appendChild(el);
  }
}
