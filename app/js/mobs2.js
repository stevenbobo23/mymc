// ---------------- 生物 ----------------
const mobs=[];
function mobBoxCollides(pos,w,h){
  const x0=Math.floor(pos.x-w),x1=Math.floor(pos.x+w-0.0001);
  const y0=Math.floor(pos.y),y1=Math.floor(pos.y+h-0.0001);
  const z0=Math.floor(pos.z-w),z1=Math.floor(pos.z+w-0.0001);
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
    if(y<0)return true;
    if(isSolidBlock(getBlock(x,y,z)))return true;
  }
  return false;
}
function mobMoveAxis(mob,axis,amt){
  if(amt===0)return;
  const p=mob.pos.clone();p[axis]+=amt;
  if(!mobBoxCollides(p,mob.w,mob.h)){mob.pos[axis]+=amt;return;}
  let lo=0,hi=amt;
  for(let i=0;i<6;i++){
    const mid=(lo+hi)/2;
    const q=mob.pos.clone();q[axis]+=mid;
    if(mobBoxCollides(q,mob.w,mob.h))hi=mid;else lo=mid;
  }
  mob.pos[axis]+=lo;
  if(axis==='y'){if(amt<0)mob.onGround=true;mob.vel.y=0;}
  else{mob.vel[axis]=0;mob.blocked=true;}
}
function buildVillagerModel(){ // 村民：棕袍子+大鼻子
  const g=new THREE.Group();
  const robe=new THREE.MeshLambertMaterial({color:0x8a6a4a});
  const skin=new THREE.MeshLambertMaterial({color:0xd9a066});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.9,0.32),robe);
  body.position.y=0.85;g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.4),skin);
  head.position.y=1.55;g.add(head);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.2,0.12),skin);
  nose.position.set(0,1.45,-0.26);g.add(nose);
  const brow=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.08,0.06),robe);
  brow.position.set(0,1.68,-0.21);g.add(brow);
  const arms=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.16,0.16),robe);
  arms.position.set(0,0.95,-0.22);g.add(arms); // 抱在胸前
  const legs=[];
  for(const lx of [-0.13,0.13]){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.45,0.16),robe);
    leg.position.set(lx,0.22,0);g.add(leg);legs.push(leg);
  }
  return {g,legs};
}
function buildGolemModel(){ // 铁傀儡：白白壮壮，手臂超长，身上有藤蔓
  const g=new THREE.Group();
  const iron=new THREE.MeshLambertMaterial({color:0xd8d8d0});
  const vine=new THREE.MeshLambertMaterial({color:0x5a8a3a});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.9,0.5),iron);
  body.position.y=1.35;g.add(body);
  const patch=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.34,0.52),vine);
  patch.position.set(0.25,1.2,0);g.add(patch);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.45,0.45),iron);
  head.position.y=2.1;g.add(head);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.22,0.14),new THREE.MeshLambertMaterial({color:0xc09060}));
  nose.position.set(0,2.0,-0.29);g.add(nose);
  const brow=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.08,0.08),new THREE.MeshLambertMaterial({color:0x3a3a3a}));
  brow.position.set(0,2.26,-0.24);g.add(brow);
  const legs=[],arms=[];
  for(const s of [-1,1]){
    const arm=new THREE.Mesh(new THREE.BoxGeometry(0.22,1.1,0.22),iron);
    arm.position.set(s*0.55,1.25,0);g.add(arm);arms.push(arm);
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.6,0.24),iron);
    leg.position.set(s*0.2,0.3,0);g.add(leg);legs.push(leg);
  }
  return {g,legs,arms};
}
function buildCowModel(){
  const g=new THREE.Group();
  const brown=new THREE.MeshLambertMaterial({color:0x8d5a2b});
  const dark=new THREE.MeshLambertMaterial({color:0x6b3f1d});
  const white=new THREE.MeshLambertMaterial({color:0xe8e0d0});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.6,1.1),brown);
  body.position.y=0.75;g.add(body);
  const patch=new THREE.Mesh(new THREE.BoxGeometry(0.64,0.3,0.5),white);
  patch.position.set(0,0.85,0.15);g.add(patch);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.42,0.42),dark);
  head.position.set(0,1.1,-0.72);g.add(head);
  const muzzle=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,0.1),white);
  muzzle.position.set(0,1.0,-0.95);g.add(muzzle);
  const legs=[];
  const lpos=[[-0.2,-0.35],[0.2,-0.35],[-0.2,0.35],[0.2,0.35]];
  for(const lp of lpos){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.5,0.18),dark);
    leg.position.set(lp[0],0.25,lp[1]);
    g.add(leg);legs.push(leg);
  }
  return {g,legs};
}
function buildTurtleModel(){
  const g=new THREE.Group();
  const skin=new THREE.MeshLambertMaterial({color:0x4a8a3f});
  const shellM=new THREE.MeshLambertMaterial({color:0x2d6a2a});
  const shell=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.22,0.95),shellM);
  shell.position.y=0.28;g.add(shell);
  const rim=new THREE.Mesh(new THREE.BoxGeometry(0.95,0.1,1.05),skin);
  rim.position.y=0.16;g.add(rim);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.2,0.3),skin);
  head.position.set(0,0.22,-0.62);g.add(head);
  const legs=[];
  const lpos=[[-0.45,-0.35],[0.45,-0.35],[-0.45,0.35],[0.45,0.35]];
  for(const lp of lpos){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.12,0.25),skin);
    leg.position.set(lp[0],0.08,lp[1]);
    g.add(leg);legs.push(leg);
  }
  return {g,legs};
}
function ghastFaceTex(){
  const cv=document.createElement('canvas');cv.width=32;cv.height=32;
  const c=cv.getContext('2d');
  c.fillStyle='#f4f0e8';c.fillRect(0,0,32,32);
  c.fillStyle='#3a3a3a';
  c.fillRect(8,12,5,2);c.fillRect(19,12,5,2); // 笑眼
  c.fillStyle='#f0a8a8';c.fillRect(6,16,5,3);c.fillRect(21,16,5,3); // 腮红
  c.fillStyle='#3a3a3a';c.fillRect(12,21,8,2);c.fillRect(10,19,2,2);c.fillRect(20,19,2,2); // 微笑
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;
  return t;
}
function buildGhastModel(){ // 快乐恶魂：白色大方块+笑脸+小触手
  const g=new THREE.Group();
  const white=new THREE.MeshLambertMaterial({color:0xf4f0e8});
  const face=new THREE.MeshLambertMaterial({map:ghastFaceTex()});
  const mats=[white,white,white,white,white,face]; // 脸朝 -z（移动方向）
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.1,1.5),mats);
  body.position.y=0.85;g.add(body);
  const legs=[];
  const tpos=[[-0.45,-0.45],[0.45,-0.45],[-0.45,0.45],[0.45,0.45]];
  for(const tp of tpos){
    const t=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.45,0.16),white);
    t.position.set(tp[0],0.15,tp[1]);g.add(t);legs.push(t);
  }
  return {g,legs};
}
function buildCreakingModel(){ // 嘎吱怪：树皮色高个+发光黄眼
  const g=new THREE.Group();
  const bark=new THREE.MeshLambertMaterial({color:0x5a4f42});
  const bark2=new THREE.MeshLambertMaterial({color:0x453b30});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.5,1.0,0.32),bark);
  body.position.y=0.95;g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.45,0.4),bark2);
  head.position.y=1.68;g.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:0xffd24a});
  const e1=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,0.03),eyeM);
  e1.position.set(-0.1,1.72,-0.21);g.add(e1);
  const e2=e1.clone();e2.position.x=0.1;g.add(e2);
  const a1=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.7,0.12),bark2);
  a1.position.set(-0.32,1.05,0);g.add(a1);
  const a2=a1.clone();a2.position.x=0.32;g.add(a2);
  const legs=[];
  const l1=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.5,0.16),bark);
  l1.position.set(-0.12,0.25,0);g.add(l1);legs.push(l1);
  const l2=l1.clone();l2.position.x=0.12;g.add(l2);legs.push(l2);
  return {g,legs};
}
function buildZombieModel(){ // 僵尸：绿皮肤，双臂前伸
  const g=new THREE.Group();
  const skin=new THREE.MeshLambertMaterial({color:0x4a7a3a});
  const shirt=new THREE.MeshLambertMaterial({color:0x3a5a6a});
  const pants=new THREE.MeshLambertMaterial({color:0x3a3a5a});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.28),shirt);
  body.position.y=1.0;g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.45,0.45),skin);
  head.position.y=1.6;g.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:0x1a0a0a});
  const e1=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.09,0.03),eyeM);
  e1.position.set(-0.1,1.65,-0.23);g.add(e1);
  const e2=e1.clone();e2.position.x=0.1;g.add(e2);
  // 前伸的双臂
  const a1=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.13,0.55),skin);
  a1.position.set(-0.3,1.15,-0.32);g.add(a1);
  const a2=a1.clone();a2.position.x=0.3;g.add(a2);
  const legs=[];
  const l1=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.65,0.18),pants);
  l1.position.set(-0.13,0.33,0);g.add(l1);legs.push(l1);
  const l2=l1.clone();l2.position.x=0.13;g.add(l2);legs.push(l2);
  return {g,legs};
}
function buildDragonModel(){ // 末影龙：黑色大龙，紫色眼睛，会扇翅膀
  const g=new THREE.Group();
  const black=new THREE.MeshLambertMaterial({color:0x181220});
  const gray=new THREE.MeshLambertMaterial({color:0x2c2438});
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.9,1.0),black);
  body.position.y=0.8;g.add(body);
  const belly=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.3,0.8),gray);
  belly.position.y=0.35;g.add(belly);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.7,0.7),black);
  head.position.set(-1.55,1.1,0);g.add(head);
  const snout=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.35,0.5),gray);
  snout.position.set(-2.05,0.95,0);g.add(snout);
  const eyeM=new THREE.MeshBasicMaterial({color:0xc060ff}); // 紫色发光眼
  const e1=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.14,0.14),eyeM);
  e1.position.set(-1.96,1.2,-0.2);g.add(e1);
  const e2=e1.clone();e2.position.z=0.2;g.add(e2);
  // 角
  const horn=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.1,0.1),gray);
  horn.position.set(-1.5,1.5,-0.2);horn.rotation.z=0.5;g.add(horn);
  const horn2=horn.clone();horn2.position.z=0.2;g.add(horn2);
  // 尾巴两节
  const tail1=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.5,0.5),black);
  tail1.position.set(1.7,0.85,0);g.add(tail1);
  const tail2=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.3,0.3),gray);
  tail2.position.set(2.7,0.9,0);g.add(tail2);
  // 大翅膀
  const wingGeo=new THREE.BoxGeometry(1.6,0.12,2.6);
  const wingL=new THREE.Mesh(wingGeo,gray);wingL.position.set(0,1.3,-1.7);g.add(wingL);
  const wingR=new THREE.Mesh(wingGeo,gray);wingR.position.set(0,1.3,1.7);g.add(wingR);
  return {g,legs:[],wingL,wingR};
}
function buildCrystalModel(){ // 末影水晶：粉色发光旋转方块，罩着玻璃罩
  const g=new THREE.Group();
  const core=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.4),
    new THREE.MeshBasicMaterial({color:0xff80e8}));
  core.position.y=0.5;core.rotation.set(0.6,0.6,0);g.add(core);
  const cage=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.9,0.75),
    new THREE.MeshLambertMaterial({color:0xa0c0ff,transparent:true,opacity:0.35}));
  cage.position.y=0.5;g.add(cage);
  g.userData.core=core;
  return {g,legs:[]};
}
function buildEndermanModel(){ // 末影人：高高的黑色身影，紫色发光眼睛
  const g=new THREE.Group();
  const black=new THREE.MeshLambertMaterial({color:0x14101c});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.85,0.24),black);
  body.position.y=1.45;g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.42,0.42),black);
  head.position.y=2.15;g.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:0xc060ff}); // 紫色发光眼
  const e1=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.05,0.03),eyeM);
  e1.position.set(-0.1,2.15,-0.22);g.add(e1);
  const e2=e1.clone();e2.position.x=0.1;g.add(e2);
  const a1=new THREE.Mesh(new THREE.BoxGeometry(0.11,1.0,0.11),black);
  a1.position.set(-0.28,1.35,0);g.add(a1);
  const a2=a1.clone();a2.position.x=0.28;g.add(a2);
  const legs=[];
  const l1=new THREE.Mesh(new THREE.BoxGeometry(0.15,1.0,0.15),black);
  l1.position.set(-0.11,0.5,0);g.add(l1);legs.push(l1);
  const l2=l1.clone();l2.position.x=0.11;g.add(l2);legs.push(l2);
  return {g,legs};
}
function buildSlimeModel(){ // 史莱姆：绿色果冻方块
  const g=new THREE.Group();
  const jelly=new THREE.MeshLambertMaterial({color:0x5ac24a,transparent:true,opacity:0.85});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.6,0.8),jelly);
  body.position.y=0.3;g.add(body);
  const eyeM=new THREE.MeshBasicMaterial({color:0x1a3a1a});
  const e1=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.12,0.03),eyeM);
  e1.position.set(-0.16,0.38,-0.41);g.add(e1);
  const e2=e1.clone();e2.position.x=0.16;g.add(e2);
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.05,0.03),eyeM);
  mouth.position.set(0,0.18,-0.41);g.add(mouth);
  return {g,legs:[]};
}
const MOB_CONF={
  cow:{hp:3,w:0.4,h:1.15,speed:0.8},
  turtle:{hp:3,w:0.5,h:0.45,speed:0.4},
  hghast:{hp:20,w:0.85,h:1.35,speed:0.7},
  creaking:{hp:4,w:0.35,h:1.7,speed:2.3},
  zombie:{hp:6,w:0.35,h:1.8,speed:1.6},
  slime:{hp:2,w:0.5,h:0.6,speed:1.1},
  enderman:{hp:8,w:0.35,h:2.5,speed:2.6},
  dragon:{hp:30,w:1.9,h:2.2,speed:4},
  crystal:{hp:1,w:0.45,h:1.0,speed:0},
  villager:{hp:6,w:0.35,h:1.8,speed:0.9},
  golem:{hp:30,w:0.6,h:2.4,speed:1.5}
};
let nextNid=1; // mobs 网络 id（房主分配，联机广播用）
function netMobByNid(nid){for(const m of mobs)if(m.nid===nid&&!m.dead)return m;return null;}
function spawnMob(type,x,z,y,nid){
  const sy=y!==undefined?y:surfaceY(x,z)+1;
  const model=type==='cow'?buildCowModel():type==='turtle'?buildTurtleModel():
    type==='hghast'?buildGhastModel():type==='zombie'?buildZombieModel():
    type==='slime'?buildSlimeModel():type==='enderman'?buildEndermanModel():
    type==='dragon'?buildDragonModel():type==='crystal'?buildCrystalModel():
    type==='villager'?buildVillagerModel():type==='golem'?buildGolemModel():buildCreakingModel();
  const cf=MOB_CONF[type];
  const mob={
    type,pos:new THREE.Vector3(x+0.5,sy,z+0.5),
    vel:new THREE.Vector3(),yaw:Math.random()*Math.PI*2,
    hp:cf.hp,maxHp:cf.hp,w:cf.w,h:cf.h,speed:cf.speed,
    group:model.g,legs:model.legs,wingL:model.wingL,wingR:model.wingR,arms:model.arms,
    dirT:0,moving:false,walkT:0,flashT:0,onGround:false,blocked:false,dead:false,
    atkT:0,frozen:false,flyT:Math.random()*10,
    nid:nid!==undefined?nid:(nextNid++), // 联机稳定 id（房主分配，广播驱动客人端）
    remote:null // 远端目标位（联机客人端由房主广播驱动）
  };
  mob.group.position.copy(mob.pos);
  mobsGroup.add(mob.group);
  mobs.push(mob);
  return mob;
}
function spawnMobs(){
  if(gameMode==='shooter'||gameMode==='skyblock')return; // 竞技场/空岛无生物
  if(NET.roomId&&!NET.isHost)return; // 联机客人：mobs 由房主广播驱动，不本地刷
  const px=spawnPoint.x,pz=spawnPoint.z;
  for(let i=0;i<4;i++)trySpawnNear('cow',px,pz,6,24);
  for(let i=0;i<3;i++)trySpawnNear('turtle',px,pz,6,30);
  trySpawnGhast(px,pz);
}
function trySpawnNear(type,px,pz,minD,maxD){
  for(let t=0;t<20;t++){
    const a=Math.random()*Math.PI*2,d=minD+Math.random()*(maxD-minD);
    const x=Math.floor(px+Math.cos(a)*d),z=Math.floor(pz+Math.sin(a)*d);
    const y=surfaceY(x,z);
    const top=getBlock(x,y,z);
    if(type==='cow'&&top===B_GRASS&&y>SEA){spawnMob('cow',x,z);return;}
    if(type==='turtle'&&top===B_SAND&&y>=SEA-1&&y<=SEA+1){
      let nearWater=false;
      for(let dx=-3;dx<=3&&!nearWater;dx++)for(let dz=-3;dz<=3;dz++)
        if(getBlock(x+dx,SEA,z+dz)===B_WATER){nearWater=true;break;}
      if(nearWater){spawnMob('turtle',x,z);return;}
    }
    if(type==='creaking'&&(top===B_GRASS||top===B_STONE||top===B_SAND||top===B_COBBLE||top===B_DIRT)&&y>SEA){
      spawnMob('creaking',x,z);return;
    }
    if(type==='zombie'&&(top===B_GRASS||top===B_STONE||top===B_SAND||top===B_COBBLE||top===B_DIRT)&&y>SEA){
      spawnMob('zombie',x,z);return;
    }
    if(type==='slime'&&top===B_GRASS&&y>SEA){
      let nearWater=false;
      for(let dx=-4;dx<=4&&!nearWater;dx++)for(let dz=-4;dz<=4;dz++)
        if(getBlock(x+dx,SEA,z+dz)===B_WATER){nearWater=true;break;}
      if(nearWater){spawnMob('slime',x,z);return;}
    }
  }
}
function trySpawnGhast(px,pz){
  const a=Math.random()*Math.PI*2,d=12+Math.random()*18;
  const x=Math.floor(px+Math.cos(a)*d),z=Math.floor(pz+Math.sin(a)*d);
  spawnMob('hghast',x,z,surfaceY(x,z)+8);
}
// 动态刷怪：白天刷动物和快乐恶魂，夜晚刷嘎吱怪；远处生物清理
let spawnT=5;
function dynamicSpawner(dt){
  if(gameMode==='shooter'||gameMode==='skyblock')return; // 竞技场/空岛无生物
  if(NET.roomId&&!NET.isHost)return; // 联机客人：刷怪由房主权威决定
  spawnT-=dt;
  if(spawnT>0)return;
  spawnT=4;
  const px=player.pos.x,pz=player.pos.z;
  let cows=0,turtles=0,ghasts=0,creaks=0,zombies=0,slimes=0;
  for(let i=mobs.length-1;i>=0;i--){
    const m=mobs[i];
    if(m.dead)continue;
    const d=Math.hypot(m.pos.x-px,m.pos.z-pz);
    if(d>96&&m!==player.mounted&&m.type!=='dragon'&&m.type!=='crystal'&&m.type!=='villager'&&m.type!=='golem'){killMob(m,true);continue;}
    if(m.type==='cow')cows++;else if(m.type==='turtle')turtles++;
    else if(m.type==='hghast')ghasts++;else if(m.type==='creaking')creaks++;
    else if(m.type==='zombie')zombies++;else if(m.type==='slime')slimes++;
  }
  // 下界：僵尸+史莱姆常年出没；末地：末影人
  if(curDim==='nether'){
    if(gameMode!=='creative'&&zombies<5&&Math.random()<0.7)trySpawnNear('zombie',px,pz,14,26);
    if(slimes<2&&Math.random()<0.3)trySpawnNear('slime',px,pz,14,28);
    return;
  }
  if(curDim==='end'){
    let enders=0;
    for(const m of mobs)if(!m.dead&&m.type==='enderman')enders++;
    if(enders<4&&Math.random()<0.7)trySpawnNear('enderman',px,pz,12,30);
    return;
  }
  const elev=Math.sin((dayTime-0.25)*Math.PI*2);
  const isNight=elev<0.1;
  if(!isNight){
    if(cows<4&&Math.random()<0.4)trySpawnNear('cow',px,pz,16,30);
    if(turtles<2&&Math.random()<0.25)trySpawnNear('turtle',px,pz,12,26);
    if(ghasts<2&&Math.random()<0.2)trySpawnGhast(px,pz);
    if(slimes<2&&Math.random()<0.2)trySpawnNear('slime',px,pz,14,28);
  }else{
    if(creaks<3&&Math.random()<0.7)trySpawnNear('creaking',px,pz,16,26);
    if(gameMode!=='creative'&&zombies<4&&Math.random()<0.8)trySpawnNear('zombie',px,pz,14,26);
    let enders=0;
    for(const m of mobs)if(!m.dead&&m.type==='enderman')enders++;
    if(enders<2&&Math.random()<0.3)trySpawnNear('enderman',px,pz,18,30); // 主世界夜晚也有末影人
  }
}
function mobFlash(m,dt){
  if(m.flashT>0){
    m.flashT-=dt;
    const on=Math.floor(m.flashT*10)%2===0;
    m.group.traverse(o=>{if(o.material&&o.material.emissive)o.material.emissive.setHex(on?0x880000:0x000000);});
    if(m.flashT<=0)m.group.traverse(o=>{if(o.material&&o.material.emissive)o.material.emissive.setHex(0x000000);});
  }
}
function updateGhast(m,dt){ // 快乐恶魂：空中漂浮，被骑乘时由主循环控制
  m.flyT+=dt;
  if(player.mounted===m){
    m.group.position.copy(m.pos);
    m.group.rotation.y=m.yaw;
    return;
  }
  const gy=surfaceY(Math.floor(m.pos.x),Math.floor(m.pos.z))+7+Math.sin(m.flyT*0.6)*1.2;
  m.pos.y+=(gy-m.pos.y)*Math.min(1,dt*0.8);
  m.dirT-=dt;
  if(m.dirT<=0){m.dirT=4+Math.random()*5;m.yaw=Math.random()*Math.PI*2;m.moving=Math.random()<0.5;}
  if(m.moving){
    m.pos.x+=-Math.sin(m.yaw)*m.speed*dt;
    m.pos.z+=-Math.cos(m.yaw)*m.speed*dt;
  }
  m.group.position.copy(m.pos);
  m.group.rotation.y=m.yaw;
  mobFlash(m,dt);
}
function updateCreaking(m,dt){ // 嘎吱怪：没人看时才动，天亮消失
  const elev=Math.sin((dayTime-0.25)*Math.PI*2);
  if(elev>0.12){
    spawnBlockParticles(m.pos.x,m.pos.y+1,m.pos.z,'rgb(120,100,80)');
    killMob(m,true);return;
  }
  m.atkT-=dt;
  const dx=player.pos.x-m.pos.x,dy=(player.pos.y+PEYE)-(m.pos.y+1.4),dz=player.pos.z-m.pos.z;
  const dist=Math.hypot(dx,dy,dz);
  const dirc={x:-Math.sin(player.yaw)*Math.cos(player.pitch),y:Math.sin(player.pitch),z:-Math.cos(player.yaw)*Math.cos(player.pitch)};
  const dot=(dx*dirc.x+dy*dirc.y+dz*dirc.z)/(dist||1);
  m.frozen=(dot>0.5&&dist<36)||player.dead;
  if(!m.frozen&&dist>1.2){
    const ux=dx/dist,uz=dz/dist;
    m.vel.x=ux*m.speed;m.vel.z=uz*m.speed;
    m.moving=true;m.walkT+=dt*5;
    m.yaw=Math.atan2(-ux,-uz);
  }else{
    m.vel.x*=0.3;m.vel.z*=0.3;m.moving=false;
  }
  m.vel.y-=22*dt;m.vel.y=Math.max(m.vel.y,-30);
  m.onGround=false;
  mobMoveAxis(m,'x',m.vel.x*dt);
  mobMoveAxis(m,'z',m.vel.z*dt);
  mobMoveAxis(m,'y',m.vel.y*dt);
  if(!m.frozen&&dist<1.5&&m.atkT<=0&&!player.dead){
    damagePlayer(2,'被嘎吱怪偷袭了');
    m.atkT=0.9;
    player.vel.x+=dx/dist*5;player.vel.z+=dz/dist*5;player.vel.y=3;
  }
  if(m.pos.y<-5){killMob(m,true);return;}
  m.group.position.copy(m.pos);
  m.group.rotation.y=m.yaw;
  const sw=Math.sin(m.walkT*8)*(m.moving?0.6:0);
  for(let l=0;l<m.legs.length;l++)m.legs[l].rotation.x=(l%2===0?sw:-sw);
  mobFlash(m,dt);
}
let foundVillage=false,golemKilled=false;
function updateGolem(m,dt){ // 铁傀儡：平时散步巡逻，你打它或打村民就会生气追你
  m.atkT-=dt;
  const dx=player.pos.x-m.pos.x,dz=player.pos.z-m.pos.z;
  const dist=Math.hypot(dx,dz);
  const hunting=m.angry&&gameMode!=='creative'&&!player.dead&&dist<26;
  if(hunting&&dist>1.4){ // 生气：追！
    const ux=dx/dist,uz=dz/dist;
    m.vel.x=ux*m.speed*1.4;m.vel.z=uz*m.speed*1.4;
    m.moving=true;m.walkT+=dt*5;
    m.yaw=Math.atan2(-ux,-uz);
  }else if(hunting){
    m.vel.x*=0.3;m.vel.z*=0.3;m.moving=true;m.walkT+=dt*2;
  }else{ // 巡逻散步
    m.dirT-=dt;
    if(m.dirT<=0){m.dirT=2+Math.random()*4;m.yaw=Math.random()*Math.PI*2;m.moving=Math.random()<0.5;}
    if(m.moving){
      m.vel.x=-Math.sin(m.yaw)*m.speed*0.6;m.vel.z=-Math.cos(m.yaw)*m.speed*0.6;
      m.walkT+=dt*m.speed;
    }else{m.vel.x*=0.5;m.vel.z*=0.5;}
  }
  m.vel.y-=22*dt;m.vel.y=Math.max(m.vel.y,-30);
  m.onGround=false;
  mobMoveAxis(m,'x',m.vel.x*dt);
  mobMoveAxis(m,'z',m.vel.z*dt);
  mobMoveAxis(m,'y',m.vel.y*dt);
  if(m.blocked){m.yaw+=Math.PI/2;m.dirT=1;}
  if(hunting&&dist<2.0&&m.atkT<=0){ // 把你打飞！
    damagePlayer(4,'被铁傀儡打飞了');
    m.atkT=1.2;
    if(dist>0.1){player.vel.x+=dx/dist*5;player.vel.z+=dz/dist*5;player.vel.y=5;}
    if(m.arms)for(const a2 of m.arms)a2.rotation.x=-2.2; // 举手臂
  }
  if(m.arms){ // 手臂慢慢放下
    for(const a2 of m.arms)a2.rotation.x*=0.9;
  }
  if(m.pos.y<-5){killMob(m,true);return;}
  m.group.position.copy(m.pos);
  m.group.rotation.y=m.yaw;
  const sw=Math.sin(m.walkT*6)*(m.moving?0.4:0);
  for(let l=0;l<m.legs.length;l++)m.legs[l].rotation.x=(l%2===0?sw:-sw);
  mobFlash(m,dt);
}
function updateZombie(m,dt){ // 僵尸：夜晚追击玩家，天亮自燃（末影人也用这套追击AI，但不会烧）
  const elev=Math.sin((dayTime-0.25)*Math.PI*2);
  if(m.type==='zombie'&&elev>0.12){
    m.burnT=(m.burnT||0)+dt;
    if(Math.random()<dt*8)spawnBlockParticles(m.pos.x,m.pos.y+1.6,m.pos.z,'rgb(255,140,40)');
    if(m.burnT>2.5){ // 白天烧死
      spawnBlockParticles(m.pos.x,m.pos.y+1,m.pos.z,'rgb(255,120,30)');
      killMob(m,false);return;
    }
  }else m.burnT=0;
  m.atkT-=dt;
  const dx=player.pos.x-m.pos.x,dz=player.pos.z-m.pos.z;
  const dist=Math.hypot(dx,dz);
  if(dist<26&&dist>1.1&&!player.dead){ // 追击
    const ux=dx/dist,uz=dz/dist;
    m.vel.x=ux*m.speed;m.vel.z=uz*m.speed;
    m.moving=true;m.walkT+=dt*5;
    m.yaw=Math.atan2(-ux,-uz);
  }else{
    m.vel.x*=0.3;m.vel.z*=0.3;m.moving=false;
  }
  m.vel.y-=22*dt;m.vel.y=Math.max(m.vel.y,-30);
  m.onGround=false;
  mobMoveAxis(m,'x',m.vel.x*dt);
  mobMoveAxis(m,'z',m.vel.z*dt);
  mobMoveAxis(m,'y',m.vel.y*dt);
  if(dist<1.6&&m.atkT<=0&&!player.dead){
    damagePlayer(m.type==='enderman'?2:1.5,m.type==='enderman'?'被末影人打了':'被僵尸咬了');
    m.atkT=1.0;
    if(dist>0.1){player.vel.x+=dx/dist*4;player.vel.z+=dz/dist*4;player.vel.y=2.5;}
  }
  if(m.pos.y<-5){killMob(m,true);return;}
  m.group.position.copy(m.pos);
  m.group.rotation.y=m.yaw;
  const sw=Math.sin(m.walkT*8)*(m.moving?0.6:0);
  for(let l=0;l<m.legs.length;l++)m.legs[l].rotation.x=(l%2===0?sw:-sw);
  mobFlash(m,dt);
}
// ---------------- 末影龙 Boss ----------------
let dragonKilled=false,crystalsBroken=0;
function dragonMob(){return mobs.find(m=>m.type==='dragon'&&!m.dead);}
function spawnDragon(){
  if(dragonKilled||dragonMob())return;
  const m=spawnMob('dragon',16,16,46);
  m.circleA=0;
  // 6 根柱子上召唤末影水晶（不打掉水晶龙会一直回血）
  for(let k=0;k<6;k++){
    const pa=k/6*Math.PI*2+0.5;
    const px2=Math.round(Math.cos(pa)*28),pz2=Math.round(Math.sin(pa)*28);
    const ph=14+((k*7)%6);
    spawnMob('crystal',px2,pz2,30+4+ph+1.5);
  }
  $('bossbar').style.display='block';
  showToast('🐉 末影龙出现了！先打掉柱子上的末影水晶，不然它会一直回血！');
}
function crystalsAlive(){let n=0;for(const m of mobs)if(!m.dead&&m.type==='crystal')n++;return n;}
function updateBossbar(){
  const d=dragonMob();
  $('bossbar').style.display=d?'block':'none';
  if(d)$('bossfill').style.width=Math.max(0,d.hp/d.maxHp*100)+'%';
}
function updateDragon(m,dt){ // 绕岛盘旋，每隔一阵俯冲玩家；水晶没打完会慢慢回血
  m.flyT+=dt;m.atkT-=dt;
  if(m.hp<m.maxHp&&crystalsAlive()>0){
    m.hp=Math.min(m.maxHp,m.hp+1.5*dt);
    if(Math.random()<dt*2)spawnBlockParticles(m.pos.x,m.pos.y+1,m.pos.z,'rgb(255,120,235)');
  }
  if(m.diveT===undefined){m.diveT=8;m.circleA=0;m.diving=false;m.diveDur=0;}
  if(m.diving){
    m.diveDur-=dt;
    const tx=player.pos.x,ty=player.pos.y+1.2,tz=player.pos.z;
    const dx=tx-m.pos.x,dy=ty-m.pos.y,dz=tz-m.pos.z;
    const d=Math.hypot(dx,dy,dz)||1;
    m.pos.x+=dx/d*m.speed*2.0*dt;m.pos.y+=dy/d*m.speed*2.0*dt;m.pos.z+=dz/d*m.speed*2.0*dt;
    m.yaw=Math.atan2(dx,dz)+Math.PI/2;
    if(d<2.2&&m.atkT<=0&&!player.dead){
      damagePlayer(3,'被末影龙撞飞了');
      player.vel.x+=dx/d*-6;player.vel.z+=dz/d*-6;player.vel.y=4;
      m.atkT=1.2;m.diving=false;m.diveT=8;
    }
    if(m.diveDur<=0){m.diving=false;m.diveT=7+Math.random()*4;}
  }else{
    m.diveT-=dt;
    m.circleA+=dt*0.55;
    const gx=Math.cos(m.circleA)*17,gz=Math.sin(m.circleA)*17;
    const gy=46+Math.sin(m.flyT*0.8)*2;
    m.pos.x+=(gx-m.pos.x)*Math.min(1,dt*1.5);
    m.pos.y+=(gy-m.pos.y)*Math.min(1,dt*1.5);
    m.pos.z+=(gz-m.pos.z)*Math.min(1,dt*1.5);
    m.yaw=-m.circleA; // 沿着盘旋方向
    if(m.diveT<=0&&curDim==='end'&&!player.dead&&gameState==='playing'){m.diving=true;m.diveDur=3.5;}
  }
  // 扇翅膀
  const flap=Math.sin(m.flyT*6)*0.55;
  if(m.wingL)m.wingL.rotation.x=flap;
  if(m.wingR)m.wingR.rotation.x=-flap;
  m.group.position.copy(m.pos);
  m.group.rotation.y=m.yaw;
  mobFlash(m,dt);
  updateBossbar();
}
function updateMobs(dt){
  const remoteDriven=NET.roomId&&!NET.isHost; // 联机客人：mobs 由房主广播驱动
  for(let i=mobs.length-1;i>=0;i--){
    const m=mobs[i];
    if(m.dead)continue;
    if(remoteDriven){
      // 远端 mob：位置插值到房主广播目标位，动画轻量，保留"靠近会咬人"判定
      if(m.hpBar&&m.hpBar.sp.visible){m.hpShowT-=dt;if(m.hpShowT<=0)m.hpBar.sp.visible=false;}
      if(m.remote){
        m.pos.x+=(m.remote.x-m.pos.x)*Math.min(1,dt*8);
        m.pos.y+=(m.remote.y-m.pos.y)*Math.min(1,dt*8);
        m.pos.z+=(m.remote.z-m.pos.z)*Math.min(1,dt*8);
        m.group.position.copy(m.pos);
        m.group.rotation.y=m.remote.yaw;
      }
      m.flyT+=dt;m.walkT+=dt;
      const sw=Math.sin(m.walkT*8)*0.4;
      if(m.legs)for(let l=0;l<m.legs.length;l++)m.legs[l].rotation.x=(l%2===0?sw:-sw);
      if(m.wingL){const flap=Math.sin(m.flyT*6)*0.55;m.wingL.rotation.x=flap;if(m.wingR)m.wingR.rotation.x=-flap;}
      if(m.atkT>0)m.atkT-=dt;
      if(!player.dead&&(m.type==='zombie'||m.type==='enderman'||m.type==='creaking'||m.type==='golem')){
        const dx=player.pos.x-m.pos.x,dz=player.pos.z-m.pos.z;
        const dist=Math.hypot(dx,dz);
        if(dist<1.6&&m.atkT<=0){
          damagePlayer(m.type==='enderman'?2:(m.type==='golem'?4:1.5),'被'+({zombie:'僵尸',enderman:'末影人',creaking:'嘎吱怪',golem:'铁傀儡'}[m.type])+'咬了');
          m.atkT=1.0;
        }
      }
      mobFlash(m,dt);
      if(curDim==='end')updateBossbar(); // 末地显示龙血条
      continue;
    }
    if(m.hpBar&&m.hpBar.sp.visible){m.hpShowT-=dt;if(m.hpShowT<=0)m.hpBar.sp.visible=false;}
    if(m.type==='hghast'){updateGhast(m,dt);continue;}
    if(m.type==='creaking'){updateCreaking(m,dt);continue;}
    if(m.type==='zombie'||m.type==='enderman'){updateZombie(m,dt);continue;}
    if(m.type==='golem'){updateGolem(m,dt);continue;}
    if(m.type==='dragon'){updateDragon(m,dt);continue;}
    if(m.type==='crystal'){ // 末影水晶：原地旋转发光
      m.flyT+=dt;
      m.group.rotation.y+=dt*1.5;
      m.group.position.y=m.pos.y+Math.sin(m.flyT*2)*0.15;
      mobFlash(m,dt);
      continue;
    }
    m.dirT-=dt;
    if(m.dirT<=0){
      m.dirT=2+Math.random()*4;
      m.yaw=Math.random()*Math.PI*2;
      m.moving=Math.random()<0.6;
    }
    m.blocked=false;
    if(m.moving){
      const dx=-Math.sin(m.yaw)*m.speed,dz=-Math.cos(m.yaw)*m.speed;
      m.vel.x=dx;m.vel.z=dz;
      m.walkT+=dt*m.speed*2;
    }else{
      m.vel.x*=0.5;m.vel.z*=0.5;
    }
    m.vel.y-=22*dt;
    m.vel.y=Math.max(m.vel.y,-30);
    m.onGround=false;
    mobMoveAxis(m,'x',m.vel.x*dt);
    mobMoveAxis(m,'z',m.vel.z*dt);
    mobMoveAxis(m,'y',m.vel.y*dt);
    if(m.blocked){m.yaw+=Math.PI/2;m.dirT=1;}
    if(m.pos.y<-5){killMob(m,true);continue;}
    // 动画
    m.group.position.copy(m.pos);
    m.group.rotation.y=m.yaw;
    const sw=Math.sin(m.walkT*8)*(m.moving?0.5:0);
    for(let l=0;l<m.legs.length;l++)m.legs[l].rotation.x=(l%2===0?sw:-sw);
    if(m.flashT>0){
      m.flashT-=dt;
      const on=Math.floor(m.flashT*10)%2===0;
      m.group.traverse(o=>{if(o.material&&o.material.emissive)o.material.emissive.setHex(on?0x880000:0x000000);});
      if(m.flashT<=0)m.group.traverse(o=>{if(o.material&&o.material.emissive)o.material.emissive.setHex(0x000000);});
    }
  }
}
function mobRaycast(){
  const origin=new THREE.Vector3(player.pos.x,player.pos.y+PEYE,player.pos.z);
  const dir=new THREE.Vector3(
    -Math.sin(player.yaw)*Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw)*Math.cos(player.pitch)).normalize();
  const ray=new THREE.Ray(origin,dir);
  let best=null;
  for(const m of mobs){
    if(m.dead)continue;
    const box=new THREE.Box3(
      new THREE.Vector3(m.pos.x-m.w,m.pos.y,m.pos.z-m.w),
      new THREE.Vector3(m.pos.x+m.w,m.pos.y+m.h,m.pos.z+m.w));
    const hit=ray.intersectBox(box,new THREE.Vector3());
    if(hit){
      const d=hit.distanceTo(origin);
      if(d<4.3&&(!best||d<best.d))best={mob:m,d};
    }
  }
  return best;
}
// PVP：射线检测远程玩家（头像模型位置，不穿墙）
function playerRaycast(){
  const origin=new THREE.Vector3(player.pos.x,player.pos.y+PEYE,player.pos.z);
  const dir=new THREE.Vector3(
    -Math.sin(player.yaw)*Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw)*Math.cos(player.pitch)).normalize();
  const ray=new THREE.Ray(origin,dir);
  const blockD=rayBlockDist(origin.x,origin.y,origin.z,dir.x,dir.y,dir.z,4.3);
  let best=null;
  for(const id in NET.players){
    if(String(id)===String(NET.myId))continue;
    const p=NET.players[id];
    if(!p||p.dead)continue;
    const box=new THREE.Box3(
      new THREE.Vector3(p.x-0.3,p.y,p.z-0.3),
      new THREE.Vector3(p.x+0.3,p.y+1.8,p.z+0.3));
    const hit=ray.intersectBox(box,new THREE.Vector3());
    if(hit){
      const d=hit.distanceTo(origin);
      if(d<4.3&&d<blockD&&(!best||d<best.d))best={id:String(id),d};
    }
  }
  return best;
}
let attackCd=0;
// ---------------- 枪战模式（shooter）：射击/换弹/重生/计分 ----------------
let SHOOTER={score:{},target:10,winner:null,ammo:{},lastShot:0,reloading:false,reloadEnd:0,streak:0,lastKillT:0,spawnProtectT:0,reserve:{}};
let arenaLoot=false; // 枪战子模式：false=普通（开局发全套武器）/ true=捡枪（地上随机刷武器，捡到才能用）
function shooterReset(){SHOOTER={score:{},target:10,winner:null,ammo:{},lastShot:0,reloading:false,reloadEnd:0,streak:0,lastKillT:0,spawnProtectT:0,reserve:{}};
  nadeReloading=false;nadeReloadEnd=0;nadeCharging=false;
  for(const mn of mines){mobsGroup.remove(mn.body);mobsGroup.remove(mn.lamp);mobsGroup.remove(mn.pole);mobsGroup.remove(mn.flag);mobsGroup.remove(mn.ring);}mines=[];}
// 捡枪模式：武器掉落池（概率权重）+ 随机刷点 + 定时补刷（房主权威，客人靠 drop 广播同步）
const LOOT_POOL=[['pistol',28],['smg',18],['shotgun',13],['sniper',9],['missile',10],['grenade',13],['mine',9]];
function lootPick(){
  let r=Math.random()*100,acc=0;
  for(const pair of LOOT_POOL){acc+=pair[1];if(r<acc)return I[pair[0]];}
  return I.pistol;
}
function lootPointOk(x,z){
  const sy=surfaceY(x,z);
  if(sy<ARENA_GROUND)return false; // 虚空/太低
  if(getBlock(x,sy+1,z)!==0||getBlock(x,sy+2,z)!==0)return false; // 上方 2 格需空气（人站得下）
  return true;
}
function spawnArenaLoot(count){
  if(!arenaLoot||gameMode!=='shooter')return;
  if(NET.open&&NET.roomId&&!NET.isHost)return; // 只有房主刷（客人通过 t:'drop' 广播看到武器）
  let placed=0,guard=0;
  while(placed<count&&guard++<300){
    const x=Math.floor(Math.random()*52-26),z=Math.floor(Math.random()*52-26); // ±26 场景内
    if(!lootPointOk(x,z))continue;
    const id=lootPick();
    spawnDrop(x+0.5,surfaceY(x,z)+0.6,z+0.5,id,(id===I.grenade||id===I.mine?5:1));
    placed++;
  }
}
let arenaLootNextCheck=0,arenaLootLastSpawn=0;
function updateArenaLoot(dt){
  if(!arenaLoot||!started||gameMode!=='shooter')return;
  if(NET.open&&NET.roomId&&!NET.isHost)return; // 房主补刷
  const now=performance.now()/1000;
  if(now<arenaLootNextCheck)return;
  arenaLootNextCheck=now+5; // 每 5 秒检查
  if(now-arenaLootLastSpawn<12)return; // 每 12 秒最多补 1 件
  let gunCount=0;
  for(const d of drops){if(d.id===I.pistol||d.id===I.smg||d.id===I.shotgun||d.id===I.sniper||d.id===I.missile)gunCount++;}
  if(gunCount<6){spawnArenaLoot(1);arenaLootLastSpawn=now;} // 场上少于 6 把枪就补
}
function gunClip(gunId){return SHOOTER.ammo[gunId]!==undefined?SHOOTER.ammo[gunId]:ITEMS[gunId].gun.clip;}
function gunSetClip(gunId,v){SHOOTER.ammo[gunId]=v;}
function reloadGun(){ // R 换弹（或弹空自动）
  const held=heldItemId();const it=held?ITEMS[held]:null;
  if(!it||(it.type!=='gun'&&it.type!=='missile'))return;
  const g=it.gun,now=performance.now()/1000;
  if(SHOOTER.reloading&&now<SHOOTER.reloadEnd)return;
  if(gunClip(held)>=g.clip)return;
  if(arenaLoot&&(it.type==='gun'||it.type==='missile')&&(SHOOTER.reserve[held]||0)<=0){ // 捡枪模式：无备弹不换弹（弹夹空即停火，枪/导弹打空即消失）
    if(gunClip(held)<=0)removeGunFromHot(held); // 弹夹+备弹全空 -> 枪用完消失
    else showToast('⛔ 没有备弹了！');
    return;
  }
  SHOOTER.reloading=true;SHOOTER.reloadEnd=now+g.reload;
  sfx.reload&&sfx.reload();
  showToast('🔄 换弹中…');
}
// 捡枪模式：枪用完（弹夹空+备弹空）从背包移除
function removeGunFromHot(gunId){
  const idx=inv.hot.findIndex(s=>s&&s.id===gunId);
  if(idx>=0){
    const name=ITEMS[gunId]?ITEMS[gunId].name:'武器';
    inv.hot[idx]=null;
    if(player.sel===idx)player.sel=Math.max(0,idx-1);
    if(typeof updateHotbar==='function')updateHotbar();
    updateGunHud();
    showToast('🔫 '+name+' 打光了，从背包里消失了');
  }
}
// 捡枪模式：拾取枪/导弹时标记为无备弹（一个弹夹打空就消失）
function gunReserveInit(id){
  if(arenaLoot&&ITEMS[id]&&(ITEMS[id].type==='gun'||ITEMS[id].type==='missile')){
    if(!SHOOTER.reserve)SHOOTER.reserve={};
    SHOOTER.reserve[id]=0;
  }
}
// 体素 DDA：沿射线找最近实心方块的距离（子弹不能穿墙）
function rayBlockDist(ox,oy,oz,dx,dy,dz,maxDist){
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const stepX=dx>0?1:-1,stepY=dy>0?1:-1,stepZ=dz>0?1:-1;
  const tDeltaX=dx!==0?Math.abs(1/dx):Infinity;
  const tDeltaY=dy!==0?Math.abs(1/dy):Infinity;
  const tDeltaZ=dz!==0?Math.abs(1/dz):Infinity;
  let tMaxX=dx!==0?((dx>0?(x+1-ox):(ox-x))*tDeltaX):Infinity;
  let tMaxY=dy!==0?((dy>0?(y+1-oy):(oy-y))*tDeltaY):Infinity;
  let tMaxZ=dz!==0?((dz>0?(z+1-oz):(oz-z))*tDeltaZ):Infinity;
  let t=0;
  let guard=0;
  while(t<=maxDist&&guard<128){
    guard++;
    if(t>0.001){
      const b=getBlock(x,y,z);
      if(b!==0&&BLOCKS[b]&&BLOCKS[b].solid)return t; // 实心方块阻挡
    }
    if(tMaxX<tMaxY&&tMaxX<tMaxZ){x+=stepX;t=tMaxX;tMaxX+=tDeltaX;}
    else if(tMaxY<tMaxZ){y+=stepY;t=tMaxY;tMaxY+=tDeltaY;}
    else{z+=stepZ;t=tMaxZ;tMaxZ+=tDeltaZ;}
  }
  return Infinity;
}
// 自定义朝向射线（枪战射击用，含散布；被实心方块阻挡；支持爆头）
function shootRayAt(yaw,pitch,range){
  const origin=new THREE.Vector3(player.pos.x,player.pos.y+PEYE,player.pos.z);
  const dir=new THREE.Vector3(
    -Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).normalize();
  const ray=new THREE.Ray(origin,dir);
  // 方块遮挡：子弹打中墙就不再穿透
  const blockD=rayBlockDist(origin.x,origin.y,origin.z,dir.x,dir.y,dir.z,range);
  let best=null;
  for(const id in NET.players){
    if(String(id)===String(NET.myId))continue;
    const p=NET.players[id];
    if(!p||p.dead)continue;
    // 头部盒优先（y 1.25~1.8 区域）-> 爆头
    const headBox=new THREE.Box3(
      new THREE.Vector3(p.x-0.22,p.y+1.25,p.z-0.22),
      new THREE.Vector3(p.x+0.22,p.y+1.8,p.z+0.22));
    const hh=ray.intersectBox(headBox,new THREE.Vector3());
    if(hh){
      const hd=hh.distanceTo(origin);
      if(hd<range&&hd<blockD&&(!best||hd<best.d)){best={id:String(id),d:hd,hs:true};continue;}
    }
    const box=new THREE.Box3(
      new THREE.Vector3(p.x-0.3,p.y,p.z-0.3),
      new THREE.Vector3(p.x+0.3,p.y+1.8,p.z+0.3));
    const hit=ray.intersectBox(box,new THREE.Vector3());
    if(hit){
      const d=hit.distanceTo(origin);
      if(d<range&&d<blockD&&(!best||d<best.d))best={id:String(id),d};
    }
  }
  if(best)return best;
  // 未命中玩家：若子弹在射程内被墙/地挡住，返回命中点（用于 miss 火花）
  if(blockD<range)return {block:true,d:blockD,x:origin.x+dir.x*blockD,y:origin.y+dir.y*blockD,z:origin.z+dir.z*blockD};
  return null;
}
// 子弹 miss 火花：打中墙/地时黄色火星弹溅 + 少量灰烟
function spawnMissSpark(x,y,z){
  for(let i=0;i<10;i++){
    const m=new THREE.Mesh(particleGeo,new THREE.MeshLambertMaterial({color:new THREE.Color(i%2?'rgb(255,230,140)':'rgb(255,170,60)')}));
    m.position.set(x,y,z);
    particles.push({m,vx:(Math.random()-0.5)*5,vy:Math.random()*4+1.5,vz:(Math.random()-0.5)*5,life:0.25+Math.random()*0.2});
    particlesGroup.add(m);
  }
  for(let i=0;i<3;i++){
    const m=new THREE.Mesh(particleGeo,new THREE.MeshLambertMaterial({color:new THREE.Color('rgb(120,120,120)')}));
    m.position.set(x,y,z);
    particles.push({m,vx:(Math.random()-0.5)*1.5,vy:Math.random()*1+0.5,vz:(Math.random()-0.5)*1.5,life:0.4+Math.random()*0.2});
    particlesGroup.add(m);
  }
}
function tryShootGun(){
  const held=heldItemId();const it=held?ITEMS[held]:null;
  if(!it)return false;
  if(it.type==='missile')return fireMissile(); // 追踪导弹：发射飞行弹体
  if(it.type!=='gun')return false;
  if(player.dead)return true;
  const g=it.gun,now=performance.now()/1000;
  if(SHOOTER.reloading&&now<SHOOTER.reloadEnd){showToast('🔄 换弹中…');return true;}
  SHOOTER.reloading=false;
  if(now-SHOOTER.lastShot<g.cd)return true;
  let clip=gunClip(held);
  if(clip<=0){reloadGun();return true;}
  SHOOTER.lastShot=now;gunSetClip(held,--clip);
  if(clip<=0)reloadGun(); // 弹夹打空：立即自动开始换弹（无需再按左键）
  sfx.gun();
  if(typeof handRecoilPulse==='function')handRecoilPulse(); // 手持武器后坐
  // 枪口粒子
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  spawnBlockParticles(player.pos.x+fx*0.8,player.pos.y+PEYE,player.pos.z+fz*0.8,'rgb(255,210,100)');
  // 弹丸（霰弹多颗）
  const pellets=g.pellets||1;
  let shotHx=null,shotHy=null,shotHz=null;
  for(let i=0;i<pellets;i++){
    const yaw=player.yaw+(Math.random()-0.5)*g.spread*2;
    const pitch=player.pitch+(Math.random()-0.5)*g.spread*2;
    const hit=shootRayAt(yaw,pitch,g.range);
    if(shotHx===null&&hit){
      if(hit.block){shotHx=hit.x;shotHy=hit.y;shotHz=hit.z;}
      else if(hit.id&&NET.players[hit.id]){shotHx=NET.players[hit.id].x;shotHy=NET.players[hit.id].y+0.9;shotHz=NET.players[hit.id].z;}
    }
    if(hit&&hit.block){
      // 子弹打中墙/地：miss 火花（本地显示即可）
      spawnMissSpark(hit.x,hit.y,hit.z);
    }else if(hit&&NET.open&&NET.roomId){
      const hs=!!hit.hs;
      const dmg=Math.round(g.dmg*(hs?2:1)); // 爆头 2 倍
      netBroadcast({t:'pvphit',target:hit.id,dmg,x:player.pos.x,y:player.pos.y,z:player.pos.z,attacker:NET.myName,aid:NET.myId,gun:true,hs,wn:it.name});
      sfx.hit();
      const tp=NET.players[hit.id];
      // 红色血粒子：命中目标身上喷血（朝攻击反方向飞溅；爆头更浓）
      if(tp){
        spawnBlood(tp.x,tp.y+1,tp.z,-Math.sin(yaw),-Math.cos(yaw));
        if(hs)spawnBlood(tp.x,tp.y+1.5,tp.z,-Math.sin(yaw),-Math.cos(yaw));
        showDmgNumber(tp.x,tp.y+(hs?1.55:1.3),tp.z,dmg,hs); // 伤害飘字
      }
    }
  }
  // 广播开枪事件：对端显示枪口火光 + 弹道线（视觉同步）
  if(NET.open&&NET.roomId)netBroadcast({t:'shoot',x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,pitch:player.pitch,hx:shotHx,hy:shotHy,hz:shotHz});
  updateGunHud();
  return true;
}
function shooterRespawn(){
  player.dead=false;player.hp=player.maxHp;player.vel.set(0,0,0);
  const sc=curArenaScene().spawns;const sp=sc[(Math.random()*sc.length)|0];
  player.pos.set(sp[0]+0.5,surfaceY(sp[0],sp[1])+1.01,sp[1]+0.5); // 出生高度按地表动态算（山坡场景不会卡进石头）
  player.peakY=player.pos.y;player.mounted=null;
  if(arenaLoot){
    // 捡枪模式：死亡重生 = 武器全掉光（徒手），重新去地上捡
    inv.hot=[null,null,null,null,null,null,null,{id:4,count:200},null];
    SHOOTER.reserve={}; // 武器都没了，备弹池清空
    player.sel=0;
    updateHotbar();
    showToast('💀 你掉光了武器！去地上捡枪再战');
  }else{
    for(const k in SHOOTER.ammo)delete SHOOTER.ammo[k]; // 补满弹
    if(inv.hot[7]&&inv.hot[7].id===4)inv.hot[7].count=200; // 补满掩体方块
  }
  SHOOTER.reloading=false;
  SHOOTER.spawnProtectT=3; // 出生保护 3 秒
  updateHearts();hide('death');
  const sh=$('spawnShield');if(sh)sh.style.display='block';
  if(NET.open&&NET.roomId)netBroadcast({t:'pvpdead',target:NET.myId,alive:true}); // 队友视角：头像恢复
  if(!isTouch)lockPointer();
  updateGunHud();
}
// 击杀横幅（连杀提示）
let bannerTimer=null;
function showKillBanner(text,color){
  const el=$('killBanner');if(!el)return;
  el.textContent=text;
  el.style.color=color||'#ffd24a';
  el.style.display='block';
  if(bannerTimer)clearTimeout(bannerTimer);
  bannerTimer=setTimeout(()=>{el.style.display='none';},1300);
}
function streakName(n){return ['','','⚡ 双杀！','🔥 三杀！','💥 四杀！','🌟 五杀！','👑 大杀特杀！'][Math.min(n,6)]||'👑 大杀特杀！';}
function streakColor(n){return n>=5?'#ff9a3a':(n>=3?'#ffd24a':'#8ad4ff');}
// 击杀里程碑：每到 10 的倍数喊"厉害的话"
function milestoneMsg(n){
  const m={
    10:'🔱 10 杀！势不可挡！',20:'👑 20 杀！战神降临！',30:'💀 30 杀！人间兵器！',
    40:'🔥 40 杀！杀神觉醒！',50:'☠️ 50 杀！终极杀戮机器！',60:'⚡ 60 杀！死神来了！',
    70:'🌋 70 杀！毁灭者！',80:'👹 80 杀！恶魔降世！',90:'☄️ 90 杀！传说降临！',
    100:'🏆 100 杀！杀戮之神！'
  };
  return m[n]||('⚔️ '+n+' 杀！无人能挡！');
}
// 伤害数字飘字（3D 位置投影到屏幕）
function showDmgNumber(x,y,z,dmg,hs){
  const el=$('dmgLayer');if(!el||!camera)return;
  const v=new THREE.Vector3(x,y,z).project(camera);
  if(v.z>1||v.z<-1)return;
  const sx=(v.x*0.5+0.5)*window.innerWidth;
  const sy=(-v.y*0.5+0.5)*window.innerHeight;
  const d=document.createElement('div');
  d.textContent='-'+dmg;
  d.style.cssText='position:absolute;left:'+sx+'px;top:'+sy+'px;transform:translate(-50%,-50%);font-size:'+(hs?28:20)+'px;font-weight:bold;color:'+(hs?'#ff4040':'#fff')+';text-shadow:1px 1px 2px #000;pointer-events:none;transition:all .8s ease-out;opacity:1;font-family:Consolas,monospace';
  el.appendChild(d);
  requestAnimationFrame(()=>{d.style.transform='translate(-50%,-180%)';d.style.opacity=0;});
  setTimeout(()=>d.remove(),900);
}
// 击杀处理：k=killer id, v=victim id, wn=武器名（名字用于显示）
function shooterKill(k,v,kn,vn,wn){
  const me=String(NET.myId);
  const k2=String(k),v2=String(v);
  // 自杀（被自己的手榴弹/地雷等炸死）：不计入击杀榜，只显示死亡原因（说明是什么导致的自杀）
  if(k2===v2){
    if(v2===me){
      const selfMsg='💀 你被自己的'+(wn||'武器')+'炸死了';
      showKillBanner(selfMsg,'#ff6a6a');
      showToast(selfMsg);
    }
    updateGunHud();
    if(typeof renderScoreBoard==='function')renderScoreBoard();
    return; // 自杀不改变任何人的击杀数
  }
  SHOOTER.score[k]=(SHOOTER.score[k]||0)+1;
  const total=SHOOTER.score[k]; // 累计击杀数（无上限，无限击杀）
  const wTxt=wn?('用'+wn+' '):'';
  const isMilestone=total>0&&total%10===0; // 每到 10 的倍数：喊厉害的话
  if(isMilestone){
    const msg=milestoneMsg(total);
    const who=esc(kn||('玩家'+k));
    if(k2===me)showKillBanner('🌟 '+msg,'#ffd24a');
    else showKillBanner('🏆 '+who+' '+msg,'#ffd24a');
  }
  if(k2===me){
    // 连杀判定：5 秒内再次击杀
    const now=performance.now()/1000;
    SHOOTER.streak=(now-SHOOTER.lastKillT<5)?SHOOTER.streak+1:1;
    SHOOTER.lastKillT=now;
    if(!isMilestone){ // 里程碑时大横幅已喊话，击杀横幅让位（toast 仍完整）
      if(SHOOTER.streak>=2){
        // 连杀：大字横幅带击杀总数（双杀/三杀… (N 杀)）
        showKillBanner(streakName(SHOOTER.streak)+' ('+total+' 杀)',streakColor(SHOOTER.streak));
      }else{
        // 单杀也弹横幅，击杀数一目了然
        showKillBanner('🔫 '+wTxt+'击杀 '+esc(vn||'对手')+'！ ('+total+' 杀)','#8ad4ff');
      }
    }
    showToast('🔫 你'+wTxt+'击杀了 '+esc(vn||'对手')+'！('+total+' 杀)');
  }
  else if(v2===me){
    // 自己被击杀：中央大字红色横幅（和击杀者横幅同级醒目）+ toast 兜底
    const deadMsg='💀 你被 '+esc(kn||'对手')+' '+wTxt+'击杀了';
    showKillBanner(deadMsg,'#ff6a6a');
    showToast(deadMsg);
  }
  updateGunHud();
  if(typeof renderScoreBoard==='function')renderScoreBoard(); // 刷新左上角击杀榜
}
function updateGunHud(){
  const el=$('gunHud');if(!el)return;
  if(gameMode!=='shooter'){el.style.display='none';return;}
  el.style.display='block';
  const held=heldItemId();const it=held?ITEMS[held]:null;
  if(it&&(it.type==='gun'||it.type==='missile')){
    const g=it.gun,clip=gunClip(held),now=performance.now()/1000;
    const reloading=SHOOTER.reloading&&now<SHOOTER.reloadEnd;
    $('gunName').textContent=it.name;
    if(arenaLoot&&(it.type==='gun'||it.type==='missile')){
      // 捡枪模式：无备弹（一个弹夹打空就消失）
      const rv=SHOOTER.reserve[held]||0;
      $('gunAmmo').textContent=reloading?'换弹中…':(clip+' / '+(rv>0?rv+' 备':'无备弹'));
      $('gunAmmo').style.color=reloading?'#ffd75e':(clip===0?'#f66':'#fff');
    }else{
      $('gunAmmo').textContent=reloading?'换弹中…':(clip+' / '+g.clip);
      $('gunAmmo').style.color=reloading?'#ffd75e':(clip===0?'#f66':'#fff');
    }
  }else{
    $('gunName').textContent=arenaLoot?'🎒 捡武器':'徒手';
    $('gunAmmo').textContent=arenaLoot?'走近地上的发光物品':'';
  }
  // 计分板
  const sc=SHOOTER.score,me=String(NET.myId);
  const rows=['⚔️ 无限击杀']; // 击杀无上限，杀到天荒地老
  for(const id in NET.players){
    const p=NET.players[id];
    const n=(id===me?'你':(p?p.name:('玩家'+id)));
    rows.push('<span class="'+(id===me?'gself':'')+'">'+esc(n)+': '+(sc[id]||0)+'</span>');
  }
  if(!NET.open)rows.push('<span>我: '+(sc[me]||0)+'</span>');
  $('gunBoard').innerHTML=rows.join('<br>');
}
// 初始化枪战：发枪 + 出生点（keepInv=true 时捡枪模式保留已捡武器——存档恢复用）
function shooterInit(keepInv){
  shooterReset();
  if(arenaLoot){
    // 捡枪模式：徒手开局（只留第7格掩体圆石），武器全部在地上随机刷
    if(!keepInv)inv.hot=[null,null,null,null,null,null,null,{id:4,count:200},null];
    inv.store=new Array(27).fill(null);inv.armor=new Array(4).fill(null);inv.craft2=new Array(4).fill(null);inv.craft3=new Array(9).fill(null);cursor=null;
    player.sel=0;
    const sc2=curArenaScene().spawns;const sp2=sc2[(Math.random()*sc2.length)|0];
    player.pos.set(sp2[0]+0.5,surfaceY(sp2[0],sp2[1])+1.01,sp2[1]+0.5);
    player.vel.set(0,0,0);player.peakY=player.pos.y;player.hp=player.maxHp;player.dead=false;
    updateHotbar();updateHearts();
    updateGunHud();
    spawnArenaLoot(10); // 场上先刷 10 件武器/道具（联机：房主刷，客人收广播）
    if(typeof renderScoreBoard==='function')renderScoreBoard();
    showToast('🎒 捡枪模式：地上随机刷了武器，走过去捡起来（1-6 切换）！');
    return;
  }
  inv.hot=[{id:I.pistol,count:1},{id:I.smg,count:1},{id:I.shotgun,count:1},{id:I.sniper,count:1},{id:I.grenade,count:5},{id:I.missile,count:1},{id:I.mine,count:999},{id:4,count:200},null]; // 第8格=掩体方块（圆石×200）
  inv.store=new Array(27).fill(null);inv.armor=new Array(4).fill(null);inv.craft2=new Array(4).fill(null);inv.craft3=new Array(9).fill(null);cursor=null;
  player.sel=0;
  const sc=curArenaScene().spawns;const sp=sc[(Math.random()*sc.length)|0];
  player.pos.set(sp[0]+0.5,surfaceY(sp[0],sp[1])+1.01,sp[1]+0.5); // 出生高度按地表动态算（山坡场景不会卡进石头）
  player.vel.set(0,0,0);player.peakY=player.pos.y;player.hp=player.maxHp;player.dead=false;
  updateHotbar();updateHearts();
  updateGunHud();
  if(typeof renderScoreBoard==='function')renderScoreBoard(); // 进入枪战：显示左上角击杀榜
}
// ---------------- 手榴弹（投掷 + 引信爆炸 + 范围伤害） ----------------
const grenadeGeo=new THREE.BoxGeometry(0.3,0.3,0.3);
const grenadeFuseGeo=new THREE.SphereGeometry(0.06,6,6);
let grenades=[],nextNadeId=1,nadeCdT=0;
let nadeReloading=false,nadeReloadEnd=0; // 手榴弹数量用完 -> 自动装填（4s 补满）
const GRENADE_FUSE=1.4,GRENADE_RADIUS=5,GRENADE_DMG=20; // 中心 20：贴身可秒满血
function spawnGrenade(nid,x,y,z,vx,vy,vz,remote,aid,an){
  const mat=new THREE.MeshLambertMaterial({color:0x4a7a3a});
  const m=new THREE.Mesh(grenadeGeo,mat);
  // 红色引信闪点（引信燃烧中，落地后持续闪烁定位）
  const fuse=new THREE.Mesh(grenadeFuseGeo,new THREE.MeshBasicMaterial({color:0xff3030}));
  fuse.position.set(0,0.18,0);
  m.add(fuse);
  m.position.set(x,y,z);
  mobsGroup.add(m);
  grenades.push({m,fuse,nid,pos:new THREE.Vector3(x,y,z),vel:new THREE.Vector3(vx,vy,vz),
    life:GRENADE_FUSE,bounced:false,remote:!!remote,aid:aid||null,an:an||''});
}
function throwGrenade(power){ // G 键长按蓄力 / 右键按住蓄力投掷（shooter 模式；普通模式 5 颗自动装填，捡枪模式 5 颗用完消失）
  if(gameMode!=='shooter'||player.dead)return;
  const now=performance.now()/1000;
  const slot=inv.hot.find(s=>s&&s.id===I.grenade); // 按 id 查找（捡枪模式手榴弹不固定槽位）
  if(!slot||slot.count<=0){showToast(arenaLoot?'⛔ 没有手榴弹了！':'🔄 手榴弹自动装填中…');return;}
  if(nadeReloading){showToast('🔄 手榴弹自动装填中…');return;}
  nadeCdT=now;
  // 沿视线方向（含俯仰 pitch）投掷：朝上看天扔得高，朝下扔近且落地快
  const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch);
  const dx=-Math.sin(player.yaw)*cp,dy=sp,dz=-Math.cos(player.yaw)*cp;
  const pwr=power===undefined?1:clamp(power,0,1); // 蓄力 0~1（直接调用默认满力）
  const SPEED=6+pwr*14; // 最小力 6，满力 20
  const x=player.pos.x+dx*0.6,y=player.pos.y+PEYE,z=player.pos.z+dz*0.6;
  const nid=NET.myId+'_'+(nextNadeId++); // id 带发送者前缀，避免两端各自从 1 计数冲突
  spawnGrenade(nid,x,y,z,dx*SPEED,dy*SPEED+2,dz*SPEED,false,NET.myId,NET.myName); // +2 保持自然上抛弧度
  sfx.throwNade&&sfx.throwNade();
  if(typeof handRecoilPulse==='function')handRecoilPulse(); // 投掷后坐
  showToast('💣 手榴弹！'+(pwr<0.99?'（蓄力 '+Math.round(pwr*100)+'%）':''));
  if(NET.open&&NET.roomId)netBroadcast({t:'nade',id:nid,x,y,z,vx:dx*SPEED,vy:dy*SPEED+2,vz:dz*SPEED,aid:NET.myId,an:NET.myName});
  // 消耗一颗手榴弹：普通模式扔完自动装填（4s 后补满）；捡枪模式用完直接消失
  slot.count--;
  if(typeof updateHotbar==='function')updateHotbar();
  if(slot.count<=0){
    if(arenaLoot){
      removeInvItemFromHot(I.grenade); // 捡枪模式：5 颗扔完 -> 从背包消失
    }else{
      nadeReloading=true;nadeReloadEnd=now+4;
      showToast('🔄 手榴弹用完了，自动装填中…（4s）');
    }
  }
}
// 通用：从快捷栏移除用完的物品（捡枪模式武器/手榴弹/地雷打光消失）
function removeInvItemFromHot(itemId){
  const idx=inv.hot.findIndex(s=>s&&s.id===itemId);
  if(idx>=0){
    const name=ITEMS[itemId]?ITEMS[itemId].name:'物品';
    inv.hot[idx]=null;
    if(player.sel===idx)player.sel=Math.max(0,idx-1);
    if(typeof updateHotbar==='function')updateHotbar();
    updateGunHud();
    showToast('💥 '+name+' 用完了，从背包里消失了');
  }
}
// ---------------- 手榴弹蓄力（按住蓄力，松手投掷，1 秒充满） ----------------
let nadeCharging=false,nadeChargeT=0,nadeChargeAmt=0;
const NADE_CHARGE_TIME=1.0;
function startNadeCharge(){
  if(gameMode!=='shooter'||player.dead||NET_APPLYING)return;
  const slot=inv.hot.find(s=>s&&s.id===I.grenade); // 按 id 查找（捡枪模式不固定槽位）
  if(!slot||slot.count<=0||nadeReloading){showToast(arenaLoot?'⛔ 没有手榴弹了！':'🔄 手榴弹自动装填中…');return;}
  const now=performance.now()/1000;
  if(nadeCharging)return;
  nadeCharging=true;nadeChargeT=now;nadeChargeAmt=0;
  const bar=$('nadeCharge');
  if(bar){bar.style.display='block';bar.style.width='0%';}
}
function releaseNadeCharge(){
  if(!nadeCharging)return;
  nadeCharging=false;
  const bar=$('nadeCharge');
  if(bar)bar.style.display='none';
  if(gameMode!=='shooter'||player.dead)return;
  throwGrenade(nadeChargeAmt);
}
function updateNadeCharge(dt){
  if(!nadeCharging)return;
  nadeChargeAmt=Math.min(1,(performance.now()/1000-nadeChargeT)/NADE_CHARGE_TIME);
  const bar=$('nadeCharge');
  if(bar){
    bar.style.width=Math.round(nadeChargeAmt*100)+'%';
    bar.style.background='linear-gradient(90deg,#8a3a3a,'+(nadeChargeAmt>=1?'#ffd24a':'#ff6a3a')+')';
    if(nadeChargeAmt>=1){releaseNadeCharge();} // 蓄满自动投掷
  }
}
function explodeGrenade(x,y,z,aid,an){
  // 爆炸视觉：火焰 + 烟 + 尘土
  spawnBlockParticles(x,y+0.5,z,'rgb(255,160,40)');
  spawnBlockParticles(x,y+0.5,z,'rgb(255,220,100)');
  spawnBlockParticles(x,y+1,z,'rgb(140,120,100)');
  spawnBlockParticles(x,y+1.2,z,'rgb(90,90,90)');
  sfx.boom();
  // 冲击波：推开范围内玩家（本地自己）
  const dx=player.pos.x-x,dz=player.pos.z-z;
  const dist=Math.hypot(dx,dz);
  if(dist<GRENADE_RADIUS+1&&dist>0.1){
    player.vel.x+=dx/dist*10;player.vel.z+=dz/dist*10;
  }
  // 伤害结算（各端只结算自己，防双端重复）
  if(dist<GRENADE_RADIUS){
    const dmg=Math.max(2,Math.round(GRENADE_DMG*(1-dist/GRENADE_RADIUS)));
    if(String(NET.myId)!==String(aid)){ // 非投掷者被炸
      damagePlayer(dmg,{aid,attacker:an||'',wn:'手榴弹',text:'💥 被 '+(an||'手榴弹')+' 用手榴弹炸死了'});
    }else if(dist<1.8){ // 投掷者自己距离太近也受伤（自爆）
      damagePlayer(Math.max(4,Math.round(dmg*0.6)),{aid,attacker:an||'',wn:'手榴弹',text:'💥 被自己的手榴弹炸了'});
    }
  }
}
function updateGrenades(dt){
  for(let i=grenades.length-1;i>=0;i--){
    const g=grenades[i];
    g.life-=dt;
    const px=g.pos.x,py=g.pos.y,pz=g.pos.z; // 碰撞回退用
    g.vel.y-=22*dt;g.vel.y=Math.max(g.vel.y,-30);
    g.pos.x+=g.vel.x*dt;g.pos.y+=g.vel.y*dt;g.pos.z+=g.vel.z*dt;
    // 竞技场边界反弹（防止越墙掉虚空钻地）
    if(gameMode==='shooter'&&typeof ARENA_HALF==='number'){
      const L=ARENA_HALF-0.5;
      if(g.pos.x>L){g.pos.x=L;g.vel.x=-Math.abs(g.vel.x)*0.6;}
      else if(g.pos.x<-L){g.pos.x=-L;g.vel.x=Math.abs(g.vel.x)*0.6;}
      if(g.pos.z>L){g.pos.z=L;g.vel.z=-Math.abs(g.vel.z)*0.6;}
      else if(g.pos.z<-L){g.pos.z=-L;g.vel.z=Math.abs(g.vel.z)*0.6;}
    }
    // 实心方块碰撞：手榴弹不能穿墙，碰到墙体反弹（逐轴体素检测，半径 0.15）
    const R=0.15;
    const solidAt=(x,y,z)=>{const b=getBlock(Math.floor(x),Math.floor(y),Math.floor(z));return b!==B_AIR&&BLOCKS[b]&&BLOCKS[b].solid;};
    if(g.vel.x!==0){
      const sx=Math.sign(g.vel.x);
      if(solidAt(g.pos.x+sx*R,g.pos.y,g.pos.z)||solidAt(g.pos.x+sx*R,g.pos.y+0.25,g.pos.z)||solidAt(g.pos.x+sx*R,g.pos.y+0.05,g.pos.z)){
        g.pos.x=px;g.vel.x*=-0.5;
      }
    }
    if(g.vel.y!==0){
      const sy=Math.sign(g.vel.y);
      if(solidAt(g.pos.x,g.pos.y+sy*R,g.pos.z)||solidAt(g.pos.x+0.1,g.pos.y+sy*R,g.pos.z)||solidAt(g.pos.x-0.1,g.pos.y+sy*R,g.pos.z)){
        g.pos.y=py;g.vel.y*=-0.5;
      }
    }
    if(g.vel.z!==0){
      const sz=Math.sign(g.vel.z);
      if(solidAt(g.pos.x,g.pos.y,g.pos.z+sz*R)||solidAt(g.pos.x,g.pos.y+0.25,g.pos.z+sz*R)||solidAt(g.pos.x,g.pos.y+0.05,g.pos.z+sz*R)){
        g.pos.z=pz;g.vel.z*=-0.5;
      }
    }
    // 落地弹跳一次（竞技场/世界通用；两端一致，对端影子也可见落点）
    const gy=surfaceY(Math.floor(g.pos.x),Math.floor(g.pos.z))+0.16; // 浮高一点，落地清晰可见
    if(g.pos.y<=gy&&g.vel.y<=0){
      g.pos.y=gy;
      if(!g.bounced){g.bounced=true;g.vel.y=Math.abs(g.vel.y)*0.4;g.vel.x*=0.5;g.vel.z*=0.5;}
      else{g.vel.y=0;g.vel.x=0;g.vel.z=0;}
    }
    // 引信燃烧动画：红点脉冲闪烁（定位手榴弹；无灰烟）
    if(g.fuse)g.fuse.scale.setScalar(0.8+0.5*Math.sin(performance.now()/90));
    g.m.position.copy(g.pos);
    if(g.life<=0){
      mobsGroup.remove(g.m);grenades.splice(i,1);
      if(g.remote){ // 影子端：等 boom 渲染（若 boom 丢失，静默消失即可）
        continue;
      }
      // 投掷端：广播爆炸（对端收到后渲染+结算）
      explodeGrenade(g.pos.x,g.pos.y,g.pos.z,g.aid,g.an);
      if(NET.open&&NET.roomId)netBroadcast({t:'boom',id:g.nid,x:g.pos.x,y:g.pos.y,z:g.pos.z,aid:g.aid,an:g.an});
    }
  }
}
// ---------------- 地雷（放置后踩中爆炸） ----------------
const mineGeo=new THREE.CylinderGeometry(0.28,0.34,0.12,10);
const mineLampGeo=new THREE.SphereGeometry(0.07,6,6);
// 自己的雷可见标记：小红旗（旗杆 + 红旗面，飘动动画）+ 地面红光环（辅助定位）
const minePoleGeo=new THREE.CylinderGeometry(0.045,0.045,1.4,6);
const mineFlagGeo=new THREE.PlaneGeometry(0.7,0.42);
const mineRingGeo=new THREE.RingGeometry(0.35,0.55,24);
let mines=[],nextMineId=1,mineCdT=0;
const MINE_MAX=10,MINE_TRIGGER=0.6,MINE_ARM=0.8; // 每人最多 10 颗；触发半径 0.6；0.8s 布设延迟
function spawnMine(mid,x,z,aid,an){
  const body=new THREE.Mesh(mineGeo,new THREE.MeshLambertMaterial({color:0x3a5a2a}));
  const lamp=new THREE.Mesh(mineLampGeo,new THREE.MeshLambertMaterial({color:0xb03030}));
  // 小红旗：深色旗杆（与浅背景对比明显）+ 红色旗面（挂在旗杆顶，带一点前倾）+ 地面光环
  const pole=new THREE.Mesh(minePoleGeo,new THREE.MeshLambertMaterial({color:0x2a2a2a}));
  const flagMat=new THREE.MeshBasicMaterial({color:0xff3030,transparent:true,opacity:0.95,depthWrite:false,side:THREE.DoubleSide});
  const flag=new THREE.Mesh(mineFlagGeo,flagMat);
  const ringMat=new THREE.MeshBasicMaterial({color:0xff3030,transparent:true,opacity:0.5,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(mineRingGeo,ringMat);
  const gy=surfaceY(Math.floor(x),Math.floor(z))+0.12;
  body.position.set(x+0.5,gy+0.06,z+0.5);
  lamp.position.set(x+0.5,gy+0.13,z+0.5);
  pole.position.set(x+0.5,gy+0.7,z+0.5); // 旗杆：地面 → 1.4 格高
  flag.position.set(x+0.5,gy+1.3,z+0.42); // 旗面在旗杆顶端偏前
  flag.rotation.y=-Math.PI/2; // 平面朝 Z 方向
  flag.rotation.z=-0.25; // 轻微前倾，更像飘旗
  ring.rotation.x=-Math.PI/2; // 平贴地面
  ring.position.set(x+0.5,gy+0.15,z+0.5);
  // 隐形地雷：只有放置者自己能看见，其他人（含联机对端）完全看不见
  const visible=String(aid||'')===String(NET.myId);
  body.visible=visible;lamp.visible=visible;pole.visible=visible;flag.visible=visible;ring.visible=visible;
  mobsGroup.add(body);mobsGroup.add(lamp);mobsGroup.add(pole);mobsGroup.add(flag);mobsGroup.add(ring);
  mines.push({mid,body,lamp,pole,flag,ring,flagMat,ringMat,pos:new THREE.Vector3(x+0.5,gy+0.06,z+0.5),aid:aid||null,an:an||'',armed:false,armedT:0,t:0});
}
function placeMine(){ // 手持地雷右键放置（shooter 模式；普通模式无限颗，捡枪模式 5 颗用完消失）
  if(gameMode!=='shooter'||player.dead)return;
  const now=performance.now()/1000;
  if(now-mineCdT<1){showToast('🔄 地雷装填中…');return;} // 1s 放置间隔
  const slot=inv.hot[player.sel];
  if(!slot||slot.id!==I.mine){showToast('⛔ 请先选中地雷（数字键 7）');return;}
  const myCount=mines.filter(m=>m.aid===NET.myId).length; // 每人各自上限
  if(myCount>=MINE_MAX){showToast('⛔ 地雷满了（每人最多 '+MINE_MAX+' 颗）');return;}
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  const mx=Math.floor(player.pos.x+fx),mz=Math.floor(player.pos.z+fz);
  const gy=surfaceY(mx,mz);
  if(gy<ARENA_GROUND-1||getBlock(mx,gy+1,mz)!==0){showToast('⛔ 这里不能放地雷');return;}
  mineCdT=now; // 1s 放置间隔
  const mid=NET.myId+'_'+(nextMineId++); // id 带发送者前缀，避免两端各自从 1 计数导致冲突
  spawnMine(mid,mx,mz,NET.myId,NET.myName);
  sfx.throwNade&&sfx.throwNade();
  showToast('💣 地雷已埋下（对方看不见）');
  if(NET.open&&NET.roomId)netBroadcast({t:'mine',id:mid,x:mx,z:mz,aid:NET.myId,an:NET.myName});
  if(arenaLoot){ // 捡枪模式：每放一颗消耗库存，5 颗放完 -> 从背包消失
    slot.count--;
    if(typeof updateHotbar==='function')updateHotbar();
    if(slot.count<=0)removeInvItemFromHot(I.mine);
  }
}
function explodeMine(x,y,z,aid,an){
  // 地雷爆炸：粒子 + 冲击波 + 专用伤害（踩中 25 必死，范围 3 比手榴弹小但更致命）
  spawnBlockParticles(x,y+0.5,z,'rgb(255,160,40)');
  spawnBlockParticles(x,y+0.5,z,'rgb(255,60,40)');
  spawnBlockParticles(x,y+1,z,'rgb(90,90,90)');
  sfx.boom();
  const dx=player.pos.x-x,dz=player.pos.z-z;
  const dist=Math.hypot(dx,dz);
  if(dist<4&&dist>0.1){player.vel.x+=dx/dist*8;player.vel.z+=dz/dist*8;}
  if(dist<3){
    const dmg=dist<0.8?25:Math.max(4,Math.round(16*(1-dist/3))); // 踩中 25 秒满血，边缘衰减
    if(String(NET.myId)!==String(aid))damagePlayer(dmg,{aid,attacker:an||'',wn:'地雷',text:'💥 被 '+(an||'玩家')+' 的地雷炸死了'});
    else if(dist<1.8)damagePlayer(Math.max(4,Math.round(dmg*0.6)),{aid,attacker:an||'',wn:'地雷',text:'💥 被自己的地雷炸死了'});
  }
}
function updateMines(dt){
  for(let i=mines.length-1;i>=0;i--){
    const mn=mines[i];
    // 自己雷的可见标记：红旗飘动 + 光环脉冲
    if(mn.flag&&mn.flag.visible){
      mn.t=(mn.t||0)+dt;
      mn.flag.rotation.z=-0.25+Math.sin(mn.t*4)*0.18; // 飘动
      if(mn.ringMat)mn.ringMat.opacity=0.35+0.2*Math.sin(mn.t*4);
    }
    // 布设延迟：放下的雷 0.8s 内不触发（防自己转身踩爆）
    if(!mn.armed){mn.armedT+=dt;if(mn.armedT>=MINE_ARM)mn.armed=true;continue;}
    // 任一玩家（本地自己）踩中即炸
    const dx=player.pos.x-mn.pos.x,dz=player.pos.z-mn.pos.z;
    if(!player.dead&&Math.hypot(dx,dz)<MINE_TRIGGER&&Math.abs(player.pos.y-mn.pos.y)<1.3){
      mobsGroup.remove(mn.body);mobsGroup.remove(mn.lamp);mobsGroup.remove(mn.pole);mobsGroup.remove(mn.flag);mobsGroup.remove(mn.ring);
      mines.splice(i,1);
      explodeMine(mn.pos.x,mn.pos.y,mn.pos.z,mn.aid,mn.an);
      if(NET.open&&NET.roomId)netBroadcast({t:'mineboom',id:mn.mid,aid:mn.aid,an:mn.an});
    }
  }
}
// ---------------- 追踪导弹（左键发射 · 对准目标即锁定追踪 3s · 撞墙爆炸不穿墙） ----------------
let missiles=[],nextMissileId=1;
const MISSILE_SPEED=24,MISSILE_RADIUS=4.5,MISSILE_DMG=26,MISSILE_TRACK_T=3,MISSILE_RANGE=90;
let missileGeo=null;
function ensureMissileGeo(){
  if(!missileGeo)missileGeo=new THREE.BoxGeometry(0.14,0.14,0.62);
  return missileGeo;
}
function spawnMissile(nid,x,y,z,vx,vy,vz,remote,lockId,aid,an){
  const m=new THREE.Mesh(ensureMissileGeo(),new THREE.MeshLambertMaterial({color:0xdcdcdc}));
  m.position.set(x,y,z);
  mobsGroup.add(m);
  missiles.push({m,nid,pos:new THREE.Vector3(x,y,z),start:new THREE.Vector3(x,y,z),
    vel:new THREE.Vector3(vx,vy,vz).normalize().multiplyScalar(MISSILE_SPEED),
    trackT:MISSILE_TRACK_T,lockId:lockId||null,remote:!!remote,aid:aid||null,an:an||''});
}
function fireMissile(){ // 左键发射：准星对准目标 -> 锁定追踪 3 秒；未对准 -> 直飞；撞墙/命中爆炸
  if(gameMode!=='shooter'||player.dead||NET_APPLYING)return false;
  const it=ITEMS[I.missile];if(!it)return false;
  const now=performance.now()/1000;
  if(now-SHOOTER.lastShot<it.gun.cd)return false;
  if(gunClip(I.missile)<=0){
    if(!SHOOTER.reloading)reloadGun();
    return false;
  }
  SHOOTER.lastShot=now;
  gunSetClip(I.missile,gunClip(I.missile)-1);
  if(gunClip(I.missile)<=0)reloadGun(); // 弹夹打空：立即换弹（捡枪模式无备弹 -> 导弹消失）
  const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch);
  const dx=-Math.sin(player.yaw)*cp,dy=sp,dz=-Math.cos(player.yaw)*cp;
  // 对准目标发射：发射瞬间准星命中的玩家即锁定目标（未命中 -> 直飞无追踪）
  const hit=shootRayAt(player.yaw,player.pitch,60);
  const lockId=hit&&hit.id?hit.id:null;
  const mid=NET.myId+'_m'+(nextMissileId++);
  const x=player.pos.x+dx*0.6,y=player.pos.y+PEYE,z=player.pos.z+dz*0.6;
  spawnMissile(mid,x,y,z,dx,dy,dz,false,lockId,NET.myId,NET.myName);
  if(sfx.throwNade)sfx.throwNade();
  if(typeof handRecoilPulse==='function')handRecoilPulse();
  if(lockId){
    const tp=NET.players[lockId];
    showToast('🎯 追踪导弹锁定'+(tp&&tp.name?' '+esc(tp.name):'')+'！');
  }else{showToast('🚀 追踪导弹发射（未锁定，直飞）');}
  if(NET.open&&NET.roomId)netBroadcast({t:'nade',id:mid,x,y,z,vx:dx,vy:dy,vz:dz,aid:NET.myId,an:NET.myName,missile:1,lock:lockId});
  updateGunHud();
  return true;
}
function updateMissiles(dt){
  for(let i=missiles.length-1;i>=0;i--){
    const ms=missiles[i];
    if(ms.trackT>0)ms.trackT-=dt; // 追踪计时（3 秒）
    // 追踪：时限内且锁定目标存活 -> 速度方向平滑转向目标当前位置
    if(ms.trackT>0&&ms.lockId){
      const tp=NET.players[ms.lockId];
      if(tp&&!tp.dead){
        const toT=new THREE.Vector3(tp.x-ms.pos.x,(tp.y+0.9)-ms.pos.y,tp.z-ms.pos.z);
        const d=toT.length();
        if(d>0.01&&d<60){
          const cur=ms.vel.clone().normalize();
          ms.vel=cur.lerp(toT.normalize(),Math.min(1,dt*3.2)).normalize().multiplyScalar(MISSILE_SPEED);
        }
      }
    }
    ms.pos.addScaledVector(ms.vel,dt); // 推进（速度 24 * 帧 0.016=0.38 < 1 方块，单步不穿墙）
    // 尾焰粒子
    for(let k=0;k<2;k++){
      const pm=new THREE.Mesh(particleGeo,new THREE.MeshBasicMaterial({color:new THREE.Color(k?'rgb(255,160,60)':'rgb(255,240,200)')}));
      pm.position.copy(ms.pos).addScaledVector(ms.vel,-0.25);
      particles.push({m:pm,vx:(Math.random()-0.5)*1.2,vy:(Math.random()-0.5)*1.2,vz:(Math.random()-0.5)*1.2,life:0.25+Math.random()*0.15});
      particlesGroup.add(pm);
    }
    const boomNow=()=>{
      mobsGroup.remove(ms.m);missiles.splice(i,1);
      if(!ms.remote){
        explodeMissile(ms.pos.x,ms.pos.y,ms.pos.z,ms.aid,ms.an);
        if(NET.open&&NET.roomId)netBroadcast({t:'boom',id:ms.nid,x:ms.pos.x,y:ms.pos.y,z:ms.pos.z,aid:ms.aid,an:ms.an,missile:1});
      }
    };
    // 撞墙爆炸（不穿墙）：弹头采样点进入实心方块即爆
    const nx=Math.floor(ms.pos.x),ny=Math.floor(ms.pos.y),nz=Math.floor(ms.pos.z);
    const nb=getBlock(nx,ny,nz);
    if(nb!==B_AIR&&BLOCKS[nb]&&BLOCKS[nb].solid){boomNow();continue;}
    // 命中玩家：锁定目标贴身 / 任何非发射者近身 -> 爆炸
    let hitId=null;
    for(const id in NET.players){
      if(String(id)===String(ms.aid))continue;
      const tp=NET.players[id];if(!tp||tp.dead)continue;
      const dx2=tp.x-ms.pos.x,dy2=(tp.y+0.9)-ms.pos.y,dz2=tp.z-ms.pos.z;
      if(dx2*dx2+dy2*dy2+dz2*dz2<1.3*1.3){hitId=id;break;}
    }
    if(hitId){boomNow();continue;}
    // 竞技场边界：出界即爆炸（高速飞行物撞界墙）
    if(gameMode==='shooter'&&typeof ARENA_HALF==='number'){
      const L=ARENA_HALF+0.5;
      if(Math.abs(ms.pos.x)>L||Math.abs(ms.pos.z)>L){boomNow();continue;}
    }
    // 最大射程（防无限飞）
    if(ms.pos.distanceTo(ms.start)>MISSILE_RANGE){
      mobsGroup.remove(ms.m);missiles.splice(i,1);continue;
    }
    // 朝向速度方向（弹体长轴 = Z）
    ms.m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),ms.vel.clone().normalize());
    ms.m.position.copy(ms.pos);
  }
}
function explodeMissile(x,y,z,aid,an){
  spawnBlockParticles(x,y+0.4,z,'rgb(255,170,60)');
  spawnBlockParticles(x,y+0.4,z,'rgb(255,230,120)');
  spawnBlockParticles(x,y+0.9,z,'rgb(130,130,130)');
  sfx.boom();
  // 冲击波 + 伤害（同手榴弹模式，归因发射者，武器名=追踪导弹）
  const dx=player.pos.x-x,dz=player.pos.z-z;
  const dist=Math.hypot(dx,dz);
  if(dist<MISSILE_RADIUS+1&&dist>0.1){
    player.vel.x+=dx/dist*11;player.vel.z+=dz/dist*11;
  }
  if(dist<MISSILE_RADIUS){
    const dmg=Math.max(3,Math.round(MISSILE_DMG*(1-dist/MISSILE_RADIUS)));
    if(String(NET.myId)!==String(aid)){
      damagePlayer(dmg,{aid,attacker:an||'',wn:'追踪导弹',text:'💥 被 '+(an||'追踪导弹')+' 用追踪导弹炸死了'});
    }else if(dist<2.2){
      damagePlayer(Math.max(5,Math.round(dmg*0.6)),{aid,attacker:an||'',wn:'追踪导弹',text:'💥 被自己的追踪导弹炸了'});
    }
  }
}
// ---------------- 弓箭 ----------------
const arrows=[];
const arrowGeo=new THREE.BoxGeometry(0.08,0.08,0.55);
function takeItemFromInv(id,n){
  for(const arr of [inv.hot,inv.store]){
    for(const s of arr){
      if(s&&s.id===id&&s.count>=n){s.count-=n;if(s.count<=0)arr[arr.indexOf(s)]=null;refreshAll();return true;}
    }
  }
  return false;
}
function shootArrow(){
  const dir=new THREE.Vector3(
    -Math.sin(player.yaw)*Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw)*Math.cos(player.pitch)).normalize();
  const m=new THREE.Mesh(arrowGeo,new THREE.MeshBasicMaterial({color:0xd8d0c0}));
  m.position.set(player.pos.x+dir.x*0.8,player.pos.y+PEYE+dir.y*0.8,player.pos.z+dir.z*0.8);
  m.lookAt(m.position.clone().add(dir));
  mobsGroup.add(m);
  const bstack=inv.hot[player.sel];
  const pw=bstack&&bstack.ench?(bstack.ench.power||0):0;
  arrows.push({m,vel:dir.multiplyScalar(20),life:5,dmg:3+2*pw});
  sfx.place('wood');
}
function updateArrows(dt){
  for(let i=arrows.length-1;i>=0;i--){
    const a=arrows[i];
    a.life-=dt;
    a.vel.y-=3.5*dt; // 轻微下坠
    a.m.position.x+=a.vel.x*dt;a.m.position.y+=a.vel.y*dt;a.m.position.z+=a.vel.z*dt;
    const p=a.m.position;
    let dead=a.life<=0;
    // 命中怪物
    if(!dead){
      for(const mob of mobs){
        if(mob.dead)continue;
        if(Math.abs(p.x-mob.pos.x)<mob.w+0.3&&Math.abs(p.z-mob.pos.z)<mob.w+0.3&&
           p.y>mob.pos.y-0.2&&p.y<mob.pos.y+mob.h+0.4){
          hurtMob(mob,a.dmg||3);
          spawnBlockParticles(p.x,p.y,p.z,'rgb(200,60,60)');
          dead=true;break;
        }
      }
    }
    // 射中方块
    if(!dead&&isSolidBlock(getBlock(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))))dead=true;
    if(dead){mobsGroup.remove(a.m);a.m.material.dispose();arrows.splice(i,1);}
  }
}
function tryAttackMob(){
  if(!inputEnabled())return;
  if(gameMode==='shooter'){
    if(tryShootGun())return; // 有枪/导弹：开枪
    // 徒手近战：没拿武器也能攻击（小伤害 1，遇到残血敌人可以补刀）
    const mh=mobRaycast(), ph=playerRaycast();
    if(mh&&(!ph||mh.d<=ph.d)){
      hurtMob(mh.mob,1);
      if(NET.open&&!NET.isHost&&mh.mob.nid)netBroadcast({t:'mobhit',id:mh.mob.nid,dmg:1}); // 客人攻击：同步给房主结算
    }else if(ph){
      // PVP：广播伤害给被攻击者（对方本地扣血 + 击退），防双端重复结算
      if(NET.open&&NET.roomId){
        netBroadcast({t:'pvphit',target:ph.id,dmg:1,x:player.pos.x,y:player.pos.y,z:player.pos.z,attacker:NET.myName});
        sfx.hit();
        const tp=NET.players[ph.id];
        if(tp)spawnBlood(tp.x,tp.y+1,tp.z,-Math.sin(player.yaw),-Math.cos(player.yaw)); // 红色血粒子
      }
    }
    attackCd=0.5;
    return;
  }
  const held=heldItemId();
  const it=held?ITEMS[held]:null;
  const hstack=inv.hot[player.sel];
  const sharp=hstack&&hstack.ench?(hstack.ench.sharp||0):0;
  const dmg=(it&&it.type==='tool'?it.dmg:1)+2*sharp;
  // 近战目标：怪物优先，其次远程玩家（取更近者）
  const mh=mobRaycast(), ph=playerRaycast();
  if(!mh&&!ph)return;
  if(mh&&(!ph||mh.d<=ph.d)){
    hurtMob(mh.mob,dmg);
    if(NET.open&&!NET.isHost&&mh.mob.nid)netBroadcast({t:'mobhit',id:mh.mob.nid,dmg}); // 客人攻击：同步给房主结算
  }else if(ph){
    // PVP：广播伤害给被攻击者（对方本地扣血 + 击退），防双端重复结算
    if(NET.open&&NET.roomId){
      netBroadcast({t:'pvphit',target:ph.id,dmg,x:player.pos.x,y:player.pos.y,z:player.pos.z,attacker:NET.myName});
      sfx.hit();
      const tp=NET.players[ph.id];
      if(tp)spawnBlood(tp.x,tp.y+1,tp.z,-Math.sin(player.yaw),-Math.cos(player.yaw)); // 红色血粒子
    }
  }
  attackCd=0.5;
}
// 怪物头顶的生命值爱心条（被打后显示 4 秒）
function makeHpSprite(){
  const cv=document.createElement('canvas');cv.width=76;cv.height=18;
  const tex=new THREE.CanvasTexture(cv);tex.magFilter=THREE.NearestFilter;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
  sp.scale.set(1.35,0.32,1);sp.visible=false;
  return {sp,cv,tex};
}
function drawMobHp(m){
  if(!m.hpBar)m.hpBar=makeHpSprite();
  const {sp,cv,tex}=m.hpBar;
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,76,18);
  ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(0,2,76,16);
  const halfs=Math.max(0,Math.ceil(m.hp/m.maxHp*10));
  for(let i=0;i<5;i++){
    const v=halfs-i*2;
    drawBarIcon(ctx,2+i*14,'heart',v>=2?2:(v===1?1:0));
  }
  tex.needsUpdate=true;
  sp.visible=true;
  m.hpShowT=4;
}
function hurtMob(m,dmg){
  if(m.type==='hghast'){showToast('快乐恶魂是好朋友，不会受伤 ❤️');return;}
  m.hp-=dmg;m.flashT=0.4;
  sfx.hit();
  if(m.type!=='dragon'&&m.type!=='crystal'){
    drawMobHp(m);
    if(m.hpBar.sp.parent!==m.group){m.group.add(m.hpBar.sp);m.hpBar.sp.position.set(0,m.h+0.5,0);}
  }
  // 打铁傀儡它会反击；打村民，附近的铁傀儡都会生气！
  if(m.type==='golem'){m.angry=true;showToast('😠 铁傀儡生气了！小心它把你打飞！');}
  if(m.type==='villager'){
    for(const g2 of mobs)if(!g2.dead&&g2.type==='golem'&&Math.hypot(g2.pos.x-m.pos.x,g2.pos.z-m.pos.z)<24)g2.angry=true;
    showToast('😠 你打了村民！铁傀儡要来教训你了！');
  }
  if(m.type==='dragon'&&crystalsAlive()>0){
    const nowT=performance.now();
    if(!window._lastCrystalHint||nowT-_lastCrystalHint>6000){
      window._lastCrystalHint=nowT;
      showToast('🐉 末影龙在回血！先打掉柱子上的粉色末影水晶！');
    }
  }
  if(m.type!=='dragon'&&m.type!=='crystal'){ // 末影龙和水晶不会被击退
    const dx=m.pos.x-player.pos.x,dz=m.pos.z-player.pos.z;
    const len=Math.hypot(dx,dz)||1;
    m.vel.x+=dx/len*4;m.vel.z+=dz/len*4;m.vel.y=3;
  }
  if(m.hp<=0){
    killMob(m,false);
    if(NET.open&&NET.isHost&&m.nid)netBroadcast({t:'mobkill',id:m.nid}); // 房主权威：广播死亡
  }
}
function killMob(m,silent){
  if(m.dead)return;
  m.dead=true;
  mobsGroup.remove(m.group);
  if(!silent){
    sfx.mobDie();
    spawnBlockParticles(m.pos.x,m.pos.y+0.5,m.pos.z,'rgb(200,60,60)');
    if(NET.roomId&&!NET.isHost)return; // 联机客人：mob 掉落由房主权威生成+广播，本地只播死亡效果
    if(m.type==='cow'){
      const n=Math.floor(Math.random()*3); // 0-2 皮革
      if(n>0)spawnDrop(m.pos.x,m.pos.y+0.5,m.pos.z,I.leather,n);
      if(Math.random()<0.25)spawnDrop(m.pos.x,m.pos.y+0.5,m.pos.z,I.string,1);
    }else if(m.type==='creaking'){
      const n=1+Math.floor(Math.random()*2); // 1-2 树脂团
      spawnDrop(m.pos.x,m.pos.y+0.8,m.pos.z,I.resin_clump,n);
    }else if(m.type==='turtle'){
      spawnDrop(m.pos.x,m.pos.y+0.3,m.pos.z,I.scute,1);
    }else if(m.type==='golem'){
      const n=3+Math.floor(Math.random()*3); // 3-5 铁锭
      spawnDrop(m.pos.x,m.pos.y+0.8,m.pos.z,I.iron_ingot,n);
      if(Math.random()<0.5)spawnDrop(m.pos.x,m.pos.y+0.8,m.pos.z,B_FLOWER,1); // 偶尔掉朵小花
      golemKilled=true;updateTasks();
    }else if(m.type==='villager'){
      showToast('😭 村民呜呜地哭了……铁傀儡不会放过你的');
    }else if(m.type==='zombie'){
      const n=Math.floor(Math.random()*3); // 0-2 腐肉
      if(n>0)spawnDrop(m.pos.x,m.pos.y+0.5,m.pos.z,I.rotten_flesh,n);
    }else if(m.type==='slime'){
      const n=1+Math.floor(Math.random()*2); // 1-2 黏液球
      spawnDrop(m.pos.x,m.pos.y+0.4,m.pos.z,I.slimeball,n);
    }else if(m.type==='enderman'){
      if(Math.random()<0.8)spawnDrop(m.pos.x,m.pos.y+0.5,m.pos.z,I.ender_pearl,1);
    }else if(m.type==='crystal'){
      crystalsBroken++;
      spawnBlockParticles(m.pos.x,m.pos.y+0.5,m.pos.z,'rgb(255,120,235)');
      spawnBlockParticles(m.pos.x,m.pos.y+0.8,m.pos.z,'rgb(255,220,255)');
      const left=crystalsAlive();
      showToast(left>0?'💥 末影水晶碎了！还剩 '+left+' 个':'💥 末影水晶全碎了！末影龙不能回血了，打它！');
      updateTasks();
    }else if(m.type==='dragon'){
      dragonKilled=true;
      updateBossbar();
      // 掉龙蛋和一堆末影珍珠
      const ix=Math.floor(player.pos.x),iz=Math.floor(player.pos.z);
      const iy=surfaceY(ix,iz)+1;
      spawnDrop(ix+0.5,iy+0.5,iz+0.5,I.dragon_egg,1);
      spawnDrop(ix+0.5,iy+0.5,iz+0.5,I.ender_pearl,6);
      // 岛中心开启返回主世界的传送门
      setBlock(0,36,0,B_ENDPORTAL);
      spawnBlockParticles(0.5,37,0.5,'rgb(200,120,255)');
      showToast('🎉 打败末影龙了！岛中心开启了回家的传送门！');
      updateTasks();saveGame();
    }
  }
  const idx=mobs.indexOf(m);
  if(idx>=0)mobs.splice(idx,1);
}

