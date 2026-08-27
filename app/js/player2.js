// ---------------- 玩家 ----------------
const PW=0.3,PH=1.8,PEYE=1.62;
const player={
  pos:new THREE.Vector3(48.5,40,48.5),
  vel:new THREE.Vector3(),
  yaw:0,pitch:0,onGround:false,
  hp:20,maxHp:20,peakY:40,jumpT:0,speedT:0,slowT:0,goldT:0, // 🧪 药水效果剩余秒数（goldT=金苹果护盾）
  inWater:false,headWater:false,
  lastDamage:-99,dead:false,
  mounted:null, // 骑乘中的快乐恶魂
  sel:0,heldId:B_GRASS
};
let spawnPoint=new THREE.Vector3(48.5,40,48.5);
let plantedSaplings=0; // 空岛：种下的树苗数（任务用）

function playerAABB(pos){
  return {x0:pos.x-PW,y0:pos.y,z0:pos.z-PW,x1:pos.x+PW,y1:pos.y+PH,z1:pos.z+PW};
}
function boxCollides(pos){
  const a=playerAABB(pos);
  const x0=Math.floor(a.x0),x1=Math.floor(a.x1-0.0001);
  const y0=Math.floor(a.y0),y1=Math.floor(a.y1-0.0001);
  const z0=Math.floor(a.z0),z1=Math.floor(a.z1-0.0001);
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
    if(y<0)return true;
    if(isSolidBlock(getBlock(x,y,z)))return true;
  }
  return false;
}
function moveAxis(axis,amt){
  if(amt===0)return;
  const p=player.pos.clone();
  p[axis]+=amt;
  if(!boxCollides(p)){player.pos[axis]=amt+player.pos[axis];return;}
  // 二分逼近
  let lo=0,hi=amt;
  for(let i=0;i<8;i++){
    const mid=(lo+hi)/2;
    const q=player.pos.clone();q[axis]+=mid;
    if(boxCollides(q))hi=mid;else lo=mid;
  }
  player.pos[axis]+=lo;
  if(axis==='y'){
    if(amt<0)player.onGround=true;
    player.vel.y=0;
  }else player.vel[axis]=0;
}
function checkWater(){
  const fx=Math.floor(player.pos.x),fy=Math.floor(player.pos.y),fz=Math.floor(player.pos.z);
  const hy=Math.floor(player.pos.y+PEYE);
  const isLiq=b=>b===B_WATER||b===B_LAVA; // 岩浆里也能扑腾（但会烫伤）
  player.inWater=isLiq(getBlock(fx,fy,fz))||isLiq(getBlock(fx,fy+1,fz));
  player.headWater=isLiq(getBlock(fx,hy,fz));
}
function physicsStep(dt,input){
  checkWater();
  // 输入方向
  let fx=input.f,rz=input.r;
  const len=Math.hypot(fx,rz);
  if(len>1){fx/=len;rz/=len;}
  const sin=Math.sin(player.yaw),cos=Math.cos(player.yaw);
  // 前向 = (-sin, -cos) (yaw=0 朝 -z)
  const dirX=fx*(-sin)+rz*(cos);
  const dirZ=fx*(-cos)+rz*(-sin);
  // 🧪 药水效果倒计时
  if(player.jumpT>0)player.jumpT-=dt;
  if(player.speedT>0)player.speedT-=dt;
  if(player.slowT>0)player.slowT-=dt;
  if(player.goldT>0)player.goldT-=dt; // 🍎 金光护盾倒计时
  let speed=player.inWater?3.0:(input.sprint?6.5:4.3);
  if(player.speedT>0)speed*=1.6; // 💨 速度药水
  if(player.inWater&&player.speedT>0)speed=Math.min(speed,5.5);
  const ctrl=player.onGround||player.inWater?1:0.35;
  player.vel.x=lerp(player.vel.x,dirX*speed,clamp(ctrl*dt*12,0,1));
  player.vel.z=lerp(player.vel.z,dirZ*speed,clamp(ctrl*dt*12,0,1));
  // 重力/跳跃
  if(gameMode==='creative'&&flying){
    // 创造模式：飞行（跳跃=上升，Shift/下降键=下降，否则悬停）；双击Shift可关闭
    const flySp=input.sprint?11:6.5;
    const vy=input.jump?flySp:(flyDown?-flySp:0);
    player.vel.y=lerp(player.vel.y,vy,clamp(dt*10,0,1));
    player.peakY=player.pos.y; // 飞行不产生摔落伤害
  }else if(player.inWater){
    player.vel.y+=-25*0.18*dt;
    if(input.jump)player.vel.y=Math.min(player.vel.y+60*dt,3.6);
    player.vel.y=clamp(player.vel.y,-3.5,4);
  }else{
    player.vel.y-=25*dt*(player.slowT>0?0.3:1); // 🪶 缓降药水：轻轻飘
    player.vel.y=Math.max(player.vel.y,player.slowT>0?-2.5:-40);
    if(input.jump&&player.onGround){player.vel.y=player.jumpT>0?11:8.4;player.onGround=false;} // 🐇 跳跃药水跳更高
  }
  const wasGround=player.onGround;
  player.onGround=false;
  moveAxis('x',player.vel.x*dt);
  moveAxis('z',player.vel.z*dt);
  moveAxis('y',player.vel.y*dt);
  // 掉落追踪（掉进水里不受伤！）
  if(player.inWater)player.peakY=player.pos.y; // 在水里一直重置高度
  if(!player.onGround){
    if(player.pos.y>player.peakY)player.peakY=player.pos.y;
  }else if(!wasGround){
    const dist=player.peakY-player.pos.y;
    const landB=getBlock(Math.floor(player.pos.x),Math.floor(player.pos.y),Math.floor(player.pos.z));
    const underB=getBlock(Math.floor(player.pos.x),Math.floor(player.pos.y)-1,Math.floor(player.pos.z));
    const safeWater=player.inWater||landB===B_WATER||underB===B_WATER;
    if(dist>4&&player.vel.y<=0.01&&!safeWater&&!(player.slowT>0)&&gameMode!=='creative'){ // 创造模式关飞行坠落也不摔伤
      const armor=totalArmor();
      let dmg=Math.floor(dist-3);
      dmg=Math.max(0,Math.round(dmg*(1-Math.min(armor*0.04,0.8))));
      if(gameMode!=='parkour'&&dmg>0)damagePlayer(dmg,'从高处摔落'); // 跑酷不掉落伤害
    }else if(dist>4&&safeWater){
      sfx.splash();
      spawnBlockParticles(player.pos.x,player.pos.y+0.5,player.pos.z,'rgb(80,140,255)');
    }
    player.peakY=player.pos.y;
  }
  if(player.onGround)player.peakY=player.pos.y;
  // 掉出世界（跑酷模式由 updateParkour 回起点，不判死）
  if(player.pos.y<-10&&gameMode!=='parkour')damagePlayer(100,'掉出了世界');
  // 缓慢回血
  if(player.hp<player.maxHp&&performance.now()/1000-player.lastDamage>5){
    player.regenT=(player.regenT||0)+dt;
    if(player.regenT>2){player.regenT=0;player.hp=Math.min(player.maxHp,player.hp+1);updateHearts();}
  }
}
function fullInfinityArmor(){ // 全套无尽贪婪盔甲
  for(const a of inv.armor)if(!a||!ITEMS[a.id]||ITEMS[a.id].mat!=='infinity')return false;
  return true;
}
function fullMatArmor(mat){ // 🛡️ 穿了一整套某个材料的盔甲？（红石/煤炭/绿宝石/铜/青金石/黑曜石/基岩/泰坦）
  for(const a of inv.armor)if(!a||!ITEMS[a.id]||ITEMS[a.id].mat!==mat)return false;
  return true;
}
function fullGodArmor(){ // 全套创世盔甲（HIM模组）：几乎不掉血！
  for(const a of inv.armor)if(!a||!ITEMS[a.id]||ITEMS[a.id].mat!=='god')return false;
  return true;
}
function totalArmor(){
  let s=0;
  for(const a of inv.armor)if(a)s+=ITEMS[a.id].armorPts+(a.ench?(a.ench.prot||0):0);
  return s;
}
function damagePlayer(dmg,reason){
  if(player.dead)return;
  if(gameMode==='parkour')return; // 跑酷：不掉血（掉落由 updateParkour 回起点）
  if(gameMode==='creative')return; // 创造模式不掉血
  if(gameMode==='shooter'&&SHOOTER.spawnProtectT>0){showToast('🛡 出生保护中，免疫伤害！');return;} // 出生保护免伤
  if(player.goldT>0){dmg*=0.5;if(Math.random()<0.3)spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(255,220,90)');} // 🍎 金光护盾：伤害减半！
  if(player.goldT>0)player.goldT-=0; // 计时在 physicsStep 里走
  if(fullMatArmor('titan')){ // 💜 全套泰坦甲：最最最强！凋零斯拉打你也像挠痒痒
    dmg=Math.max(dmg*0.01,0.01);
    if(Math.random()<0.5)spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(192,74,232)');
  }else if(fullMatArmor('bedrock')){ // ⬛ 全套基岩甲：几乎完全打不动！泰坦踩你也只掉一点点
    dmg=Math.max(dmg*0.02,0.02);
    if(Math.random()<0.4)spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(120,120,120)');
  }else if(fullMatArmor('obsidian')){ // ⚫ 全套黑曜石甲：保护力超强！
    dmg=Math.max(dmg*0.08,0.05);
    if(Math.random()<0.35)spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(90,60,140)');
  }else if(fullGodArmor()){ // 创世神甲：比无尽贪婪还硬！
    dmg=Math.max(dmg*0.05,0.05);
    if(Math.random()<0.4)spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(255,232,160)');
  }else if(fullInfinityArmor()){ // 无尽贪婪甲：打十下才掉一滴血
    dmg=Math.max(dmg*0.1,0.1);
    if(Math.random()<0.3)spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(190,110,255)');
  }
  player.hp-=dmg;
  player.lastDamage=performance.now()/1000;
  sfx.hurt();
  flashScreen();
  // 被击方第一视角：血雾从身上喷出（红色）
  spawnBlood(player.pos.x,player.pos.y+1,player.pos.z);
  updateHearts();
  if(player.hp<=0){
    player.hp=0;player.dead=true;
    closeAllPanels(); // 死亡瞬间收起所有面板，避免挡住重生按钮
    spawnBlood(player.pos.x,player.pos.y+1,player.pos.z); // 击杀瞬间大血雾
    spawnBlood(player.pos.x,player.pos.y+1.4,player.pos.z);
    if(gameMode==='shooter'){
      // 枪战模式：不走死亡界面，广播击杀并自动重生
      const aid=(reason&&reason.aid)?reason.aid:null;
      if(NET.open&&NET.roomId){
        netBroadcast({t:'kill',k:aid||'0',v:NET.myId,kn:reason?reason.attacker:'',vn:NET.myName,wn:reason?reason.wn:''});
        netBroadcast({t:'pvpdead',target:NET.myId,alive:false}); // 队友视角：头像消失
        shooterKill(aid||'0',NET.myId,reason?reason.attacker:'',NET.myName,reason?reason.wn:''); // 本地也计分（攻击者+1）
      }
      else shooterKill(aid||'1',NET.myId,reason?reason.attacker:'',NET.myName,reason?reason.wn:'');
      setTimeout(()=>{if(gameMode==='shooter'&&player.dead)shooterRespawn();},1400);
      return;
    }
    document.getElementById('deathMsg').textContent=reason&&reason.text?reason.text:'';
    show('death');
    unlockPointer();
    if(NET.open&&NET.roomId)netBroadcast({t:'pvpdead',target:NET.myId,alive:false}); // 通知其他人：我死了
  }
}
function flashScreen(){
  const f=document.getElementById('flash');
  f.style.opacity=0.35;
  setTimeout(()=>{f.style.opacity=0;},120);
}

// ---------------- 输入 ----------------
const isTouch=('ontouchstart'in window)||(navigator.maxTouchPoints>0)||location.search.indexOf('touch=1')>=0;
if(isTouch)document.body.classList.add('touch-mode');
let gameState='start'; // start|playing|dead
const keys={};
const input={f:0,r:0,jump:false,sprint:false};
let mining=false;
let flying=false; // 创造模式飞行：双击空格起飞 / 双击Shift降落（MC同款）
let lastShiftT=0;
let lastSpaceT=0;
let pointerLocked=false;
function $(id){return document.getElementById(id);}
function show(id){$(id).classList.remove('hidden');}
function hide(id){$(id).classList.add('hidden');}
function anyPanelOpen(){return !$('invPanel').classList.contains('hidden')||!$('tablePanel').classList.contains('hidden')||!$('furnacePanel').classList.contains('hidden')||!$('bookPanel').classList.contains('hidden')||!$('mpPanel').classList.contains('hidden')||!$('cmdPanel').classList.contains('hidden')||!$('chestPanel').classList.contains('hidden')||!$('enchPanel').classList.contains('hidden')||!$('tradePanel').classList.contains('hidden')||!$('brewPanel').classList.contains('hidden')||!$('modPanel').classList.contains('hidden');}
function inputEnabled(){return gameState==='playing'&&!player.dead&&!anyPanelOpen();}
function lockPointer(){if(isTouch)return;const c=renderer.domElement;if(c.requestPointerLock)c.requestPointerLock();}
function unlockPointer(){if(document.exitPointerLock&&document.pointerLockElement)document.exitPointerLock();}

function initControls(){
  initHandView(); // 第一人称手持武器
  window.addEventListener('keydown',e=>{
    if(e.repeat)return;
    if(e.target&&e.target.tagName==='INPUT'&&e.code!=='Enter'&&e.code!=='Escape')return; // 在输入框里打字不触发游戏按键
    keys[e.code]=true;
    if(gameState!=='playing')return;
    if(e.code==='KeyE'){
      if(anyPanelOpen())closeAllPanels();
      else openInventory();
      e.preventDefault();
    }
    if(e.code==='KeyB'){
      if(anyPanelOpen())closeAllPanels();
      else openBook();
      e.preventDefault();
    }
    if(e.code==='Slash'){
      if(anyPanelOpen())closeAllPanels();
      else openCmd();
      e.preventDefault();
    }
    if(e.code==='KeyT'){
      // T 键：唤起/隐藏左侧任务面板；有面板时只负责关面板
      if(anyPanelOpen()){closeAllPanels();e.preventDefault();return;}
      toggleTasks();
      e.preventDefault();
    }
    if(gameMode==='creative'&&(e.code==='Space'||e.code==='ShiftLeft'||e.code==='ShiftRight')){
      // MC 同款：双击空格起飞，双击 Shift 降落
      const now=performance.now();
      if(e.code==='Space'&&!flying&&now-lastSpaceT<300){
        flying=true;showToast('✈️ 起飞！空格上升 · Shift 下降 · 双击Shift降落');
        lastSpaceT=0;
      }else if(e.code==='Space'){lastSpaceT=now;}
      if((e.code==='ShiftLeft'||e.code==='ShiftRight')){
        if(flying&&now-lastShiftT<300){
          flying=false;showToast('🚶 已降落，双击空格再次起飞');
          lastShiftT=0;
        }else lastShiftT=now;
      }
    }
    if(e.code.indexOf('Digit')===0){
      const n=+e.code.slice(5);
      if(n>=1&&n<=9){player.sel=n-1;sfx.select();updateHotbar();}
    }
  });
  window.addEventListener('keyup',e=>{
    keys[e.code]=false;
    if(e.code==='KeyG'&&gameMode==='shooter'&&typeof releaseNadeCharge==='function')releaseNadeCharge();
  });
  document.addEventListener('mousemove',e=>{
    if(!pointerLocked||!inputEnabled())return;
    player.yaw-=e.movementX*0.0022;
    player.pitch-=e.movementY*0.0022;
    player.pitch=clamp(player.pitch,-1.55,1.55);
  });
  document.addEventListener('mousedown',e=>{
    if(gameState!=='playing'||!pointerLocked||anyPanelOpen()||player.dead)return;
    if(e.button===0){if(heldIsFood()){eatFood();}else if(heldItemId()&&ITEMS[heldItemId()]&&ITEMS[heldItemId()].potion){drinkPotion(ITEMS[heldItemId()].potion);}else{mining=true;tryAttackMob();}}
    else if(e.button===2){
      // 枪战：手持手榴弹->按住蓄力；手持地雷->布雷；否则原放置/投掷逻辑
      if(gameMode==='shooter'){
        const held=heldItemId();
        if(held&&ITEMS[held]&&ITEMS[held].type==='grenade'){startNadeCharge();return;}
      }
      interactOrPlace();
    }
  });
  document.addEventListener('mouseup',e=>{
    if(e.button===0)mining=false;
    if(e.button===2&&typeof releaseNadeCharge==='function')releaseNadeCharge();
  });
  document.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('wheel',e=>{
    if(gameState!=='playing'||anyPanelOpen())return;
    player.sel=(player.sel+(e.deltaY>0?1:-1)+9)%9;
    sfx.select();updateHotbar();
  },{passive:true});
  document.addEventListener('pointerlockchange',()=>{
    pointerLocked=document.pointerLockElement===renderer.domElement;
    if(!pointerLocked&&gameState==='playing'&&!anyPanelOpen()&&!player.dead&&!isTouch){
      closeAllPanels(); // 防御：清单外的浮层若开着也别与暂停菜单叠层
      show('pause');
      const db=$('disconnectBtn');
      if(db)db.classList.toggle('hidden',!(NET.open&&NET.roomId)); // 联机中才显示「断开联机」
    }else{
      hide('pause');
    }
  });
  $('resumeBtn').addEventListener('click',()=>{hide('pause');lockPointer();});
  $('disconnectBtn').addEventListener('click',()=>{ // 断开联机，留在单人世界继续玩
    hide('pause');
    if(typeof netLeave==='function')netLeave(true);
    lockPointer();
  });
  $('backHomeBtn').addEventListener('click',()=>{if(typeof backToHome==='function')backToHome();});
  $('respawnBtn').addEventListener('click',respawn);
  if(isTouch)initTouch();
}
function respawn(){
  player.dead=false;player.hp=player.maxHp;
  player.pos.copy(spawnPoint);player.vel.set(0,0,0);player.peakY=player.pos.y;player.mounted=null;
  hide('death');updateHearts();
  if(!isTouch)lockPointer();
  if(NET.open&&NET.roomId)netBroadcast({t:'pvpdead',target:NET.myId,alive:true}); // 通知其他人：我复活了
}

// ---------------- 触屏 ----------------
const joy={active:false,id:-1,x:0,y:0};
const look={active:false,id:-1,lx:0,ly:0};
function initTouch(){
  const joyEl=$('joy'),knob=$('knob');
  joyEl.addEventListener('touchstart',e=>{
    e.preventDefault();
    const t=e.changedTouches[0];
    joy.active=true;joy.id=t.identifier;
    moveKnob(t);
  },{passive:false});
  window.addEventListener('touchmove',e=>{
    for(const t of e.changedTouches){
      if(joy.active&&t.identifier===joy.id){moveKnob(t);e.preventDefault();}
      if(look.active&&t.identifier===look.id){
        const dx=t.clientX-look.lx,dy=t.clientY-look.ly;
        look.lx=t.clientX;look.ly=t.clientY;
        if(inputEnabled()){
          player.yaw-=dx*0.0042;
          player.pitch=clamp(player.pitch-dy*0.0042,-1.55,1.55);
        }
      }
    }
  },{passive:false});
  window.addEventListener('touchend',e=>{
    for(const t of e.changedTouches){
      if(t.identifier===joy.id){joy.active=false;joy.id=-1;joy.x=0;joy.y=0;knob.style.transform='translate(-50%,-50%)';}
      if(t.identifier===look.id){look.active=false;look.id=-1;}
    }
  });
  window.addEventListener('touchcancel',e=>{
    joy.active=false;joy.id=-1;joy.x=0;joy.y=0;look.active=false;look.id=-1;
    knob.style.transform='translate(-50%,-50%)';
  });
  function moveKnob(t){
    const r=joyEl.getBoundingClientRect();
    let dx=t.clientX-(r.left+r.width/2),dy=t.clientY-(r.top+r.height/2);
    const max=r.width/2;
    const len=Math.hypot(dx,dy);
    if(len>max){dx*=max/len;dy*=max/len;}
    knob.style.transform='translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px))';
    joy.x=dx/max;joy.y=dy/max;
  }
  // 点按摇杆边缘 = 朝该方向走一小步（带鼠标的触屏设备/辅助操作用）
  joyEl.addEventListener('click',e=>{
    if(!inputEnabled())return;
    const r=joyEl.getBoundingClientRect();
    let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    const max=r.width/2;
    joy.x=clamp(dx/max,-1,1);joy.y=clamp(dy/max,-1,1);joy.active=true;
    knob.style.transform='translate(calc(-50% + '+(joy.x*max*0.6)+'px),calc(-50% + '+(joy.y*max*0.6)+'px))';
    setTimeout(()=>{
      joy.active=false;joy.x=0;joy.y=0;
      knob.style.transform='translate(-50%,-50%)';
    },260);
  });
  // 视角拖动(右半屏空白处)
  document.addEventListener('touchstart',e=>{
    if(gameState!=='playing')return;
    for(const t of e.changedTouches){
      if(t.clientX<window.innerWidth*0.35)continue;
      const el=document.elementFromPoint(t.clientX,t.clientY);
      if(el&&el.closest('.tbtn,#joy,.panel,#hotbar,#startBtn,.overlay-full'))continue;
      if(look.active)continue;
      look.active=true;look.id=t.identifier;look.lx=t.clientX;look.ly=t.clientY;
    }
  },{passive:true});
  function bindBtn(id){
    const el=$(id);
    el.addEventListener('touchstart',e=>{
      e.preventDefault();e.stopPropagation();
      if(id==='btnJump')jumpBtn=true;
      else if(id==='btnFlyDown')flyDownBtn=true;
      else if(id==='btnMine'){if(heldIsFood()){eatFood();}else if(heldItemId()&&ITEMS[heldItemId()]&&ITEMS[heldItemId()].potion){drinkPotion(ITEMS[heldItemId()].potion);}else{mining=true;tryAttackMob();}}
      else if(id==='btnPlace'){
        // 触屏：手持手榴弹->按住蓄力，否则原放置逻辑
        if(gameMode==='shooter'&&heldItemId()&&ITEMS[heldItemId()]&&ITEMS[heldItemId()].type==='grenade'){startNadeCharge();return;}
        interactOrPlace();
      }
      else if(id==='btnInv'){if(anyPanelOpen())closeAllPanels();else openInventory();}
    },{passive:false});
    el.addEventListener('touchend',e=>{
      e.preventDefault();
      if(id==='btnPlace'&&typeof releaseNadeCharge==='function')releaseNadeCharge();
      if(id==='btnJump')jumpBtn=false;
      else if(id==='btnFlyDown')flyDownBtn=false;
      else if(id==='btnMine')mining=false;
    },{passive:false});
  }
  bindBtn('btnJump');bindBtn('btnFlyDown');bindBtn('btnMine');bindBtn('btnPlace');bindBtn('btnInv');
  // 带鼠标的触屏设备（或自动化）：核心按钮补鼠标 click（touchstart 已 preventDefault，不会双触发）
  const tapClick=(id,down,up)=>{
    const el=$(id);if(!el)return;
    el.addEventListener('click',()=>{down();if(up)up();});
  };
  tapClick('btnJump',()=>{jumpBtn=true;setTimeout(()=>{jumpBtn=false;},120);});
  tapClick('btnFlyDown',()=>{flyDownBtn=true;setTimeout(()=>{flyDownBtn=false;},120);});
  tapClick('btnMine',()=>{if(heldIsFood()){eatFood();}else if(heldItemId()&&ITEMS[heldItemId()]&&ITEMS[heldItemId()].potion){drinkPotion(ITEMS[heldItemId()].potion);}else{mining=true;tryAttackMob();setTimeout(()=>{mining=false;},120);}});
  tapClick('btnPlace',()=>interactOrPlace());
  const bi=$('btnInv');
  if(bi)bi.addEventListener('click',()=>{if(anyPanelOpen())closeAllPanels();else openInventory();}); // 带鼠标的触屏设备用鼠标点
  const bb=$('btnBook');
  if(bb){
    bb.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();
      if(anyPanelOpen())closeAllPanels();else openBook();},{passive:false});
    bb.addEventListener('click',()=>{if(anyPanelOpen())closeAllPanels();else openBook();}); // preventDefault 已挡掉触屏合成 click
  }
  // 快捷栏点选
  $('hotbar').addEventListener('touchstart',e=>{
    const el=e.target.closest('.slot');
    if(!el)return;
    e.preventDefault();
    player.sel=+el.dataset.idx;sfx.select();updateHotbar();
  },{passive:false});
}

// ---------------- 射线检测 ----------------
function raycastVoxel(maxDist){
  const origin=new THREE.Vector3(player.pos.x,player.pos.y+PEYE,player.pos.z);
  const dir=new THREE.Vector3(
    -Math.sin(player.yaw)*Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw)*Math.cos(player.pitch)).normalize();
  let x=Math.floor(origin.x),y=Math.floor(origin.y),z=Math.floor(origin.z);
  const stepX=dir.x>0?1:-1,stepY=dir.y>0?1:-1,stepZ=dir.z>0?1:-1;
  const tdx=Math.abs(1/(dir.x||1e-10)),tdy=Math.abs(1/(dir.y||1e-10)),tdz=Math.abs(1/(dir.z||1e-10));
  let tmx=(stepX>0?(x+1-origin.x):(origin.x-x))*tdx;
  let tmy=(stepY>0?(y+1-origin.y):(origin.y-y))*tdy;
  let tmz=(stepZ>0?(z+1-origin.z):(origin.z-z))*tdz;
  let nx=0,ny=0,nz=0,t=0;
  for(let i=0;i<200;i++){
    if(tmx<tmy&&tmx<tmz){x+=stepX;t=tmx;tmx+=tdx;nx=-stepX;ny=0;nz=0;}
    else if(tmy<tmz){y+=stepY;t=tmy;tmy+=tdy;nx=0;ny=-stepY;nz=0;}
    else{z+=stepZ;t=tmz;tmz+=tdz;nx=0;ny=0;nz=-stepZ;}
    if(t>maxDist)return null;
    const b=getBlock(x,y,z);
    if(b!==B_AIR&&(BLOCKS[b].solid||b===B_DOOR_OPEN||b===B_CROPS)){ // 开着的门和麦苗也要能点到
      return {x,y,z,nx,ny,nz,dist:t,block:b};
    }
  }
  return null;
}

// ---------------- 挖掘/放置 ----------------
let mineTarget=null,mineProgress=0,mineTickT=0;
let curTarget=null;
function heldItemId(){
  const s=inv.hot[player.sel];
  return s?s.id:0;
}
// ---------------- 第一人称手持武器（手 + 不同武器 3D 模型） ----------------
let handGroup=null,handWeapon=null,handRecoil=0,handBobT=0,handMoving=false;
const HAND_POS={x:0.36,y:-0.30,z:-0.62}; // 相机空间：画面右下角
function initHandView(){
  if(handGroup||!camera)return;
  handGroup=new THREE.Group();
  // 不再渲染手臂/手掌：空手不显示任何东西，拿什么显示什么
  handWeapon=new THREE.Group();
  handWeapon.position.set(0,0.08,-0.16);
  handGroup.add(handWeapon);
  camera.add(handGroup);
  handGroup.position.copy(HAND_POS);
  showHeldItem();
}
// 构建各武器 3D 模型（挂在 handWeapon 下，指向 -Z 视线方向）
function buildWeaponModel(id){
  const g=new THREE.Group();
  const M=(c,r)=>new THREE.MeshLambertMaterial({color:c});
  const dark=M(0x2e2e2e),grey=M(0x555555),wood=M(0x8a5a2a),darkwood=M(0x5e3a1a);
  const box=(w,h,d,mat,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m;};
  const cyl=(r,h,mat,x,y,z)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);g.add(m);return m;};
  const it=id?ITEMS[id]:null;const type=it?it.type:null;
  if(type!=='gun'&&type!=='grenade'&&type!=='mine'&&type!=='block'&&id!==I.missile&&id!==I.bow){
    // 工具/普通物品：不在这一侧渲染，交给 mobs2.js 的 itemPlaneVM 图标平面显示（拿什么图标就是什么）
    return g;
  }
  else if(id===I.missile){ // 追踪导弹：白色细长弹体 + 红色弹头 + 尾翼
    box(0.1,0.1,0.4,grey,0,0,-0.28); // 弹身
    box(0.07,0.07,0.1,M(0xb03030),0,0,-0.5); // 红色弹头
    box(0.14,0.02,0.05,M(0x8a8a8a),0,0.07,-0.06); // 尾翼
    box(0.14,0.02,0.05,M(0x8a8a8a),0,-0.07,-0.06);
    box(0.02,0.02,0.08,M(0xff8a30),0,0,0.08); // 尾焰
  }else if(type==='gun'){
    const gn=it.gun||{};
    if(gn.dmg>=25){ // 狙击枪：长枪管 + 瞄准镜 + 木托
      box(0.06,0.09,0.42,grey,0,0,-0.21); // 枪身
      cyl(0.028,0.55,dark,0,0.015,-0.52); // 长枪管
      cyl(0.036,0.10,dark,0,0.09,-0.16); // 瞄准镜
      box(0.07,0.1,0.16,wood,0,-0.02,0.12); // 枪托
    }else if(gn.pellets){ // 霰弹枪：双管 + 木托
      cyl(0.03,0.5,dark,-0.022,0.01,-0.28);
      cyl(0.03,0.5,dark,0.022,0.01,-0.28);
      box(0.08,0.09,0.2,wood,0,0.01,-0.02); // 枪身木
      box(0.07,0.1,0.16,darkwood,0,-0.02,0.14); // 枪托
    }else if(gn.cd<=0.14){ // 冲锋枪：短枪身 + 下挂弹匣
      box(0.08,0.1,0.34,dark,0,0,-0.16); // 枪身
      box(0.06,0.14,0.05,dark,0,-0.11,-0.14); // 弹匣
      cyl(0.025,0.2,dark,0,0.015,-0.4); // 枪管
      box(0.04,0.03,0.06,wood,0,-0.02,0.12); // 握把小
    }else{ // 手枪：短管 + 握把 + 准星
      box(0.07,0.1,0.24,grey,0,0.01,-0.1); // 滑套
      cyl(0.022,0.14,dark,0,0.03,-0.26); // 枪管
      box(0.06,0.16,0.06,dark,0,-0.12,-0.02); // 握把
      box(0.02,0.03,0.02,dark,0,0.09,-0.2); // 准星
    }
  }else if(type==='grenade'){
    const ball=new THREE.Mesh(new THREE.SphereGeometry(0.09,10,10),M(0x4a7a3a));
    ball.position.set(0,0,-0.04);g.add(ball);
    const pin=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.08,6),M(0x8a8a8a));
    pin.position.set(0,0.06,-0.04);g.add(pin);
  }else if(type==='mine'){
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,0.045,10),M(0x3a5a2a));
    disc.position.set(0,0,-0.03);g.add(disc);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.025,6,6),M(0xff3030));
    lamp.position.set(0,0.02,-0.03);g.add(lamp);
  }else if(type==='block'){ // 掩体方块：圆石色方块
    const blk=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,0.16),new THREE.MeshLambertMaterial({color:0x8a8a7a}));
    blk.position.set(0,0.02,-0.1);g.add(blk);
  }
  // 弓：木弯弓（弧）
  else if(id===I.bow){
    const bow=new THREE.Mesh(new THREE.TorusGeometry(0.11,0.018,6,14,Math.PI),M(0x8a5a2a));
    bow.position.set(0,0.04,-0.08);bow.rotation.x=Math.PI/2;g.add(bow);
    const str=new THREE.Mesh(new THREE.BoxGeometry(0.005,0.005,0.22),M(0xcccccc));
    str.position.set(0,0.04,-0.08);g.add(str);
  }
  return g;
}
function showHeldItem(){
  if(!handGroup)return;
  while(handWeapon.children.length)handWeapon.remove(handWeapon.children[0]);
  const held=heldItemId();
  const wm=buildWeaponModel(held);
  handWeapon.add(wm);
  // 面板/死亡隐藏
  const hide=!started||(typeof anyPanelOpen==='function'&&anyPanelOpen())||player.dead;
  handGroup.visible=!hide;
}
function handRecoilPulse(){handRecoil=0.09;}
function updateHandView(dt){
  if(!handGroup)return;
  // 隐藏条件
  const hide=!started||(typeof anyPanelOpen==='function'&&anyPanelOpen())||player.dead;
  if(hide){handGroup.visible=false;return;}
  handGroup.visible=true;
  // 走路摆动 + 后坐恢复
  handRecoil=Math.max(0,handRecoil-dt*0.5);
  const move=keys&&(keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD'])&&!player.dead;
  handBobT+=dt*(move?9:3);
  const bob=Math.sin(handBobT)*(move?0.016:0.004);
  handGroup.position.set(HAND_POS.x+Math.sin(handBobT*0.5)*0.012,HAND_POS.y+bob,HAND_POS.z+handRecoil);
  // 后坐时武器轻微上仰
  handWeapon.rotation.x=handRecoil*0.8;
}

function breakTimeFor(b,held){
  const def=BLOCKS[b];
  if(!isFinite(def.hard)){
    if(b===B_BEDROCK&&modsOn.titan&&held===I.obsidian_pickaxe)return 25; // 🗿 泰坦模组：黑曜石镐能慢慢挖动基岩！
    return Infinity;
  }return Infinity;
  const it=held?ITEMS[held]:null;
  if(it&&it.type==='tool'&&def.tool&&it.toolType===def.tool&&it.tier>=def.minTier){
    const st=inv.hot[player.sel];
    const eff=st&&st.id===held&&st.ench?(st.ench.eff||0):0;
    return Math.max(def.hard/(it.speed*(1+0.5*eff)),0.05);
  }
  if(def.tool&&def.minTier>0)return def.hard*1.6;
  return Math.max(def.hard,0.05);
}
function canHarvest(b,held){
  const def=BLOCKS[b];
  if(!def.tool||def.minTier===0)return true;
  const it=held?ITEMS[held]:null;
  return !!(it&&it.type==='tool'&&it.toolType===def.tool&&it.tier>=def.minTier);
}
function updateMining(dt){
  curTarget=inputEnabled()?raycastVoxel(5.2):null;
  if(curTarget){
    highlightBox.visible=true;
    highlightBox.position.set(curTarget.x+0.5,curTarget.y+0.5,curTarget.z+0.5);
  }else highlightBox.visible=false;
  const bar=$('minebar');
  // 枪战模式：只允许挖玩家放置/改动过的方块（掩体等，blockDiff 有记录），竞技场原生方块保护
  const t0=curTarget;
  const playerChanged=t0&&blockDiff[t0.x+','+t0.y+','+t0.z]!==undefined;
  // 🔱 拿着长矛按住挖掘键是「戳刺」，不会挖坏方块！
  const heldIt=heldItemId()?ITEMS[heldItemId()]:null;
  if((gameMode==='shooter'&&!playerChanged)||!mining||!curTarget||!inputEnabled()||mobRaycast()||(heldIt&&heldIt.toolType==='spear')){
    mineProgress=0;mineTarget=null;bar.style.display='none';
    return;
  }
  const t=curTarget;
  if(!mineTarget||mineTarget.x!==t.x||mineTarget.y!==t.y||mineTarget.z!==t.z){
    mineTarget={x:t.x,y:t.y,z:t.z};mineProgress=0;
  }
  let bt=breakTimeFor(t.block,heldItemId());
  if(gameMode==='creative')bt=0.05; // 创造模式秒挖
  if(gameMode==='shooter')bt=Math.min(bt,0.6); // 枪战：挖掩体加速（徒手/持枪 0.6s 内挖掉）
  if(!isFinite(bt)){bar.style.display='none';return;}
  mineProgress+=dt/bt;
  mineTickT+=dt;
  if(mineTickT>0.22){mineTickT=0;sfx.digTick(BLOCKS[t.block].sound);}
  bar.style.display='block';
  $('minefill').style.width=Math.min(100,mineProgress*100)+'%';
  if(mineProgress>=1){
    breakBlock(t.x,t.y,t.z,t.block);
    mineProgress=0;mineTarget=null;bar.style.display='none';
  }
}
let chainMining=false; // 防止无尽贪婪镐连锁挖矿时无限套娃
function breakBlock(x,y,z,b){
  const held=heldItemId();
  // 枪战模式：挖掩体只清方块，不掉落物（防背包污染）
  if(gameMode==='shooter'){
    setBlock(x,y,z,B_AIR);
    spawnBlockParticles(x,y,z,tileColors[BLOCKS[b].tiles.side]);
    sfx.breakBlock(BLOCKS[b].sound);
    onWorldChanged();
    return;
  }
  const cropStage=(b===B_CROPS)?(facings[x+','+y+','+z]||0):0; // setBlock 会清掉 facings，先记住生长阶段
  setBlock(x,y,z,B_AIR);
  makeNoise(x,z); // 敲方块会发出声音，远古城市里的坚守者听得见！
  // 🍀 幸运方块：挖开抽奖！
  if(b===B_LUCKY||b===B_LUCKY_SUPER||b===B_UNLUCKY||b===B_LUCKY_DIAMOND||b===B_LUCKY_RAINBOW||b===B_LUCKY_TNT||b===B_LUCKY_MOB){
    if(!modsOn.lucky){showToast('🔒 要先在开始界面打开幸运方块模组哦！');}
    else luckyEvent(b,x,y,z);
  }
  // ☝️ 单格方块生存：挖神奇方块→长新方块+随机奖励
  if(modsOn.oneblock&&oneBlockPos&&x===oneBlockPos.x&&y===oneBlockPos.y&&z===oneBlockPos.z){
    oneBlockCount++;
    setBlock(x,y,z,oneBlockRandomBlock());
    spawnDrop(x+0.5,y+1.2,z+0.5,oneBlockBonus(),1);
    if(oneBlockCount===10)showToast('☝️ 挖了 10 次！方块越来越好啦～');
    if(oneBlockCount===25)showToast('☝️ 25 次！石头时代来喽！');
    if(oneBlockCount===50)showToast('☝️ 50 次！铁器时代！');
    if(oneBlockCount===80)showToast('☝️ 80 次！快到钻石啦！');
    if(oneBlockCount===150)showToast('🏆 150 次！你是单格方块大师！');
    if(Math.random()<0.06)spawnMob(['pig','sheep','chicken','cow'][(Math.random()*4)|0],x+1,z);
    onWorldChanged();
    return; // 不走正常掉落
  }
  // ⛏️ 连锁采集：挖一个，连在一起的一样的全掉出来！
  if(modsOn.vein&&!chainVein&&VEIN_BLOCKS.has(b)){
    chainVein=true;
    const n=veinMine(x,y,z,b);
    chainVein=false;
    if(n>0)showToast('⛏️✨ 连锁采集！一下子挖掉 '+(n+1)+' 个「'+BLOCKS[b].name+'」！');
  }
  // 🗿 泰坦模组：黑曜石镐能挖基岩！
  if(b===B_BEDROCK&&modsOn.titan&&held===I.obsidian_pickaxe){spawnDrop(x+0.5,y+0.5,z+0.5,B_BEDROCK,1);}
  // 💜 无尽贪婪镐子：一镐下去 3×3×3 一大片全碎！
  if(held===I.infinity_pickaxe&&!chainMining){
    chainMining=true;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      if(dx===0&&dy===0&&dz===0)continue;
      const nb=getBlock(x+dx,y+dy,z+dz);
      if(nb===B_AIR)continue;
      const nd=BLOCKS[nb];
      if(!nd||!isFinite(nd.hard))continue; // 基岩、命令方块这些挖不动
      breakBlock(x+dx,y+dy,z+dz,nb);
    }
    chainMining=false;
  }
  // 门是上下两格，敲一格另一格也消失
  if(b===B_DOOR||b===B_DOOR_OPEN){
    const isDoor=v=>v===B_DOOR||v===B_DOOR_OPEN;
    if(isDoor(getBlock(x,y+1,z)))setBlock(x,y+1,z,B_AIR);
    if(isDoor(getBlock(x,y-1,z)))setBlock(x,y-1,z,B_AIR);
  }
  // 床是左右两格，敲一格另一格也消失（敲床头时床尾掉出床物品）
  if(b===B_BED||b===B_BED_HEAD){
    for(const bd of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+bd[0],nz=z+bd[1];
      const nb=getBlock(nx,y,nz);
      if(b===B_BED&&nb===B_BED_HEAD)setBlock(nx,y,nz,B_AIR);
      if(b===B_BED_HEAD&&nb===B_BED){setBlock(nx,y,nz,B_AIR);if(canHarvest(B_BED,held))spawnDrop(nx+0.5,y+0.5,nz+0.5,B_BED,1);}
    }
  }
  // 箱子被打掉：里面的东西全部掉出来
  if(b===B_CHEST){
    const key=x+','+y+','+z;
    const cs=chestStates[key];
    if(cs)for(const s of cs.slots)if(s)spawnDrop(x+0.5,y+0.5,z+0.5,s.id,s.count);
    delete chestStates[key];
  }
  sfx.breakBlock(BLOCKS[b].sound);
  spawnBlockParticles(x,y,z,tileColors[BLOCKS[b].tiles.side]);
  // 花丛有几率掉小麦种子
  if(b===B_FLOWER&&Math.random()<0.5)spawnDrop(x+0.5,y+0.5,z+0.5,I.seeds,1);
  // 小麦：成熟了掉小麦+种子，没成熟只掉种子
  if(b===B_CROPS){
    if(cropStage>=3){spawnDrop(x+0.5,y+0.5,z+0.5,I.wheat,1);spawnDrop(x+0.5,y+0.5,z+0.5,I.seeds,1+Math.floor(Math.random()*2));}
    else spawnDrop(x+0.5,y+0.5,z+0.5,I.seeds,1);
  }
  // 下界岩有几率掉冶炼粉（做超级TNT用）
  if(b===B_NETHERRACK&&curDim==='nether'&&modsOn.storm&&Math.random()<0.3)spawnDrop(x+0.5,y+0.5,z+0.5,I.blaze_powder,1);
  let drop=BLOCKS[b].drop;
  // 🔒 模组没开：模组方块挖掉就消失，不掉出来（没有模组效果！）
  if(drop&&ITEMS[drop]&&ITEMS[drop].mod&&!modsOn[ITEMS[drop].mod])drop=0;
  queueWaterNear(x,y,z); // 挖掉的方块旁边有水的话，水会流进来
  if(b===B_LEAVES||b===B_SPRUCE_LEAVES||b===B_DARK_LEAVES||b===B_CHERRY_LEAVES){
    const r=Math.random();
    if(r<0.05)drop=I.sapling; // 5% 掉树苗（空岛种树循环关键）
    else if(r<0.09)drop=I.stick;else if(r<0.12)drop=I.string;else drop=0;
  }
  if(drop&&canHarvest(b,held))spawnDrop(x+0.5,y+0.5,z+0.5,drop,1);
  else if(drop&&BLOCKS[b].tool){ // 工具不对：方块碎了但不掉东西，提示该用什么工具
    const tierName=['','木镐','石镐','铁镐','钻石镐'][BLOCKS[b].minTier]||'镐子';
    const need=BLOCKS[b].minTier<=1?'一把镐子':tierName+'或更好的镐子';
    const nowT=performance.now();
    if(!window._lastHarvestHint||nowT-window._lastHarvestHint>3000){
      window._lastHarvestHint=nowT;
      showToast('⛏️ '+BLOCKS[b].name+'碎掉了但没掉东西——要用'+need+'挖才会掉落！');
    }
  }
  onWorldChanged();
}
let rodeGhast=false,usedPearl=false,tilledLand=false,plantedSeeds=false; // 任务用：骑过快乐恶魂 / 扔过末影珍珠 / 耕过地 / 种过小麦
function mountGhast(m){
  player.mounted=m;
  rodeGhast=true;
  showToast('骑上快乐恶魂啦！前进=朝准星方向飞，再点一次右键/放置下来');
  updateTasks();
}
function dismountGhast(){
  const m=player.mounted;
  if(!m)return;
  player.mounted=null;
  player.pos.set(m.pos.x+1.2,m.pos.y+0.2,m.pos.z);
  player.vel.set(0,0,0);
  player.peakY=player.pos.y;
  showToast('下来了');
}
function eatFood(){
  const fid=heldItemId();
  const f=fid&&ITEMS[fid]?ITEMS[fid].food:0;
  if(!f)return;
  const emoji={bread:'🍞',carrot:'🥕',potato:'🥔'}[ITEMS[fid].key]||'🍞';
  if(fid===I.golden_apple){ // 🍎 金苹果：回满血 + 30秒金光护盾（受伤减半）！
    player.hp=player.maxHp;updateHearts();
    player.goldT=30;
    spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(255,220,90)');
    showToast('🍎✨ 金苹果！生命全满！30秒金光护盾，怪物打你只掉一半血！');
    if(gameMode!=='creative')consumeHeld(1);
    return;
  }
  if(f>0){
    if(player.hp<player.maxHp){
      player.hp=Math.min(player.maxHp,player.hp+f);updateHearts();
      showToast(emoji+' 真好吃！生命 +'+f);
    }else showToast(emoji+' 啊呜啊呜……真好吃！');
  }else{ // 腐肉等负分食物：吃了掉血
    damagePlayer(Math.abs(f),'吃坏肚子了');
    showToast(emoji+' 呃……这个不能吃！');
  }
  if(gameMode!=='creative')consumeHeld(1);
}
function heldIsFood(){const id=heldItemId();return id&&ITEMS[id]&&ITEMS[id].food;}
// 枪战掩体方块：选中圆石方块右键放置（shooter 模式，8 个限量）
function placeBarrier(){
  if(gameMode!=='shooter'||player.dead)return;
  const slot=inv.hot[player.sel];
  if(!slot||!ITEMS[slot.id]||ITEMS[slot.id].type!=='block'){showToast('⛔ 请先选中掩体方块（数字键 7）');return;}
  if(slot.count<=0){showToast('⛔ 掩体方块用完了');return;}
  const t=raycastVoxel(5.2);
  if(!t){showToast('⛔ 看向要放置的位置');return;}
  const tx=t.x+t.nx,ty=t.y+t.ny,tz=t.z+t.nz;
  if(!inW(tx,ty,tz))return;
  const cur=getBlock(tx,ty,tz);
  if(cur!==B_AIR&&cur!==B_WATER){showToast('⛔ 这里放不了');return;}
  const pa=playerAABB(player.pos);
  if(tx+1>pa.x0&&tx<pa.x1&&ty+1>pa.y0&&ty<pa.y1&&tz+1>pa.z0&&tz<pa.z1){showToast('⛔ 离自己太近了');return;}
  setBlock(tx,ty,tz,slot.blockId||slot.id); // 写入世界 + 自动广播同步给队友
  slot.count--;
  if(slot.count<=0)inv.hot[player.sel]=null;
  if(typeof updateHotbar==='function')updateHotbar();
  if(typeof sfx!=='undefined'&&sfx.place)sfx.place();
  showToast('🧱 掩体已放置（剩 '+(slot.count>0?slot.count:0)+' 个）');
}
function interactOrPlace(){
  if(!inputEnabled())return;
  if(gameMode==='shooter'){
    // 枪战模式右键：地雷→布雷，掩体方块→放置掩体，否则→蓄力扔手榴弹
    const held=heldItemId();
    if(held&&ITEMS[held]&&ITEMS[held].type==='mine'){placeMine();return;}
    if(held&&ITEMS[held]&&ITEMS[held].type==='block'){placeBarrier();return;}
    throwGrenade();return;
  }
  if(player.mounted){dismountGhast();return;}
  // 弓：射箭（要有箭，创造模式不用）
  if(heldItemId()===I.bow){
    if(gameMode!=='creative'&&!takeItemFromInv(I.arrow,1)){showToast('🏹 没有箭了！用木棍合成箭');return;}
    shootArrow();return;
  }
  // 末影珍珠：扔出去传送到 8 格以外
  if(heldItemId()===I.ender_pearl){
    const dx=-Math.sin(player.yaw),dz=-Math.cos(player.yaw);
    const tx=Math.floor(player.pos.x+dx*8),tz=Math.floor(player.pos.z+dz*8);
    player.pos.set(tx+0.5,surfaceY(tx,tz)+1,tz+0.5);
    player.vel.set(0,0,0);player.peakY=player.pos.y;
    if(gameMode!=='creative')consumeHeld(1);
    usedPearl=true;updateTasks();
    showToast('💜 嗖——传送过来了！');
    return;
  }
  // 面包：吃一口回血（随时都能吃）
  if(heldIsFood()){eatFood();return;}
  { // 🧪 手持药水：右键喝掉
    const ph=heldItemId()?ITEMS[heldItemId()]:null;
    if(ph&&ph.potion){drinkPotion(ph.potion);return;}
  }
  const mh=mobRaycast();
  if(mh&&mh.mob.type==='hghast'&&mh.d<4.2){mountGhast(mh.mob);return;}
  // 💚 村民交易：点村民打开交易面板
  if(mh&&mh.mob.type==='villager'&&mh.d<4.2){openTrade();return;}
  const t0=raycastVoxel(5.2);
  if(t0){
    // 💥 炸弹们：点一下就炸！
    if(t0.block===B_TNT){setBlock(t0.x,t0.y,t0.z,0);explode(t0.x+0.5,t0.y+0.5,t0.z+0.5,3,8);showToast('💥 砰！');return;}
    if(t0.block===B_SUPER_TNT){setBlock(t0.x,t0.y,t0.z,0);explode(t0.x+0.5,t0.y+0.5,t0.z+0.5,5,16);showToast('💥💥 超级大爆炸！');return;}
    // 🧨 更多TNT模组：16种新TNT！
    if(t0.block>=B_TNT_BIG&&t0.block<=B_TNT_TP){
      if(!modsOn.moretnt){showToast('🔒 要先打开更多TNT模组哦！');return;}
      const cx=t0.x+0.5,cy=t0.y+0.5,cz=t0.z+0.5;
      const tb=t0.block;
      setBlock(t0.x,t0.y,t0.z,0);
      if(tb===B_TNT_BIG){ // 💥💥💥 超巨大爆炸！
        explode(cx,cy,cz,8,30);showToast('💥💥💥 超超超巨大爆炸！！！');
      }else if(tb===B_TNT_FIRE){ // 🔥 火焰TNT：炸完还着火！
        explode(cx,cy,cz,3,10);
        for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(dx*dx+dz*dz<=9){
          const fx2=t0.x+dx,fz2=t0.z+dz,fy=surfaceY(fx2,fz2)+1;igniteFire(fx2,fy,fz2);
        }
        showToast('🔥💥 火焰爆炸！到处都着火啦！');
      }else if(tb===B_TNT_ICE){ // 🧊 冰冻TNT：把周围冻成冰屋！
        explode(cx,cy,cz,2,6);
        for(let dx=-3;dx<=3;dx++)for(let dy=-3;dy<=3;dy++)for(let dz=-3;dz<=3;dz++){
          const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
          if(d>2.6&&d<=3.6){const bx=t0.x+dx,by=t0.y+dy,bz=t0.z+dz;if(getBlock(bx,by,bz)===B_AIR)setBlock(bx,by,bz,B_GLASS);}
        }
        for(const m of mobs){if(!m.dead&&m.pos.distanceTo(new THREE.Vector3(cx,cy,cz))<10)m.iceT=5;}
        showToast('🧊💥 冰冻爆炸！怪物都被冻住啦！');
      }else if(tb===B_TNT_LIGHTNING){ // ⚡ 雷电TNT：召唤6道闪电！
        for(let i=0;i<6;i++)luckyLightning(t0.x+((Math.random()*11)|0)-5,t0.z+((Math.random()*11)|0)-5);
        explode(cx,cy,cz,2,6);showToast('⚡💥 雷电爆炸！天降神雷！');
      }else if(tb===B_TNT_MOB){ // 👹 怪物TNT
        for(let i=0;i<8;i++)spawnMob(['zombie','skeleton','spider','creeper'][(Math.random()*4)|0],t0.x+((Math.random()*9)|0)-4,t0.z+((Math.random()*9)|0)-4);
        showToast('👹💥 哇！蹦出了一大群怪物！');
      }else if(tb===B_TNT_ANIMAL){ // 🐷 动物TNT
        for(let i=0;i<8;i++)spawnMob(['pig','sheep','chicken','cow'][(Math.random()*4)|0],t0.x+((Math.random()*9)|0)-4,t0.z+((Math.random()*9)|0)-4);
        showToast('🐷💥 哇！蹦出了一大群小动物！');
      }else if(tb===B_TNT_DIAMOND){ // 💎 钻石TNT：炸出钻石矿！
        explode(cx,cy,cz,3,8);
        let placed=0;
        for(let i=0;i<40&&placed<12;i++){
          const bx=t0.x+((Math.random()*9)|0)-4,by=t0.y+((Math.random()*9)|0)-4,bz=t0.z+((Math.random()*9)|0)-4;
          if(getBlock(bx,by,bz)===B_AIR){setBlock(bx,by,bz,B_DIAMOND_ORE);placed++;}
        }
        giveItemToInv(I.diamond,2);
        showToast('💎💥 钻石爆炸！炸出了钻石矿！');
      }else if(tb===B_TNT_HOUSE){ // 🏠 房子TNT
        buildLuckyHouse(t0.x,t0.y,t0.z);
        showToast('🏠💥 嘭！变出了一座小木屋！');
      }else if(tb===B_TNT_RAINBOW){ // 🌈 彩虹TNT：天上掉彩虹方块雨！
        explode(cx,cy,cz,2,4);
        const RB=[B_GOLD_BLOCK,B_DIAMOND_BLOCK,B_EMERALD_BLOCK,B_REDSTONE_BLOCK,B_GLOWSTONE,B_INFINITY_BLOCK];
        let rp=0;
        for(let i=0;i<60&&rp<24;i++){
          const bx=t0.x+((Math.random()*13)|0)-6,bz=t0.z+((Math.random()*13)|0)-6,by=surfaceY(bx,bz)+1;
          if(getBlock(bx,by,bz)===B_AIR){setBlock(bx,by,bz,RB[i%6]);rp++;spawnBlockParticles(bx+0.5,by+0.5,bz+0.5,'rgb(255,120,220)');}
        }
        showToast('🌈💥 哇！下起彩虹方块雨啦！');
      }else if(tb===B_TNT_FLOOD){ // 🌊 洪水TNT
        for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++)if(dx*dx+dz*dz<=16){
          const bx=t0.x+dx,bz=t0.z+dz,by=surfaceY(bx,bz)+1;
          if(getBlock(bx,by,bz)===B_AIR)setBlock(bx,by,bz,B_WATER);
        }
        showToast('🌊💥 哗啦啦！发大水啦，快游泳！');
      }else if(tb===B_TNT_LAVA){ // 🌋 岩浆TNT
        explode(cx,cy,cz,2,6);
        for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(dx*dx+dz*dz<=5){
          const bx=t0.x+dx,bz=t0.z+dz,by=surfaceY(bx,bz)+1;
          if(getBlock(bx,by,bz)===B_AIR)setBlock(bx,by,bz,B_LAVA);
        }
        showToast('🌋💥 火山爆发！小心滚烫的岩浆！');
      }else if(tb===B_TNT_HOLE){ // 🕳️ 黑洞TNT：吸出一个超级大深坑！
        explode(cx,cy,cz,10,20);
        for(let dy=0;dy<20;dy++)explode(cx,cy-dy*1.2,cz,3,0);
        showToast('🕳️💥 黑洞！地面被吸出一个超级大深坑！');
      }else if(tb===B_TNT_FIREWORK){ // 🎆 烟花TNT
        const FC=['rgb(255,80,80)','rgb(255,200,60)','rgb(120,255,120)','rgb(120,180,255)','rgb(230,130,255)'];
        for(let i=0;i<30;i++)for(let j=0;j<8;j++)spawnBlockParticles(cx+(Math.random()*30-15),cy+8+Math.random()*18,cz+(Math.random()*30-15),FC[i%5]);
        thunderSound(1);
        showToast('🎆💥 砰砰啪！满天都是漂亮的烟花！');
      }else if(tb===B_TNT_FOOD){ // 🍗 美食TNT
        explode(cx,cy,cz,2,4);
        giveItemToInv(I.bread,5);giveItemToInv(I.potato,5);giveItemToInv(I.carrot,5);giveItemToInv(I.wheat,5);
        for(let i=0;i<20;i++)spawnBlockParticles(cx+(Math.random()*6-3),cy+Math.random()*3,cz+(Math.random()*6-3),'rgb(255,220,120)');
        showToast('🍗💥 哇！掉了好多面包、土豆和胡萝卜！');
      }else if(tb===B_TNT_CHEST){ // 🎁 宝箱TNT：变出装满宝贝的宝箱！
        const sy2=surfaceY(t0.x,t0.z)+1;
        setBlock(t0.x,sy2,t0.z,B_CHEST);
        const ck3=t0.x+','+sy2+','+t0.z;
        const slots=new Array(27).fill(null);
        const loot=[[I.diamond,3],[I.gold_ingot,5],[I.iron_ingot,8],[I.emerald,4],[I.redstone,10],[I.bread,5],[I.slimeball,6],[I.ender_pearl,2]];
        loot.forEach((l,i)=>{slots[i*3]={id:l[0],count:l[1]};});
        chestStates[ck3]={slots};
        for(let i=0;i<16;i++)spawnBlockParticles(t0.x+0.5,sy2+0.5+Math.random(),t0.z+0.5,'rgb(255,215,0)');
        showToast('🎁💥 嘭！变出一个装满宝贝的宝箱！');
      }else if(tb===B_TNT_TP){ // 🌀 传送TNT：咻！把你传送到随机地方！
        for(let i=0;i<24;i++)spawnBlockParticles(player.pos.x,player.pos.y+Math.random()*2,player.pos.z,'rgb(120,255,230)');
        const nx=Math.floor(player.pos.x+(Math.random()*400-200)),nz=Math.floor(player.pos.z+(Math.random()*400-200));
        const ny=surfaceY(nx,nz)+2;
        player.pos.set(nx+0.5,ny,nz+0.5);player.vel.set(0,0,0);player.peakY=ny;
        for(let i=0;i<24;i++)spawnBlockParticles(nx+0.5,ny+Math.random()*2,nz+0.5,'rgb(120,255,230)');
        showToast('🌀💥 咻——！你被传送到了一个新地方！');
      }
      onWorldChanged();
      return;
    }
    // 🗿 泰坦刷怪蛋：放出超级大泰坦！
    const TITAN_EGGS={[I.titan_zombie_egg]:'titan_zombie',[I.titan_skeleton_egg]:'titan_skeleton',[I.titan_creeper_egg]:'titan_creeper',[I.titan_spider_egg]:'titan_spider',[I.titan_golem_egg]:'titan_golem',[I.titan_warden_egg]:'titan_warden',[I.witherzilla_egg]:'witherzilla'};
    const titanEggType=TITAN_EGGS[heldItemId()];
    if(titanEggType){
      if(!modsOn.titan){showToast('🔒 要先在开始界面打开泰坦模组哦！');return;}
      spawnMob(titanEggType,t0.x,t0.z,t0.y+1);
      showToast('🌍 轰隆隆！'+(TITAN_NAMES[titanEggType]||'泰坦')+'出现了！！');
      return;
    }
    // 🔥 打火石：点矿石门框点燃维度传送门；点别的地方就着火！
    if(heldItemId()===I.flint_steel){
      const frameDim={[B_IRON_BLOCK]:'iron',[B_GOLD_BLOCK]:'gold',[B_DIAMOND_BLOCK]:'diamond',[B_NETHERITE_BLOCK]:'netherite',[B_REDSTONE_BLOCK]:'redstone',[B_EMERALD_BLOCK]:'emerald',[B_INFINITY_BLOCK]:'infinity'};
      const dim=frameDim[t0.block];
      if(dim){
        if(!modsOn.oredim){showToast('🔒 要先在开始界面打开🌀矿石维度模组哦！');return;}
        if(!tryLightOrePortal(t0.x,t0.y,t0.z,t0.block,dim))showToast('💡 小提示：门框中间要留一个洞，洞的四周（除了最下面贴地的一排）都要是同一种方块哦！');
        return;
      }
      // 点普通方块：上面着火啦！
      if(igniteFire(t0.x,t0.y+1,t0.z))showToast('🔥 点着啦！小心火会烧到旁边的木头哦～');
      return;
    }
  }
  const t=raycastVoxel(5.2);
  if(!t)return;
  if(t.block===B_TABLE){openTable();return;}
  if(t.block===B_FURNACE){openFurnace(t.x,t.y,t.z);return;}
  if(t.block===B_CHEST){openChest(t.x,t.y,t.z);return;}
  if(t.block===B_ENCHANT){openEnchant(t.x,t.y,t.z);return;}
  if(t.block===B_BREW){openBrew();return;}
  if(t.block===B_PISTON||t.block===B_STICKY){pistonPush(t.x,t.y,t.z);return;}
  if(t.block===B_DOOR||t.block===B_DOOR_OPEN){toggleDoor(t.x,t.y,t.z);return;}
  if(t.block===B_BED||t.block===B_BED_HEAD){sleepInBed(t.x,t.y,t.z);return;}
  const held=heldItemId();
  // 🪣 空桶装水：对着水点一下就装满（光线会穿过水打到水底，所以看相邻那一格）
  if((held===I.bucket||held===I.infinity_bucket)&&getBlock(t.x+t.nx,t.y+t.ny,t.z+t.nz)===B_WATER){
    setBlock(t.x+t.nx,t.y+t.ny,t.z+t.nz,B_AIR);
    queueWaterNear(t.x+t.nx,t.y+t.ny,t.z+t.nz); // 旁边的水会流过来补位
    inv.hot[player.sel]={id:held===I.bucket?I.water_bucket:I.infinity_water_bucket,count:1};
    sfx.splash();
    showToast(held===I.bucket?'🪣 装满水了！找块空地倒出来':'💜🪣 无尽水桶装满了！可以无限倒水！');
    refreshAll();
    return;
  }
  // 🪣 水桶倒水
  if(held===I.water_bucket||held===I.infinity_water_bucket){
    const tx=t.x+t.nx,ty=t.y+t.ny,tz=t.z+t.nz;
    if(!inW(tx,ty,tz))return;
    const cur=getBlock(tx,ty,tz);
    if(cur!==B_AIR&&cur!==B_WATER)return;
    setBlock(tx,ty,tz,B_WATER);
    waterFlowQ.push({x:tx,y:ty,z:tz}); // 水开始流动
    sfx.splash();
    if(held===I.water_bucket){ // 铁桶倒完就空了
      inv.hot[player.sel]={id:I.bucket,count:1};
      showToast('🪣 水倒出来了！');
    } // 无尽贪婪水桶永远倒不完，不用变回去
    refreshAll();
    return;
  }
  // 红石粉：撒在地上，放在活塞旁边还会把活塞推出去！
  if(held===I.redstone){
    const tx=t.x+t.nx,ty=t.y+t.ny,tz=t.z+t.nz;
    if(!inW(tx,ty,tz))return;
    const cur=getBlock(tx,ty,tz);
    if(cur!==B_AIR&&cur!==B_WATER)return;
    if(t.ny===0&&!isSolidBlock(getBlock(tx,ty-1,tz))){showToast('🔴 红石粉要撒在方块上面');return;}
    setBlock(tx,ty,tz,B_REDSTONE);
    if(gameMode!=='creative')consumeHeld(1);
    sfx.breakBlock('grass');
    // 旁边有活塞就触发它
    for(const d of[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
      const nb=getBlock(tx+d[0],ty+d[1],tz+d[2]);
      if(nb===B_PISTON||nb===B_STICKY)pistonPush(tx+d[0],ty+d[1],tz+d[2]);
    }
    showToast('🔴 撒了一撮红石粉！');
    return;
  }
  // 锄头：把泥土/草方块耕成农田
  if(held&&ITEMS[held]&&ITEMS[held].toolType==='hoe'&&(t.block===B_DIRT||t.block===B_GRASS)){
    if(getBlock(t.x,t.y+1,t.z)!==B_AIR){showToast('上面被挡住了，没法耕地');return;}
    setBlock(t.x,t.y,t.z,B_FARMLAND);
    sfx.breakBlock('grass');
    tilledLand=true;updateTasks();
    showToast('🟫 耕好一块地！拿小麦种子点它就能种');
    return;
  }
  // 小麦种子：种在农田上
  if(held===I.seeds&&t.block===B_FARMLAND){
    if(getBlock(t.x,t.y+1,t.z)!==B_AIR)return;
    setBlock(t.x,t.y+1,t.z,B_CROPS);
    facings[t.x+','+(t.y+1)+','+t.z]=0;
    if(gameMode!=='creative')consumeHeld(1);
    plantedSeeds=true;updateTasks();
    showToast('🌱 种下了！等它慢慢长大，变黄了就能收');
    return;
  }
  // 树苗：种在草地/泥土上（空岛种树循环核心，生存通用）
  if(held===I.sapling&&(t.block===B_GRASS||t.block===B_DIRT)){
    if(getBlock(t.x,t.y+1,t.z)!==B_AIR){showToast('上面没空间，种不了');return;}
    setBlock(t.x,t.y+1,t.z,B_SAPLING);
    if(gameMode!=='creative')consumeHeld(1);
    plantedSaplings++;updateTasks();
    showToast('🌱 树苗种下了！等它慢慢长大');
    return;
  }
  if(!held)return;
  const it=ITEMS[held];
  if(!it||it.type!=='block')return;
  const tx=t.x+t.nx,ty=t.y+t.ny,tz=t.z+t.nz;
  if(!inW(tx,ty,tz))return;
  const cur=getBlock(tx,ty,tz);
  if(cur!==B_AIR&&cur!==B_WATER)return;
  // 不能放在玩家身体里
  const pa=playerAABB(player.pos);
  if(tx+1>pa.x0&&tx<pa.x1&&ty+1>pa.y0&&ty<pa.y1&&tz+1>pa.z0&&tz<pa.z1)return;
  // 木门要占上下两格
  if(it.blockId===B_DOOR){
    if(!inW(tx,ty+1,tz)){showToast('上面没空间放门');return;}
    const above=getBlock(tx,ty+1,tz);
    if(above!==B_AIR&&above!==B_WATER){showToast('上面被挡住，门放不下');return;}
  }
  // 床要占两格：脚踩的这格+脸朝的方向那格（床头）
  if(it.blockId===B_BED){
    const f=playerFacingIdx();
    const bd=[[0,-1],[1,0],[0,1],[-1,0]][f];
    const hx=tx+bd[0],hz=tz+bd[1];
    if(!inW(hx,ty,hz)){showToast('床头那边没空间');return;}
    const hb=getBlock(hx,ty,hz);
    if(hb!==B_AIR&&hb!==B_WATER){showToast('床头那边被挡住，床放不下');return;}
    setBlock(hx,ty,hz,B_BED_HEAD);
  }
  setBlock(tx,ty,tz,it.blockId);
  if(it.blockId===B_COPIER)setTimeout(()=>tryCopyFill(tx,ty,tz),50); // 📋 复制方块：放下后尝试填充
  if(it.blockId===B_DOOR)setBlock(tx,ty+1,tz,B_DOOR);
  if(it.blockId===B_FURNACE||it.blockId===B_PISTON||it.blockId===B_STICKY)facings[tx+','+ty+','+tz]=playerFacingIdx();
  if(gameMode!=='creative')consumeHeld(1); // 创造模式放置不消耗
  sfx.place(BLOCKS[it.blockId].sound);
  onWorldChanged();
}
// 门：右键开/关（上下两格一起变）
function toggleDoor(x,y,z){
  let y0=y;
  const b=getBlock(x,y,z);
  if(b===B_DOOR||b===B_DOOR_OPEN){
    const up=getBlock(x,y+1,z),down=getBlock(x,y-1,z);
    const isDoor=v=>v===B_DOOR||v===B_DOOR_OPEN;
    if(isDoor(up))y0=y;else if(isDoor(down))y0=y-1;else return;
  }else return;
  const cur=getBlock(x,y0,z);
  const nb=(cur===B_DOOR)?B_DOOR_OPEN:B_DOOR;
  setBlock(x,y0,z,nb);setBlock(x,y0+1,z,nb);
  sfx.place('wood');
  showToast(nb===B_DOOR_OPEN?'🚪 门打开了':'🚪 门关上了');
  onWorldChanged();
}
// 床：晚上睡觉直接天亮，并记住重生点
function sleepInBed(x,y,z){
  const elev=Math.sin((dayTime-0.25)*Math.PI*2);
  if(elev>=0.1){showToast('现在还不困，晚上再来睡觉吧 🌙');return;}
  spawnPoint.set(x,y+1,z);
  dayTime=0.27;
  showToast('😴 睡了一觉，天亮了！重生点已记住');
  saveGame();
}
// 活塞：手里拿着红石粉才能激活（红石驱动，每次消耗1个，创造模式免费）
// 普通活塞=只推；粘性活塞=能推也能拉
function pistonPush(x,y,z){
  const pb=getBlock(x,y,z);
  const sticky=(pb===B_STICKY);
  const fi=facings[x+','+y+','+z];
  const dirs=[[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]];
  const d=dirs[fi!==undefined?fi:playerFacingIdx()];
  // 收集前方连续的方块
  const line=[];
  let cx=x+d[0],cy=y+d[1],cz=z+d[2];
  while(line.length<12&&inW(cx,cy,cz)){
    const b=getBlock(cx,cy,cz);
    if(b===B_AIR||b===B_WATER)break;
    if(b===B_BEDROCK){showToast('基岩推不动！');return;}
    line.push([cx,cy,cz,b]);
    cx+=d[0];cy+=d[1];cz+=d[2];
  }
  let action=null; // 'push' | 'pull'
  if(line.length){
    if(!inW(cx,cy,cz)){showToast('推到世界边界了');return;}
    const endB=getBlock(cx,cy,cz);
    if(endB!==B_AIR&&endB!==B_WATER){showToast('前面被堵住了');return;}
    action='push';
  }else if(sticky){
    // 拉：面前一格为空，第二格有方块 → 拉回来
    const b2=getBlock(cx+d[0],cy+d[1],cz+d[2]);
    if(inW(cx+d[0],cy+d[1],cz+d[2])&&b2!==B_AIR&&b2!==B_WATER&&b2!==B_BEDROCK)action='pull';
  }
  if(!action){showToast(sticky?'面前没有可推/可拉的方块':'面前没有方块可推');return;}
  // 红石驱动：手里要拿着红石粉
  const held=heldItemId();
  if(gameMode!=='creative'){
    if(held!==I.redstone){showToast('🔴 需要手里拿着红石粉来驱动活塞！');return;}
    consumeHeld(1);
  }
  if(action==='push'){
    const moveFacing={};
    for(let i=line.length-1;i>=0;i--){
      const bx=line[i][0],by=line[i][1],bz=line[i][2],b=line[i][3];
      const ok=bx+','+by+','+bz,nk=(bx+d[0])+','+(by+d[1])+','+(bz+d[2]);
      if(facings[ok]!==undefined)moveFacing[nk]=facings[ok];
      setBlock(bx+d[0],by+d[1],bz+d[2],b);
      setBlock(bx,by,bz,B_AIR);
      delete facings[ok];
    }
    for(const k in moveFacing)facings[k]=moveFacing[k];
    spawnBlockParticles(line[0][0]+0.5,line[0][1]+0.5,line[0][2]+0.5,'rgb(190,190,190)');
    showToast('⚡红石驱动！活塞把 '+line.length+' 个方块推了一格');
  }else{
    // 拉：第二格的方块移到面前一格
    const b2=getBlock(cx+d[0],cy+d[1],cz+d[2]);
    const ok=(cx+d[0])+','+(cy+d[1])+','+(cz+d[2]),nk=cx+','+cy+','+cz;
    setBlock(cx,cy,cz,b2);
    setBlock(cx+d[0],cy+d[1],cz+d[2],B_AIR);
    if(facings[ok]!==undefined){facings[nk]=facings[ok];delete facings[ok];}
    spawnBlockParticles(cx+0.5,cy+0.5,cz+0.5,'rgb(120,200,90)');
    showToast('⚡粘性活塞把方块拉回来了！');
  }
  sfx.place('stone');
  onWorldChanged();
}
function playerFacingIdx(){
  const dx=-Math.sin(player.yaw),dz=-Math.cos(player.yaw);
  if(Math.abs(dx)>Math.abs(dz))return dx>0?1:3;
  return dz>0?2:0;
}
function consumeHeld(n){
  const s=inv.hot[player.sel];
  if(!s)return;
  s.count-=n;
  if(s.count<=0)inv.hot[player.sel]=null;
  updateHotbar();
}

// ---------------- 粒子 ----------------
const particleGeo=new THREE.BoxGeometry(0.09,0.09,0.09);
const particleMats={};
const particles=[];
function spawnBlockParticles(x,y,z,color){
  let mat=particleMats[color];
  if(!mat){mat=new THREE.MeshLambertMaterial({color:new THREE.Color(color)});particleMats[color]=mat;}
  for(let i=0;i<14;i++){
    const m=new THREE.Mesh(particleGeo,mat);
    m.position.set(x+0.3+Math.random()*0.4,y+0.3+Math.random()*0.4,z+0.3+Math.random()*0.4);
    particles.push({m,
      vx:(Math.random()-0.5)*3,vy:Math.random()*4+1,vz:(Math.random()-0.5)*3,
      life:0.5+Math.random()*0.35});
    particlesGroup.add(m);
  }
}
// 血粒子：打中目标时红色喷溅（方向 = 攻击方向，血向后飞溅更有打击感）
const BLOOD_COLORS=['rgb(210,30,30)','rgb(235,55,55)','rgb(165,18,18)','rgb(255,85,85)','rgb(120,12,12)'];
function spawnBlood(x,y,z,dirX,dirZ){
  const color=BLOOD_COLORS[(Math.random()*BLOOD_COLORS.length)|0];
  let mat=particleMats[color];
  if(!mat){mat=new THREE.MeshLambertMaterial({color:new THREE.Color(color)});particleMats[color]=mat;}
  const n=12+((Math.random()*6)|0);
  const bx=dirX||0,bz=dirZ||0;
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(particleGeo,mat);
    m.position.set(x+0.2+Math.random()*0.6,y+0.3+Math.random()*0.8,z+0.2+Math.random()*0.6);
    particles.push({m,
      vx:(Math.random()-0.5)*4.5-bx*2.5, // 攻击反方向飞溅
      vy:Math.random()*2.8+0.6,
      vz:(Math.random()-0.5)*4.5-bz*2.5,
      life:0.4+Math.random()*0.35});
    particlesGroup.add(m);
  }
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.life-=dt;
    if(p.life<=0){particlesGroup.remove(p.m);particles.splice(i,1);continue;}
    p.vy-=18*dt;
    p.m.position.x+=p.vx*dt;
    p.m.position.y+=p.vy*dt;
    p.m.position.z+=p.vz*dt;
    p.m.rotation.x+=dt*6;p.m.rotation.y+=dt*5;
  }
}

// ---------------- 掉落物 ----------------
const dropGeo=new THREE.BoxGeometry(0.26,0.26,0.26);
const itemTexCache={};
const drops=[];
let nextDropNid=1; // 掉落物网络 id（联机同步用）
function getItemTex(id){
  if(itemTexCache[id])return itemTexCache[id];
  const cv=document.createElement('canvas');cv.width=16;cv.height=16;
  drawItemIcon(cv.getContext('2d'),id);
  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
  itemTexCache[id]=tex;
  return tex;
}
function spawnDrop(x,y,z,id,count,nid,vx,vy,vz){
  const mat=new THREE.MeshLambertMaterial({map:getItemTex(id)});
  const m=new THREE.Mesh(dropGeo,mat);
  m.position.set(x,y,z);
  dropsGroup.add(m);
  const d={m,id,count,
    vy:vy!==undefined?vy:2.5,
    vx:vx!==undefined?vx:(Math.random()-0.5)*1.5,
    vz:vz!==undefined?vz:(Math.random()-0.5)*1.5,
    age:0,
    nid:nid!==undefined?nid:nextDropNid++,pending:false};
  drops.push(d);
  // 联机：任何端产生掉落都广播（含初始速度，对端物理一致），对端创建"影子"（单份掉落，防双捡）
  if(NET.open&&NET.roomId&&nid===undefined){
    netBroadcast({t:'drop',nid:d.nid,id,x,y,z,count,dim:curDim,vx:d.vx,vy:d.vy,vz:d.vz});
  }
  return d;
}
function updateDrops(dt){
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];
    d.age+=dt;
    const p=d.m.position;
    // 简易重力+落地
    const below=getBlock(Math.floor(p.x),Math.floor(p.y-0.2),Math.floor(p.z));
    if(!isSolidBlock(below)){
      d.vy-=12*dt;p.y+=d.vy*dt;p.x+=d.vx*dt;p.z+=d.vz*dt;
    }else{d.vy=0;p.y=Math.floor(p.y-0.2)+1+0.2;}
    d.m.rotation.y+=dt*2;
    // 吸附
    const dx=player.pos.x-p.x,dy=(player.pos.y+0.9)-p.y,dz=player.pos.z-p.z;
    const dist=Math.hypot(dx,dy,dz);
    if(dist<1.7&&gameState==='playing'&&!player.dead){
      p.x+=dx*dt*8;p.y+=dy*dt*8;p.z+=dz*dt*8;
      if(dist<0.55){
        if(NET.roomId){
          if(NET.isHost){
            // 房主权威拾取：加背包 + 移除 + 广播确认（客人端移除影子）
            const pickCount=d.count;
            const left=addItemToInv(d.id,d.count);
            if(typeof gunReserveInit==='function')gunReserveInit(d.id); // 捡枪模式：枪拾取初始化备弹
            d.count=left;
            if(left<=0){
              dropsGroup.remove(d.m);d.m.material.dispose();drops.splice(i,1);sfx.pickup();
              netBroadcast({t:'pickuped',nid:d.nid,by:NET.myId,itemId:d.id,count:pickCount});
              continue;
            }
          }else{
            // 联机客人：发拾取请求，等房主仲裁确认（防止同一掉落被两人捡到）
            if(!d.pending){
              d.pending=true;
              netBroadcast({t:'pickup',nid:d.nid,by:NET.myId,itemId:d.id,count:d.count});
            }
            continue;
          }
        }else{
          const left=addItemToInv(d.id,d.count);
          if(typeof gunReserveInit==='function')gunReserveInit(d.id); // 捡枪模式：枪拾取初始化备弹
          d.count=left;
          if(left<=0){dropsGroup.remove(d.m);d.m.material.dispose();drops.splice(i,1);sfx.pickup();continue;}
        }
      }
    }
    if(d.age>240){
      dropsGroup.remove(d.m);d.m.material.dispose();drops.splice(i,1);
      if(NET.open&&NET.roomId)netBroadcast({t:'dropgone',nid:d.nid}); // 告知对端移除影子
    }
  }
}

