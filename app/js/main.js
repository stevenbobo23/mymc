// ---------------- 主循环 ----------------
let lastT=0,jumpBtn=false,started=false,flyDown=false,flyDownBtn=false;
// ---------------- 区块流式加载（无限世界） ----------------
const RENDER_R=3;
let streamT=0;
function streamChunks(dt){
  streamT-=dt;
  if(streamT>0)return;
  streamT=0.3;
  const pcx=Math.floor(player.pos.x/CH),pcz=Math.floor(player.pos.z/CH);
  let built=0;
  for(let r=0;r<=RENDER_R&&built<3;r++){
    for(let dx=-r;dx<=r&&built<3;dx++)for(let dz=-r;dz<=r&&built<3;dz++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
      const key=ck(pcx+dx,pcz+dz);
      if(!chunkMeshes[key]){buildChunk(pcx+dx,pcz+dz);built++;}
    }
  }
  for(const key in chunkMeshes){
    const p=key.split(','),dx=+p[0]-pcx,dz=+p[1]-pcz;
    if(Math.max(Math.abs(dx),Math.abs(dz))>RENDER_R+2){
      for(const m of chunkMeshes[key]){chunkGroup.remove(m);m.geometry.dispose();}
      delete chunkMeshes[key];
    }
  }
}

// ---------------- 存档 / 读档（多槽位目录） ----------------
const SAVE_LEGACY='fk_save_v1'; // 旧版单槽（自动迁移）
const SAVES_IDX='fk_saves_idx';  // 存档目录索引
const ACTIVE_KEY='fk_save_active';
let activeSlotId=null; // 当前游戏写入的槽位 id
let pendingRoomSave=null; // 联机开房选中的存档数据（生存/创造模式从存档开房）
let pendingSave=null; // 开始界面待加载存档
let scenePickCb=null; // 枪战场景选择回调
let autoSaveT=10; // 定期自动存档计时（秒）
let shooterHudT=0; // 枪战 HUD 刷新计时
window.addEventListener('pagehide',()=>{if(started&&!player.dead)saveGame();});
window.addEventListener('beforeunload',()=>{if(started&&!player.dead)saveGame();});
let gameMode='survival';
function getSaveIndex(){
  try{const s=localStorage.getItem(SAVES_IDX);return s?JSON.parse(s):[];}catch(e){return [];}
}
function writeSaveIndex(idx){try{localStorage.setItem(SAVES_IDX,JSON.stringify(idx));}catch(e){}}
function slotKey(id){return 'fk_save_'+id;}
// 迁移旧版单槽存档 → 第一个槽「我的世界」；初始化 activeSlot
function migrateSaves(){
  const idx=getSaveIndex();
  if(!idx.length){
    let legacy=null;
    try{legacy=localStorage.getItem(SAVE_LEGACY);}catch(e){}
    if(legacy){
      try{
        const s=JSON.parse(legacy);
        const id='s1';
        localStorage.setItem(slotKey(id),legacy);
        idx.push({id,name:'我的世界',seed:s.seed,gameMode:s.gameMode||'survival',dim:s.dim||'overworld',time:Date.now(),blocks:Object.keys(s.diff||{}).length});
        localStorage.removeItem(SAVE_LEGACY);
        writeSaveIndex(idx);
      }catch(e){}
    }
  }
  let act=null;try{act=localStorage.getItem(ACTIVE_KEY);}catch(e){}
  activeSlotId=act&&idx.some(x=>x.id===act)?act:(idx.length?idx[0].id:null);
  return idx;
}
function setActiveSlot(id){activeSlotId=id||null;try{localStorage.setItem(ACTIVE_KEY,activeSlotId||'');}catch(e){}}
function getSlotMeta(id){return getSaveIndex().find(x=>x.id===id)||null;}
function saveNow(msg){ // 手动保存按钮：输入存档名称后保存
  if(!started)return;
  if(!activeSlotId)activeSlotId=createSaveSlot(null);
  const cur=(getSlotMeta(activeSlotId)||{}).name||'';
  const nm=prompt('存档名称（保存到存档目录）：',cur);
  if(nm===null)return; // 取消
  if(nm.trim())renameSaveSlot(activeSlotId,nm.trim());
  saveGame();
  const m=getSlotMeta(activeSlotId);
  showToast('💾 已保存「'+(m?m.name:'未命名')+'」');
  const sf=$('saveFab'),sn=$('saveFabName');
  if(sf&&sn)sn.textContent=m?('「'+m.name+'」'):'';
  // prompt 会释放鼠标指针锁定，保存后重新锁定（触屏不需要）
  if(!isTouch&&gameState==='playing'&&!player.dead&&document.pointerLockElement===null){
    setTimeout(()=>{if(gameState==='playing'&&!player.dead)lockPointer();},120);
  }
}
function createSaveSlot(name){
  const idx=getSaveIndex();
  const id='s'+(Date.now().toString(36));
  idx.push({id,name:name||('世界'+(idx.length+1)),seed:SEED||Math.floor(Math.random()*1000000000),gameMode,time:Date.now(),blocks:0});
  writeSaveIndex(idx);
  return id;
}
function deleteSaveSlot(id){
  const idx=getSaveIndex().filter(x=>x.id!==id);
  writeSaveIndex(idx);
  try{localStorage.removeItem(slotKey(id));}catch(e){}
  if(activeSlotId===id)setActiveSlot(idx.length?idx[0].id:null);
}
function renameSaveSlot(id,name){
  const idx=getSaveIndex();
  const s=idx.find(x=>x.id===id);
  if(s){s.name=(name||'未命名').slice(0,16);writeSaveIndex(idx);}
}
function touchSaveMeta(id){
  const idx=getSaveIndex();
  const s=idx.find(x=>x.id===id);
  if(s){s.time=Date.now();s.seed=SEED;s.gameMode=gameMode;s.dim=curDim;s.blocks=Object.keys(blockDiff).length;}
  writeSaveIndex(idx);
}
function saveGame(slotId){
  if(!started||player.dead)return;
  const id=slotId||activeSlotId;
  if(!id)return;
  // 存档前先把当前维度的改动同步进 DIMS
  DIMS[curDim].diff={};Object.assign(DIMS[curDim].diff,blockDiff);
  DIMS[curDim].fac={};Object.assign(DIMS[curDim].fac,facings);
  DIMS[curDim].furn={};Object.assign(DIMS[curDim].furn,furnStates);
  DIMS[curDim].chest={};Object.assign(DIMS[curDim].chest,chestStates);
  const s={v:1,seed:SEED,dayTime,gameMode,skinIdx,dim:curDim,dims:DIMS,
    px:player.pos.x,py:player.pos.y,pz:player.pos.z,
    yaw:player.yaw,pitch:player.pitch,hp:player.hp,
    sp:[spawnPoint.x,spawnPoint.y,spawnPoint.z],
    hot:inv.hot,store:inv.store,armor:inv.armor,
    diff:blockDiff,facings:facings,furn:furnStates,chest:chestStates,
    tasks:TASKS.map(t=>t.done?1:0),dragonKilled};
  if(gameMode==='shooter'){ // 枪战存档附加：场景 + 战绩（竞技场掩体已含在 diff/dims）
    s.arenaScene=arenaScene;
    s.score=SHOOTER.score;
    s.target=SHOOTER.target;
  }
  try{localStorage.setItem(slotKey(id),JSON.stringify(s));}catch(e){}
  touchSaveMeta(id);
}
function loadSave(slotId){
  const id=slotId||activeSlotId;
  if(!id)return null;
  try{const s=localStorage.getItem(slotKey(id));return s?JSON.parse(s):null;}catch(e){return null;}
}
function clearSave(){ // 清除当前活跃槽（新建世界用）
  if(activeSlotId)deleteSaveSlot(activeSlotId);
}
// 恢复枪战存档：先设场景 → setupWorld 恢复竞技场世界（含掩体 blockDiff）→ 发枪 → 恢复战绩
function restoreShooterSave(save){
  gameMode='shooter';
  if(save.arenaScene&&typeof ARENA_SCENES!=='undefined'&&ARENA_SCENES.some(s=>s.id===save.arenaScene))arenaScene=save.arenaScene;
  setupWorld(save.seed||ARENA_SEED,save);
  shooterInit();
  if(save.score)SHOOTER.score=save.score;
  if(typeof save.target==='number')SHOOTER.target=save.target;
  updateGunHud();
}
// 通用"载入存档进入游戏"（开始界面继续 / 存档目录进入 共用）
function enterSaveSlot(id){
  const sd=loadSave(id);
  if(!sd)return false;
  setActiveSlot(id);
  if(sd.gameMode==='shooter')restoreShooterSave(sd);
  else{
    gameMode=sd.gameMode||gameMode;
    sd.gameMode=gameMode;sd.skinIdx=skinIdx;
    setupWorld(sd.seed,sd);
  }
  startGame();
  return true;
}

function loop(t){
  requestAnimationFrame(loop);
  let dt=(t-lastT)/1000;lastT=t;
  if(!(dt>0))dt=0.001;
  dt=Math.min(dt,0.05);
  if(inputEnabled()){
    input.f=((keys.KeyW?1:0)-(keys.KeyS?1:0))+(-joy.y);
    input.r=((keys.KeyD?1:0)-(keys.KeyA?1:0))+joy.x;
    input.jump=!!keys.Space||jumpBtn;
    input.sprint=!!keys.ShiftLeft||!!keys.ShiftRight;
    flyDown=!!keys.ShiftLeft||!!keys.ShiftRight||flyDownBtn;
  }else{
    input.f=0;input.r=0;input.jump=false;
  }
  streamChunks(dt);
  portalTick(dt);
  dimHazardTick(dt);
  cropTick(dt);
  updateArrows(dt);
  if(typeof netTick==='function')netTick(dt);
  // 枪战模式 tick：换弹完成补弹 + HUD 刷新 + 手榴弹物理
  if(gameMode==='shooter'&&started){
    if(SHOOTER.reloading){
      const now=performance.now()/1000;
      if(now>=SHOOTER.reloadEnd){
        SHOOTER.reloading=false;
        const held=heldItemId();
        if(held&&ITEMS[held]&&ITEMS[held].type==='gun'){gunSetClip(held,ITEMS[held].gun.clip);showToast('✅ 换弹完成！');}
      }
    }
    if(typeof updateGrenades==='function')updateGrenades(dt);
    if(typeof updateMines==='function')updateMines(dt);
    // 手榴弹用完自动装填：4s 后补满 5 颗
    if(typeof nadeReloading!=='undefined'&&nadeReloading){
      const now=performance.now()/1000;
      if(now>=nadeReloadEnd){
        nadeReloading=false;
        const s=inv.hot[4];
        if(s&&s.id===I.grenade){s.count=5;if(typeof updateHotbar==='function')updateHotbar();showToast('✅ 手榴弹装填完成！');}
      }
    }
    if(typeof updateNadeCharge==='function')updateNadeCharge(dt); // 手榴弹蓄力条
    if(typeof updateHandView==='function')updateHandView(dt); // 手持武器动画
    // 出生保护计时
    if(SHOOTER.spawnProtectT>0){
      SHOOTER.spawnProtectT-=dt;
      if(SHOOTER.spawnProtectT<=0){const sh=$('spawnShield');if(sh)sh.style.display='none';}
    }
    shooterHudT-=dt;
    if(shooterHudT<=0){shooterHudT=0.2;updateGunHud();}
  }
  // 定期自动存档（10 秒一次；死亡时不存，保留上次活着的进度）
  if(started){autoSaveT-=dt;if(autoSaveT<=0){autoSaveT=10;saveGame();}}
  if(gameState==='playing'){
    if(!player.dead){
      if(player.mounted){
        // 骑乘快乐恶魂：自由飞行
        const g=player.mounted;
        const dir=new THREE.Vector3(-Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch));
        const sp=7;
        if(inputEnabled()){
          g.pos.addScaledVector(dir,input.f*sp*dt);
          const rx=-Math.sin(player.yaw-Math.PI/2),rz=-Math.cos(player.yaw-Math.PI/2);
          g.pos.x+=rx*input.r*sp*0.7*dt;g.pos.z+=rz*input.r*sp*0.7*dt;
          if(input.jump)g.pos.y+=4*dt;
        }
        g.pos.y=Math.max(g.pos.y,2);
        g.yaw=player.yaw;
        player.pos.set(g.pos.x,g.pos.y+g.h+0.02,g.pos.z);
        player.vel.set(0,0,0);
        player.peakY=player.pos.y;
        updateMining(dt);
      }else{
        physicsStep(dt,input);
      }
      attackCd-=dt;
      if(mining&&attackCd<=0)tryAttackMob();
      if(!player.mounted)updateMining(dt);
    }
    updateMobs(dt);
    dynamicSpawner(dt);
    updateDrops(dt);
    updateFurnaces(dt);
    updateFurnaceUI();
    updateParticles(dt);
    updateDayNight(dt);
  }
  processDirty(6);
  camera.position.set(player.pos.x,player.pos.y+PEYE,player.pos.z);
  camera.rotation.order='YXZ';
  camera.rotation.y=player.yaw;
  camera.rotation.x=player.pitch;
  renderer.render(scene,camera);
}

// ---------------- 启动 ----------------
function startGame(){
  if(started)return;
  started=true;
  disposeMenuScene(); // 销毁首页 3D 背景，进入游戏主场景
  ac();
  hide('start');
  show('hud');
  if(isTouch)show('touch');
  gameState='playing';
  lockPointer();
  const fd=$('btnFlyDown');
  if(fd)fd.classList.toggle('hidden',gameMode!=='creative');
  // 保存按钮：所有模式都显示（枪战存档含场景/掩体/战绩）
  const sf=$('saveFab');
  if(sf){
    if(!activeSlotId)activeSlotId=createSaveSlot(null); // 首次进入自动建槽
    sf.style.display='block';
    const meta=getSlotMeta(activeSlotId);
    $('saveFabName').textContent=meta?('「'+meta.name+'」'):'';
  }
  showToast(gameMode==='creative'?'🧱 创造模式：背包里可拿所有物品 · 跳跃键飞行':(isTouch?'左侧摇杆移动 · 点「背包」合成 · 点 📖 看所有配方':'WASD 移动 · 左键挖掘 · 右键放置 · E 背包'));
  if(isTouch)setTimeout(()=>{if(gameState==='playing')showToast('合成木板：背包→点原木→点合成格→点成品取出');},2800);
  if(location.search.indexOf('book=1')>=0)setTimeout(()=>{if(gameState==='playing')openBook();},400);
  if(location.search.indexOf('inv=1')>=0)setTimeout(()=>{if(gameState==='playing')openInventory();},400);
  if(location.search.indexOf('night=1')>=0)dayTime=0.72;
}
function findSpawn(){
  let sx=0,sz=0,bestD=1e9;
  for(let r=0;r<96;r+=4){
    for(let a=0;a<16;a++){
      const x=Math.round(Math.cos(a/16*Math.PI*2)*r),z=Math.round(Math.sin(a/16*Math.PI*2)*r);
      const y=surfaceY(x,z);
      if(getBlock(x,y,z)===B_GRASS&&y>SEA){
        const d=x*x+z*z;
        if(d<bestD){bestD=d;sx=x;sz=z;}
      }
    }
    if(bestD<1e9)break;
  }
  return [sx,sz];
}
function clearWorldMeshes(){
  for(const key in chunkMeshes){
    for(const m of chunkMeshes[key]){chunkGroup.remove(m);m.geometry.dispose();}
    delete chunkMeshes[key];
  }
  dirtyChunks.clear();
}
// ---------------- 维度切换 ----------------
function dimSpawnPos(target){
  if(target==='end')return new THREE.Vector3(3.5,surfaceY(3,3)+1.2,3.5);
  if(target==='nether'){
    const x=Math.floor(player.pos.x),z=Math.floor(player.pos.z);
    for(let y=H-2;y>19;y--){
      const b=getBlock(x,y,z);
      if(isSolidBlock(b)&&b!==B_BEDROCK&&getBlock(x,y+1,z)===B_AIR&&getBlock(x,y+2,z)===B_AIR)
        return new THREE.Vector3(x+0.5,y+1,z+0.5);
    }
    return new THREE.Vector3(x+0.5,30,z+0.5);
  }
  return new THREE.Vector3(player.pos.x,surfaceY(Math.floor(player.pos.x),Math.floor(player.pos.z))+1,player.pos.z);
}
function switchDim(target){
  if(target===curDim)return;
  // 把当前维度的改动存起来
  const D0=DIMS[curDim];
  D0.diff={};Object.assign(D0.diff,blockDiff);
  D0.fac={};Object.assign(D0.fac,facings);
  D0.furn={};Object.assign(D0.furn,furnStates);
  D0.chest={};Object.assign(D0.chest,chestStates);
  D0.pos=[player.pos.x,player.pos.y,player.pos.z];
  curDim=target;
  // 换上目标维度
  for(const k in chunks)delete chunks[k];
  for(const k in blockDiff)delete blockDiff[k];
  for(const k in facings)delete facings[k];
  for(const k in furnStates)delete furnStates[k];
  for(const k in chestStates)delete chestStates[k];
  const D1=DIMS[target];
  Object.assign(blockDiff,D1.diff);Object.assign(facings,D1.fac);Object.assign(furnStates,D1.furn);
  if(D1.chest)Object.assign(chestStates,D1.chest);
  clearWorldMeshes();
  for(const m of mobs)mobsGroup.remove(m.group);mobs.length=0;
  for(const d of drops){dropsGroup.remove(d.m);d.m.material.dispose();}drops.length=0;
  for(const a of arrows){mobsGroup.remove(a.m);a.m.material.dispose();}arrows.length=0;
  if(D1.pos)player.pos.set(D1.pos[0],D1.pos[1],D1.pos[2]);
  else player.pos.copy(dimSpawnPos(target));
  player.vel.set(0,0,0);player.peakY=player.pos.y;
  spawnPoint.set(player.pos.x,player.pos.y,player.pos.z);
  showToast('✨ '+DIM_NAMES[target]+' 到了！');
  updateTasks();saveGame();
  if(target==='end'&&(NET.isHost||!NET.roomId))setTimeout(()=>{if(curDim==='end')spawnDragon();},800);
  else $('bossbar').style.display='none';
}
// 传送门检测：站在门里 1.2 秒后传送
let portalT=0;
// 小麦生长：每 5 秒所有种下的麦子长一格，变黄（3 格）就熟了
let cropTimer=0,ripeToastDone=false;
function cropTick(dt){
  cropTimer+=dt;
  if(cropTimer<5)return;
  cropTimer=0;
  let newRipe=0;
  for(const k in blockDiff){
    if(blockDiff[k]!==B_CROPS)continue;
    const st=facings[k]||0;
    if(st>=3)continue;
    facings[k]=st+1;
    if(st+1>=3)newRipe++;
    const p=k.split(',');
    markDirty(+p[0],+p[2]);
  }
  if(newRipe>0)showToast('🌾 小麦成熟啦！黄黄的那株可以收了，能合成面包！');
}
function portalTick(dt){
  if(gameState!=='playing'||player.dead){portalT=0;return;}
  const fx=Math.floor(player.pos.x),fy=Math.floor(player.pos.y),fz=Math.floor(player.pos.z);
  const here=getBlock(fx,fy,fz),head=getBlock(fx,fy+1,fz);
  const inPortal=here===B_PORTAL||head===B_PORTAL,inEnd=here===B_ENDPORTAL||head===B_ENDPORTAL;
  if(!inPortal&&!inEnd){portalT=0;return;}
  portalT+=dt;
  if(portalT<1.2)return;
  portalT=0;
  if(inPortal)switchDim(curDim==='nether'?'overworld':'nether');
  else switchDim(curDim==='end'?'overworld':'end');
}
// 末地掉虚空：拉回岛上；岩浆：烫！
let lavaT=0;
function dimHazardTick(dt){
  if(gameState!=='playing'||player.dead)return;
  if(curDim==='end'&&player.pos.y<-6){
    player.pos.copy(dimSpawnPos('end'));
    player.vel.set(0,0,0);player.peakY=player.pos.y;
    if(gameMode!=='creative')damagePlayer(2,'掉进了虚空');
    showToast('🌌 你从虚空里被捞回来了！');
  }
  const fx=Math.floor(player.pos.x),fy=Math.floor(player.pos.y),fz=Math.floor(player.pos.z);
  const inLava=getBlock(fx,fy,fz)===B_LAVA||getBlock(fx,fy+1,fz)===B_LAVA;
  if(inLava){
    lavaT-=dt;
    if(lavaT<=0){
      lavaT=0.5;
      if(gameMode!=='creative'){damagePlayer(2,'被岩浆烫到了');spawnBlockParticles(player.pos.x,player.pos.y+1,player.pos.z,'rgb(255,120,20)');}
    }
  }else lavaT=0;
}
function setupWorld(seed,save){
  SEED=seed;
  if(!save){ // 新世界：回到主世界，清空各维度
    curDim='overworld';dragonKilled=false;$('bossbar').style.display='none';
    for(const dn of ['overworld','nether','end']){DIMS[dn].diff={};DIMS[dn].fac={};DIMS[dn].furn={};DIMS[dn].chest={};DIMS[dn].pos=null;}
  }
  for(const k in chunks)delete chunks[k];
  clearWorldMeshes();
  for(const k in blockDiff)delete blockDiff[k];
  for(const k in facings)delete facings[k];
  for(const k in furnStates)delete furnStates[k];
  for(const k in chestStates)delete chestStates[k];
  for(const m of mobs)mobsGroup.remove(m.group);
  mobs.length=0;
  for(const a of arrows){mobsGroup.remove(a.m);a.m.material.dispose();}
  arrows.length=0;
  for(const d of drops){dropsGroup.remove(d.m);d.m.material.dispose();}
  drops.length=0;
  inv.hot=new Array(9).fill(null);
  inv.store=new Array(27).fill(null);
  inv.armor=new Array(4).fill(null);
  inv.craft2=new Array(4).fill(null);
  inv.craft3=new Array(9).fill(null);
  cursor=null;
  dayTime=0.34;
  player.hp=player.maxHp;player.dead=false;player.vel.set(0,0,0);
  player.mounted=null;player.sel=0;rodeGhast=false;
  for(const t of TASKS)t.done=false;
  if(save){
    // 恢复维度
    if(save.dim==='nether'||save.dim==='end')curDim=save.dim;else curDim='overworld';
    if(save.dims){
      for(const dn of ['overworld','nether','end']){
        if(save.dims[dn]){
          DIMS[dn].diff=save.dims[dn].diff||{};DIMS[dn].fac=save.dims[dn].fac||{};
          DIMS[dn].furn=save.dims[dn].furn||{};DIMS[dn].chest=save.dims[dn].chest||{};DIMS[dn].pos=save.dims[dn].pos||null;
        }
      }
    }
    Object.assign(blockDiff,save.diff||{});
    Object.assign(facings,save.facings||{});
    Object.assign(furnStates,save.furn||{});
    Object.assign(chestStates,save.chest||{});
    if(typeof save.dayTime==='number')dayTime=save.dayTime;
    if(save.gameMode==='creative'||save.gameMode==='survival')gameMode=save.gameMode;
    if(typeof save.skinIdx==='number'&&save.skinIdx>=0&&save.skinIdx<SKINS.length)skinIdx=save.skinIdx;
    if(save.hot&&save.hot.length===9)inv.hot=save.hot;
    if(save.store&&save.store.length===27)inv.store=save.store;
    if(save.armor&&save.armor.length===4)inv.armor=save.armor;
    if(save.tasks)for(let i=0;i<TASKS.length&&i<save.tasks.length;i++)TASKS[i].done=!!save.tasks[i];
    if(typeof save.hp==='number')player.hp=save.hp;
    dragonKilled=!!save.dragonKilled;
    if(curDim==='end'&&!dragonKilled&&(NET.isHost||!NET.roomId))setTimeout(()=>{if(curDim==='end')spawnDragon();},1200);
    player.yaw=save.yaw||0;player.pitch=save.pitch||0;
    if(save.sp)spawnPoint.set(save.sp[0],save.sp[1],save.sp[2]);
    player.pos.set(save.px,save.py,save.pz);
  }else{
    const sp=findSpawn();
    spawnPoint.set(sp[0]+0.5,surfaceY(sp[0],sp[1])+1.01,sp[1]+0.5);
    player.pos.copy(spawnPoint);
  }
  player.peakY=player.pos.y;
  spawnMobs();
  onArmorChanged();updateHearts();updateHotbar();updateTasks();refreshAll();
}
// ---------------- 多人联机（CloudBase 信令中继 + WebRTC 点对点） ----------------
const NET_API='https://lowcode-4gtjkx2ud62e0f03-1256114242.ap-shanghai.app.tcloudbase.com/mcroom';
const NET={open:false,isHost:false,myId:'1',players:{},avatars:{},conns:{},guestDc:null,guestPc:null,diffQ:[],sendT:0,timeT:0,mobT:0,
  roomId:null,myName:'玩家',mySkin:0,hostInfo:null,pollTimer:null,pollStop:false};
let NET_APPLYING=false;
let lobbyTimer=null;
function netStatus(m){const el=$('mpStatus');if(el)el.textContent=m;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function netFetch(path,opts={}){
  const r=await fetch(NET_API+path,{headers:{'Content-Type':'application/json'},...opts});
  let j=null;try{j=await r.json();}catch(e){}
  if(!r.ok||!j||j.ok===false)throw new Error((j&&j.error)||('HTTP '+r.status));
  return j;
}
function encodeSDP(pc){return btoa(unescape(encodeURIComponent(JSON.stringify(pc.localDescription))));}
function decodeSDP(s){return JSON.parse(decodeURIComponent(escape(atob(s.trim()))));}
async function waitIce(pc){
  if(pc.iceGatheringState==='complete')return;
  await new Promise(res=>{
    const t0=Date.now();
    const h=()=>{if(pc.iceGatheringState==='complete'||Date.now()-t0>3000)res();else setTimeout(h,100);};
    pc.addEventListener('icegatheringstatechange',h);h();
  });
}
function netSend(o){if(NET.guestDc&&NET.guestDc.readyState==='open')NET.guestDc.send(JSON.stringify(o));}
function netSendTo(id,o){const c=NET.conns[String(id)];if(c&&c.dc&&c.dc.readyState==='open')c.dc.send(JSON.stringify(o));}
function netBroadcast(o,except){
  if(!NET.open)return;
  if(NET.isHost){for(const id in NET.conns)if(String(id)!==String(except))netSendTo(id,o);}
  else netSend(o);
}
// 远程玩家小人模型（用皮肤颜色；armor=[helmet,chest,legs,boots] 材质key或null）
function buildAvatarModel(skinIdx2,armor){
  const sk=SKINS[skinIdx2]||SKINS[0];
  const g=new THREE.Group();
  function hex(c){return parseInt(c.slice(1),16);}
  function darken(c,f){const n=hex(c);const r=Math.floor(((n>>16)&255)*f),gg=Math.floor(((n>>8)&255)*f),b=Math.floor((n&255)*f);return '#'+((r<<16)|(gg<<8)|b).toString(16).padStart(6,'0');}
  const mat=c=>new THREE.MeshLambertMaterial({color:hex(c)});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.28),mat(sk.shirt));body.position.y=1.0;g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.45,0.45),mat(sk.skin));head.position.y=1.6;g.add(head);
  const hair=new THREE.Mesh(new THREE.BoxGeometry(0.47,0.15,0.47),mat(sk.hair));hair.position.y=1.83;g.add(hair);
  // 脸（正面 = -Z 方向）：眼睛 + 鼻子，方便认出正反面
  const eyeMat=mat(sk.eye);
  const e1=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.12,0.04),eyeMat);e1.position.set(-0.105,1.635,-0.235);g.add(e1);
  const e2=e1.clone();e2.position.x=0.105;g.add(e2);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.1,0.05),mat(darken(sk.skin,0.75)));nose.position.set(0,1.55,-0.24);g.add(nose);
  const a1=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.6,0.13),mat(sk.skin));a1.position.set(-0.32,1.0,0);g.add(a1);
  const a2=a1.clone();a2.position.x=0.32;g.add(a2);
  const l1=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.65,0.18),mat(sk.pants));l1.position.set(-0.13,0.33,0);g.add(l1);
  const l2=l1.clone();l2.position.x=0.13;g.add(l2);
  // 腿部引用：netTick 里按移动速度驱动走路摆动动画
  g.userData.legs=[l1,l2];
  g.userData.walkT=0;
  // 穿甲渲染：按槽位把对应部件染成盔甲材质色（脸保留 -> 不影响认正反）
  const base={body:sk.shirt,head:sk.skin,hair:sk.hair,legs:sk.pants};
  g.userData.base=base;
  g.userData.setArmor=function(ar){
    ar=ar||[null,null,null,null];
    const cm=MAT_COLOR[ar[1]]||null; // 胸甲
    const lm=MAT_COLOR[ar[2]]||null; // 腿甲
    const bm=MAT_COLOR[ar[3]]||null; // 靴子
    const hm=MAT_COLOR[ar[0]]||null; // 头盔
    body.material.color.setHex(hex(cm||base.body));
    const legCol=lm||(bm&&!lm?bm:null)||base.legs; // 腿甲优先，其次靴子色
    l1.material.color.setHex(hex(legCol));
    l2.material.color.setHex(hex(legCol));
    head.material.color.setHex(hex(hm||base.head));
    hair.material.color.setHex(hex(hm||base.hair));
    g.userData.armorKey=ar.join(',');
  };
  g.userData.setArmor(armor);
  return g;
}
function makeNameSprite(name){
  const s=2; // 超采样倍数：canvas 用 2x 分辨率绘制，放大显示依然清晰
  const cv=document.createElement('canvas');
  const ctx=cv.getContext('2d');
  ctx.font='bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
  const tw=Math.ceil(ctx.measureText(String(name||'玩家')).width);
  const w=Math.max(30,tw+14);
  cv.width=w*s;cv.height=24*s;
  const c2=cv.getContext('2d');
  c2.scale(s,s);
  c2.font='bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
  c2.textAlign='center';c2.textBaseline='middle';
  c2.fillStyle='rgba(0,0,0,0.5)';
  c2.fillRect(0,0,w,24);
  c2.fillStyle='#fff';
  c2.fillText(String(name||'玩家'),w/2,12.5);
  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.LinearFilter;  // 平滑过滤，文字边缘清晰
  tex.minFilter=THREE.LinearFilter;
  tex.generateMipmaps=false;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,transparent:true}));
  sp.scale.set(w/34,0.48,1); // 世界单位：长宽约为显示尺寸的一半（小巧）
  sp.position.set(0,1.98,0);
  sp.renderOrder=10; // 名字浮在模型上方（同深度时优先显示），但仍被墙正确遮挡
  return sp;
}
function addAvatar(id,skin,armor){
  removeAvatar(id);
  const g=buildAvatarModel(skin,armor);
  g.position.set(player.pos.x,player.pos.y,player.pos.z);
  mobsGroup.add(g);
  NET.avatars[id]=g;
  g.userData.nameSp=makeNameSprite((NET.players[id]&&NET.players[id].name)||('玩家'+id));
  g.add(g.userData.nameSp);
}
function updateAvatarName(id){
  const g=NET.avatars[id];
  if(!g)return;
  if(g.userData.nameSp){g.remove(g.userData.nameSp);g.userData.nameSp.material.map.dispose();g.userData.nameSp.material.dispose();}
  g.userData.nameSp=makeNameSprite((NET.players[id]&&NET.players[id].name)||('玩家'+id));
  g.add(g.userData.nameSp);
}
function removeAvatar(id){
  const g=NET.avatars[id];
  if(g){mobsGroup.remove(g);delete NET.avatars[id];}
}
function applyNetDiff(list){
  NET_APPLYING=true;
  for(const e of list)setBlock(e[0],e[1],e[2],e[3]);
  NET_APPLYING=false;
  onWorldChanged();
}
// ---------------- 联机消息路由表（替代巨型 if-else 链，逻辑逐字搬移） ----------------
const NET_MSG_HANDLERS={
  hello(o,senderId){ // 新朋友连上（房主响应）
    if(!NET.isHost)return;
    const gid=String(o.id||'0');
    if(!NET.conns[gid]){netStatus('连接未建立，忽略');return;}
    NET.players[gid]={x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:0,skin:o.skin||0,name:o.name||('玩家'+gid),dim:curDim,armor:o.armor||[null,null,null,null]};
    const roster={};
    roster[String(NET.myId)]={skin:skinIdx,name:NET.myName,armor:armorMats()};
    for(const pid in NET.players)if(pid!==gid)roster[pid]={skin:NET.players[pid].skin,name:NET.players[pid].name,armor:NET.players[pid].armor};
    // 全维度改动快照：好友加入后看到与房主一致的整个世界（含已有建筑/箱/熔炉）
    DIMS[curDim].diff={};Object.assign(DIMS[curDim].diff,blockDiff);
    DIMS[curDim].fac={};Object.assign(DIMS[curDim].fac,facings);
    DIMS[curDim].furn={};Object.assign(DIMS[curDim].furn,furnStates);
    DIMS[curDim].chest={};Object.assign(DIMS[curDim].chest,chestStates);
    const dims={};
    for(const dn of ['overworld','nether','end'])dims[dn]={diff:DIMS[dn].diff||{},fac:DIMS[dn].fac||{},furn:DIMS[dn].furn||{},chest:DIMS[dn].chest||{}};
    netSendTo(gid,{t:'welcome',id:gid,seed:SEED,dayTime,diff:blockDiff,fac:facings,players:roster,dim:curDim,dims,mode:gameMode,scene:arenaScene,
      mines:mines.map(m=>({id:m.mid,x:Math.floor(m.pos.x),z:Math.floor(m.pos.z),aid:m.aid,an:m.an}))});
    netBroadcast({t:'join',id:gid,skin:o.skin||0,name:o.name||('玩家'+gid),armor:o.armor||[null,null,null,null]},gid);
    if(!NET.avatars[gid])addAvatar(gid,o.skin||0,o.armor);
    showToast('👥 '+esc(o.name||'朋友')+' 进入了你的世界！');
    netStatus('✅ 已连接 '+Object.keys(NET.players).length+' 位朋友，可以一起玩了！');
    updateTasks();
  },
  welcome(o,senderId){ // 房主欢迎（客人端初始化世界）
    if(NET.isHost)return;
    NET.myId=String(o.id);
    const wdim=o.dim||'overworld';
    // 枪战模式：先切模式（genChunkData 需要 gameMode==='shooter' 生成竞技场）
    if(o.mode&&o.mode!==gameMode)applyGameMode(o.mode,true);
    if(o.scene)arenaScene=o.scene; // 房主枪战场景 -> 客人同场景（setupWorld 前设置）
    setupWorld(o.seed,null); // 重置世界（curDim='overworld'，DIMS 清空）
    if(gameMode==='shooter'){shooterInit();spawnPoint.copy(player.pos);}
    // 房主早埋的地雷全量同步（隐形，后加入的客人才踩得到）
    if(o.mines&&Array.isArray(o.mines))for(const mn of o.mines)spawnMine(mn.id,mn.x,mn.z,mn.aid,mn.an);
    if(wdim!=='overworld'){
      // 房主不在主世界 -> 客人切到同维度开始（保持一致体验）
      curDim=wdim;
      for(const k in chunks)delete chunks[k];
      clearWorldMeshes();
      player.pos.copy(dimSpawnPos(wdim));
      player.vel.set(0,0,0);player.peakY=player.pos.y;
      spawnPoint.copy(player.pos);
      $('bossbar').style.display=wdim==='end'?'block':'none';
    }
    Object.assign(blockDiff,o.diff||{});
    Object.assign(facings,o.fac||{});
    // 全维度改动恢复（房主存档世界）：setupWorld 已清空 DIMS，这里重建
    if(o.dims){
      for(const dn of ['overworld','nether','end']){
        if(o.dims[dn]){
          DIMS[dn].diff=o.dims[dn].diff||{};
          DIMS[dn].fac=o.dims[dn].fac||{};
          DIMS[dn].furn=o.dims[dn].furn||{};
          DIMS[dn].chest=o.dims[dn].chest||{};
        }
      }
      const cd=o.dims[curDim];
      if(cd){
        Object.assign(blockDiff,cd.diff||{});
        Object.assign(facings,cd.fac||{});
        Object.assign(furnStates,cd.furn||{});
        Object.assign(chestStates,cd.chest||{});
      }
    }
    dayTime=o.dayTime;
    for(const k in chunks)delete chunks[k];
    clearWorldMeshes();
    for(const pid in o.players){
      if(String(pid)!==String(NET.myId)){
        NET.players[String(pid)]={x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:0,skin:o.players[pid].skin,name:o.players[pid].name,dim:wdim,armor:o.players[pid].armor||[null,null,null,null]};
        addAvatar(String(pid),o.players[pid].skin,o.players[pid].armor);
      }
    }
    NET.open=true;
    showToast('👥 已加入 '+esc(NET.hostInfo?NET.hostInfo.name:'朋友')+' 的世界！');
    netStatus('✅ 已连接！一起盖房子吧！');
    $('mpLeaveBtn').classList.remove('hidden');
    updateTasks();
  },
  join(o,senderId){
    NET.players[String(o.id)]={x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:0,skin:o.skin,name:o.name||'玩家',dim:curDim,armor:o.armor||[null,null,null,null]};
    if(!NET.avatars[String(o.id)])addAvatar(String(o.id),o.skin,o.armor);
    showToast('👥 '+(o.name||'玩家')+' 加入了！');updateTasks();
  },
  pos(o,senderId){
    if(o.dim!==undefined&&o.dim!==curDim)return; // 不同维度的位置不更新（防头像错位）
    const p=NET.players[String(o.id)];
    if(p){p.x=o.x;p.y=o.y;p.z=o.z;p.yaw=o.yaw;p.armor=o.armor;}
    // 穿甲变化 -> 更新 avatar 部件颜色
    const av=NET.avatars[String(o.id)];
    if(av&&av.userData&&av.userData.setArmor&&p&&p.armor){
      const key=(p.armor||[]).join(',');
      if(av.userData.armorKey!==key)av.userData.setArmor(p.armor);
    }
    if(NET.isHost)netBroadcast(o,String(o.id)); // 房主转发给其他朋友
  },
  diff(o,senderId){
    if(o.dim!==undefined&&o.dim!==curDim)return; // 不同维度的方块改动不应用（防错位污染）
    applyNetDiff(o.list);
    if(NET.isHost)netBroadcast(o,String(senderId));
  },
  time(o,senderId){if(!NET.isHost)dayTime=o.v;},
  mobs(o,senderId){ // 房主广播 mobs 快照 -> 客人端场景一致
    if(NET.isHost)return;
    if(o.dim!==curDim)return; // 维度不同步时忽略，避免跨维度错位
    const alive={};
    for(const e of o.list){
      const nid=e[0];
      alive[nid]=true;
      let m=netMobByNid(nid);
      if(!m){
        m=spawnMob(e[1],e[2]-0.5,e[4]-0.5,e[3],nid);
        m.remote={x:e[2],y:e[3],z:e[4],yaw:e[5]};
      }else{
        m.remote={x:e[2],y:e[3],z:e[4],yaw:e[5]};
        m.hp=e[6];m.maxHp=e[7];
      }
    }
    // 房主端没有的 mob 从客人端移除（不产生掉落）
    for(const m of mobs.slice()){
      if(!m.dead&&!alive[m.nid])killMob(m,true);
    }
  },
  mobkill(o,senderId){ // 房主端 mob 死亡 -> 客人端同步死亡效果
    if(NET.isHost)return;
    const m=netMobByNid(o.id);
    if(m)killMob(m,false);
  },
  mobhit(o,senderId){ // 客人攻击 mob -> 房主权威结算
    if(!NET.isHost)return;
    const m=netMobByNid(o.id);
    if(m)hurtMob(m,o.dmg);
  },
  pvphit(o,senderId){ // PVP：被攻击者本地扣血 + 击退（防双端重复结算）
    if(String(o.target)===String(NET.myId)){
      const protectedNow=gameMode==='shooter'&&SHOOTER.spawnProtectT>0;
      if(!protectedNow){ // 出生保护期间免击退（免伤由 damagePlayer 处理）
        const kx=player.pos.x-o.x,kz=player.pos.z-o.z;
        const kl=Math.hypot(kx,kz)||1;
        if(o.gun){player.vel.x+=kx/kl*1.2;player.vel.z+=kz/kl*1.2;} // 枪战：轻击退，不打飞
        else{player.vel.x+=kx/kl*5;player.vel.z+=kz/kl*5;player.vel.y=3;}
      }
      damagePlayer(o.dmg,{aid:o.aid,attacker:o.attacker||'',hs:!!o.hs,wn:o.wn||'',text:(o.gun?(o.hs?'💥爆头！被 ':'🔫 被 '):'')+(o.attacker||'玩家')+(o.gun&&o.wn?' 的 '+o.wn:'')+' 打死了'});
    }
    if(NET.isHost)netBroadcast(o,String(senderId)); // 房主转发给其他客人
  },
  kill(o,senderId){ // 枪战击杀：各端计分 + 胜负判定
    shooterKill(o.k,o.v,o.kn,o.vn,o.wn);
    if(NET.isHost)netBroadcast(o,String(senderId)); // 房主转发（避免双计分：非击杀端也转发）
  },
  nade(o,senderId){ // 手榴弹投掷同步：对端创建影子（同物理轨迹）
    if(!grenades.some(g=>g.nid===o.id))spawnGrenade(o.id,o.x,o.y,o.z,o.vx,o.vy,o.vz,true,o.aid,o.an);
    if(NET.isHost)netBroadcast(o,String(senderId));
  },
  boom(o,senderId){ // 手榴弹爆炸：对端删影子 + 渲染 + 结算
    for(let i=grenades.length-1;i>=0;i--)if(grenades[i].nid===o.id){mobsGroup.remove(grenades[i].m);grenades.splice(i,1);}
    explodeGrenade(o.x,o.y,o.z,o.aid,o.an);
    if(NET.isHost)netBroadcast(o,String(senderId));
  },
  mine(o,senderId){ // 地雷放置同步：对端创建影子
    if(!mines.some(m=>m.mid===o.id))spawnMine(o.id,o.x,o.z,o.aid,o.an);
    if(NET.isHost)netBroadcast(o,String(senderId));
  },
  mineboom(o,senderId){ // 地雷爆炸：对端删影子（伤害由踩中端本地结算）
    const mi=mines.findIndex(m=>m.mid===o.id);
    if(mi>=0){mobsGroup.remove(mines[mi].body);mobsGroup.remove(mines[mi].lamp);mobsGroup.remove(mines[mi].pole);mobsGroup.remove(mines[mi].flag);mobsGroup.remove(mines[mi].ring);mines.splice(mi,1);}
    if(NET.isHost)netBroadcast(o,String(senderId));
  },
  pvpdead(o,senderId){ // 玩家死亡/复活状态同步
    const pp=NET.players[String(o.target)];
    if(pp)pp.dead=!o.alive;
    const av=NET.avatars[String(o.target)];
    if(av)av.visible=!!o.alive;
    if(NET.isHost)netBroadcast(o,String(senderId));
  },
  drop(o,senderId){ // 掉落物同步：对端创建影子（单份掉落）
    if(o.dim!==curDim)return;
    if(!drops.some(x=>x.nid===o.nid))spawnDrop(o.x,o.y,o.z,o.id,o.count,o.nid);
    if(NET.isHost)netBroadcast(o,String(senderId)); // 房主转发给其他客人
  },
  dropgone(o,senderId){ // 对端掉落过期消失 -> 移除本地影子
    const idx=drops.findIndex(x=>x.nid===o.nid);
    if(idx>=0){dropsGroup.remove(drops[idx].m);drops[idx].m.material.dispose();drops.splice(idx,1);}
    if(NET.isHost)netBroadcast(o,String(senderId)); // 房主转发给其他客人
  },
  pickup(o,senderId){ // 拾取请求 -> 房主仲裁（防双捡）
    if(NET.isHost){
      const idx=drops.findIndex(x=>x.nid===o.nid);
      if(idx>=0){
        const d=drops[idx];
        dropsGroup.remove(d.m);d.m.material.dispose();drops.splice(idx,1);
        netBroadcast({t:'pickuped',nid:o.nid,by:o.by,itemId:o.itemId,count:o.count});
      }
      // 掉落已不存在（被别人捡走）-> 忽略，请求者不获得物品
    }
  },
  pickuped(o,senderId){ // 拾取确认：所有人移除影子；归属者加背包
    const idx=drops.findIndex(x=>x.nid===o.nid);
    if(idx>=0){dropsGroup.remove(drops[idx].m);drops[idx].m.material.dispose();drops.splice(idx,1);}
    if(String(o.by)===String(NET.myId)&&!NET.isHost){
      addItemToInv(o.itemId,o.count);
      sfx.pickup();
    }
  },
  gm(o,senderId){
    applyGameMode(o.v,true);
    showToast(o.v==='creative'?'🧱 房主把世界切换成了创造模式':'⚒ 房主把世界切换成了生存模式');
  },
};
function onNetMsg(senderId,msg){
  let o;try{o=JSON.parse(msg);}catch(e){return;}
  const h=NET_MSG_HANDLERS[o.t];
  if(h)h(o,senderId);
}
function setupConnHandlers(pc,dc,onOpen){
  dc.onopen=()=>{if(onOpen)onOpen();};
  dc.onmessage=e=>{
    // 找发送者id
    let sid=String(NET.myId);
    for(const id in NET.conns)if(NET.conns[id].dc===dc){sid=id;break;}
    onNetMsg(sid,e.data);
  };
  dc.onclose=()=>{
    for(const id in NET.conns){
      if(NET.conns[id].dc===dc){
        delete NET.conns[id];removeAvatar(id);delete NET.players[id];
        netBroadcast({t:'leave',id});
        showToast('👥 一位朋友离开了');
        updateTasks();
        return;
      }
    }
    if(!NET.isHost&&NET.guestDc===dc){
      netLeave(false); // 非静默：更新状态栏，避免残留"在线 N 人"误导
      showToast('👥 与房主的连接断开了（房间可能已被房主删除）');
    }
  };
}
// ---------- 创建房间（成为房主，进入大厅列表） ----------
async function mpCreateRoom(){
  try{
    netStatus('正在创建房间…');
    const rnEl=$('roomName');
    const roomName=rnEl?rnEl.value.trim().slice(0,24):'';
    // 枪战：竞技场 seed；其他：选中存档 > 当前世界 > 全新随机世界（绝不沿用旧存档）
    const seed=gameMode==='shooter'?ARENA_SEED:(pendingRoomSave?pendingRoomSave.seed:(started?SEED:Math.floor(Math.random()*1000000000)));
    const res=await netFetch('/create',{method:'POST',body:JSON.stringify({name:NET.myName,skin:skinIdx,mode:gameMode,roomName,seed})});
    NET.roomId=res.roomId;NET.myId='1';NET.isHost=true;NET.open=true;
    NET.hostInfo={id:'1',name:NET.myName,skin:skinIdx};
    NET.mySkin=skinIdx;
    $('mpLeaveBtn').classList.remove('hidden');
    $('mpLeaveBtn').textContent='🗑 删除房间并退出'; // 房主可解散房间
    if(gameMode==='shooter'){
      if(pendingRoomSave){ // 从枪战存档开房：恢复场景+竞技场世界（含掩体）+发枪+战绩
        if(pendingRoomSave.arenaScene&&ARENA_SCENES.some(s=>s.id===pendingRoomSave.arenaScene))arenaScene=pendingRoomSave.arenaScene;
        setupWorld(pendingRoomSave.seed||ARENA_SEED,pendingRoomSave);
        shooterInit();
        if(pendingRoomSave.score)SHOOTER.score=pendingRoomSave.score;
        if(typeof pendingRoomSave.target==='number')SHOOTER.target=pendingRoomSave.target;
        updateGunHud();
      }else{
        activeSlotId=createSaveSlot(null); // 每次新枪战 = 全新独立存档槽
        setupWorld(ARENA_SEED,null);
        shooterInit();
      }
    }else if(!started){
      // 还没进游戏：选中存档则用存档恢复；否则全新世界（新建独立槽，绝不沿用旧存档）
      if(pendingRoomSave){pendingRoomSave.gameMode=gameMode;pendingRoomSave.skinIdx=skinIdx;setupWorld(pendingRoomSave.seed,pendingRoomSave);}
      else{activeSlotId=createSaveSlot(null);setupWorld(res.seed,null);}
    }
    pendingRoomSave=null; // 用完即清
    // 已 started：保留当前世界/背包/位置，只进入联机状态（好友进来看到现有世界）
    startGame();
    hide('mpPanel');
    startPoll();
    netStatus(gameMode==='shooter'?'🔫 枪战房间 '+res.roomId+' 已创建，等对手来！':'🏠 房间 '+res.roomId+' 已创建，等朋友来！');
    showToast(gameMode==='shooter'?'🔫 枪战房间已创建：'+res.roomId+' · 1-4 切枪 · R 换弹 · 先到 10 杀获胜！':'🏠 房间已创建：'+res.roomId+' · 朋友们打开「联机大厅」就能看到并加入！');
    updateTasks();
  }catch(e){netStatus('创建失败：'+e.message);showToast('⚠️ '+e.message);}
}
// ---------- 加入公开房间（无需邀请码） ----------
async function joinRoom(roomId){
  try{
    netStatus('正在加入房间 '+roomId+'…');
    const res=await netFetch('/join',{method:'POST',body:JSON.stringify({roomId,name:NET.myName,skin:skinIdx})});
    NET.roomId=res.roomId;NET.myId=String(res.playerId);NET.isHost=false;
    NET.hostInfo=res.host;NET.mySkin=skinIdx;
    $('mpLeaveBtn').classList.remove('hidden');
    $('mpLeaveBtn').textContent='🚪 退出房间';
    if(res.mode&&res.mode!==gameMode)applyGameMode(res.mode,true);
    setupWorld(res.seed,null);
    if(gameMode==='shooter'){shooterInit();spawnPoint.copy(player.pos);}
    startGame();
    hide('mpPanel');
    startPoll();
    await mpGuestOffer();
  }catch(e){
    netStatus('加入失败：'+e.message);
    showToast('⚠️ '+e.message);
  }
}
// ---------- 客人发起 WebRTC 连接（offer -> 房主） ----------
async function mpGuestOffer(){
  try{
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const dc=pc.createDataChannel('game');
    NET.guestDc=dc;NET.guestPc=pc;
    setupConnHandlers(pc,dc,null);
    dc.onopen=()=>{
      NET.open=true;
      netSend({t:'hello',id:NET.myId,skin:skinIdx,name:NET.myName,armor:armorMats()});
      netStatus('✅ 已连上房主，正在同步世界…');
    };
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    await netFetch('/signal',{method:'POST',body:JSON.stringify({roomId:NET.roomId,from:NET.myId,to:String(NET.hostInfo.id),type:'offer',data:encodeSDP(pc)})});
    netStatus('已发送连接请求，等待房主…');
  }catch(e){netStatus('连接失败：'+e.message);}
}
// ---------- 处理信令：房主回 answer / 客人收 answer ----------
async function handleNetSignal(sig){
  const from=String(sig.from);
  try{
    if(sig.type==='offer'&&NET.isHost&&from!==String(NET.myId)){
      if(NET.conns[from])return; // 重复 offer 忽略
      const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
      pc.ondatachannel=e=>{
        const dc=e.channel;
        NET.conns[from]={pc,dc};
        setupConnHandlers(pc,dc,()=>netStatus('朋友连上了，正在同步世界…'));
      };
      await pc.setRemoteDescription(decodeSDP(sig.data));
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      await netFetch('/signal',{method:'POST',body:JSON.stringify({roomId:NET.roomId,from:NET.myId,to:from,type:'answer',data:encodeSDP(pc)})});
    }else if(sig.type==='answer'&&!NET.isHost&&NET.guestPc){
      if(NET.guestPc.signalingState==='stable')return;
      await NET.guestPc.setRemoteDescription(decodeSDP(sig.data));
      netStatus('连接已建立！');
    }
  }catch(e){console.warn('信令处理失败',e);}
}
// ---------- 轮询：信令 + 玩家列表 + 心跳 ----------
async function pollRoom(){
  if(NET.pollStop||!NET.roomId)return;
  try{
    const res=await netFetch('/poll?roomId='+encodeURIComponent(NET.roomId)+'&playerId='+encodeURIComponent(String(NET.myId)));
    if(NET.pollStop||!NET.roomId)return; // 请求期间可能已断开
    for(const s of (res.signals||[]))await handleNetSignal(s);
    syncPlayers(res.players||[]);
    const cnt=(res.players||[]).length;
    const badge=$('mpBadge');
    if(badge){badge.style.display=NET.roomId?'block':'none';badge.textContent=NET.roomId?('🌐 '+NET.roomId+' · '+cnt+'人'):'';}
    if(NET.isHost)netStatus('🏠 房间 '+NET.roomId+' · 在线 '+cnt+' 人');
    else netStatus('🎮 已加入 '+esc(NET.hostInfo?NET.hostInfo.name:'房主')+' 的房间 · 在线 '+cnt+' 人');
  }catch(e){
    const m=e.message||'';
    if(m.indexOf('不存在')>=0||m.indexOf('已关闭')>=0||m.indexOf('不在房间')>=0){
      netStatus('⚠️ 房间已关闭，联机结束');
      showToast('⚠️ 房间已关闭');
      netLeave(true);
      return;
    }
  }finally{
    if(!NET.pollStop)NET.pollTimer=setTimeout(pollRoom,800);
  }
}
function startPoll(){NET.pollStop=false;if(NET.pollTimer)clearTimeout(NET.pollTimer);pollRoom();}
function stopPoll(){NET.pollStop=true;if(NET.pollTimer){clearTimeout(NET.pollTimer);NET.pollTimer=null;}}
// ---------- 玩家列表同步（头像增删 + 面板显示） ----------
function syncPlayers(list){
  const known={};
  for(const p of list){
    const pid=String(p.id);
    known[pid]=true;
    if(pid===String(NET.myId))continue;
    if(!NET.players[pid]){
      NET.players[pid]={x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:0,skin:p.skin,name:p.name};
      addAvatar(pid,p.skin);
    }else{
      if(NET.players[pid].name!==p.name){NET.players[pid].name=p.name;updateAvatarName(pid);}
    }
  }
  for(const id in NET.players){
    if(!known[id]){removeAvatar(id);delete NET.players[id];}
  }
  const el=$('mpPlayers');
  if(el){
    el.innerHTML=list.map(p=>{
      const isMe=String(p.id)===String(NET.myId);
      const isHost=p.id==='1';
      return '<div style="padding:3px 0;color:#eee">'+(isHost?'👑':'🧍')+' '+esc(p.name)+(isMe?' <span style="color:#ffd75e">(你)</span>':'')+' <span style="color:#888">#'+esc(p.id)+'</span></div>';
    }).join('');
  }
}
// ---------- 大厅房间列表（公开可见，每 2.5s 刷新） ----------
async function refreshRoomList(){
  const panel=$('mpPanel');
  if(!panel||panel.classList.contains('hidden')){stopLobby();return;}
  try{
    const res=await netFetch('/list');
    const list=res.rooms||[];
    const el=$('roomList');
    if(!el)return;
    if(!list.length){
      el.innerHTML='<div style="color:#9aa;padding:12px;text-align:center">🕸 暂无公开房间，点上面「创建房间」成为第一个吧</div>';
    }else{
      el.innerHTML=list.map(r=>(
        '<div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border:1px solid #556;border-radius:8px;padding:8px 12px;margin-bottom:6px">'+
          '<span style="background:#2a5e2a;color:#ffd75e;font-weight:bold;padding:2px 8px;border-radius:4px;border:1px solid #6a8a4a">'+esc(r.roomId)+'</span>'+
          '<span style="flex:1;color:#eee;font-weight:bold">'+esc(r.name)+'</span>'+
          '<span style="color:#9cf">👤'+esc(r.hostName)+'</span>'+
          '<span style="color:#aaa">👥'+r.playerCount+'/'+r.maxPlayers+'</span>'+
          '<span title="'+(r.mode==='creative'?'创造':(r.mode==='shooter'?'枪战':'生存'))+'">'+(r.mode==='creative'?'🧱':(r.mode==='shooter'?'🔫':'⚒'))+'</span>'+
          '<button class="joinBtn" data-id="'+esc(r.roomId)+'" style="padding:6px 14px;font-size:13px;background:linear-gradient(#3a7a3a,#2a5e2a)"'+(r.playerCount>=r.maxPlayers?' disabled':'')+'>加入</button>'+
        '</div>'
      )).join('');
      el.querySelectorAll('.joinBtn').forEach(b=>b.addEventListener('click',()=>joinRoom(b.dataset.id)));
    }
  }catch(e){/* 网络抖动静默，下次自动刷新重试 */}
}
function startLobby(){
  if(lobbyTimer)return;
  refreshRoomList();
  lobbyTimer=setInterval(refreshRoomList,2500);
}
function stopLobby(){if(lobbyTimer){clearInterval(lobbyTimer);lobbyTimer=null;}}
function netLeave(silent){
  stopPoll();
  if(NET.roomId){
    netFetch('/leave',{method:'POST',body:JSON.stringify({roomId:NET.roomId,playerId:String(NET.myId)})}).catch(()=>{});
    NET.roomId=null;
  }
  for(const id in NET.conns){try{NET.conns[id].dc.close();}catch(e){}try{NET.conns[id].pc.close();}catch(e){}}
  NET.conns={};
  if(NET.guestDc){try{NET.guestDc.close();}catch(e){}NET.guestDc=null;}
  if(NET.guestPc){try{NET.guestPc.close();}catch(e){}NET.guestPc=null;}
  for(const id in NET.avatars)removeAvatar(id);
  NET.players={};NET.open=false;NET.isHost=false;NET.myId='1';
  const badge=$('mpBadge');if(badge)badge.style.display='none';
  $('mpLeaveBtn').classList.add('hidden');
  const pl=$('mpPlayers');if(pl)pl.innerHTML='';
  if(!silent){netStatus('已断开联机');show('mpPanel');startLobby();}
  updateTasks();
}
function netTick(dt){
  if(!NET.open||!started)return;
  // 发送自己的位置（带维度，防跨维度头像错位）
  NET.sendT-=dt;
  if(NET.sendT<=0){
    NET.sendT=0.12;
    netBroadcast({t:'pos',id:NET.myId,x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,skin:skinIdx,dim:curDim,armor:armorMats()});
  }
  // 发送方块改动（带维度，防跨维度方块错位污染）
  if(NET.diffQ.length)netBroadcast({t:'diff',list:NET.diffQ.splice(0,NET.diffQ.length),dim:curDim});
  // 房主广播 mobs 快照（客人端由房主权威驱动，保证两边场景一致）
  if(NET.isHost){
    NET.mobT-=dt;
    if(NET.mobT<=0){
      NET.mobT=0.4;
      const list=[];
      for(const m of mobs)if(!m.dead)list.push([m.nid,m.type,m.pos.x,m.pos.y,m.pos.z,m.yaw,m.hp,m.maxHp]);
      netBroadcast({t:'mobs',dim:curDim,list});
    }
  }
  // 房主同步时间
  if(NET.isHost){
    NET.timeT-=dt;
    if(NET.timeT<=0){NET.timeT=5;netBroadcast({t:'time',v:dayTime});}
  }
  // 更新远程玩家小人
  for(const id in NET.players){
    const p=NET.players[id],av=NET.avatars[id];
    if(!av)continue;
    const mx=(p.x-av.position.x)*Math.min(1,dt*10);
    const mz=(p.z-av.position.z)*Math.min(1,dt*10);
    av.position.x+=mx;
    av.position.y+=(p.y-av.position.y)*Math.min(1,dt*10);
    av.position.z+=mz;
    av.rotation.y=p.yaw;
    // 走路动画：按水平移动量驱动腿部摆动（不动则静止）
    const moved=Math.hypot(mx,mz);
    av.userData.walkT+=moved*2;
    const sw=Math.sin(av.userData.walkT*2.5)*(moved>0.002?0.55:0);
    if(av.userData.legs){
      av.userData.legs[0].rotation.x=sw;
      av.userData.legs[1].rotation.x=-sw;
    }
  }
}
// ---------------- UI 组件函数（文件级，供各 init 子函数与外部复用） ----------------
// 存档目录面板（mode='play' 浏览/进入；mode='room' 选存档开房）
function renderSavePanel(mode){
  mode=mode||'play';
  const list=$('saveList');if(!list)return;
  $('savePanelTitle').textContent=mode==='room'?'🏠 选择要进入联机的存档':'💾 存档目录';
  const newWrap=$('newSaveWrap');
  if(newWrap)newWrap.style.display=mode==='room'?'none':'flex';
  const roomNew=$('roomNewWorldBtn');
  if(roomNew){
    roomNew.style.display=mode==='room'?'block':'none';
    roomNew.textContent=gameMode==='shooter'?'🎯 新场景开房（选一张竞技场地图）':'🆕 新世界开房（全新随机地图）';
  }
  const idx=getSaveIndex();
  if(!idx.length){
    list.innerHTML='<div style="color:#888;font-size:13px;padding:18px;text-align:center">'+(mode==='room'?'还没有存档，点下方「新世界开房」开一张全新地图':'还没有存档。进入游戏后点左下角 💾 保存，或点下方「新建存档」。')+'</div>';
    return;
  }
  list.innerHTML=idx.map(s=>{
    const act=s.id===activeSlotId?'<span style="color:#ffd24a;font-size:11px">当前</span>':'';
    const modeName=s.gameMode==='creative'?'创造':(s.gameMode==='shooter'?'枪战':'生存');
    const dimName=s.dim==='nether'?'下界':(s.dim==='end'?'末地':'主世界');
    const btns=mode==='room'
      ?'<button data-act="roomenter" data-id="'+s.id+'" style="padding:6px 14px;background:linear-gradient(#3a7a3a,#2a5e2a)">用它开房</button>'
      :'<button data-act="enter" data-id="'+s.id+'" style="padding:5px 12px;background:linear-gradient(#3a7a3a,#2a5e2a)">进入</button>'+
       '<button data-act="rename" data-id="'+s.id+'" style="padding:5px 10px;font-size:12px">重命名</button>'+
       '<button data-act="del" data-id="'+s.id+'" style="padding:5px 10px;font-size:12px;background:linear-gradient(#a03a3a,#7a2a2a)">删除</button>';
    return '<div style="display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.35);border:1px solid '+(s.id===activeSlotId?'#ffd24a':'#555')+';border-radius:8px;padding:9px 12px">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="color:#fff;font-weight:bold;font-size:15px">'+esc(s.name)+' '+act+'</div>'+
        '<div style="color:#999;font-size:11px;margin-top:2px">种子 '+s.seed+' · '+modeName+' · '+dimName+' · '+new Date(s.time).toLocaleString()+(s.blocks?' · '+s.blocks+' 方块改动':'')+'</div>'+
      '</div>'+btns+
    '</div>';
  }).join('');
  list.querySelectorAll('[data-act]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.getAttribute('data-id');const act=btn.getAttribute('data-act');
      if(act==='roomenter'){ // 用它开房：载入该存档世界后建房
        const sd=loadSave(id);
        if(!sd){showToast('⚠️ 存档数据缺失');renderSavePanel('room');return;}
        setActiveSlot(id); // 该存档成为当前槽（游戏内自动保存写回）
        pendingRoomSave=sd;
        $('savePanel').classList.add('hidden');
        mpCreateRoom();
      }else if(act==='enter'){
        $('savePanel').classList.add('hidden');
        enterSaveSlot(id);
      }else if(act==='rename'){
        const nm=prompt('新名字：',(getSlotMeta(id)||{}).name||'');
        if(nm!==null&&nm.trim()){renameSaveSlot(id,nm.trim());renderSavePanel();}
      }else if(act==='del'){
        const nm=(getSlotMeta(id)||{}).name||'';
        if(confirm('删除存档「'+nm+'」？不可恢复！')){
          deleteSaveSlot(id);renderSavePanel();
          refreshStartBtn();
        }
      }
    });
  });
}
function openRoomSaveSelect(){
  renderSavePanel('room');
  $('savePanel').classList.remove('hidden');
}
function refreshStartBtn(){
  const ps=loadSave();
  if(ps&&ps.seed!==undefined){
    const meta=getSlotMeta(activeSlotId);
    $('startBtn').textContent='▶ 继续「'+(meta?meta.name:'上次的世界')+'」（种子 '+ps.seed+'）';
    show('newWorldBtn');
  }else{
    $('startBtn').textContent='点击开始';
    hide('newWorldBtn');
  }
}
// 皮肤选择
function drawSkinPreview(){
  const cv=$('skinCv');if(!cv)return;
  const ctx=cv.getContext('2d');const s=4;const sk=curSkin();
  ctx.clearRect(0,0,64,128);
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x*s,y*s,w*s,h*s);}
  function sr(x,y,w,h,c){rect(x,y,w,h,c);ctx.fillStyle='rgba(0,0,0,0.18)';ctx.fillRect(x*s,(y+h-1)*s,w*s,s);ctx.fillRect((x+w-1)*s,y*s,s,h*s);}
  sr(4,16,4,10,sk.pants);sr(8,16,4,10,sk.pants);
  sr(4,26,4,4,sk.shoes);sr(8,26,4,4,sk.shoes);
  sr(4,8,8,8,sk.shirt);sr(2,8,2,8,sk.skin);sr(12,8,2,8,sk.skin);
  sr(4,0,8,8,sk.skin);rect(6,3,1,2,sk.eye);rect(9,3,1,2,sk.eye);rect(4,0,8,2,sk.hair);
  $('skinName').textContent=sk.name;
}
function setSkin(i){skinIdx=((i%SKINS.length)+SKINS.length)%SKINS.length;drawSkinPreview();}
function setMode(m){
  gameMode=m;
  $('modeSurvival').classList.toggle('sel',m==='survival');
  $('modeCreative').classList.toggle('sel',m==='creative');
}
// 枪战场景选择面板
function openSceneSelect(cb){
  scenePickCb=cb||null;
  if(typeof closeAllPanels==='function')closeAllPanels(); // 先关掉联机大厅等所有弹窗，避免遮挡场景选择
  const list=$('sceneList');if(!list)return;
  list.innerHTML=ARENA_SCENES.map(s=>
    '<div data-scene="'+s.id+'" style="width:220px;padding:14px;background:rgba(30,30,30,.9);border:2px solid '+(s.id===arenaScene?'#ffd24a':'#555')+';border-radius:10px;cursor:pointer;text-align:center">'+
    '<div style="font-size:34px">'+s.icon+'</div>'+
    '<div style="font-size:17px;font-weight:bold;margin-top:6px;color:#fff">'+s.name+'</div>'+
    '<div style="font-size:12px;color:#aaa;margin-top:4px;line-height:1.5">'+s.desc+'</div>'+
    '</div>').join('');
  list.querySelectorAll('[data-scene]').forEach(el=>{
    el.addEventListener('click',()=>{
      arenaScene=el.getAttribute('data-scene');
      $('scenePanel').classList.add('hidden');
      const cb2=scenePickCb;scenePickCb=null;
      if(cb2)cb2();
    });
  });
  $('scenePanel').classList.remove('hidden');
  if(document.pointerLockElement)document.exitPointerLock();
}
// 联机大厅开关
function toggleMpPanel(){
  const p=$('mpPanel');
  const willOpen=p.classList.contains('hidden');
  p.classList.toggle('hidden');
  if(willOpen){
    // 释放指针锁定，方便鼠标操作面板
    if(document.pointerLockElement)document.exitPointerLock();
    if(!NET.roomId){netStatus('创建房间 或 点列表里的「加入」直接进别人的世界');startLobby();}
    else if(NET.isHost)netStatus('🏠 你是房主 · 房间 '+NET.roomId+' · 等朋友加入');
    else netStatus('🎮 已加入 '+esc(NET.hostInfo?NET.hostInfo.name:'房主')+' 的房间 '+NET.roomId);
  }else{
    stopLobby();
    if(gameState==='playing'&&!isTouch&&!document.pointerLockElement)lockPointer();
  }
}
const setLobbyMode=m=>{
  gameMode=m;
  const map={'survival':'modeBtn','creative':'modeCreativeBtn','shooter':'modeShooterBtn'};
  for(const k in map){const el=$(map[k]);if(el)el.style.borderColor=k===m?'#ffd75e':'#555';}
};
// ---------------- 初始化（按域拆分，逻辑与改造前一致） ----------------
function initCore(){
  buildTiles();
  registerContent();
  buildRecipes();buildSmelt();buildFuel();
  initScene();
  buildPanels();
  initControls();
  migrateSaves(); // 迁移旧存档 + 初始化当前槽
  pendingSave=loadSave();
  if(pendingSave&&pendingSave.seed!==undefined){
    const meta=getSlotMeta(activeSlotId);
    $('startBtn').textContent='▶ 继续「'+(meta?meta.name:'上次的世界')+'」（种子 '+pendingSave.seed+'）';
    show('newWorldBtn');
  }else{
    pendingSave=null;
    setupWorld(Math.floor(Math.random()*1000000000),null);
  }
}
function initStartUI(){
  $('startBtn').addEventListener('click',()=>{
    if(pendingSave&&activeSlotId){enterSaveSlot(activeSlotId);pendingSave=null;}
    else startGame();
  });
  $('newWorldBtn').addEventListener('click',()=>{
    pendingSave=null;
    if(gameMode==='shooter')gameMode='survival'; // 新世界默认生存（模式选择器只支持生存/创造，防残留枪战模式）
    activeSlotId=createSaveSlot(null); // 新建独立槽位（旧存档保留在目录里）
    setupWorld(Math.floor(Math.random()*1000000000),null);
    startGame();
  });
  $('saveDirBtn').addEventListener('click',()=>{renderSavePanel('play');$('savePanel').classList.remove('hidden');});
  $('savePanelClose').addEventListener('click',()=>$('savePanel').classList.add('hidden'));
  $('roomNewWorldBtn').addEventListener('click',()=>{
    pendingRoomSave=null; // 新世界/新场景开房
    $('savePanel').classList.add('hidden');
    if(gameMode==='shooter'){openSceneSelect(mpCreateRoom);return;}
    mpCreateRoom();
  });
  $('newSaveBtn').addEventListener('click',()=>{
    const nm=$('newSaveName').value.trim();
    if(gameMode==='shooter')gameMode='survival'; // 存档目录新建 = 生存新世界（防残留枪战模式）
    activeSlotId=createSaveSlot(nm||null);
    pendingSave=null;
    $('savePanel').classList.add('hidden');
    setupWorld(Math.floor(Math.random()*1000000000),null);
    startGame();
  });
  $('newSaveName').addEventListener('keydown',e=>{
    if(e.key==='Enter'){$('newSaveBtn').click();e.stopPropagation();}
  });
  const hb=$('helpBtn');
  if(hb)hb.addEventListener('click',()=>{const h=$('help');if(h)h.classList.toggle('hidden');});
  const sf=$('saveFab');
  if(sf)sf.addEventListener('click',saveNow);
}
function initSkinModeUI(){
  $('skinPrev').addEventListener('click',()=>setSkin(skinIdx-1));
  $('skinNext').addEventListener('click',()=>setSkin(skinIdx+1));
  drawSkinPreview();
  $('modeSurvival').addEventListener('click',()=>setMode('survival'));
  $('modeCreative').addEventListener('click',()=>setMode('creative'));
  setMode(pendingSave&&pendingSave.gameMode?pendingSave.gameMode:'survival');
  if(pendingSave&&typeof pendingSave.skinIdx==='number')setSkin(pendingSave.skinIdx);
}
function initNetUI(){
  // 多人联机大厅
  try{NET.myName=localStorage.getItem('mc_net_name')||('玩家'+Math.floor(Math.random()*900+100));}catch(e){NET.myName='玩家'+Math.floor(Math.random()*900+100);}
  const netNameEl=$('netName');
  if(netNameEl){netNameEl.value=NET.myName;netNameEl.addEventListener('input',()=>{NET.myName=netNameEl.value.trim().slice(0,16)||NET.myName;try{localStorage.setItem('mc_net_name',NET.myName);}catch(e){}});}
  $('mpBtn').addEventListener('click',toggleMpPanel);
  $('mpFab').addEventListener('click',toggleMpPanel);
  $('mpHostBtn').addEventListener('click',()=>{
    if(NET.roomId){netStatus('你已经在一个房间里了，先点「断开联机」');return;}
    openRoomSaveSelect(); // 先选存档（枪战可恢复竞技场+战绩）或新世界/新场景开房
  });
  $('modeBtn').addEventListener('click',()=>setLobbyMode('survival'));
  $('modeCreativeBtn').addEventListener('click',()=>setLobbyMode('creative'));
  $('modeShooterBtn').addEventListener('click',()=>setLobbyMode('shooter'));
  $('shooterBtn').addEventListener('click',()=>{
    if(NET.open&&NET.roomId){netStatus('你已经在房间里了，先断开');return;}
    setLobbyMode('shooter');
    openSceneSelect(()=>mpCreateRoom());
  });
  $('lobbyRefreshBtn').addEventListener('click',refreshRoomList);
  $('mpLeaveBtn').addEventListener('click',()=>netLeave(false));
}
function initSceneSelectUI(){
  $('sceneCancelBtn').addEventListener('click',()=>{scenePickCb=null;$('scenePanel').classList.add('hidden');});
}
function initMiscUI(){
  $('btnCmd').addEventListener('click',()=>{if(anyPanelOpen())closeAllPanels();else openCmd();});
  $('cmdRunBtn').addEventListener('click',runCommand);
  $('cmdInput').addEventListener('keydown',e=>{if(e.key==='Enter')runCommand();e.stopPropagation();});
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'&&anyPanelOpen())closeAllPanels();
    if(e.code==='KeyM')toggleMpPanel();
    if(e.code==='KeyR'&&gameMode==='shooter'){e.preventDefault();reloadGun();} // 枪战换弹
    if(e.code==='KeyG'&&gameMode==='shooter'){e.preventDefault();startNadeCharge();} // 按住 G 蓄力手榴弹
  });
  setInterval(saveGame,20000); // 每20秒自动保存
  window.addEventListener('pagehide',saveGame);
  window.addEventListener('beforeunload',saveGame);
  requestAnimationFrame(loop);
  initMenuScene(); // 首页 3D panorama 背景（MC 主菜单风格）
}
function init(){
  initCore();
  initStartUI();
  initSkinModeUI();
  initNetUI();
  initSceneSelectUI();
  initMiscUI();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();

// ================ 首页 3D 背景（MC 主菜单 panorama 风格） ================
// 独立 renderer/scene/camera，与游戏主场景完全隔离；startGame 时销毁释放 WebGL context
let menuRenderer=null,menuScene=null,menuCamera=null,menuRafId=0,menuClouds=[],menuResizeFn=null;
function makeCanvasTex(draw){
  const c=document.createElement('canvas');c.width=16;c.height=16;
  draw(c.getContext('2d'));
  const t=new THREE.CanvasTexture(c);
  t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter; // 像素纹理（MC 质感）
  return t;
}
function menuGrassSideTex(){return makeCanvasTex(g=>{
  g.fillStyle='#8a6a3f';g.fillRect(0,0,16,16);
  for(let i=0;i<42;i++){g.fillStyle=Math.random()<.5?'#7a5c36':'#94754a';g.fillRect(Math.random()*16|0,Math.random()*16|0,1,1);}
  g.fillStyle='#7fbd4f';g.fillRect(0,0,16,4);
  for(let i=0;i<16;i++){g.fillStyle=Math.random()<.5?'#6fae42':'#8cc95e';g.fillRect(Math.random()*16|0,Math.random()*16|0,1,1);}
});}
function menuGrassTopTex(){return makeCanvasTex(g=>{
  g.fillStyle='#7fbd4f';g.fillRect(0,0,16,16);
  for(let i=0;i<48;i++){g.fillStyle=Math.random()<.5?'#6fae42':'#8cc95e';g.fillRect(Math.random()*16|0,Math.random()*16|0,1,1);}
});}
function menuDirtTex(){return makeCanvasTex(g=>{
  g.fillStyle='#8a6a3f';g.fillRect(0,0,16,16);
  for(let i=0;i<48;i++){g.fillStyle=Math.random()<.5?'#7a5c36':'#94754a';g.fillRect(Math.random()*16|0,Math.random()*16|0,1,1);}
});}
function initMenuScene(){
  if(menuRenderer||!document.getElementById('start'))return;
  menuRenderer=new THREE.WebGLRenderer({antialias:false,alpha:true});
  menuRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  menuRenderer.setSize(window.innerWidth,window.innerHeight);
  const cv=menuRenderer.domElement;
  cv.style.cssText='position:absolute;inset:0;z-index:0;width:100%;height:100%;pointer-events:none';
  document.getElementById('start').appendChild(cv);
  menuScene=new THREE.Scene();
  menuScene.fog=new THREE.Fog(0x9ad7ef,26,74); // 远景雾化，MC 远处朦胧感
  menuScene.add(new THREE.HemisphereLight(0xcfe8ff,0x8a6a4a,0.95));
  menuScene.add(new THREE.AmbientLight(0xffffff,0.35));
  const sunL=new THREE.DirectionalLight(0xfff2d0,1.15);sunL.position.set(18,30,10);menuScene.add(sunL);
  // 地面：32×32 草方块（顶面草纹 + 四面泥土边）
  const side=menuGrassSideTex(),top=menuGrassTopTex(),dirt=menuDirtTex();
  const ground=new THREE.Mesh(new THREE.BoxGeometry(32,1,32),
    [new THREE.MeshLambertMaterial({map:side}),new THREE.MeshLambertMaterial({map:side}),
     new THREE.MeshLambertMaterial({map:top}),new THREE.MeshLambertMaterial({map:dirt}),
     new THREE.MeshLambertMaterial({map:side}),new THREE.MeshLambertMaterial({map:side})]);
  ground.position.y=-0.5;menuScene.add(ground);
  // 树（原木 + 双层树叶）
  const logM=new THREE.MeshLambertMaterial({map:dirt});
  const leafM=new THREE.MeshLambertMaterial({map:menuGrassTopTex()});
  [[-9,4],[-5,-8],[7,6],[11,-5],[-13,-4],[4,-12],[-2,12],[13,9],[-8,13]].forEach(([x,z])=>{
    const g=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.BoxGeometry(1,3,1),logM);trunk.position.y=1.5;g.add(trunk);
    const l1=new THREE.Mesh(new THREE.BoxGeometry(3,1.4,3),leafM);l1.position.y=3.2;g.add(l1);
    const l2=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.2,1.6),leafM);l2.position.y=4.6;g.add(l2);
    g.position.set(x,0,z);menuScene.add(g);
  });
  // 远山（石头金字塔 + 雪顶）
  const stoneM=new THREE.MeshLambertMaterial({color:0x8f9296});
  const snowM=new THREE.MeshLambertMaterial({color:0xf5f6f7});
  [[-26,-20],[22,-26],[-27,18],[26,22],[0,27]].forEach(([hx,hz])=>{
    const g=new THREE.Group();
    for(let i=0;i<3;i++){
      const s=14-i*4.5;
      const m=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),i<2?stoneM:snowM);
      m.position.y=i*2.4+1;g.add(m);
    }
    g.position.set(hx,0,hz);menuScene.add(g);
  });
  // 云（白色方块群，缓慢平移循环）
  const cloudM=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.92});
  for(let i=0;i<6;i++){
    const g=new THREE.Group();
    for(let j=0;j<3;j++){
      const m=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.7,2),cloudM);
      m.position.set(j*2-2,Math.random()*0.5,(Math.random()-0.5)*1.5);g.add(m);
    }
    g.position.set((Math.random()*40-20),13+i%3*3+Math.random()*2,(Math.random()*40-20));
    g.userData.sx=g.position.x;
    menuScene.add(g);menuClouds.push(g);
  }
  // 太阳（Sprite 光晕，自动面向相机）
  const sunSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:makeCanvasTex(g=>{
    const grad=g.createRadialGradient(8,8,1,8,8,8);
    grad.addColorStop(0,'rgba(255,238,160,1)');grad.addColorStop(.55,'rgba(255,205,80,1)');grad.addColorStop(1,'rgba(255,205,80,0)');
    g.fillStyle=grad;g.fillRect(0,0,16,16);
  }),transparent:true,depthWrite:false}));
  sunSpr.scale.set(14,14,1);sunSpr.position.set(46,26,-22);menuScene.add(sunSpr);
  // 相机：绕世界中心缓慢环绕（MC panorama 同款）
  menuCamera=new THREE.PerspectiveCamera(62,window.innerWidth/window.innerHeight,0.1,300);
  menuCamera.position.set(26,6.5,0);
  menuCamera.lookAt(0,3,0);
  menuResizeFn=()=>{
    menuCamera.aspect=window.innerWidth/window.innerHeight;menuCamera.updateProjectionMatrix();
    menuRenderer.setSize(window.innerWidth,window.innerHeight);
  };
  window.addEventListener('resize',menuResizeFn);
  const tick=()=>{
    if(!menuRenderer)return;
    const t=performance.now()/1000;
    const a=t*0.06;
    menuCamera.position.set(Math.cos(a)*26,6.5,Math.sin(a)*26);
    menuCamera.lookAt(0,3,0);
    for(let i=0;i<menuClouds.length;i++){
      const c=menuClouds[i];
      c.position.x=((c.userData.sx+t*0.5+90)%180)-90;
    }
    menuRenderer.render(menuScene,menuCamera);
    menuRafId=requestAnimationFrame(tick);
  };
  menuRafId=requestAnimationFrame(tick);
}
function disposeMenuScene(){
  if(menuRafId){cancelAnimationFrame(menuRafId);menuRafId=0;}
  if(menuResizeFn){window.removeEventListener('resize',menuResizeFn);menuResizeFn=null;}
  if(menuRenderer){
    menuRenderer.dispose();
    const el=menuRenderer.domElement;
    if(el&&el.parentNode)el.parentNode.removeChild(el);
    menuRenderer=null;
  }
  menuScene=null;menuCamera=null;menuClouds=[];
}
