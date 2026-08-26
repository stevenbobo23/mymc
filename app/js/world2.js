// ---------------- 世界数据（无限世界：按区块动态生成） ----------------
const H=64,SEA=24,CH=16;
const chunks={};       // "cx,cz" -> Uint8Array(CH*H*CH)
const blockDiff={};    // "x,y,z" -> 方块id（玩家改动，存档用）
const facings={};      // "x,y,z" -> 0..3 (熔炉朝向)
function ck(cx,cz){return cx+','+cz;}
function lidx(x,y,z){return x+z*CH+y*CH*CH;} // x,z 为区块内局部坐标
function inW(x,y,z){return y>=0&&y<H;}
// 生态（两路噪声：b1=湿度决定森林种类，b2=温度决定冷热带）
// 0=橡树平原 1=小山 2=白桦林 3=花林 4=云杉林 5=丛林 6=金合欢草原 7=深色森林 8=樱花林
function biomeAt(x,z){
  const b1=fbm(x*0.006+500,z*0.006+500,3);
  const b2=fbm(x*0.005+900,z*0.005+900,3);
  if(b1<0.30)return 1;
  if(b2<0.24)return 4;
  if(b2>0.74)return b1>0.6?5:6;
  if(b1>0.72)return 2;
  if(b1>0.60)return 3;
  if(b1>0.48)return 7;
  if(b2>0.55&&b2<0.68&&b1>0.40&&b1<=0.46)return 9; // 🩶 苍白花园：灰树叶+嘎吱怪的家
  if(b2>0.55)return 8;
  return 0;
}
function biomeName(b){return ['橡树平原','小山 ⛰️','白桦林 🌳','花林 🌸','云杉林 🌲','丛林 🌴','金合欢草原 🌾','深色森林 🌑','樱花林 🌸','苍白花园 🩶'][b]||'未知';}
function terrainH(x,z){
  const h1=fbm(x*0.025,z*0.025,4);
  const h2=fbm(x*0.09+100,z*0.09+100,2);
  if(biomeAt(x,z)===1){ // 小山：更高、起伏更大
    const m=fbm(x*0.02+300,z*0.02+300,4);
    return clamp(Math.floor(22+m*26+h2*5),8,H-16);
  }
  return clamp(Math.floor(13+h1*20+h2*4),8,H-20);
}
function veinRng(ocx,ocz,k){
  let s=(Math.imul(ocx,73856093)^Math.imul(ocz,19349663)^Math.imul(k,83492791)^SEED)>>>0;
  return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}
// [矿石, 每区块脉数, 最高y, 最小团, 最大团]
const VEINS=[
  [B_COAL_ORE,15,40,5,9],
  [B_IRON_ORE,13,28,4,8],
  [B_GOLD_ORE,6,20,3,6],
  [B_DIAMOND_ORE,5,22,3,6], // 钻石：更多一些，浅一点也能挖到
  [B_REDSTONE_ORE,8,22,4,8],
  [B_DEBRIS,2,12,2,4],
  [B_OBSIDIAN,4,10,2,5], // 黑曜石：最深处，做传送门用
  [B_INFINITY_ORE,2,9,1,3], // 无尽贪婪矿石：超稀有！只在最深处 (y≤10)
  [B_EMERALD_ORE,4,20,2,5], // 绿宝石矿：比钻石还少一点 (y<20)
  [B_COPPER_ORE,12,32,4,8], // 🟠 铜矿：很多！石镐就能挖（一直都有，不用开模组）
  [B_LAPIS_ORE,6,24,3,6] // 🔵 青金石矿（一直都有，不用开模组）
];
// ---------------- 维度：主世界 / 下界 / 末地 ----------------
let curDim='overworld';
const DIM_NAMES={overworld:'主世界 🌍',nether:'下界 🔥',end:'末地 🌌',iron:'铁矿石维度 ⛏️',gold:'金矿石维度 🟡',diamond:'钻石矿石维度 💎',netherite:'下界合金矿石维度 🟣',redstone:'红石矿石维度 🔴',emerald:'绿宝石矿石维度 💚',infinity:'无尽贪婪矿石维度 💜'};
const ORE_DIMS={
  iron:{ore:B_IRON_ORE,frame:B_IRON_BLOCK,sky:0xbfd4e6},
  gold:{ore:B_GOLD_ORE,frame:B_GOLD_BLOCK,sky:0xf0d080},
  diamond:{ore:B_DIAMOND_ORE,frame:B_DIAMOND_BLOCK,sky:0xa8e8f0},
  netherite:{ore:B_DEBRIS,frame:B_NETHERITE_BLOCK,sky:0x6a5a7a},
  redstone:{ore:B_REDSTONE_ORE,frame:B_REDSTONE_BLOCK,sky:0xd08070},
  emerald:{ore:B_EMERALD_ORE,frame:B_EMERALD_BLOCK,sky:0x90e0b0},
  infinity:{ore:B_INFINITY_ORE,frame:B_INFINITY_BLOCK,sky:0xb090e0}
};
// 每个维度记住自己的改动和离开时的位置
const DIMS={
  overworld:{diff:{},fac:{},furn:{},chest:{},pos:null},
  nether:{diff:{},fac:{},furn:{},chest:{},pos:null},
  end:{diff:{},fac:{},furn:{},chest:{},pos:null},
  iron:{diff:{},fac:{},furn:{},chest:{},pos:null},
  gold:{diff:{},fac:{},furn:{},chest:{},pos:null},
  diamond:{diff:{},fac:{},furn:{},chest:{},pos:null},
  netherite:{diff:{},fac:{},furn:{},chest:{},pos:null},
  redstone:{diff:{},fac:{},furn:{},chest:{},pos:null},
  emerald:{diff:{},fac:{},furn:{},chest:{},pos:null},
  infinity:{diff:{},fac:{},furn:{},chest:{},pos:null}
};
function genOreDimChunk(cx,cz){ // 矿石维度：满地都是那种矿石！
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  const ore=ORE_DIMS[curDim].ore;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    const h=clamp(Math.floor(16+fbm(x*0.02,z*0.02,3)*18+fbm(x*0.06,z*0.06,2)*5),6,H-10);
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0)b=B_BEDROCK;
      else if(y<h)b=hash3(x,y,z)<0.12?B_STONE:ore; // 大部分都是矿石！偶尔夹一点石头
      else if(y===h)b=ore; // 地面也是矿石！
      arr[lidx(lx,y,lz)]=b;
    }
    // 地表撒一点荧石当灯
    if(hash2(x*5+1,z*7+3)<0.03&&h+1<H-1)arr[lidx(lx,h+1,lz)]=B_GLOWSTONE;
  }
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){ // 应用玩家改动
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
function genNetherChunk(cx,cz){ // 下界：下界岩丘陵 + 岩浆湖 + 荧石 + 远古残骸
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  const NSEA=18; // 岩浆湖面
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    let h=clamp(Math.floor(13+fbm(x*0.012,z*0.012,3)*30+fbm(x*0.05,z*0.05,2)*4),8,H-20);
    if(fbm(x*0.006+300,z*0.006+300,2)<0.42)h=Math.max(6,h-24); // 低洼盆地→岩浆湖
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0||y===H-1)b=B_BEDROCK;
      else if(y<h)b=B_NETHERRACK;
      else if(y<=NSEA)b=B_LAVA;
      arr[lidx(lx,y,lz)]=b;
    }
    // 地表荧石簇
    if(hash2(x*3+5,z*7+9)<0.02&&h+2<H-1){
      arr[lidx(lx,h+1,lz)]=B_GLOWSTONE;
      if(hash2(x,z*3)<0.5)arr[lidx(lx,h+2,lz)]=B_GLOWSTONE;
    }
  }
  // 下界矿脉：远古残骸多 + 石英用荧石代替
  for(let ox=cx-1;ox<=cx+1;ox++)for(let oz=cz-1;oz<=cz+1;oz++){
    const rnd=veinRng(ox,oz,7);
    for(let i=0;i<5;i++){
      let x=ox*CH+((rnd()*CH)|0),z=oz*CH+((rnd()*CH)|0),y=2+((rnd()*26)|0);
      const size=2+((rnd()*3)|0);
      for(let j=0;j<size;j++){
        const lx=x-x0,lz=z-z0;
        if(lx>=0&&lx<CH&&lz>=0&&lz<CH&&y>=1&&y<H-1&&arr[lidx(lx,y,lz)]===B_NETHERRACK)arr[lidx(lx,y,lz)]=B_DEBRIS;
        const d=(rnd()*6)|0;
        if(d===0)x++;else if(d===1)x--;else if(d===2)y++;else if(d===3)y--;else if(d===4)z++;else z--;
        y=clamp(y,1,H-2);
      }
    }
  }
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
function genEndChunk(cx,cz){ // 末地：末地石浮岛 + 黑曜石柱子 + 中央返回传送门
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  const BASE=30; // 岛面高度
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    const r=Math.hypot(x,z);
    if(r<42){
      const dome=Math.cos(r/42*Math.PI/2); // 中央高边缘低
      const top=BASE+Math.floor(dome*4+fbm(x*0.08,z*0.08,2)*1.5);
      const depth=Math.max(1,Math.floor(dome*5));
      for(let y=top;y>top-depth&&y>0;y--)arr[lidx(lx,y,lz)]=B_ENDSTONE;
    }
    // 黑曜石柱子（环绕岛的 6 根）
    for(let k=0;k<6;k++){
      const pa=k/6*Math.PI*2+0.5;
      const px2=Math.round(Math.cos(pa)*28),pz2=Math.round(Math.sin(pa)*28);
      if(Math.abs(x-px2)<=1&&Math.abs(z-pz2)<=1){
        const ph=14+((k*7)%6);
        for(let y=BASE+4;y<BASE+4+ph&&y<H;y++)arr[lidx(lx,y,lz)]=B_OBSIDIAN;
        if(x===px2&&z===pz2&&BASE+4+ph<H)arr[lidx(lx,BASE+4+ph,lz)]=B_GLOWSTONE; // 柱顶荧石"水晶"
      }
    }
  }
  // 岛中心：3x3 平台（打败末影龙后才会在这里开启回家的传送门）
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    if(Math.abs(x)<=1&&Math.abs(z)<=1)arr[lidx(lx,BASE+5,lz)]=B_ENDSTONE;
  }
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
// ---------------- 🧩 模组开关 ----------------
const MODS_KEY='mc_mods_v2';
let modsOn={him:false,storm:false,lucky:false,vein:false,real:false,oneblock:false,oredim:false,copy:false,moretnt:false,armor:false,titan:false}; // 不点模组就没有模组内容，选了才有！
try{Object.assign(modsOn,JSON.parse(localStorage.getItem(MODS_KEY)||'{}'))}catch(e){}
function saveMods(){try{localStorage.setItem(MODS_KEY,JSON.stringify(modsOn))}catch(e){}}
// 凋零风暴的状态：它在哪、有没有被炸开口子、体内命令方块还剩几下
const stormState={mob:null,wound:false,cmdHp:4,insideSpawned:false,returnPos:null,actT:0,altarPos:null};
const STORM_ROOM={x:20000,y:10,z:20000}; // 凋零风暴身体里面的小房间（藏在很远很远的地方）
// 死过人的村庄：重进游戏村民不会复活（记进存档）
const deadVillages={};

// ---------------- 🏘 村庄巡逻刷村民 + 神庙陷阱 ----------------
// 走近村庄才刷村民（修bug：以前只在区块生成那一刻刷，来晚了就永远没有村民）
const spawnedVillages={};
function villageTick(){
  if(!started||curDim!=='overworld')return;
  templeTrapCheck(); // 看看有没有踩中神庙的陷阱机关
  const pcx=Math.floor(player.pos.x/CH),pcz=Math.floor(player.pos.z/CH);
  for(let cx=pcx-1;cx<=pcx+1;cx++)for(let cz=pcz-1;cz<=pcz+1;cz++){ // 走近神庙提醒一下
    const key='t'+ck(cx,cz);
    if(foundTemples[key])continue;
    if(!isTempleChunk(cx,cz))continue;
    const tcx=cx*CH+8,tcz=cz*CH+8;
    if(Math.hypot(player.pos.x-tcx,player.pos.z-tcz)>48)continue;
    foundTemples[key]=1;
    showToast('🛕 发现丛林神庙！里面有宝箱，但是小心脚下——有陷阱机关！');
  }
  for(let cx=pcx-1;cx<=pcx+1;cx++)for(let cz=pcz-1;cz<=pcz+1;cz++){ // 走近女巫小屋：刷女巫+提醒
    const key='w'+ck(cx,cz);
    if(spawnedHuts[key])continue;
    if(!isWitchHutChunk(cx,cz))continue;
    const wcx=cx*CH+8,wcz=cz*CH+8;
    if(Math.hypot(player.pos.x-wcx,player.pos.z-wcz)>40)continue;
    spawnedHuts[key]=1;
    spawnMob('witch',wcx,wcz);
    showToast('🧙 发现女巫小屋！里面有酿造台和宝箱，小心女巫扔药水！');
  }
  for(let cx=pcx-1;cx<=pcx+1;cx++)for(let cz=pcz-1;cz<=pcz+1;cz++){
    const key=ck(cx,cz);
    if(spawnedVillages[key]||deadVillages[key])continue;
    if(!isVillageChunk(cx,cz))continue;
    const vcx=cx*CH+8,vcz=cz*CH+8;
    if(Math.hypot(player.pos.x-vcx,player.pos.z-vcz)>64)continue;
    spawnedVillages[key]=1;
    // 刷在村子中间的小路上（本地坐标7-8那条十字路），别刷进房子里卡住
    spawnMob('villager',vcx-1,vcz-1);spawnMob('villager',vcx,vcz);spawnMob('villager',vcx-1,vcz+4);
    spawnMob('golem',vcx,vcz+5);
    if(!foundVillage){foundVillage=true;updateTasks();showToast('🏠 发现村庄！村民和铁傀儡住在这里，点村民可以用绿宝石换东西哦！');}
  }
}

// ---------------- 🛕 丛林神庙 + 🧙 女巫小屋 ----------------
// ---------------- 🛕 丛林神庙 ----------------
const templeTraps={}; // 陷阱机关："x,y,z" -> 1（踩上去就爆炸）
const foundTemples={}; // 已经提醒过的神庙
// 出生点附近保证有一座神庙（走一两分钟就到）
let _spawnTemple=null;
function getSpawnTemple(){
  if(_spawnTemple)return _spawnTemple;
  const sx=Math.floor(spawnPoint.x/CH),sz=Math.floor(spawnPoint.z/CH);
  let best=null,bestD=1e9;
  for(let cx=sx-12;cx<=sx+12;cx++)for(let cz=sz-12;cz<=sz+12;cz++){
    const d=Math.hypot(cx-sx,cz-sz);
    if(d<4||d>12)continue; // 64~190格之间
    const th=terrainH(cx*CH+8,cz*CH+8);
    if(th<=SEA+2||th>=36)continue;
    if(isVillageChunk(cx,cz))continue;
    if(d<bestD){bestD=d;best={cx,cz};}
  }
  _spawnTemple=best||{cx:sx+6,cz:sz+6};
  return _spawnTemple;
}
function isTempleChunk(cx,cz){
  const stc=getSpawnTemple();
  if(cx===stc.cx&&cz===stc.cz)return true; // 出生点附近必有一座
  const tcx=cx*CH+8,tcz=cz*CH+8;
  if(Math.hypot(tcx-spawnPoint.x,tcz-spawnPoint.z)<100)return false; // 近处只留保证的那一座
  if(isVillageChunk(cx,cz))return false; // 不跟村庄挤在一起
  const th=terrainH(tcx,tcz);
  return hash2(cx*13+7,cz*17+3)<0.03&&th>SEA+2&&th<36; // 其他地方也更常见了
}
function buildTemple(arr,x0,z0){
  const hx=2,hz=2; // 11×11 的神庙
  const wx=x0+8,wz=z0+8;
  const base=terrainH(wx,wz);
  // 填平地基，清空上方
  for(let dx=0;dx<11;dx++)for(let dz=0;dz<11;dz++){
    for(let y=base+1;y<base+9&&y<H;y++)arr[lidx(hx+dx,y,hz+dz)]=B_AIR;
    arr[lidx(hx+dx,base,hz+dz)]=B_COBBLE; // 圆石地板
    for(let y=Math.max(1,base-3);y<base;y++){
      const b=arr[lidx(hx+dx,y,hz+dz)];
      if(b===B_AIR||b===B_WATER)arr[lidx(hx+dx,y,hz+dz)]=B_DIRT;
    }
  }
  // 外墙（圆石，有些石头砖纹样的变化），南边中间留门
  for(let dx=0;dx<11;dx++)for(let dz=0;dz<11;dz++){
    const edge=dx===0||dx===10||dz===0||dz===10;
    if(!edge)continue;
    const door=dz===10&&(dx>=4&&dx<=6);
    for(let dy=1;dy<=3;dy++){
      if(door&&dy<=2)continue;
      arr[lidx(hx+dx,base+dy,hz+dz)]=hash3(x0+dx,base+dy,z0+dz)<0.25?B_STONE:B_COBBLE;
    }
  }
  // 金字塔台阶屋顶：一层比一层小
  for(let layer=0;layer<3;layer++){
    const a=layer,b=10-layer;
    for(let dx=a;dx<=b;dx++)for(let dz=a;dz<=b;dz++){
      const edgeL=dx===a||dx===b||dz===a||dz===b;
      if(layer===2||edgeL)arr[lidx(hx+dx,base+4+layer,hz+dz)]=B_COBBLE;
    }
  }
  arr[lidx(hx+5,base+7,hz+5)]=B_GLOWSTONE; // 塔尖一颗发光石
  // 门口两列柱子
  for(const px2 of [3,7])for(let dy=1;dy<=3;dy++)arr[lidx(hx+px2,base+dy,hz+9)]=B_LOG;
  // 里面两边墙角各一个宝箱
  const lootTab=[[I.emerald,1,3],[I.gold_ingot,1,3],[I.iron_ingot,1,2],[I.bullet,4,10],[I.bread,1,2],[I.slimeball,1,3],[I.redstone,2,5],[I.arrow,3,8]];
  for(const c of [[1,1],[9,1]]){
    arr[lidx(hx+c[0],base+1,hz+c[1])]=B_CHEST;
    const ck2=(x0+hx+c[0])+','+(base+1)+','+(z0+hz+c[1]);
    if(!chestStates[ck2]){
      const slots=new Array(27).fill(null);
      let placed=0;
      for(const l of lootTab){
        if(hash3(x0+c[0],base,z0+c[1]+placed)<0.3)continue;
        const n=l[1]+Math.floor(hash3(x0,base+placed+7,z0+c[0])*(l[2]-l[1]+1));
        slots[Math.floor(hash3(x0+placed,base+3,z0+placed)*27)]={id:l[0],count:Math.max(1,n)};
        placed++;
      }
      if(hash3(x0,base,z0+99)<0.35)slots[13]={id:I.diamond,count:1}; // 运气好有钻石！
      if(placed>0)chestStates[ck2]={slots};
    }
  }
  // 陷阱机关：中间走廊的4块地板，踩上去就爆炸！
  for(const t of [[5,5],[4,6],[6,6],[5,7]]){
    templeTraps[(x0+hx+t[0])+','+(base+1)+','+(z0+hz+t[1])]=1;
  }
}
// ---------------- 🧙 女巫小屋 ----------------
const spawnedHuts={}; // 已经刷过女巫的小屋
let _spawnHut=null;
function getSpawnHut(){ // 出生点附近保证有一座女巫小屋（64~190格之间）
  if(_spawnHut)return _spawnHut;
  const sx=Math.floor(spawnPoint.x/CH),sz=Math.floor(spawnPoint.z/CH);
  let best=null,bestD=1e9;
  for(let cx=sx-12;cx<=sx+12;cx++)for(let cz=sz-12;cz<=sz+12;cz++){
    const d=Math.hypot(cx-sx,cz-sz);
    if(d<4||d>12)continue;
    const th=terrainH(cx*CH+8,cz*CH+8);
    if(th<=SEA-1||th>SEA+2)continue; // 要低洼的沼泽地
    if(isVillageChunk(cx,cz)||isTempleChunk(cx,cz))continue;
    if(d<bestD){bestD=d;best={cx,cz};}
  }
  if(!best){ // 找不到沼泽就把最近的一块地垫成小屋
    for(let cx=sx-12;cx<=sx+12;cx++)for(let cz=sz-12;cz<=sz+12;cz++){
      const d=Math.hypot(cx-sx,cz-sz);
      if(d<4||d>12)continue;
      if(isVillageChunk(cx,cz)||isTempleChunk(cx,cz))continue;
      if(d<bestD){bestD=d;best={cx,cz};}
    }
  }
  _spawnHut=best||{cx:sx-6,cz:sz-6};
  return _spawnHut;
}
function isWitchHutChunk(cx,cz){
  const shc=getSpawnHut();
  if(cx===shc.cx&&cz===shc.cz)return true;
  const wcx=cx*CH+8,wcz=cz*CH+8;
  if(Math.hypot(wcx-spawnPoint.x,wcz-spawnPoint.z)<100)return false;
  if(isVillageChunk(cx,cz)||isTempleChunk(cx,cz))return false;
  const th=terrainH(wcx,wcz);
  return hash2(cx*29+11,cz*31+5)<0.06&&th>SEA-1&&th<=SEA+2; // 沼泽低地里偶尔有
}
function buildWitchHut(arr,x0,z0){
  const hx=4,hz=4; // 7×7 的小木屋，架在沼泽上
  const wx=x0+8,wz=z0+8;
  const base=Math.max(terrainH(wx,wz),SEA-1);
  const fy=base+2; // 地板高度（架起来，下面悬空）
  // 清空小屋顶上的空间
  for(let dx=0;dx<7;dx++)for(let dz=0;dz<7;dz++)
    for(let y=fy;y<fy+8&&y<H;y++)arr[lidx(hx+dx,y,hz+dz)]=B_AIR;
  // 四角的木桩脚（从水底一直撑到地板）
  for(const s of [[0,0],[6,0],[0,6],[6,6]])
    for(let y=Math.max(1,base-3);y<fy;y++)arr[lidx(hx+s[0],y,hz+s[1])]=B_LOG;
  // 木地板
  for(let dx=0;dx<7;dx++)for(let dz=0;dz<7;dz++)arr[lidx(hx+dx,fy,hz+dz)]=B_PLANKS;
  // 木墙（3格高），南边中间留门，东西两边各留一扇窗
  for(let dx=0;dx<7;dx++)for(let dz=0;dz<7;dz++){
    const edge=dx===0||dx===6||dz===0||dz===6;
    if(!edge)continue;
    const door=dz===6&&dx===3;
    const win=(dz===0&&dx===3)||(dx===0&&dz===3)||(dx===6&&dz===3);
    for(let dy=1;dy<=3;dy++){
      if(door&&dy<=2)continue;
      if(win&&dy===2)continue;
      arr[lidx(hx+dx,fy+dy,hz+dz)]=B_PLANKS;
    }
  }
  // 金字塔木屋顶
  for(let layer=0;layer<3;layer++){
    const a=layer,b=6-layer;
    for(let dx=a;dx<=b;dx++)for(let dz=a;dz<=b;dz++){
      const edgeL=dx===a||dx===b||dz===a||dz===b;
      if(layer===2||edgeL)arr[lidx(hx+dx,fy+4+layer,hz+dz)]=B_PLANKS;
    }
  }
  // 屋里的宝贝：酿造台 + 一个装着药水材料的宝箱
  arr[lidx(hx+1,fy+1,hz+1)]=B_BREW;
  arr[lidx(hx+5,fy+1,hz+1)]=B_CHEST;
  const ck2=(x0+hx+5)+','+(fy+1)+','+(z0+hz+1);
  if(!chestStates[ck2]){
    const slots=new Array(27).fill(null);
    const loot=[[I.redstone,1,3],[I.slimeball,1,2],[I.carrot,1,2],[I.rotten_flesh,1,2],[I.string,1,2],[I.gold_ingot,1,1],[I.potion_heal,1,1]];
    let p=0;
    for(const l of loot){
      if(hash3(x0+p*3,fy,z0+p*5)<0.4)continue;
      slots[2+p*3]={id:l[0],count:l[1]+Math.floor(hash3(x0,fy+p,z0)*(l[2]-l[1]+1))};
      p++;
    }
    chestStates[ck2]={slots};
  }
}

// ---------------- 🏛 远古城市：地下超级大的古城，里面有坚守者！ ----------------
let cityBuilt=false;
function getCityPos(){ // 远古城市就在出生点的正下方！一直往下挖就能掉进去！
  return {x:Math.round(spawnPoint.x),z:Math.round(spawnPoint.z)};
}
function cityHint(){ // 告诉你远古城市在哪
  const cp=getCityPos();
  const dx=cp.x-player.pos.x,dz=cp.z-player.pos.z;
  const dist=Math.round(Math.hypot(dx,dz));
  if(dist<40)return '🏛 远古城市就在你的脚底下！看到地上那一大片泥土了吗？把泥土一直往下挖，就能掉进去！小心里面的坚守者……';
  const dirs=['北','东北','东','东南','南','西南','西','西北'];
  const ang=Math.atan2(dx,-dz); // -z 是北边
  const dir=dirs[Math.round(ang/(Math.PI/4))+8&7];
  return '🏛 远古城市就在【出生点】的正下方！往'+dir+'边走 '+dist+' 格回到出生点，挖开那片泥土就能掉进去！';
}
let cityEntranceBuilt=false;
function buildCityEntrance(){ // 在地面上做一个发光灯塔+旋转楼梯，顺着它就能走进地下古城！
  if(cityEntranceBuilt)return;
  cityEntranceBuilt=true;
  const cp=getCityPos();
  const CY=9;
  const sx=cp.x,sz=cp.z;
  // 找到真正的地面：从天上往下找第一块石头/泥土/沙子（躲开山洞和水的迷惑）
  let sy=surfaceY(sx,sz);
  for(let y=Math.max(sy,40);y>CY+14;y--){
    const b=getBlock(sx,y,sz);
    if(b===B_STONE||b===B_DIRT||b===B_GRASS||b===B_SAND||b===B_COBBLE||b===B_LOG){sy=y;break;}
  }
  if(sy<CY+16)sy=CY+16; // 太低的话就从石头里凿一条井下去
  // 1) 发光灯塔：远远就能看见！（石头+荧石叠高高）
  for(let y=sy+1;y<=sy+16;y++)setBlock(sx+2,y,sz,(y%3===0)?B_GLOWSTONE:B_COBBLE);
  setBlock(sx+2,sy+17,sz,B_GLOWSTONE); // 塔顶大灯
  // 2) 3×3 的笔直竖井，从地面一直通到古城大厅——直接往下挖就能到！
  const ring=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,0],[-1,1]];
  for(let y=sy;y>=CY;y--){
    for(const o of ring)setBlock(sx+o[0],y,sz+o[1],B_AIR);
    setBlock(sx,y,sz,B_AIR); // 中间的竖井
    // 井壁上每隔几层插一盏小灯，照得亮亮的
    const lt=ring[(sy-y)%8];
    if((sy-y)%5===0)setBlock(sx+lt[0],y,sz+lt[1],B_GLOWSTONE);
  }
  // 3) 井底一大滩水，直接跳下去也摔不痛！
  for(const o of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
    setBlock(sx+o[0],CY-1,sz+o[1],B_WATER);
    setBlock(sx+o[0],CY,sz+o[1],B_WATER);
  }
  // 4) 井口围一圈荧石，晚上亮亮的
  for(const o of ring)if((o[0]+o[1])%2===0)setBlock(sx+o[0],sy+1,sz+o[1],B_GLOWSTONE);
}
function buildAncientCity(cx,cz){
  const CY=5; // 地板的高度（往地下更深了一点）
  const R=34; // 古城的半径，很大很大！
  // 挖出一个圆圆的大厅，铺上石头地板
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
    const d=Math.hypot(dx,dz);
    if(d>R)continue;
    const x=cx+dx,z=cz+dz;
    if(Math.abs(dx)<=1&&Math.abs(dz)<=1)continue; // 中间留出来放传送门框架
    for(let y=CY;y<CY+14;y++)setBlock(x,y,z,B_AIR); // 挖空
    setBlock(x,CY-1,z,hash3(x,CY,z)<0.72?B_SCULK:B_STONE); // 幽匿方块地板（原版远古城市的黑地板！）
    if(d>R-1.5)for(let y=CY;y<CY+14;y++)setBlock(x,y,z,B_COBBLE); // 圆圆的石墙
  }
  // 一圈圈大柱子顶着天花板，柱子上挂着荧石灯
  for(const pr of [12,22]){
    const n=pr===12?8:14;
    for(let k=0;k<n;k++){
      const a=k/n*Math.PI*2;
      const px=Math.round(cx+Math.cos(a)*pr),pz=Math.round(cz+Math.sin(a)*pr);
      for(let y=CY;y<CY+10;y++){setBlock(px,y,pz,B_COBBLE);setBlock(px+1,y,pz,B_COBBLE);setBlock(px,y,pz+1,B_COBBLE);setBlock(px+1,y,pz+1,B_COBBLE);}
      setBlock(px,CY+5,pz+2,B_GLOWSTONE); // 灯
    }
  }
  // 四座小房子，每座房子里面有一个宝箱！
  const lootTab=[[I.diamond,1,3],[I.gold_ingot,2,5],[I.iron_ingot,2,4],[I.ender_pearl,1,2],[I.emerald,1,4],[I.potion_heal,1,2],[I.redstone,3,8]];
  for(let h=0;h<4;h++){
    const a=h/4*Math.PI*2+Math.PI/4;
    const hx=Math.round(cx+Math.cos(a)*18)-3,hz=Math.round(cz+Math.sin(a)*18)-3;
    for(let dx=0;dx<7;dx++)for(let dz=0;dz<7;dz++){
      const edge=dx===0||dx===6||dz===0||dz===6;
      if(edge)for(let y=CY;y<CY+4;y++){
        if(dz===0&&(dx===3)&&y<CY+2)continue; // 留个门口
        setBlock(hx+dx,y,hz+dz,B_COBBLE);
      }
      setBlock(hx+dx,CY+4,hz+dz,B_PLANKS); // 木屋顶
    }
    setBlock(hx+3,CY+3,hz+3,B_GLOWSTONE); // 屋顶挂灯
    const chx=hx+5,chy=CY,chz=hz+5;
    setBlock(chx,chy,chz,B_CHEST); // 宝箱！
    const ck2=chx+','+chy+','+chz;
    if(!chestStates[ck2]){
      const slots=new Array(27).fill(null);
      let placed=0;
      for(const l of lootTab){
        if(hash3(chx+placed,chy,chz)<0.35)continue;
        const n=l[1]+Math.floor(hash3(chx,chy+placed+3,chz+placed)*(l[2]-l[1]+1));
        slots[Math.floor(hash3(chx+placed,chy+9,chz)*27)]={id:l[0],count:Math.max(1,n)};
        placed++;
      }
      if(hash3(chx,chy,chz+77)<0.2)slots[13]={id:I.infinity_ingot,count:1}; // 超级稀有：无尽贪婪锭！
      if(placed>0)chestStates[ck2]={slots};
    }
  }
  // 🌀 大厅正中间：像原版一样的传送门框架！（黑曜石大门框+石头高台）
  for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
    setBlock(cx+dx,CY-1,cz+dz,B_COBBLE); // 高出来的石头台子
    if(Math.abs(dx)===3||Math.abs(dz)===3)setBlock(cx+dx,CY,cz+dz,B_COBBLE); // 台子边上一圈矮墙
  }
  for(let y=CY+1;y<=CY+7;y++){setBlock(cx-2,y,cz,B_OBSIDIAN);setBlock(cx+2,y,cz,B_OBSIDIAN);} // 两根大柱子
  for(let dx=-2;dx<=2;dx++)setBlock(cx+dx,CY+8,cz,B_OBSIDIAN); // 顶上的横梁
  setBlock(cx-2,CY+4,cz+1,B_GLOWSTONE);setBlock(cx+2,CY+4,cz+1,B_GLOWSTONE); // 门框上的灯
  setBlock(cx-2,CY+4,cz-1,B_GLOWSTONE);setBlock(cx+2,CY+4,cz-1,B_GLOWSTONE);
  // 💧 四个小水池：从上面挖泥土掉下来，掉在水里不摔痛！
  for(const p of [[6,6],[-6,6],[6,-6],[-6,-6]])
    for(const o of [[0,0],[1,0],[0,1],[1,1]])
      setBlock(cx+p[0]+o[0],CY-1,cz+p[1]+o[1],B_WATER);
  // 🟤 古城上面盖一大片泥土！把泥土挖掉就能掉进来～
  for(let dx=-16;dx<=16;dx++)for(let dz=-16;dz<=16;dz++){
    if(dx*dx+dz*dz>256)continue;
    const x=cx+dx,z=cz+dz;
    const top=surfaceY(x,z);
    for(let y=CY+14;y<=top;y++)setBlock(x,y,z,y===top?B_GRASS:B_DIRT); // 最上面铺草方块，下面是泥土
  }
}
// ---------------- 👂 声音系统：在远古城市里太吵会吵醒坚守者！ ----------------
function cityFloorY(x,z){ // 在古城大厅里找一块站得住的地面，坚守者出生不会卡进石头里
  for(let y=5;y<18;y++){
    if(isSolidBlock(getBlock(x,y-1,z))&&!isSolidBlock(getBlock(x,y,z))&&!isSolidBlock(getBlock(x,y+1,z))&&!isSolidBlock(getBlock(x,y+2,z)))return y;
  }
  return 6;
}
const lastNoise={x:0,z:0,t:-999}; // 坚守者靠这个找你
let cityNoiseN=0,cityNoiseT=0;
function makeNoise(x,z){
  lastNoise.x=x;lastNoise.z=z;lastNoise.t=performance.now()/1000;
  const cp=getCityPos();
  if(Math.hypot(x-cp.x,z-cp.z)>46||player.pos.y>20)return; // 不在古城里面（要挖到地下深处）不算
  const now=performance.now()/1000;
  if(now-cityNoiseT<0.35)return; // 数声音不能太快
  if(now-cityNoiseT>10)cityNoiseN=0; // 安静太久就重新数
  cityNoiseT=now;cityNoiseN++;
  if(cityNoiseN>=6){ // 吵了6次！坚守者出来了！！
    cityNoiseN=0;
    let wardens=0;
    for(const m of mobs)if(!m.dead&&m.type==='warden')wardens++;
    if(wardens<2){
      const fx=Math.floor(x)+2,fz=Math.floor(z)+2;
      const w=spawnMob('warden',fx,fz,cityFloorY(fx,fz)); // 出生在地面上，不卡石头
      w.noBurn=true;
      sfx.hurt();
      showToast('😱 你太吵了！！坚守者从地下爬出来了！它有500颗心，快跑！！');
    }
  }else if(cityNoiseN===1){
    showToast('🏛 这里是远古城市……小声一点，别吵醒地下的怪物！（1/6 次声音）');
  }else{
    showToast('👂 嘘——坚守者听见你了……（'+cityNoiseN+'/6 次声音）');
  }
}
function ancientCityTick(){
  if(curDim!=='overworld'||cityBuilt)return;
  const cp=getCityPos();
  if(Math.hypot(player.pos.x-cp.x,player.pos.z-cp.z)<110){
    cityBuilt=true;
    buildAncientCity(cp.x,cp.z);
    // 😱 城里本来就住着一只坚守者！它在黑暗里走来走去……
    let wardens=0;
    for(const m of mobs)if(!m.dead&&m.type==='warden')wardens++;
    if(wardens<1){
      const w=spawnMob('warden',cp.x+8,cp.z+8,cityFloorY(cp.x+8,cp.z+8)); // 站在大厅地面上
      w.noBurn=true;
    }
    showToast('🏛 你发现了远古城市！里面有宝箱……还有一只500颗心的坚守者在巡逻！千万别发出声音！');
  }
}
// ---------------- 🏜 沙漠神殿：沙漠里的宝藏金字塔！ ----------------
function getDesertTemplePos(){ // 离出生点约90格，走一小会儿就到
  const a=hash2(555111,777333)*Math.PI*2;
  return {x:Math.round(spawnPoint.x+Math.cos(a)*90),z:Math.round(spawnPoint.z+Math.sin(a)*90)};
}
function templeHint(){
  const bp=getDesertTemplePos();
  const dx=bp.x-player.pos.x,dz=bp.z-player.pos.z;
  const dist=Math.round(Math.hypot(dx,dz));
  const dirs=['北','东北','东','东南','南','西南','西','西北'];
  const dir=dirs[Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8&7];
  return '🏜 沙漠神殿在【'+dir+'边】大约 '+dist+' 格！找到金字塔，从中间往下挖有4个宝箱……但是千万别踩压力板！';
}
let templeBuilt=false,templePos=null;
function buildDesertTemple(){
  const bp=getDesertTemplePos();
  // 在附近找沙子最多的地方（那就是沙漠！）
  let bx=bp.x,bz=bp.z,best=-1;
  for(let dx=-40;dx<=40;dx+=8)for(let dz=-40;dz<=40;dz+=8){
    let sand=0;
    for(let ox=-4;ox<=4;ox+=2)for(let oz=-4;oz<=4;oz+=2){
      const sx=bp.x+dx+ox,sz=bp.z+dz+oz;
      if(getBlock(sx,surfaceY(sx,sz),sz)===B_SAND)sand++;
    }
    if(sand>best){best=sand;bx=bp.x+dx;bz=bp.z+dz;}
  }
  templePos={x:bx,z:bz};
  // 铺一片小沙漠（把地面都变成沙子）
  for(let dx=-18;dx<=18;dx++)for(let dz=-18;dz<=18;dz++){
    if(dx*dx+dz*dz>324)continue;
    const x=bx+dx,z=bz+dz,top=surfaceY(x,z);
    if(getBlock(x,top,z)!==B_WATER)setBlock(x,top,z,B_SAND);
  }
  // 🌵 沙漠里到处种仙人掌！
  for(let i=0;i<16;i++){
    const a=hash3(bx+i,77,bz)*Math.PI*2,d=9+hash3(bx,55+i,bz)*24;
    const x=Math.round(bx+Math.cos(a)*d),z=Math.round(bz+Math.sin(a)*d);
    const y=surfaceY(x,z);
    if(getBlock(x,y,z)!==B_SAND)continue;
    const h=1+Math.floor(hash3(x,y,z)*3);
    for(let k=1;k<=h;k++)setBlock(x,y+k,z,B_CACTUS);
  }
  const fy=surfaceY(bx,bz);
  // 神殿主体：13×13 的金字塔
  for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++){
    const x=bx+dx,z=bz+dz;
    for(let y=fy+1;y<=fy+12;y++)setBlock(x,y,z,B_AIR); // 清空里面
    setBlock(x,fy,z,B_SAND); // 地板
    if(Math.abs(dx)===6||Math.abs(dz)===6)for(let y=fy+1;y<=fy+6;y++)setBlock(x,y,z,B_SAND); // 墙
  }
  for(let layer=0;layer<5;layer++){ // 金字塔顶一层一层往里收
    const r=7-layer;
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)
      if(Math.abs(dx)===r||Math.abs(dz)===r||layer>=3)setBlock(bx+dx,fy+6+layer,bz+dz,B_SAND);
  }
  setBlock(bx,fy+11,bz,B_GLOWSTONE); // 塔尖灯，晚上看得见
  for(let y=fy+1;y<=fy+3;y++)setBlock(bx,y,bz+6,B_AIR); // 南面的门
  setBlock(bx,fy,bz,B_GLOWSTONE); // 地板中间的记号：从这里往下挖！
  // 💎 地下的宝藏房间（往下挖 8 格就到）
  const ry=fy-8;
  for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
    for(let y=ry;y<=ry+3;y++)setBlock(bx+dx,y,bz+dz,B_AIR); // 挖空房间
    setBlock(bx+dx,ry-1,bz+dz,B_SAND); // 房间地板
  }
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)setBlock(bx+dx,ry-2,bz+dz,B_TNT); // 地板下面藏着 TNT！
  setBlock(bx,ry,bz,B_PLATE); // ⚠ 中间的压力板：千万别踩！
  // 💰 四个角各一个宝箱，里面宝贝超多！
  const lootTab=[[I.diamond,1,4],[I.gold_ingot,2,6],[I.emerald,1,4],[I.iron_ingot,2,5],[I.ender_pearl,1,2],[I.redstone,3,8],[I.slimeball,1,3]];
  for(const c of [[-2,-2],[2,-2],[-2,2],[2,2]]){
    const chx=bx+c[0],chz=bz+c[1];
    setBlock(chx,ry,chz,B_CHEST);
    const ck2=chx+','+ry+','+chz;
    if(!chestStates[ck2]){
      const slots=new Array(27).fill(null);
      let placed=0;
      for(const l of lootTab){
        if(hash3(chx+placed,ry,chz)<0.25)continue;
        const n=l[1]+Math.floor(hash3(chx,ry+placed,chz)*(l[2]-l[1]+1));
        slots[Math.floor(hash3(chx+placed,ry+5,chz)*27)]={id:l[0],count:n};
        placed++;
      }
      if(hash3(chx,ry,chz+55)<0.25)slots[13]={id:I.infinity_ingot,count:1}; // 超级稀有！
      chestStates[ck2]={slots};
    }
  }
  setBlock(bx+3,ry+2,bz,B_GLOWSTONE);setBlock(bx-3,ry+2,bz,B_GLOWSTONE); // 房间的小灯
}
function desertTempleTick(){
  if(curDim!=='overworld')return;
  if(!templeBuilt){
    const bp=getDesertTemplePos();
    if(Math.hypot(player.pos.x-bp.x,player.pos.z-bp.z)<90){
      templeBuilt=true;
      buildDesertTemple();
      showToast('🏜 你发现了沙漠神殿！从中间发光的地板往下挖有4个宝箱……千万别踩压力板！');
    }
  }
  if(player.dead)return;
  // ⚠ 压力板检测：踩到就引爆下面的 TNT！
  const fx=Math.floor(player.pos.x),fz=Math.floor(player.pos.z);
  let py=-1;
  if(getBlock(fx,Math.floor(player.pos.y-0.3),fz)===B_PLATE)py=Math.floor(player.pos.y-0.3);
  else if(getBlock(fx,Math.floor(player.pos.y),fz)===B_PLATE)py=Math.floor(player.pos.y);
  if(py>=0){
    setBlock(fx,py,fz,B_AIR);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
      if(getBlock(fx+dx,py-2,fz+dz)===B_TNT)setBlock(fx+dx,py-2,fz+dz,B_AIR);
    explode(fx+0.5,py-1,fz+0.5,4,16);
    showToast('💥 你踩到压力板了！！TNT 爆炸了！！');
  }
}
// ---------------- ⛏ 矿洞：地面上的入口，下面是长长的矿道！ ----------------
const MINE_COUNT=4; // 一共有4个矿洞，散落在不同方向！
function getMinePos(idx){ // 每个矿洞位置和距离都不一样，跟着种子走
  idx=idx||0;
  const a=hash2(444555+idx*7,666777+idx*13)*Math.PI*2;
  const d=90+hash2(idx+1,999)*100; // 90-190格
  return {x:Math.round(spawnPoint.x+Math.cos(a)*d),z:Math.round(spawnPoint.z+Math.sin(a)*d)};
}
function mineHint(){
  let best=null,bestD=1e9;
  for(let i=0;i<MINE_COUNT;i++){
    const p=getMinePos(i);
    const d=Math.hypot(p.x-player.pos.x,p.z-player.pos.z);
    if(d<bestD){bestD=d;best=p;}
  }
  const dx=best.x-player.pos.x,dz=best.z-player.pos.z;
  const dist=Math.round(bestD);
  const dirs=['北','东北','东','东南','南','西南','西','西北'];
  const dir=dirs[Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8&7];
  return '⛏ 最近的矿洞在【'+dir+'边】大约 '+dist+' 格！（一共有'+MINE_COUNT+'个矿洞哦）找到木头框的井口跳下去，矿道墙上全是矿石！';
}
const mineBuiltSet={};
let minePos=null;
function buildMineshaft(bx,bz){
  minePos={x:bx,z:bz};
  const MY=14; // 矿道的深度
  const airCells=[];
  // 挖一条矿道：3格宽、3格高，每5格一副木头支架+灯
  function carve(x,z,dx,dz,len){
    const ox=dz,oz=dx; // 横向偏移方向
    for(let i=0;i<len;i++){
      const cx=x+dx*i,cz=z+dz*i;
      for(let w=-1;w<=1;w++)for(let y=MY;y<MY+3;y++){
        setBlock(cx+ox*w,y,cz+oz*w,B_AIR);
        airCells.push([cx+ox*w,y,cz+oz*w]);
      }
      if(i%5===2){ // 木头支架：两根原木柱子+头顶木横梁
        for(const s of [-1,1]){setBlock(cx+ox*s,MY,cz+oz*s,B_LOG);setBlock(cx+ox*s,MY+1,cz+oz*s,B_LOG);}
        for(let w=-1;w<=1;w++)setBlock(cx+ox*w,MY+2,cz+oz*w,B_PLANKS);
        if(i%10===2)setBlock(cx,MY+2,cz,B_GLOWSTONE); // 梁上挂灯
      }
    }
  }
  const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
  const di=Math.floor(hash2(bx,bz)*4); // 每个矿洞朝不同方向
  const d=dirs[di];
  carve(bx,bz,d[0],d[1],44); // 主矿道
  carve(bx+d[0]*15,bz+d[1]*15,d[1],d[0],16); // 左边的岔道
  carve(bx+d[0]*30,bz+d[1]*30,-d[1],-d[0],16); // 右边的岔道
  // 矿道墙上露出矿石！煤、铁、金、红石，运气好还有钻石！
  const done={};
  for(const c of airCells){
    for(const o of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const nx=c[0]+o[0],ny=c[1]+o[1],nz=c[2]+o[2];
      const key=nx+','+ny+','+nz;
      if(done[key])continue;
      done[key]=1;
      if(getBlock(nx,ny,nz)!==B_STONE)continue;
      const r=hash3(nx,ny,nz);
      if(r<0.08)setBlock(nx,ny,nz,B_COAL_ORE);
      else if(r<0.14)setBlock(nx,ny,nz,B_IRON_ORE);
      else if(r<0.17)setBlock(nx,ny,nz,B_GOLD_ORE);
      else if(r<0.20)setBlock(nx,ny,nz,B_REDSTONE_ORE);
      else if(r<0.215)setBlock(nx,ny,nz,B_DIAMOND_ORE); // 💎 钻石！
    }
  }
  // 矿道尽头和岔道尽头各放一个宝箱
  const lootTab=[[I.iron_ingot,2,5],[I.gold_ingot,1,3],[I.coal,3,8],[I.redstone,3,6],[I.bread,1,3],[I.diamond,1,2]];
  const chestSpots=[
    [bx+d[0]*42,bz+d[1]*42],
    [bx+d[0]*15+d[1]*15,bz+d[1]*15+d[0]*15],
    [bx+d[0]*30-d[1]*15,bz+d[1]*30-d[0]*15]
  ];
  for(const cs of chestSpots){
    const chx=cs[0],chz=cs[1];
    setBlock(chx,MY,chz,B_CHEST);
    const ck2=chx+','+MY+','+chz;
    if(!chestStates[ck2]){
      const slots=new Array(27).fill(null);
      let placed=0;
      for(const l of lootTab){
        if(hash3(chx+placed,MY,chz)<0.15)continue;
        const n=l[1]+Math.floor(hash3(chx,MY+placed,chz)*(l[2]-l[1]+1));
        slots[(placed*5+2)%27]={id:l[0],count:n}; // 每种宝贝一个格子，不会挤掉
        placed++;
      }
      if(hash3(chx,MY,chz+33)<0.15)slots[13]={id:I.infinity_ingot,count:1};
      chestStates[ck2]={slots};
    }
  }
  // 地面上的入口：木头框的井口，一眼就能认出来！
  const fy=surfaceY(bx,bz);
  for(const o of [[-2,-2],[2,-2],[-2,2],[2,2]])for(let y=fy+1;y<=fy+3;y++)setBlock(bx+o[0],y,bz+o[1],B_LOG); // 四根柱子
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)
    if(Math.abs(dx)===2||Math.abs(dz)===2)setBlock(bx+dx,fy+4,bz+dz,B_PLANKS); // 顶上的小棚子
  setBlock(bx,fy+5,bz,B_GLOWSTONE); // 棚顶一盏灯
  // 3×3 竖井直通矿道，井底有水接着你
  for(let y=fy;y>=MY;y--){
    for(const o of [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,0],[-1,1],[0,0]])
      setBlock(bx+o[0],y,bz+o[1],B_AIR);
    if((fy-y)%6===0)setBlock(bx+1,y,bz+1,B_GLOWSTONE); // 井壁小灯
  }
  setBlock(bx,MY-1,bz,B_WATER); // 井底水池
  setBlock(bx,MY,bz,B_WATER);
}
function mineshaftTick(){
  if(curDim!=='overworld')return;
  for(let i=0;i<MINE_COUNT;i++){
    if(mineBuiltSet[i])continue;
    const bp=getMinePos(i);
    if(Math.hypot(player.pos.x-bp.x,player.pos.z-bp.z)<90){
      mineBuiltSet[i]=true;
      buildMineshaft(bp.x,bp.z);
      showToast('⛏ 你发现了一个矿洞！跳下去（有水接住），矿道墙上全是矿石，尽头还有宝箱！');
    }
  }
}
// ---------------- 🐟 守卫者：海底神殿的大眼怪鱼 ----------------
function buildGuardianModel(){
  const g=new THREE.Group();
  const body=new THREE.MeshLambertMaterial({color:0x3a9aa8}); // 蓝绿色的身体
  const spikeM=new THREE.MeshLambertMaterial({color:0xe07820}); // 橙色的刺
  const box=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.55,0.9),body);
  box.position.y=0.4;g.add(box);
  const tail=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.4,0.3),body);
  tail.position.set(0,0.4,0.6);g.add(tail); // 尾巴
  // 一只超级大的眼睛！
  const eyeW=new THREE.MeshLambertMaterial({color:0xffffff});
  const eye=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.3,0.06),eyeW);
  eye.position.set(0,0.42,-0.46);g.add(eye);
  const pupil=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,0.03),new THREE.MeshLambertMaterial({color:0x184a20}));
  pupil.position.set(0,0.42,-0.5);g.add(pupil);
  // 身上长满橙色的尖刺
  const spikes=[[0,0.75,0,0],[0.42,0.5,0,0.5],[-0.42,0.5,0,-0.5],[0,0.5,0.42,0],[0,0.5,-0.42,0]];
  for(const s of spikes){
    const sp=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.22,0.12),spikeM);
    sp.position.set(s[0],s[1],s[2]);sp.rotation.z=s[3];g.add(sp);
  }
  return {g,legs:[]};
}
function updateGuardian(m,dt){ // 在水里游来游去，看到你就放电！
  m.atkT-=dt;
  m.flyT+=dt;
  const dx=player.pos.x-m.pos.x,dy=(player.pos.y+0.8)-m.pos.y,dz=player.pos.z-m.pos.z;
  const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
  const playerInWater=getBlock(Math.floor(player.pos.x),Math.floor(player.pos.y),Math.floor(player.pos.z))===B_WATER;
  let tx,tz,ty;
  if(dist<24&&playerInWater&&!player.dead){ // 你在水里！它冲过来电你！
    tx=player.pos.x;tz=player.pos.z;ty=player.pos.y+0.8;
  }else if(m.home){ // 没人的时候绕着神殿转圈
    m.dirT-=dt;
    if(m.dirT<=0){m.dirT=3+Math.random()*3;m.homeA=Math.random()*Math.PI*2;}
    tx=m.home.x+Math.cos(m.homeA||0)*8;tz=m.home.z+Math.sin(m.homeA||0)*8;ty=m.home.y+Math.sin(m.flyT*1.5)*2;
  }else{tx=m.pos.x;tz=m.pos.z;ty=m.pos.y;}
  const ddx=tx-m.pos.x,ddy=ty-m.pos.y,ddz=tz-m.pos.z;
  const dd=Math.sqrt(ddx*ddx+ddy*ddy+ddz*ddz)||1;
  const spd=dist<24&&playerInWater?m.speed:m.speed*0.5;
  m.vel.x=ddx/dd*spd;m.vel.y=ddy/dd*spd*0.8+Math.sin(m.flyT*3)*0.3;m.vel.z=ddz/dd*spd;
  m.moving=true;m.walkT+=dt*4;
  m.yaw=Math.atan2(-ddx,-ddz);
  mobMoveAxis(m,'x',m.vel.x*dt);mobMoveAxis(m,'y',m.vel.y*dt);mobMoveAxis(m,'z',m.vel.z*dt);
  if(m.atkT<=0&&dist<7&&playerInWater&&!player.dead){ // ⚡ 放电！
    m.atkT=2.2;
    damagePlayer(2,'被守卫者的激光电到了');
    for(let i=1;i<8;i++){ // 一条闪电粒子
      const t=i/8;
      spawnBlockParticles(m.pos.x+dx*t,m.pos.y+dy*t,m.pos.z+dz*t,'rgb(255,200,60)');
    }
    sfx.hit();
  }
  if(m.pos.y<-5){killMob(m,true);return;}
  m.group.position.copy(m.pos);m.group.rotation.y=m.yaw;
  mobFlash(m,dt);
}
// ---------------- 🌊 海底神殿：蓝色的海晶石宫殿！ ----------------
function getMonumentPos(){ // 离出生点近一点，游一小会儿就到
  const a=hash2(888222,111999)*Math.PI*2;
  return {x:Math.round(spawnPoint.x+Math.cos(a)*80),z:Math.round(spawnPoint.z+Math.sin(a)*80)};
}
function monumentHint(){
  const bp=getMonumentPos();
  const dx=bp.x-player.pos.x,dz=bp.z-player.pos.z;
  const dist=Math.round(Math.hypot(dx,dz));
  const dirs=['北','东北','东','东南','南','西南','西','西北'];
  const dir=dirs[Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8&7];
  return '🌊 海底神殿在【'+dir+'边】大约 '+dist+' 格的大海底下！蓝色的海晶石宫殿里有宝箱和金块，但是小心守卫者！';
}
let monumentBuilt=false,monumentPos=null;
function buildOceanMonument(){
  const bp=getMonumentPos();
  const DEEP=SEA-14; // 海底要够深，整座宫殿才能泡在水里
  // 找附近够深的海
  let bx=bp.x,bz=bp.z,best=1e9;
  for(let dx=-60;dx<=60;dx+=6)for(let dz=-60;dz<=60;dz+=6){
    const sx=bp.x+dx,sz=bp.z+dz,y=surfaceY(sx,sz);
    if(getBlock(sx,SEA-1,sz)===B_WATER&&y<=DEEP&&y<best){best=y;bx=sx;bz=sz;}
  }
  if(best===1e9){ // 附近没有深海？自己挖一片海出来！
    bx=bp.x;bz=bp.z;best=DEEP;
    for(let dx=-18;dx<=18;dx++)for(let dz=-18;dz<=18;dz++){
      if(dx*dx+dz*dz>324)continue;
      const x=bx+dx,z=bz+dz,ty=surfaceY(x,z);
      if(ty>DEEP)for(let y=DEEP+1;y<=ty;y++)setBlock(x,y,z,y<=SEA-1?B_WATER:B_AIR); // 挖掉陆地灌满水
      else for(let y=ty+1;y<=SEA-1;y++)setBlock(x,y,z,B_WATER); // 本来就低，直接灌水
    }
  }
  monumentPos={x:bx,z:bz,y:best};
  const oy=best; // 海底的高度
  // 15×15 的蓝色海晶石宫殿
  for(let dx=-7;dx<=7;dx++)for(let dz=-7;dz<=7;dz++){
    const x=bx+dx,z=bz+dz;
    for(let y=oy+1;y<=oy+8;y++)setBlock(x,y,z,B_AIR); // 里面挖空（有空气可以呼吸！）
    setBlock(x,oy,z,B_PRISM); // 蓝色地板
    if(Math.abs(dx)===7||Math.abs(dz)===7)for(let y=oy+1;y<=oy+6;y++)setBlock(x,y,z,B_PRISM); // 蓝色墙
  }
  for(let layer=0;layer<5;layer++){ // 金字塔屋顶
    const r=8-layer;
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)
      if(Math.abs(dx)===r||Math.abs(dz)===r||layer>=3)setBlock(bx+dx,oy+6+layer,bz+dz,B_PRISM);
  }
  setBlock(bx,oy+11,bz,B_GLOWSTONE); // 塔顶海灯笼
  for(const o of [[-6,-6],[6,-6],[-6,6],[6,6]])for(let y=oy+1;y<=oy+8;y++)setBlock(bx+o[0],y,bz+o[1],B_PRISM); // 四根大柱子
  for(const o of [[-6,-6],[6,-6],[-6,6],[6,6]])setBlock(bx+o[0],oy+9,bz+o[1],B_GLOWSTONE); // 柱顶海灯笼
  for(let y=oy+1;y<=oy+3;y++)setBlock(bx,y,bz+7,B_AIR); // 南面的门
  // 💰 宫殿中间：金块堆 + 两个宝箱！
  for(const o of [[0,0],[1,0],[0,1],[1,1]])setBlock(bx+o[0]-2,oy+1,bz+o[1]-2,B_GOLD_BLOCK);
  setBlock(bx-2,oy+2,bz-2,B_GOLD_BLOCK); // 金块堆成小山
  const lootTab=[[I.diamond,1,3],[I.gold_ingot,2,5],[I.emerald,1,3],[I.ender_pearl,1,2],[I.iron_ingot,2,4]];
  for(const c of [[3,3],[-3,3]]){
    const chx=bx+c[0],chz=bz+c[1];
    setBlock(chx,oy+1,chz,B_CHEST);
    const ck2=chx+','+(oy+1)+','+chz;
    if(!chestStates[ck2]){
      const slots=new Array(27).fill(null);
      let placed=0;
      for(const l of lootTab){
        if(hash3(chx+placed,oy,chz)<0.2)continue;
        const n=l[1]+Math.floor(hash3(chx,oy+placed,chz)*(l[2]-l[1]+1));
        slots[(placed*5+2)%27]={id:l[0],count:n};
        placed++;
      }
      if(hash3(chx,oy,chz+44)<0.2)slots[13]={id:I.infinity_ingot,count:1};
      chestStates[ck2]={slots};
    }
  }
  setBlock(bx+4,oy+4,bz-4,B_GLOWSTONE);setBlock(bx-4,oy+4,bz+4,B_GLOWSTONE); // 宫殿里的灯
  // 把宫殿周围一圈泡进水里（守卫者游泳的地方，不会卡进石头）
  for(let dx=-16;dx<=16;dx++)for(let dz=-16;dz<=16;dz++){
    if(Math.abs(dx)<=8&&Math.abs(dz)<=8)continue; // 宫殿本体不动
    if(dx*dx+dz*dz>256)continue;
    for(let y=oy+1;y<=SEA-1;y++)
      if(getBlock(bx+dx,y,bz+dz)!==B_WATER)setBlock(bx+dx,y,bz+dz,B_WATER);
  }
  // 🐟 放 4 只守卫者守着神殿！
  for(let i=0;i<4;i++){
    const a=i/4*Math.PI*2;
    const gx=Math.round(bx+Math.cos(a)*10),gz=Math.round(bz+Math.sin(a)*10);
    const g=spawnMob('guardian',gx,gz,oy+4);
    g.home={x:bx,y:oy+3,z:bz};g.homeA=a;
    g.noBurn=true;
  }
}
function monumentTick(){
  if(curDim!=='overworld')return;
  const bp=getMonumentPos();
  if(!monumentBuilt){
    if(Math.hypot(player.pos.x-bp.x,player.pos.z-bp.z)<100){
      monumentBuilt=true;
      buildOceanMonument();
      showToast('🌊 你发现了海底神殿！蓝色的宫殿里有金块和宝箱……小心守卫者放电！');
    }
    return;
  }
  // 守卫者被消灭光了？你靠近时它会再游回来几只
  if(monumentPos&&Math.hypot(player.pos.x-monumentPos.x,player.pos.z-monumentPos.z)<60){
    let g=0;
    for(const m of mobs)if(!m.dead&&m.type==='guardian')g++;
    if(g<2&&Math.random()<0.01){
      const gg=spawnMob('guardian',monumentPos.x+6,monumentPos.z+6,monumentPos.y+4);
      gg.home={x:monumentPos.x,y:monumentPos.y+3,z:monumentPos.z};
      gg.noBurn=true;
    }
  }
}

// ---------------- 🍀 幸运方块：挖开看看是惊喜还是惊吓！ ----------------
function luckyLightning(x,z){ // 一道闪电正好劈在幸运方块的位置！
  const ly=surfaceY(x,z);
  weather.flash=1;
  for(let yy=0;yy<16;yy++)spawnBlockParticles(x+0.5,ly+1+yy*1.4,z+0.5,'rgb(255,255,200)');
  thunderSound(2);
  const pd=Math.hypot(player.pos.x-x,player.pos.z-z);
  if(pd<4&&!player.dead){damagePlayer(3,'被幸运方块的闪电劈中了');player.vel.y=4;}
}
function buildLuckyHouse(x,y,z){ // 啵！变出一座小木屋，里面还有个小宝箱
  const sy=y>8?y:surfaceY(x,z);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
    for(let dy=0;dy<4;dy++)setBlock(x+dx,sy+dy,z+dz,B_AIR);
    setBlock(x+dx,sy-1,z+dz,B_PLANKS); // 木地板
    if(Math.abs(dx)===2||Math.abs(dz)===2)for(let dy=0;dy<3;dy++){
      if(dz===2&&dx===0&&dy<2)continue; // 门
      setBlock(x+dx,sy+dy,z+dz,B_PLANKS);
    }
    setBlock(x+dx,sy+3,z+dz,B_PLANKS); // 屋顶
  }
  setBlock(x,sy+4,z,B_GLOWSTONE); // 屋顶灯
  setBlock(x-1,sy,z-1,B_CHEST);
  const ck2=(x-1)+','+sy+','+(z-1);
  if(!chestStates[ck2]){
    const slots=new Array(27).fill(null);
    slots[3]={id:I.gold_ingot,count:2+((Math.random()*3)|0)};
    slots[11]={id:I.bread,count:2};
    if(Math.random()<0.3)slots[13]={id:I.diamond,count:1};
    chestStates[ck2]={slots};
  }
}
function luckyEvent(b,x,y,z){
  const px=x+0.5,py=y+0.5,pz=z+0.5;
  spawnBlockParticles(px,py,pz,b===B_UNLUCKY?'rgb(140,80,200)':'rgb(255,230,80)');
  // 💎 钻石幸运方块：几乎全是传说装备！
  if(b===B_LUCKY_DIAMOND){
    if(Math.random()<0.95){
      const gear=[I.infinity_ingot,I.infinity_ingot,I.netherite_sword,I.netherite_pickaxe,I.diamond_sword,I.diamond_helmet,I.diamond_chest,I.diamond_legs,I.diamond_boots];
      spawnDrop(px,py,pz,gear[(Math.random()*gear.length)|0],1);
      spawnDrop(px,py,pz,I.diamond,2+((Math.random()*4)|0));
      showToast('💎✨ 钻石幸运方块掉出了传说装备！！');
    }else{
      luckyLightning(x,z);
      showToast('⚡ 哎呀！只有5%的倒霉闪电被你碰上啦！');
    }
    return;
  }
  // 🌈 彩虹幸运方块：一次抽两回（都是超级幸运！）
  if(b===B_LUCKY_RAINBOW){
    showToast('🌈 彩虹幸运方块！一次抽两回！！');
    luckyEvent(B_LUCKY_SUPER,x,y,z);
    luckyEvent(B_LUCKY_SUPER,x,y,z);
    return;
  }
  // 🧨 炸弹幸运方块：一定会闪电+大爆炸！
  if(b===B_LUCKY_TNT){
    luckyLightning(x,z);
    explode(x,y,z,3,10);
    showToast('🧨💥 轰隆隆！！炸弹幸运方块爆炸啦！！');
    return;
  }
  // 👾 生物幸运方块：蹦出5只生物，一半是小动物，一半是怪物！
  if(b===B_LUCKY_MOB){
    if(Math.random()<0.5){
      for(let i=0;i<5;i++)spawnMob(['pig','sheep','chicken'][(Math.random()*3)|0],x+((Math.random()*5)|0)-2,z+((Math.random()*5)|0)-2);
      if(Math.random()<0.3){spawnMob('golem',x,z);showToast('👾 哇！蹦出了一群小动物和一只铁傀儡保镖！');}
      else showToast('👾 蹦出了一大群小动物朋友！');
    }else{
      for(let i=0;i<5;i++)spawnMob(['zombie','skeleton','spider','creeper'][(Math.random()*4)|0],x+((Math.random()*5)|0)-2,z+((Math.random()*5)|0)-2);
      showToast('👾 不好！！蹦出了一大群怪物！！快跑！！');
    }
    return;
  }
  const r=Math.random();
  const good=b===B_LUCKY_SUPER?(r<0.85):b===B_LUCKY?(r<0.6):(r<0.15);
  if(good){
    const t=Math.random();
    if(t<0.3){ // 🎁 超级装备！
      const gear=[I.diamond_sword,I.netherite_sword,I.diamond_helmet,I.diamond_chest,I.diamond_legs,I.diamond_boots,I.bow,I.potion_heal];
      spawnDrop(px,py,pz,gear[(Math.random()*gear.length)|0],1);
      if(Math.random()<0.2){spawnDrop(px,py,pz,I.infinity_ingot,1);showToast('🍀✨ 天呐！！幸运方块掉出了无尽贪婪锭！！');}
      else showToast('🍀 哇！幸运方块掉出了超级装备！');
    }else if(t<0.55){ // 💎 钻石金锭雨
      const n=2+((Math.random()*4)|0);
      spawnDrop(px,py,pz,I.diamond,n);
      spawnDrop(px,py,pz,I.gold_ingot,n);
      showToast('🍀 哗啦啦！钻石和金锭！');
    }else if(t<0.8){ // 🏠 变出一座小房子
      buildLuckyHouse(x,y,z);
      showToast('🍀 啵！幸运方块变成了一座小房子！里面有个小宝箱～');
    }else{ // 🐷 小动物朋友
      for(let i=0;i<3;i++)spawnMob(['pig','sheep','chicken'][(Math.random()*3)|0],x+((Math.random()*3)|0),z+((Math.random()*3)|0));
      showToast('🍀 变出了一群小动物朋友！');
    }
  }else{
    const t=Math.random();
    if(t<0.35){ // ⚡ 闪电劈下来！
      luckyLightning(x,z);
      showToast('⚡ 倒霉！！闪电劈下来了！！');
    }else if(t<0.6){ // 💥 爆炸！
      explode(px,py,pz,3,10);
      showToast('💥 倒霉方块爆炸了！！');
    }else if(t<0.85){ // 🧟 僵尸围攻
      for(let i=0;i<4;i++)spawnMob('zombie',x+2-i,z+((Math.random()*3)|0)-1);
      showToast('🧟 倒霉！一群僵尸爬出来了！');
    }else{ // 💚 苦力怕贴脸
      spawnMob('creeper',x+1,z);
      spawnMob('creeper',x-1,z);
      showToast('💚 嘶嘶……苦力怕就在你旁边！！');
    }
  }
}

// 水流动：挖开水边的方块，水会往下/往旁边流过去（每 0.5 秒流一格）
const waterFlowQ=[];
let waterT=0;
function queueWaterNear(x,y,z){
  for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]]){
    if(getBlock(x+d[0],y+d[1],z+d[2])===B_WATER)waterFlowQ.push({x:x+d[0],y:y+d[1],z:z+d[2]});
  }
}
function waterFlowStep(wx,wy,wz){
  if(getBlock(wx,wy,wz)!==B_WATER)return;
  // 往下流
  if(getBlock(wx,wy-1,wz)===B_AIR){setBlock(wx,wy-1,wz,B_WATER);queueWaterNear(wx,wy-1,wz);return;}
  // 往旁边流（只流 3 格远，不然整个地图都被淹了）
  let flowed=0;
  for(const d of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
    if(getBlock(wx+d[0],wy,wz+d[2])===B_AIR){
      setBlock(wx+d[0],wy,wz+d[2],B_WATER);flowed++;
      if(flowed>=2)return;
    }
  }
}
function waterTick(dt){
  waterT+=dt;
  if(waterT<0.5)return;
  waterT=0;
  const n=waterFlowQ.length;
  for(let i=0;i<Math.min(n,8);i++){ // 每次最多流 8 格，不卡
    const w=waterFlowQ.shift();
    waterFlowStep(w.x,w.y,w.z);
  }
}

// ---------------- 💥 爆炸（通用：TNT/神殿陷阱/倒霉方块/凋零骷髅头共用） ----------------
function explode(x,y,z,r,dmg){
  makeNoise(x,z); // 爆炸超大声！
  const cx=Math.floor(x),cy=Math.floor(y),cz=Math.floor(z);
  for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)for(let dz=-r;dz<=r;dz++){
    if(dx*dx+dy*dy+dz*dz>r*r)continue;
    const b=getBlock(cx+dx,cy+dy,cz+dz);
    if(b===0||b===B_BEDROCK||b===B_OBSIDIAN||b===B_COMMAND||b===B_ALTAR||b===B_WATER||b===B_LAVA)continue;
    setBlock(cx+dx,cy+dy,cz+dz,0);
  }
  for(let i=0;i<14;i++)
    spawnBlockParticles(x-0.5+Math.random(),y-0.5+Math.random()*1.5,z-0.5+Math.random(),i%2?'rgb(255,160,40)':'rgb(90,90,90)');
  sfx.breakBlock('stone');sfx.hurt();
  for(const m of mobs){ // 炸伤周围的怪物（凋零风暴除外，它只怕恐怖炸弹）
    if(m.dead||m.type==='wstorm')continue;
    const d=Math.hypot(m.pos.x-x,m.pos.y+0.5-y,m.pos.z-z);
    if(d<r+2)hurtMob(m,Math.max(dmg*(1-d/(r+3)),1));
  }
  const pd=Math.hypot(player.pos.x-x,player.pos.y+1-y,player.pos.z-z);
  if(pd<r+2){
    damagePlayer(dmg*0.5*(1-pd/(r+3)),'被炸飞了');
    player.vel.y=7;player.peakY=player.pos.y+2;
  }
}

// ---------------- 枪战竞技场（shooter 模式，多场景可选，64x64 固定边界） ----------------
const ARENA_SEED=20260802; // 枪战世界固定种子
const ARENA_HALF=32, ARENA_GROUND=32, ARENA_WALL_H=6;
let arenaScene='classic'; // 当前枪战场景（建房时选择，welcome 同步给客人）
// 场景定义：id / 名称 / 描述 / 出生点 / 材质（地面/墙/掩体）/ 掩体列表 / 特殊地形生成器
const ARENA_SCENES=[
  // ========== 1. 阳光花园：草地 + 中央喷泉 + 树（树叶挡子弹）+ 四角花坛 ==========
  {id:'classic',name:'阳光花园',icon:'🌳',desc:'草地花园 · 喷泉树影',
   spawns:[[-27,-27],[27,-27],[-27,27],[27,27]],
   mat:{wall:B_STONE,cover:B_COBBLE},
   covers:[
     [-7,-5,-7,-5,2],[-7,-5,5,7,2],[5,7,-7,-5,2],[5,7,5,7,2], // 四象限石墙
     [-16,-13,-16,-13,2],[-16,-13,13,16,2],[13,16,-16,-13,2],[13,16,13,16,2], // 四角石堡
     [-24,-21,-4,-1,1],[-24,-21,1,4,1],[21,24,-4,-1,1],[21,24,1,4,1], // 左右矮墙
     [-4,-1,-24,-21,1],[-4,-1,21,24,1],[1,4,-24,-21,1],[1,4,21,24,1], // 上下矮墙
   ],
   build:function(x,y,z){
     const ax=Math.abs(x),az=Math.abs(z);
     // 中央喷泉：5×5 石边 + 3×3 水面 + 中央萤石灯柱（水中减速，可跳过石边入水）
     if(ax<=2&&az<=2){
       if(ax===0&&az===0){
         if(y===ARENA_GROUND)return B_STONE;
         if(y<=ARENA_GROUND+2)return B_GLOWSTONE;
         return B_AIR;
       }
       if(ax===2||az===2)return y===ARENA_GROUND?B_STONE:undefined;
       if(y===ARENA_GROUND)return B_WATER;
       return B_AIR;
     }
     // 树：6 棵（原木 3 格 + 双层树叶，树叶实心挡子弹 = 天然掩体）
     const trees=[[-18,-8],[18,8],[-8,18],[8,-18],[-13,13],[13,-13]];
     for(const [tx,tz] of trees){
       const adx=Math.abs(x-tx),adz=Math.abs(z-tz);
       if(x===tx&&z===tz&&y>ARENA_GROUND&&y<=ARENA_GROUND+3)return B_LOG;
       if(adx<=1&&adz<=1&&y===ARENA_GROUND+4)return B_LEAVES;
       if(adx===0&&adz===0&&y===ARENA_GROUND+5)return B_LEAVES;
     }
     // 四角花坛：圆石边 + 花
     const gardens=[[-22,-22],[22,-22],[-22,22],[22,22]];
     for(const [gx,gz] of gardens){
       const adx=Math.abs(x-gx),adz=Math.abs(z-gz);
       if(adx<=1&&adz<=1){
         if(y===ARENA_GROUND&&(adx===1||adz===1))return B_COBBLE;
         if(y===ARENA_GROUND+1&&adx===0&&adz===0)return B_FLOWER;
       }
     }
     if(y===ARENA_GROUND)return B_GRASS; // 草地地面
     return undefined;
   }},
  // ========== 2. 废墟基地：4 座不同破损度的楼 + 中央瞭望塔（坡道上塔狙击）+ 碎石堆 ==========
  {id:'ruins',name:'废墟基地',icon:'🏚️',desc:'破楼残墙 · 瞭望塔狙击',
   spawns:[[-27,-27],[27,-27],[-27,27],[27,27]],
   mat:{wall:B_COBBLE,cover:B_COBBLE},
   covers:[
     [-14,-12,-14,-12,2],[12,14,-14,-12,2],[-14,-12,12,14,2],[12,14,12,14,2], // 内四角石垒
     [-26,-23,-6,-3,1],[-26,-23,3,6,1],[23,26,-6,-3,1],[23,26,3,6,1], // 侧翼矮墙
   ],
   build:function(x,y,z){
     const ax=Math.abs(x),az=Math.abs(z);
     // 中央瞭望塔：3×3 石身 6 格（y33-38）+ 四角萤石灯（y39）+ 南坡道（z2-7 爬升，可上塔狙击）
     if(ax===1&&az===1&&y===ARENA_GROUND+7)return B_GLOWSTONE; // 塔顶四角灯（先判断，防塔身分支吞掉）
     if(ax<=1&&az<=1){
       if(y>ARENA_GROUND&&y<=ARENA_GROUND+6)return B_STONE;
       return y===ARENA_GROUND?B_STONE:B_AIR;
     }
     if(ax===0&&z>=2&&z<=7){const h=8-z;if(y>ARENA_GROUND&&y<=ARENA_GROUND+h)return B_PLANKS;}
     // 楼群：4 座不同破损度（完整→半塌→残墙→地基），木地板 + 圆石墙
     const houses=[
       {hx:-20,hz:-20,full:3,door:1},
       {hx:20,hz:-20,full:2,door:1},
       {hx:-20,hz:20,full:1,door:0},
       {hx:20,hz:20,full:0,door:0},
     ];
     for(const h of houses){
       const adx=Math.abs(x-h.hx),adz=Math.abs(z-h.hz);
       if(adx<=2&&adz<=2){
         const edge=(adx===2||adz===2);
         if(!edge&&y===ARENA_GROUND)return B_PLANKS;
         if(edge&&y===ARENA_GROUND)return B_COBBLE;
         if(edge&&y>ARENA_GROUND&&y<=ARENA_GROUND+h.full){
           if(h.door&&adx===0&&adz===2&&y<=ARENA_GROUND+1)return B_AIR; // 南门洞
           return B_COBBLE;
         }
         if(y>ARENA_GROUND)return B_AIR;
       }
     }
     // 碎石堆：随机散布 1 格高圆石（废墟感）
     if(y===ARENA_GROUND+1&&((x*7+z*13)%29+29)%29===0)return B_COBBLE;
     // 烧焦树：3 根裸原木柱
     const burnt=[[-8,-14],[14,9],[-3,24]];
     for(const [bx,bz] of burnt){
       if(x===bx&&z===bz&&y>ARENA_GROUND&&y<=ARENA_GROUND+3)return B_LOG;
     }
     // 地面：石头为主 + 圆石 + 泥土斑（破败混杂）
     if(y===ARENA_GROUND){
       const v=((x*31+z*17)%11+11)%11;
       if(v<2)return B_DIRT;
       if(v<5)return B_COBBLE;
       return B_STONE;
     }
     return undefined;
   }},
  // ========== 3. 地下仓库：木板迷宫 + 墙顶嵌萤石灯 + 中央十字通道 + 萤石广场 ==========
  {id:'maze',name:'地下仓库',icon:'📦',desc:'昏暗迷宫 · 转角遇敌',
   spawns:[[-27,1],[27,1],[1,27],[1,-27]], // 出生在十字通道（避免卡墙）
   mat:{wall:B_PLANKS,cover:B_PLANKS},
   build:function(x,y,z){
     const ax=Math.abs(x),az=Math.abs(z);
     // 中央十字大通道（宽 3）：石板地 + 无墙畅通
     if(ax<=1||az<=1){
       if(ax<=1&&az<=1){ // 中央广场 3×3：萤石地面 + 四角石柱（先判断，防通道路径吞掉）
         if(y===ARENA_GROUND)return B_GLOWSTONE;
         if(y===ARENA_GROUND+1&&(ax===1&&az===1))return B_STONE;
         return B_AIR;
       }
       if(y===ARENA_GROUND)return B_STONE;
       return B_AIR;
     }
     // 迷宫墙：棋盘 + 每 4 格缺口 + 局部高墙段（视野盲区）+ 墙顶嵌萤石灯
     if((x+z)%2===0){
       const gx=((x%4)+4)%4,gz=((z%4)+4)%4;
       if(!(gx===0&&gz===0)){
         const tall=((Math.floor(x/8)+Math.floor(z/8))%2+2)%2===0;
         const maxH=tall?3:2;
         if(y>ARENA_GROUND&&y<=ARENA_GROUND+maxH){
           if(y===ARENA_GROUND+maxH&&((x*3+z*5)%13+13)%13===0)return B_GLOWSTONE; // 嵌灯照明
           return B_PLANKS;
         }
         if(y>ARENA_GROUND)return B_AIR;
       }
     }
     // 仓库地板：木板为主 + 局部石头磨损
     if(y===ARENA_GROUND){
       const v=((x*13+z*7)%7+7)%7;
       return v<2?B_STONE:B_PLANKS;
     }
     return undefined;
   }},
  // ========== 4. 山地要塞：外围山坡（出生居高临下）+ 中央高塔 + 错落岩石平台 ==========
  {id:'towers',name:'山地要塞',icon:'⛰️',desc:'山坡高地 · 塔顶对决',
   spawns:[[-27,-27],[27,-27],[-27,27],[27,27]],
   mat:{wall:B_STONE,cover:B_STONE},
   build:function(x,y,z){
     const ax=Math.abs(x),az=Math.abs(z),r2=x*x+z*z;
     // 中央要塞塔：3×3 石身 5 格（y33-37）+ 四角萤石灯（y38）+ 南坡道（z2-6 爬升上塔）
     if(ax===1&&az===1&&y===ARENA_GROUND+6)return B_GLOWSTONE; // 塔顶四角灯（先判断）
     if(ax<=1&&az<=1){
       if(y>ARENA_GROUND&&y<=ARENA_GROUND+5)return B_STONE;
       return y===ARENA_GROUND?B_STONE:B_AIR;
     }
     if(ax===0&&z>=2&&z<=6){const h=7-z;if(y>ARENA_GROUND&&y<=ARENA_GROUND+h)return B_PLANKS;}
     // 四象限岩石平台：近台 3 格 / 远台 2 格（草顶）
     if(ax>=6&&ax<=10&&az>=6&&az<=10){
       if(y>ARENA_GROUND&&y<=ARENA_GROUND+3)return y===ARENA_GROUND+3?B_GRASS:B_STONE;
     }
     if(ax>=20&&ax<=24&&az>=20&&az<=24){
       if(y>ARENA_GROUND&&y<=ARENA_GROUND+2)return y===ARENA_GROUND+2?B_GRASS:B_STONE;
     }
     // 山坡地形：外圈环形山（r>30 一层 / r>33 两层），出生点居高临下
     if(r2>1100&&y===ARENA_GROUND+2)return B_STONE;
     if(r2>900&&y===ARENA_GROUND+1)return B_STONE;
     if(r2>700&&y===ARENA_GROUND)return B_DIRT;
     if(y===ARENA_GROUND)return B_GRASS; // 内圈草地
     return undefined;
   }},
];
function curArenaScene(){return ARENA_SCENES.find(s=>s.id===arenaScene)||ARENA_SCENES[0];}
// 空岛模式：悬浮在高空的圆角浮岛（11×11），中央一棵树，岛外虚空
const SKY_ISLAND_HALF=5, SKY_TOP=48;
function genSkyBlockChunk(cx,cz){
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    const ax=Math.abs(x),az=Math.abs(z);
    if(ax>SKY_ISLAND_HALF||az>SKY_ISLAND_HALF)continue; // 岛外 = 虚空
    if(ax===SKY_ISLAND_HALF&&az===SKY_ISLAND_HALF)continue; // 四角切圆
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===SKY_TOP)b=B_GRASS;                                  // 顶层草方块
      else if(y===SKY_TOP-1||y===SKY_TOP-2)b=B_DIRT;             // 泥土层
      else if(y===SKY_TOP-3)b=B_STONE;                           // 石头层
      else if(y===SKY_TOP-4)b=B_BEDROCK;                         // 基岩防挖穿
      else if(y>SKY_TOP&&y<SKY_TOP+3&&x===0&&z===3)b=B_LOG;      // 中央树：原木 3 格
      else if(y===SKY_TOP+3&&x===0&&z===3)b=B_LOG;
      else if(y===SKY_TOP+3&&(ax===1&&z===3||x===0&&Math.abs(z-3)===1))b=B_LEAVES; // 树冠下层十字
      else if(y===SKY_TOP+4&&ax<=1&&Math.abs(z-3)<=1)b=B_LEAVES; // 树冠上层 3×3
      arr[lidx(lx,y,lz)]=b;
    }
  }
  // blockDiff 叠加（玩家改动保留）
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
// 跑酷模式：山谷桥梁地形（两侧石山 |x|>11 高36 + 中间深谷 |x|<=11 谷底18，平台桥由 startParkour 铺在峡谷上方）
function genParkourChunk(cx,cz){
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx;
    const isValley=Math.abs(x)<=11;
    const h=isValley?18:36;
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0)b=B_BEDROCK;
      else if(y<h-3)b=B_STONE;
      else if(y<h)b=isValley?B_STONE:B_DIRT;
      else if(y===h)b=isValley?B_STONE:(Math.abs(x)<=13?B_STONE:B_GRASS);
      arr[lidx(lx,y,lz)]=b;
    }
  }
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
function genArenaChunk(cx,cz){
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const scene=curArenaScene();
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  const inArena=(x,z)=>x>=-ARENA_HALF&&x<ARENA_HALF&&z>=-ARENA_HALF&&z<ARENA_HALF;
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    if(!inArena(x,z))continue; // 竞技场外 = 虚空
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0)b=B_BEDROCK;
      else if(y<ARENA_GROUND)b=B_STONE;                       // 实心底座
      else if(y===ARENA_GROUND){ // 地面：build 可定制（如废墟楼内木板地），否则棋盘拼花
        let sb=undefined;if(scene.build)sb=scene.build(x,y,z);
        b=(sb!==undefined)?sb:(((x+z)&1)?B_STONE:B_COBBLE);
      }
      else if(y<ARENA_GROUND+ARENA_WALL_H&&(Math.abs(x)===ARENA_HALF-1||Math.abs(z)===ARENA_HALF-1))b=(scene.mat&&scene.mat.wall)||B_STONE; // 边界墙（场景材质）
      else{
        // 掩体与高台（场景材质）
        let cover=0;
        for(const c of scene.covers||[]){
          if(x>=c[0]&&x<=c[1]&&z>=c[2]&&z<=c[3]){
            const top=ARENA_GROUND+c[4];
            if(y<=top){b=(scene.mat&&scene.mat.cover)||B_COBBLE;cover=1;}
            break;
          }
        }
        if(!cover&&scene.build){
          const sb=scene.build(x,y,z);
          if(sb!==undefined)b=sb;
        }
      }
      arr[lidx(lx,y,lz)]=b;
    }
  }
  // blockDiff 叠加（玩家改动保留）
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
function genChunkData(cx,cz){
  if(ORE_DIMS[curDim])return genOreDimChunk(cx,cz); // 矿石维度
  if(modsOn.oneblock&&curDim==='overworld'){ // ☝️ 单格方块生存：主世界全空，只有玩家放过的方块
    const key=ck(cx,cz);
    if(chunks[key])return chunks[key];
    const arr=new Uint8Array(CH*H*CH);
    const x0=cx*CH,z0=cz*CH;
    for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
      const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
      if(d!==undefined)arr[lidx(lx,y,lz)]=d;
    }
    chunks[key]=arr;
    return arr;
  }
  if(curDim==='nether')return genNetherChunk(cx,cz);
  if(curDim==='end')return genEndChunk(cx,cz);
  if(gameMode==='shooter'&&curDim==='overworld')return genArenaChunk(cx,cz); // 枪战模式：竞技场
  if(gameMode==='skyblock'&&curDim==='overworld')return genSkyBlockChunk(cx,cz); // 空岛模式：浮岛
  if(gameMode==='parkour'&&curDim==='overworld')return genParkourChunk(cx,cz); // 跑酷模式：山谷桥梁
  const key=ck(cx,cz);
  if(chunks[key])return chunks[key];
  const arr=new Uint8Array(CH*H*CH);
  const x0=cx*CH,z0=cz*CH;
  // 1) 地形
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz,h=terrainH(x,z);
    const rocky=biomeAt(x,z)===1&&h>=38; // 高山岩石峰顶
    for(let y=0;y<H;y++){
      let b=B_AIR;
      if(y===0)b=B_BEDROCK;
      else if(y<h-3)b=B_STONE;
      else if(y<h)b=rocky?B_STONE:((h<=SEA+1)?B_SAND:B_DIRT);
      else if(y===h)b=rocky?B_STONE:((h<=SEA+1)?B_SAND:B_GRASS);
      else if(y<=SEA)b=B_WATER;
      arr[lidx(lx,y,lz)]=b;
    }
  }
  // 2) 矿脉（邻近9区块为脉源，确定性生成，跨区块无缝）
  for(let k=0;k<VEINS.length;k++){
    const V=VEINS[k];
    for(let ox=cx-1;ox<=cx+1;ox++)for(let oz=cz-1;oz<=cz+1;oz++){
      const rnd=veinRng(ox,oz,k);
      for(let i=0;i<V[1];i++){
        let x=ox*CH+((rnd()*CH)|0),z=oz*CH+((rnd()*CH)|0),y=1+((rnd()*V[2])|0);
        const size=V[3]+((rnd()*(V[4]-V[3]+1))|0);
        for(let j=0;j<size;j++){
          const lx=x-x0,lz=z-z0;
          if(lx>=0&&lx<CH&&lz>=0&&lz<CH&&y>=1&&y<H&&arr[lidx(lx,y,lz)]===B_STONE)arr[lidx(lx,y,lz)]=V[0];
          const d=(rnd()*6)|0;
          if(d===0)x++;else if(d===1)x--;else if(d===2)y++;else if(d===3)y--;else if(d===4)z++;else z--;
          y=clamp(y,1,H-1);
        }
      }
    }
  }
  // 3) 树（按生态选树种：橡树/白桦/云杉/丛林/金合欢/深色橡木/樱花）
  // 树种表: [原木, 树叶, 密度, 基础高, 高度浮动, 树冠样式]
  const TREE_SP={
    oak:[B_LOG,B_LEAVES,0.012,4,3,'oak'],
    birch:[B_BIRCH_LOG,B_LEAVES,0.022,6,3,'oak'],
    spruce:[B_SPRUCE_LOG,B_SPRUCE_LEAVES,0.02,7,3,'spruce'],
    jungle:[B_JUNGLE_LOG,B_LEAVES,0.02,10,4,'jungle'],
    acacia:[B_ACACIA_LOG,B_LEAVES,0.01,3,2,'acacia'],
    dark:[B_DARK_LOG,B_DARK_LEAVES,0.024,5,2,'dark'],
    cherry:[B_CHERRY_LOG,B_CHERRY_LEAVES,0.018,4,3,'oak']
  };
  function spOf(bio){
    if(bio===1)return [B_LOG,B_LEAVES,0.005,4,3,'oak'];        // 小山：稀疏橡树
    if(bio===2)return TREE_SP.birch;
    if(bio===3)return [B_LOG,B_LEAVES,0.016,4,3,'oak'];        // 花林：橡树+花
    if(bio===4)return TREE_SP.spruce;
    if(bio===5)return TREE_SP.jungle;
    if(bio===6)return TREE_SP.acacia;
    if(bio===7)return TREE_SP.dark;
    if(bio===8)return TREE_SP.cherry;
    if(bio===9)return [B_DARK_LOG,B_PALE_LEAVES,0.028,5,2,'oak']; // 🩶 苍白花园：深色树干+灰树叶，树很多！
    return TREE_SP.oak;
  }
  function canopyLayers(style,th){
    if(style==='spruce'){ // 云杉：锥形，层层收窄
      const L=[];
      for(let dy=2;dy<=th;dy++){
        const r=Math.max(1,Math.round((th-dy)/th*2.4));
        if(dy%2===0||dy>=th-1)L.push([dy,r,true]);
      }
      L.push([th+1,0,false]);
      return L;
    }
    if(style==='jungle')return [[th-1,2,true],[th,2,true],[th+1,1,false]]; // 高杆小冠
    if(style==='acacia')return [[th,3,true],[th+1,1,false]];               // 平顶伞盖
    if(style==='dark')return [[th-2,2,false],[th-1,2,false],[th,2,false],[th+1,1,false]]; // 浓密
    return [[th-2,2,true],[th-1,2,true],[th,1,true],[th+1,1,true]];        // oak/樱花
  }
  const isLeafB=b=>b===B_LEAVES||b===B_SPRUCE_LEAVES||b===B_DARK_LEAVES||b===B_CHERRY_LEAVES||b===B_PALE_LEAVES;
  for(let tx=x0-3;tx<x0+CH+3;tx++)for(let tz=z0-3;tz<z0+CH+3;tz++){
    const sp=spOf(biomeAt(tx,tz));
    if(hash2(tx*7+1,tz*13+3)>=sp[2])continue;
    const ty=terrainH(tx,tz);
    if(ty<=SEA+1)continue; // 只长在草地上
    if(biomeAt(tx,tz)===1&&ty>=38)continue; // 岩石峰顶不长树
    const th=sp[3]+Math.floor(hash2(tx,tz*31)*sp[4]);
    if(ty+th+2>=H)continue;
    const leafB=sp[1];
    for(const layer of canopyLayers(sp[5],th)){
      const dy=layer[0],r=layer[1],sparse=layer[2];
      if(r===0){ // 顶端单叶
        const px2=tx-x0,py2=ty+1+dy,pz2=tz-z0;
        if(px2>=0&&px2<CH&&pz2>=0&&pz2<CH&&py2>=0&&py2<H&&arr[lidx(px2,py2,pz2)]===B_AIR)arr[lidx(px2,py2,pz2)]=leafB;
        continue;
      }
      for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
        if(dx===0&&dz===0&&dy<th)continue;
        if(sparse&&Math.abs(dx)===r&&Math.abs(dz)===r&&hash2(tx+dx,tz+dz+dy)<0.5)continue;
        const px2=tx+dx-x0,py2=ty+1+dy,pz2=tz+dz-z0;
        if(px2>=0&&px2<CH&&pz2>=0&&pz2<CH&&py2>=0&&py2<H&&arr[lidx(px2,py2,pz2)]===B_AIR)arr[lidx(px2,py2,pz2)]=leafB;
      }
    }
    const txl=tx-x0,tzl=tz-z0;
    if(txl>=0&&txl<CH&&tzl>=0&&tzl<CH){
      for(let dy=1;dy<=th;dy++){
        const cur=arr[lidx(txl,ty+dy,tzl)];
        if(cur===B_AIR||isLeafB(cur))arr[lidx(txl,ty+dy,tzl)]=sp[0];
      }
      // 🧡 苍白花园的树：树干上长一只"嘎吱核心"眼睛！
      if(biomeAt(tx,tz)===9&&th>=4&&hash2(tx*3+5,tz*7+11)<0.6){
        arr[lidx(txl,ty+2,tzl)]=B_CREAK_HEART;
      }
    }
  }
  // 3b) 花林生态：草地上点缀花丛
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=x0+lx,z=z0+lz;
    if(biomeAt(x,z)!==3)continue;
    const ty=terrainH(x,z);
    if(ty<=SEA+1||ty+1>=H)continue;
    if(hash2(x*3+7,z*5+11)<0.05&&arr[lidx(lx,ty,lz)]===B_GRASS&&arr[lidx(lx,ty+1,lz)]===B_AIR)
      arr[lidx(lx,ty+1,lz)]=B_FLOWER;
  }
  // 3c) 村庄：平坦草地上偶尔出现，有小木屋、村民和铁傀儡
  const vcx=x0+8,vcz=z0+8;
  const isVillage=isVillageChunk(cx,cz);
  if(isVillage)buildVillage(arr,x0,z0);
  // 3d) 丛林神庙：野外的古老石头神庙，里面有宝箱和陷阱机关！
  if(isTempleChunk(cx,cz))buildTemple(arr,x0,z0);
  // 3e) 女巫小屋：沼泽（低洼水边）里的小木屋，里面住着会扔药水的女巫！
  if(isWitchHutChunk(cx,cz))buildWitchHut(arr,x0,z0);
  // 4) 应用玩家改动
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++)for(let y=0;y<H;y++){
    const d=blockDiff[(x0+lx)+','+y+','+(z0+lz)];
    if(d!==undefined)arr[lidx(lx,y,lz)]=d;
  }
  chunks[key]=arr;
  return arr;
}
// 离出生点最近的、适合建村的区块（保证出生点附近必有一个村庄）
let _spawnVillage=null;
function getSpawnVillage(){
  if(_spawnVillage)return _spawnVillage;
  const sx=Math.floor(spawnPoint.x/16),sz=Math.floor(spawnPoint.z/16);
  outer:
  for(let r=3;r<=28;r++){
    for(let cx=sx-r;cx<=sx+r;cx++)for(let cz=sz-r;cz<=sz+r;cz++){
      if(Math.max(Math.abs(cx-sx),Math.abs(cz-sz))!==r)continue;
      const vx=cx*16+8,vz=cz*16+8,vh=terrainH(vx,vz);
      if(vh>SEA+2&&vh<34&&biomeAt(vx,vz)!==1){_spawnVillage={cx,cz};break outer;}
    }
  }
  if(!_spawnVillage)_spawnVillage={cx:sx+6,cz:sz+6};
  return _spawnVillage;
}
// 村庄小屋：三种房子（木屋/石屋/高塔屋）+ 麦田
function buildVillage(arr,x0,z0){
  const spots=[[2,2],[9,9],[9,2],[2,9]];
  let n=0;
  for(const sp of spots){
    const hx=sp[0],hz=sp[1];
    if(n>0&&hash2(x0+hx*3+n,z0+hz*5+n)<0.25)continue; // 有些位置空着，村子更自然
    n++;
    const wx=x0+hx+2,wz=z0+hz+2;
    const base=terrainH(wx,wz);
    // 填平地基，清空上方
    for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
      for(let y=base+1;y<base+8&&y<H;y++)arr[lidx(hx+dx,y,hz+dz)]=B_AIR;
      arr[lidx(hx+dx,base,hz+dz)]=B_GRASS;
      for(let y=Math.max(1,base-3);y<base;y++){
        const b=arr[lidx(hx+dx,y,hz+dz)];
        if(b===B_AIR||b===B_WATER)arr[lidx(hx+dx,y,hz+dz)]=B_DIRT;
      }
    }
    const style=Math.floor(hash2(x0+hx*7+n,z0+hz*11+n)*4); // 0木屋 1石屋 2高塔屋 3麦田
    if(style===3){ // 麦田：水渠+耕地+金灿灿的小麦
      for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
        if(dx===2){arr[lidx(hx+dx,base,hz+dz)]=B_WATER;continue;} // 中间水渠
        arr[lidx(hx+dx,base,hz+dz)]=B_FARMLAND;
        const hh=hash3(x0+hx+dx,base,z0+hz+dz);
        const st=hh<0.55?3:Math.floor(hh*4); // 一半多是金黄熟麦，其他随机阶段
        arr[lidx(hx+dx,base+1,hz+dz)]=B_CROPS;
        facings[(x0+hx+dx)+','+(base+1)+','+(z0+hz+dz)]=st;
      }
      // 田边围一圈原木桩
      for(let dx=-1;dx<=5;dx++){
        if(hash3(x0+hx+dx,1,z0+hz-1)>0.4)arr[lidx(hx+dx,base+1,hz-1)]=B_LOG;
        if(hash3(x0+hx+dx,1,z0+hz+5)>0.4)arr[lidx(hx+dx,base+1,hz+5)]=B_LOG;
      }
      continue;
    }
    const wall=style===1?B_COBBLE:B_PLANKS; // 石屋用圆石墙
    const tall=style===2?4:3;               // 高塔屋更高
    // 墙、门、屋顶
    for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
      const edge=dx===0||dx===4||dz===0||dz===4;
      const corner=(dx===0||dx===4)&&(dz===0||dz===4);
      for(let dy=1;dy<=tall;dy++){
        if(!edge)continue;
        if(dz===0&&dx===2&&dy<=2){arr[lidx(hx+dx,base+dy,hz+dz)]=B_DOOR;continue;} // 木门
        arr[lidx(hx+dx,base+dy,hz+dz)]=corner?B_LOG:wall;
      }
      // 屋顶：铺满整个房子（修bug：以前只有边上有屋顶）
      arr[lidx(hx+dx,base+tall+1,hz+dz)]=B_PLANKS;
    }
    arr[lidx(hx+2,base+tall+1,hz+2)]=B_GLOWSTONE; // 屋顶灯
    if(style===1)arr[lidx(hx+3,base+1,hz+3)]=B_FURNACE; // 石屋有熔炉
    else if(style===2){ // 高塔屋有箱子，里面装着村民藏的宝贝！
      arr[lidx(hx+3,base+1,hz+3)]=B_CHEST;
      const ck2=(x0+hx+3)+','+(base+1)+','+(z0+hz+3);
      if(!chestStates[ck2]){ // 只在新村庄里放，不覆盖玩家动过的箱子
        const loot=[[I.bread,1,3],[B_PLANKS,4,10],[B_LOG,2,5],[I.wheat,1,4],[I.potato,1,3],[I.carrot,1,3],[I.iron_ingot,1,2],[I.string,1,3]];
        const slots=new Array(27).fill(null);
        let placed=0;
        for(const l of loot){
          if(hash3(x0+hx,base,z0+hz+placed)<0.35)continue; // 不是每个箱子都有全部东西
          const n=l[1]+Math.floor(hash3(x0,base+placed,z0)*(l[2]-l[1]+1));
          slots[Math.floor(hash3(x0+placed,base,z0+placed)*27)]={id:l[0],count:Math.max(1,n)};
          placed++;
        }
        if(placed>0)chestStates[ck2]={slots};
      }
    }
    else arr[lidx(hx+3,base+1,hz+3)]=B_TABLE; // 木屋有合成台
  }
}
function getBlock(x,y,z){
  if(y<0||y>=H)return B_AIR;
  const cx=Math.floor(x/CH),cz=Math.floor(z/CH);
  const arr=genChunkData(cx,cz);
  return arr[lidx(x-cx*CH,y,z-cz*CH)];
}
function isOpaque(b){return b!==B_AIR&&BLOCKS[b]&&BLOCKS[b].opaque;}
function isSolidBlock(b){return b!==B_AIR&&BLOCKS[b]&&BLOCKS[b].solid;}
function surfaceY(x,z){
  for(let y=H-2;y>0;y--){const b=getBlock(x,y,z);if(b!==B_AIR&&b!==B_WATER&&b!==B_LAVA&&!(y>=H-2&&b===B_BEDROCK))return y;}
  return 1;
}

// ---------------- 区块网格化 ----------------
const FACES=[
  {d:[-1,0,0], t:'side',  c:[[0,1,0,0,1],[0,0,0,0,0],[0,1,1,1,1],[0,0,1,1,0]]},
  {d:[1,0,0],  t:'side',  c:[[1,1,1,0,1],[1,0,1,0,0],[1,1,0,1,1],[1,0,0,1,0]]},
  {d:[0,-1,0], t:'bottom',c:[[1,0,1,1,0],[0,0,1,0,0],[1,0,0,1,1],[0,0,0,0,1]]},
  {d:[0,1,0],  t:'top',   c:[[0,1,1,0,0],[1,1,1,1,0],[0,1,0,0,1],[1,1,0,1,1]]},
  {d:[0,0,-1], t:'side',  c:[[1,0,0,0,0],[0,0,0,1,0],[1,1,0,0,1],[0,1,0,1,1]]},
  {d:[0,0,1],  t:'side',  c:[[0,0,1,0,0],[1,0,1,1,0],[0,1,1,0,1],[1,1,1,1,1]]}
];
function faceTile(b,faceType,dir,facing){
  if(b===B_CROPS)return T.crops[clamp(facing||0,0,3)]; // 小麦按生长阶段显示
  const t=BLOCKS[b].tiles;
  if((b===B_FURNACE||b===B_PISTON)&&faceType==='side'){
    const fi=(dir[0]===1)?1:(dir[0]===-1)?3:(dir[2]===1)?2:0;
    if(facing!==undefined&&fi===facing)return t.front;
  }
  if(faceType==='top')return t.top;
  if(faceType==='bottom')return t.bottom;
  return t.side;
}
function shouldDraw(b,n){
  if(b===B_WATER)return n===B_AIR||n===B_GLASS;
  if(b===B_LAVA)return n===B_AIR||n===B_GLASS||n===B_WATER;
  if(b===B_GLASS)return n!==B_GLASS&&!isOpaque(n);
  return !isOpaque(n);
}
const chunkGroup=new THREE.Group();
const chunkMeshes={};
const dirtyChunks=new Set();
function markDirty(x,z){
  const cx=Math.floor(x/CH),cz=Math.floor(z/CH);
  dirtyChunks.add(cx+','+cz);
  const lx=((x%CH)+CH)%CH,lz=((z%CH)+CH)%CH;
  if(lx===0)dirtyChunks.add((cx-1)+','+cz);
  if(lx===CH-1)dirtyChunks.add((cx+1)+','+cz);
  if(lz===0)dirtyChunks.add(cx+','+(cz-1));
  if(lz===CH-1)dirtyChunks.add(cx+','+(cz+1));
}
let solidMat=null,waterMat=null;
function buildChunk(cx,cz){
  const key=cx+','+cz;
  const arr=genChunkData(cx,cz);
  const sp={p:[],n:[],u:[],i:[]},wp={p:[],n:[],u:[],i:[]};
  for(let lx=0;lx<CH;lx++)for(let lz=0;lz<CH;lz++){
    const x=cx*CH+lx,z=cz*CH+lz;
    for(let y=0;y<H;y++){
      const b=arr[lidx(lx,y,lz)];
      if(b===B_AIR)continue;
      const isWater=b===B_WATER||b===B_LAVA;
      const G=isWater?wp:sp;
      const facing=facings[x+','+y+','+z];
      for(const f of FACES){
        const n=getBlock(x+f.d[0],y+f.d[1],z+f.d[2]);
        if(!shouldDraw(b,n))continue;
        const ti=faceTile(b,f.t,f.d,facing);
        const uv=tileUV(ti);
        const base=G.p.length/3;
        for(const cr of f.c){
          let vy=cr[1];
          if(isWater&&vy===1&&getBlock(x,y+1,z)!==B_WATER)vy=0.875;
          G.p.push(x+cr[0],y+vy,z+cr[2]);
          G.n.push(f.d[0],f.d[1],f.d[2]);
          G.u.push(cr[3]?uv[2]:uv[0],cr[4]?uv[3]:uv[1]);
        }
        G.i.push(base,base+1,base+2,base+2,base+1,base+3);
      }
    }
  }
  const old=chunkMeshes[key];
  if(old){for(const m of old){chunkGroup.remove(m);m.geometry.dispose();}}
  const meshes=[];
  function mk(G,mat){
    if(G.i.length===0)return;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(G.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(G.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(G.u,2));
    g.setIndex(G.i);
    const m=new THREE.Mesh(g,mat);
    meshes.push(m);chunkGroup.add(m);
  }
  mk(sp,solidMat);mk(wp,waterMat);
  chunkMeshes[key]=meshes;
}
function processDirty(maxN){
  let n=0;
  for(const key of dirtyChunks){
    const parts=key.split(',');
    buildChunk(+parts[0],+parts[1]);
    dirtyChunks.delete(key);
    if(++n>=maxN)break;
  }
}
function setBlock(x,y,z,b){
  if(y<0||y>=H)return;
  const cx=Math.floor(x/CH),cz=Math.floor(z/CH);
  const arr=genChunkData(cx,cz);
  arr[lidx(x-cx*CH,y,z-cz*CH)]=b;
  blockDiff[x+','+y+','+z]=b;
  if(b!==B_FURNACE&&b!==B_PISTON)delete facings[x+','+y+','+z];
  markDirty(x,z);
  if(typeof NET!=='undefined'&&NET.open&&!NET_APPLYING&&started)NET.diffQ.push([x,y,z,b]);
}

const weather={state:'clear',t:75,flash:0,thunderT:5}; // 开局 75 秒左右下第一场雨
let rainAmt=0; // 0=晴 1=大雨（慢慢过渡）
let rainObj=null,rainVel=null;
const RAIN_N=380;
function initRain(){
  if(rainObj)return;
  const g=new THREE.BufferGeometry();
  const pos=new Float32Array(RAIN_N*2*3); // 每滴雨是一小段竖线
  rainVel=new Float32Array(RAIN_N);
  for(let i=0;i<RAIN_N;i++){
    const x=(Math.random()-0.5)*44,y=Math.random()*26,z=(Math.random()-0.5)*44;
    pos[i*6]=x;pos[i*6+1]=y;pos[i*6+2]=z;
    pos[i*6+3]=x;pos[i*6+4]=y+0.55;pos[i*6+5]=z;
    rainVel[i]=16+Math.random()*7;
  }
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  rainObj=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x9ec8ff,transparent:true,opacity:0.55}));
  rainObj.visible=false;
  rainObj.frustumCulled=false;
  scene.add(rainObj);
}
let rainSndGain=null;
function setRainSound(on){ // 下雨的沙沙声（一直响）
  const c=ac();if(!c)return;
  if(on&&!rainSndGain){
    const len=c.sampleRate*2;
    const buf=c.createBuffer(1,len,c.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    const src=c.createBufferSource();src.buffer=buf;src.loop=true;
    const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=1400;
    rainSndGain=c.createGain();rainSndGain.gain.value=0;
    rainSndGain.gain.linearRampToValueAtTime(0.045,c.currentTime+2);
    src.connect(f);f.connect(rainSndGain);rainSndGain.connect(c.destination);
    src.start();
    rainSndGain._src=src;
  }else if(!on&&rainSndGain){
    rainSndGain.gain.linearRampToValueAtTime(0,c.currentTime+2);
    const g=rainSndGain;setTimeout(()=>{try{g._src.stop();}catch(e){}},2500);
    rainSndGain=null;
  }
}
function thunderSound(dist){ // 轰隆隆——越远声音越晚到、越小声
  const d=Math.min(dist/50,1),delay=d*1.8,vol=0.55*(1-d*0.55);
  noiseBurst(1.4,320,vol,delay);
  tone(58,1.8,'sine',vol*0.7,36,delay);
  noiseBurst(0.5,900,vol*0.5,delay+0.05);
}
function lightningStrike(){ // 一道闪电劈在附近！⚡ 有避雷针就全劈它！
  const px=Math.floor(player.pos.x),pz=Math.floor(player.pos.z);
  const rod=findRodNear(px,pz,48); // 附近有避雷针？闪电全部跑去劈它！
  let lx,lz,ly;
  if(rod){lx=rod[0];lz=rod[2];ly=rod[1];}
  else{
    const ang=Math.random()*Math.PI*2,dist=8+Math.random()*35;
    lx=Math.floor(player.pos.x+Math.cos(ang)*dist);lz=Math.floor(player.pos.z+Math.sin(ang)*dist);
    ly=surfaceY(lx,lz);
  }
  weather.flash=1;
  for(let yy=0;yy<16;yy++)spawnBlockParticles(lx+0.5,ly+1+yy*1.4,lz+0.5,'rgb(255,255,200)');
  spawnBlockParticles(lx+0.5,ly+1,lz+0.5,'rgb(255,240,150)');
  thunderSound(dist);
  if(rod){showToast('⚡ 咔啦！闪电劈中了避雷针！');for(let i=0;i<10;i++)spawnBlockParticles(lx+0.5,ly+1.2,lz+0.5,'rgb(255,255,180)');}
  else if(dist<10)showToast('⚡ 哇！闪电就劈在你旁边！');
}
function updateWeather(dt){
  if(!started)return;
  initRain();
  // 闪电余晖慢慢暗下来
  if(weather.flash>0)weather.flash=Math.max(0,weather.flash-dt*2.5);
  // 只在主世界下雨
  if(curDim!=='overworld'){
    if(weather.state==='rain'){weather.state='clear';weather.t=60;setRainSound(false);}
    rainAmt=Math.max(0,rainAmt-dt*0.3);
    rainObj.visible=false;
    return;
  }
  // 天气计时：晴一阵 → 雨一阵
  weather.t-=dt;
  if(weather.t<=0){
    if(weather.state==='clear'){
      weather.state='rain';weather.t=70+Math.random()*80; // 下 1~2.5 分钟
      setRainSound(true);
      showToast('🌧 下雨了！听，沙沙沙……');
    }else{
      weather.state='clear';weather.t=100+Math.random()*140; // 晴 2~4 分钟
      setRainSound(false);
      showToast('☀️ 雨停啦，太阳出来了！');
    }
  }
  // 雨量慢慢变化（不是一下子就下）
  rainAmt=clamp(rainAmt+(weather.state==='rain'?dt*0.25:-dt*0.25),0,1);
  rainObj.visible=rainAmt>0.03;
  rainObj.material.opacity=0.55*rainAmt;
  if(rainObj.visible){
    rainObj.position.set(player.pos.x,player.pos.y-6,player.pos.z); // 雨跟着人下
    const pos=rainObj.geometry.attributes.position.array;
    for(let i=0;i<RAIN_N;i++){
      let y=pos[i*6+1]-rainVel[i]*dt;
      if(y<0){ // 掉到脚底下就回到天上重新下
        y=20+Math.random()*6;
        const x=(Math.random()-0.5)*44,z=(Math.random()-0.5)*44;
        pos[i*6]=x;pos[i*6+2]=z;pos[i*6+3]=x;pos[i*6+5]=z;
      }
      pos[i*6+1]=y;pos[i*6+4]=y+0.55;
    }
    rainObj.geometry.attributes.position.needsUpdate=true;
    // 打雷：雨最大的时候随机劈闪电
    weather.thunderT-=dt;
    if(weather.thunderT<=0&&rainAmt>0.6){
      weather.thunderT=5+Math.random()*9;
      lightningStrike();
    }
  }
}

// ---------------- 场景 ----------------
let renderer,scene,camera,hemiLight,sunLight,ambientLight,highlightBox;
let dropsGroup,mobsGroup,particlesGroup;
const clock={last:0};
let dayTime=0.34; // 0..1, 0.25=清晨 0.5=正午

function initScene(){
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(window.innerWidth,window.innerHeight);
  document.getElementById('game').appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x87ceeb);
  scene.fog=new THREE.Fog(0x87ceeb,30,90);
  camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,300);
  scene.add(camera); // 把 camera 加入 scene，camera.add(handGroup) 的子对象才会被渲染遍历（FPS 手持 view model 关键）
  hemiLight=new THREE.HemisphereLight(0xcfe8ff,0x8a6a4a,0.9);
  scene.add(hemiLight);
  ambientLight=new THREE.AmbientLight(0xffffff,0.25);
  scene.add(ambientLight);
  sunLight=new THREE.DirectionalLight(0xffffff,0.9);
  scene.add(sunLight);
  solidMat=new THREE.MeshLambertMaterial({map:atlasTex,alphaTest:0.5});
  waterMat=new THREE.MeshLambertMaterial({map:atlasTex,transparent:true,opacity:0.65,depthWrite:false});
  scene.add(chunkGroup);
  dropsGroup=new THREE.Group();scene.add(dropsGroup);
  mobsGroup=new THREE.Group();scene.add(mobsGroup);
  particlesGroup=new THREE.Group();scene.add(particlesGroup);
  // 选中方块高亮
  const hg=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002,1.002,1.002));
  highlightBox=new THREE.LineSegments(hg,new THREE.LineBasicMaterial({color:0x000000}));
  highlightBox.visible=false;
  scene.add(highlightBox);
  window.addEventListener('resize',()=>{
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  });
}

// 昼夜循环
const skyStops=[
  [0.0,new THREE.Color(0x0b1026)], // 深夜
  [0.22,new THREE.Color(0x0b1026)],
  [0.27,new THREE.Color(0xff9a5a)], // 日出
  [0.35,new THREE.Color(0x87ceeb)], // 白天
  [0.65,new THREE.Color(0x87ceeb)],
  [0.73,new THREE.Color(0xff8a4a)], // 日落
  [0.8,new THREE.Color(0x0b1026)],
  [1.0,new THREE.Color(0x0b1026)]
];
function skyColorAt(t){
  for(let i=0;i<skyStops.length-1;i++){
    const a=skyStops[i],b=skyStops[i+1];
    if(t>=a[0]&&t<=b[0]){
      const f=(t-a[0])/Math.max(0.0001,b[0]-a[0]);
      return a[1].clone().lerp(b[1],f);
    }
  }
  return skyStops[0][1].clone();
}
function updateDayNight(dt){
  const elevNow=Math.sin((dayTime-0.25)*Math.PI*2);
  if(ORE_DIMS[curDim]){ // 矿石维度：固定天色+恒定亮度
    const c=new THREE.Color(ORE_DIMS[curDim].sky);
    scene.background.copy(c);scene.fog.color.copy(c);scene.fog.near=30;scene.fog.far=100;
    sunLight.intensity=1.0;hemiLight.intensity=0.9;ambientLight.intensity=0.5;
    return;
  }
  if(curDim==='overworld')dayTime=(dayTime+dt/(elevNow>0?900:300))%1; // 白天7.5分钟，夜晚2.5分钟（白天更长）
  if(curDim==='nether'){ // 下界：永远暗红
    scene.background.setHex(0x38100c);scene.fog.color.setHex(0x38100c);scene.fog.near=20;scene.fog.far=70;
    sunLight.intensity=0.25;hemiLight.intensity=0.55;ambientLight.intensity=0.4;
    return;
  }
  if(curDim==='end'){ // 末地：永远黑色星空
    scene.background.setHex(0x07070f);scene.fog.color.setHex(0x07070f);scene.fog.near=30;scene.fog.far=110;
    sunLight.intensity=0.35;hemiLight.intensity=0.6;ambientLight.intensity=0.45;
    return;
  }
  scene.fog.near=30;scene.fog.far=90;
  const sunA=(dayTime-0.25)*Math.PI*2;
  const elev=Math.sin(sunA);
  const c=skyColorAt(dayTime);
  // 🌧 下雨：天变灰变暗，雾变近
  if(rainAmt>0){
    c.lerp(new THREE.Color(0x5a6a78),rainAmt*0.62);
    scene.fog.far=90-42*rainAmt;
  }
  // ⚡ 闪电：整个天空白一下！
  if(weather.flash>0)c.lerp(new THREE.Color(0xffffff),Math.min(1,weather.flash)*0.85);
  scene.background.copy(c);
  scene.fog.color.copy(c);
  const day=clamp(elev*3+0.3,0.08,1)*(1-0.42*rainAmt)+weather.flash*0.5;
  sunLight.intensity=0.95*day;
  hemiLight.intensity=0.25+0.65*day;
  ambientLight.intensity=0.15+0.15*day;
  const px=player.pos.x,pz=player.pos.z;
  sunLight.position.set(px+Math.cos(sunA)*60,Math.sin(sunA)*60+20,pz+30);
  sunLight.target.position.set(px,0,pz);
  sunLight.target.updateMatrixWorld();
}

// 检查有没有踩中神庙陷阱（村庄巡逻时一起检查）
function templeTrapCheck(){
  const px=Math.floor(player.pos.x),py=Math.floor(player.pos.y),pz=Math.floor(player.pos.z);
  for(const off of [[0,0,0],[0,-1,0],[0,1,0]]){
    const k=(px+off[0])+','+(py+off[1])+','+(pz+off[2]);
    if(templeTraps[k]){
      delete templeTraps[k];
      explode(px+0.5,py+0.2,pz+0.5,1,6);
      showToast('💥 咔嚓！你踩中了神庙的陷阱机关！！');
      return;
    }
  }
}
// 这个区块是不是村庄（跟生成时用的是同一套判断）
function isVillageChunk(cx,cz){
  const vcx=cx*CH+8,vcz=cz*CH+8;
  const vh=terrainH(vcx,vcz);
  const svc=getSpawnVillage();
  const nearSpawn=Math.hypot(vcx-spawnPoint.x,vcz-spawnPoint.z)<400;
  return (cx===svc.cx&&cz===svc.cz)||
    (hash2(cx*7+3,cz*11+5)<(nearSpawn?0.09:0.05)&&vh>SEA+2&&vh<34&&biomeAt(vcx,vcz)!==1);
}

// ================= yangcraft 移植：传送门 / 火焰 / 火把 / 连锁挖矿 / 单格方块 / 复制方块 =================

// ---------------- 🌀 矿石维度传送门 ----------------
const orePortalDim={}; // "维度|x,y,z" -> 这个传送门通往哪个矿石维度
function orePortalKey(x,y,z){return curDim+'|'+x+','+y+','+z;}
function tryLightOrePortal(bx,by,bz,frame,dim){
  // 门框所在的竖直平面：沿x方向 或 沿z方向，找到被同种方块围住的空气洞
  for(const axis of ['x','z']){
    const start=[];
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const nx=bx+dx,ny=by+dy,nz=bz+dz;
      if(getBlock(nx,ny,nz)===B_AIR)start.push([nx,ny,nz]);
    }
    for(const s of start){
      const inPlane=(x,y,z)=>axis==='x'?z===s[2]:x===s[0];
      const seen=new Set();const region=[];const floorCells=[];const q=[s];
      let ok=true;
      while(q.length){
        const [cx,cy,cz]=q.pop();
        const k=cx+','+cy+','+cz;
        if(seen.has(k))continue;
        seen.add(k);
        if(!inPlane(cx,cy,cz))continue;
        const b=getBlock(cx,cy,cz);
        if(b===B_AIR){
          region.push([cx,cy,cz]);
          if(region.length>40){ok=false;break;}
          q.push([cx+1,cy,cz],[cx-1,cy,cz],[cx,cy+1,cz],[cx,cy-1,cz]);
        }else if(b!==frame){
          // 洞的边必须是门框方块——但最底下一排可以是地面（门框搭在地上也行！）
          if(isSolidBlock(b))floorCells.push(cy);
          else{ok=false;break;}
        }
      }
      if(!ok||region.length<1)continue;
      const minY=Math.min(...region.map(c=>c[1]));
      if(floorCells.some(cy=>cy>=minY))continue; // 不是地板的杂块 → 不算封闭
      // 点燃！洞里全变成传送门
      for(const [px,py,pz] of region){
        setBlock(px,py,pz,B_OREPORTAL);
        orePortalDim[orePortalKey(px,py,pz)]=dim;
      }
      spawnBlockParticles(bx+0.5,by+1,bz+0.5,'rgb(120,220,255)');
      sfx.place();
      showToast('🌀 传送门点燃啦！站进去就能去「'+DIM_NAMES[dim]+'」！');
      return true;
    }
  }
  return false;
}
function buildOreDimHome(dim){ // 第一次到矿石维度：造一个小平台和回去的传送门
  const D1=DIMS[dim];
  if(!D1||D1.home)return;
  D1.home=true;
  const px=Math.floor(player.pos.x),pz=Math.floor(player.pos.z);
  const py=surfaceY(px,pz)+1;
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)setBlock(px+dx,py-1,pz+dz,B_GLOWSTONE); // 发光地板
  const frame=ORE_DIMS[dim].frame;
  for(let dx=0;dx<3;dx++){setBlock(px+dx-1,py,pz+2,frame);setBlock(px+dx-1,py+3,pz+2,frame);}
  for(let dy=0;dy<4;dy++){setBlock(px-2,py+dy,pz+2,frame);setBlock(px+2,py+dy,pz+2,frame);}
  for(let dx=0;dx<3;dx++)for(let dy=0;dy<2;dy++){
    setBlock(px+dx-1,py+1+dy,pz+2,B_OREPORTAL);
    orePortalDim[orePortalKey(px+dx-1,py+1+dy,pz+2)]=dim;
  }
  player.pos.set(px+0.5,py,pz+0.5);player.vel.set(0,0,0);
}

// ---------------- 🔥 火焰蔓延系统 ----------------
const fires={}; // "维度|x,y,z" -> 烧了多久
const FLAMMABLE=new Set([B_LOG,B_BIRCH_LOG,B_SPRUCE_LOG,B_JUNGLE_LOG,B_ACACIA_LOG,B_DARK_LOG,B_CHERRY_LOG,B_LEAVES,B_SPRUCE_LEAVES,B_DARK_LEAVES,B_CHERRY_LEAVES,B_PALE_LEAVES,B_PLANKS,B_WOOL]);
function igniteFire(x,y,z){
  if(getBlock(x,y,z)!==B_AIR)return false;
  setBlock(x,y,z,B_FIRE);
  fires[curDim+'|'+x+','+y+','+z]=0;
  sfx.place();
  spawnBlockParticles(x+0.5,y+0.5,z+0.5,'rgb(255,150,40)');
  return true;
}
let fireTickT=0;
function fireTick(dt){
  if(gameState!=='playing'||player.dead)return;
  // 站在火里会被烧到！
  const fx=Math.floor(player.pos.x),fy=Math.floor(player.pos.y),fz=Math.floor(player.pos.z);
  if(getBlock(fx,fy,fz)===B_FIRE||getBlock(fx,fy+1,fz)===B_FIRE){
    player._fireT=(player._fireT||0)-dt;
    if(player._fireT<=0){damagePlayer(1,'被火烧到了');player._fireT=0.8;}
  }
  // 火烧一会自己灭，还会烧着旁边的木头树叶！
  fireTickT+=dt;
  if(fireTickT<0.5)return;
  fireTickT=0;
  for(const k in fires){
    const [dimK,coords]=k.split('|');
    if(dimK!==curDim)continue;
    const [x,y,z]=coords.split(',').map(Number);
    if(getBlock(x,y,z)!==B_FIRE){delete fires[k];continue;}
    fires[k]+=0.5;
    if(fires[k]>4+hash3(x,y,z)*3){setBlock(x,y,z,B_AIR);delete fires[k];continue;} // 烧完自己灭了
    if(Math.random()<0.3){ // 蔓延到旁边的可燃物（包括斜下方的）
      const flam=[];
      for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1],[1,-1,0],[-1,-1,0],[0,-1,1],[0,-1,-1]]){
        const nx=x+d[0],ny=y+d[1],nz=z+d[2];
        if(FLAMMABLE.has(getBlock(nx,ny,nz)))flam.push([nx,ny,nz]);
      }
      if(flam.length){
        const [nx,ny,nz]=flam[(Math.random()*flam.length)|0];
        setBlock(nx,ny,nz,B_FIRE);fires[curDim+'|'+nx+','+ny+','+nz]=0;
      }
    }
  }
}

// ---------------- 🔥 火把照明（跟随式单点光源，性能极好） ----------------
let torchLight=null,torchScanT=0;
function torchLightTick(dt){
  if(!torchLight){torchLight=new THREE.PointLight(0xffb050,0,20);scene.add(torchLight);}
  torchScanT-=dt;
  if(torchScanT>0)return;
  torchScanT=0.6;
  const px=Math.floor(player.pos.x),py=Math.floor(player.pos.y),pz=Math.floor(player.pos.z);
  let best=null,bd=14*14;
  for(let dx=-12;dx<=12;dx++)for(let dy=-6;dy<=6;dy++)for(let dz=-12;dz<=12;dz++){
    if(getBlock(px+dx,py+dy,pz+dz)===B_TORCH){const d=dx*dx+dy*dy+dz*dz;if(d<bd){bd=d;best=[px+dx+0.5,py+dy+0.8,pz+dz+0.5];}}
  }
  if(best){torchLight.position.set(best[0],best[1],best[2]);torchLight.intensity=1.6;}
  else torchLight.intensity=0;
}

// ---------------- ⛏️ 连锁采集模组 ----------------
let chainVein=false; // 防止连锁采集自己套自己
const VEIN_BLOCKS=new Set([B_COAL_ORE,B_IRON_ORE,B_GOLD_ORE,B_DIAMOND_ORE,B_REDSTONE_ORE,B_EMERALD_ORE,B_DEBRIS,B_INFINITY_ORE,B_COPPER_ORE,B_LAPIS_ORE,B_LOG,B_BIRCH_LOG,B_SPRUCE_LOG,B_JUNGLE_LOG,B_ACACIA_LOG,B_DARK_LOG,B_CHERRY_LOG]);
function veinMine(x,y,z,b){ // 从 (x,y,z) 开始，把连在一起的一样的方块全挖掉
  const seen=new Set([x+','+y+','+z]);
  const queue=[[x,y,z]];
  let n=0;
  while(queue.length&&n<128){
    const [cx,cy,cz]=queue.shift();
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const nx=cx+dx,ny=cy+dy,nz=cz+dz;
      const key=nx+','+ny+','+nz;
      if(seen.has(key))continue;
      seen.add(key);
      if(getBlock(nx,ny,nz)!==b)continue;
      n++;
      breakBlock(nx,ny,nz,b); // chainVein=true，不会再套娃
      queue.push([nx,ny,nz]);
    }
  }
  return n;
}

// ---------------- 📋 复制方块模组 ----------------
function tryCopyFill(x,y,z){
  if(!modsOn.copy){showToast('🔒 要先在开始界面打开📋复制方块模组哦！');return;}
  // 找附近32格内另一个复制方块
  let other=null,bd=1e9;
  for(let dx=-32;dx<=32;dx++)for(let dy=-16;dy<=16;dy++)for(let dz=-32;dz<=32;dz++){
    if(!dx&&!dy&&!dz)continue;
    if(getBlock(x+dx,y+dy,z+dz)===B_COPIER){
      const d=Math.abs(dx)+Math.abs(dy)+Math.abs(dz);
      if(d<bd){bd=d;other=[x+dx,y+dy,z+dz];}
    }
  }
  if(!other){showToast('📋 复制方块放好啦！再到另一个地方放一个，中间就会变出方块哦！');return;}
  // 想复制的方块：放在任意一个复制方块的头顶上
  let target=getBlock(x,y+1,z);
  if(target===B_AIR||target===B_COPIER)target=getBlock(other[0],other[1]+1,other[2]);
  if(target===B_AIR||target===B_COPIER){showToast('📋 在其中一个复制方块上面放一个你想复制的方块！');return;}
  if(target===B_BEDROCK){showToast('📋 基岩不能复制哦！');return;}
  // 两个复制方块中间的区域，全部变成目标方块！
  const x0=Math.min(x,other[0]),x1=Math.max(x,other[0]);
  const y0=Math.min(y,other[1]),y1=Math.max(y,other[1]);
  const z0=Math.min(z,other[2]),z1=Math.max(z,other[2]);
  if((x1-x0+1)*(y1-y0+1)*(z1-z0+1)>4096){showToast('📋 两个复制方块离太远啦！近一点试试～');return;}
  const pfxx=Math.floor(player.pos.x),pfyy=Math.floor(player.pos.y),pfzz=Math.floor(player.pos.z);
  let n=0;
  for(let bx=x0;bx<=x1;bx++)for(let by=y0;by<=y1;by++)for(let bz=z0;bz<=z1;bz++){
    if(bx===pfxx&&(by===pfyy||by===pfyy+1)&&bz===pfzz)continue; // 别把自己埋了
    setBlock(bx,by,bz,target);n++;
  }
  // 复制方块完成任务，变回物品，可以再用！
  setBlock(x,y,z,B_AIR);setBlock(other[0],other[1],other[2],B_AIR);
  spawnDrop(x+0.5,y+0.5,z+0.5,B_COPIER,1);
  spawnDrop(other[0]+0.5,other[1]+0.5,other[2]+0.5,B_COPIER,1);
  spawnBlockParticles(x+0.5,y+1,z+0.5,'rgb(255,140,255)');
  spawnBlockParticles(other[0]+0.5,other[1]+1,other[2]+0.5,'rgb(255,140,255)');
  showToast('📋✨ 唰——！中间变出了 '+n+' 个「'+BLOCKS[target].name+'」！');
}

// ---------------- ☝️ 单格方块生存 ----------------
let oneBlockPos=null,oneBlockCount=0;
function oneBlockPick(arr){return arr[(Math.random()*arr.length)|0];}
function oneBlockRandomBlock(){ // 越挖挖到的方块越好！
  const c=oneBlockCount;
  if(c<8)return oneBlockPick([B_GRASS,B_DIRT,B_LOG]);
  if(c<20)return oneBlockPick([B_DIRT,B_LOG,B_STONE,B_COBBLE,B_COAL_ORE,B_SAND]);
  if(c<40)return oneBlockPick([B_STONE,B_COBBLE,B_COAL_ORE,B_IRON_ORE,B_BIRCH_LOG,B_SPRUCE_LOG,B_WOOL]);
  if(c<70)return oneBlockPick([B_IRON_ORE,B_GOLD_ORE,B_REDSTONE_ORE,B_JUNGLE_LOG,B_ACACIA_LOG,B_GLASS,B_GLOWSTONE]);
  return oneBlockPick([B_GOLD_ORE,B_DIAMOND_ORE,B_EMERALD_ORE,B_OBSIDIAN,B_DARK_LOG,B_CHERRY_LOG,B_GLOWSTONE]);
}
function oneBlockBonus(){ // 额外随机掉一个东西
  const r=Math.random();
  if(r<0.18)return oneBlockPick([I.bread,I.seeds,I.stick,I.arrow]);
  if(r<0.28)return oneBlockPick([I.iron_ingot,I.gold_ingot]);
  if(r<0.32)return I.diamond;
  return oneBlockRandomBlock();
}
function startOneBlock(){ // 开局：高空中只有一格挖不完的神奇方块！
  const sx=Math.round(spawnPoint.x),sz=Math.round(spawnPoint.z),oy=54;
  setBlock(sx,oy,sz,B_GRASS);
  oneBlockPos={x:sx,y:oy,z:sz};
  oneBlockCount=0;
  player.pos.set(sx+0.5,oy+2,sz+0.5);
  player.vel.set(0,0,0);
  giveItemToInv(I.bread,3);giveItemToInv(B_LOG,2);
  setTimeout(()=>{if(gameState==='playing')showToast('☝️ 单格方块生存！挖掉神奇方块会马上长出新的，还会随机掉东西！');},2200);
  setTimeout(()=>{if(gameState==='playing')showToast('🎯 目标：用挖到的方块搭出你的世界，去末地打败🐉末影龙就通关！');},5200);
}
function oneBlockTick(){ // 掉下去（没摔死）也会被拉回神奇方块
  if(!modsOn.oneblock||!oneBlockPos||curDim!=='overworld'||player.dead)return;
  if(player.pos.y<oneBlockPos.y-10){
    player.pos.set(oneBlockPos.x+0.5,oneBlockPos.y+2,oneBlockPos.z+0.5);
    player.vel.set(0,0,0);
    showToast('☝️ 哎呀掉下去啦！把你拉回神奇方块～');
  }
}
function showOneBlockWin(){
  showToast('🎉🎉🎉 恭喜通关！你一共挖了 '+oneBlockCount+' 次神奇方块！');
  for(let i=0;i<40;i++)spawnBlockParticles(player.pos.x+(Math.random()*8-4),player.pos.y+Math.random()*4,player.pos.z+(Math.random()*8-4),'rgb(255,215,0)');
  sfx.craft();
}

// ---------------- ⚡ 避雷针 ----------------
function findRodNear(cx,cz,r){ // 找附近最近的避雷针
  let best=null,bd=r*r;
  const py=Math.floor(player.pos.y);
  for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=-8;dy<=8;dy++){
    const x=cx+dx,y=py+dy,z=cz+dz;
    if(getBlock(x,y,z)===B_ROD){const d=dx*dx+dz*dz;if(d<bd){bd=d;best=[x,y,z];}}
  }
  return best;
}
// ---------------- 🌍 逼真光影模组（真实阴影 + 电影色调） ----------------
let realShadowOn=false;
function shadowify(o){if(realShadowOn)o.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});}
function applyRealMod(on){
  realShadowOn=on;
  if(!renderer)return;
  renderer.shadowMap.enabled=on;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap; // 软软的影子边缘
  renderer.toneMapping=on?THREE.ACESFilmicToneMapping:THREE.NoToneMapping; // 电影一样的颜色！
  renderer.toneMappingExposure=on?1.18:1.0;
  sunLight.castShadow=on;
  if(on){
    sunLight.shadow.mapSize.set(1024,1024);
    const c=sunLight.shadow.camera;
    c.left=-55;c.right=55;c.top=55;c.bottom=-55;c.near=1;c.far=220;
    c.updateProjectionMatrix();
    sunLight.shadow.bias=-0.0015;
  }
  // 阳光变成暖暖的金黄色，天更蓝，水更透明
  sunLight.color.setHex(on?0xffe2b0:0xffffff);
  hemiLight.color.setHex(on?0xb8dcff:0xcfe8ff);
  hemiLight.groundColor.setHex(on?0x9a7a55:0x8a6a4a);
  if(waterMat)waterMat.opacity=on?0.5:0.65;
  if(chunkGroup)for(const m of chunkGroup.children)if(m.material===solidMat){m.castShadow=on;m.receiveShadow=on;}
  if(mobsGroup)for(const g of mobsGroup.children)g.traverse(n=>{if(n.isMesh){n.castShadow=on;n.receiveShadow=true;}});
  solidMat.needsUpdate=true;
}
