/**
 * mcroom - 方块世界联机信令服务（免登录）
 *
 * 职责：
 *  1. 房间管理：创建/加入/列表/离开（NoSQL 持久化，心跳保活）
 *  2. WebRTC 信令中继：offer/answer 通过集合投递，客户端轮询拉取
 *
 * 路由（网关 /mcroom 前缀 + 路径透传）：
 *  POST /create  创建房间  {name, skin, mode, roomName}
 *  POST /join    加入房间  {roomId, name, skin}
 *  GET  /list    公开房间列表
 *  GET  /poll    轮询：拉取信令 + 玩家列表 + 心跳保活  ?roomId=&playerId=
 *  POST /signal  投递信令  {roomId, from, to, type, data}
 *  POST /leave   离开/关闭  {roomId, playerId}
 *  GET  /room    房间详情  ?roomId=
 */
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

const ROOM_TTL = 90000;       // 房间 90s 无任何玩家心跳 => 关闭
const PLAYER_TTL = 90000;     // 玩家 90s 无心跳 => 移除
const SIGNAL_TTL = 120000;    // 信令 120s 过期
const MAX_PLAYERS = 8;
const SKIN_N = 8;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
function ok(data) {
  return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(Object.assign({ ok: true }, data)) };
}
function fail(msg, code = 400) {
  return { statusCode: code, headers: corsHeaders(), body: JSON.stringify({ ok: false, error: msg }) };
}
function now() { return Date.now(); }
function parseBody(body, isB64) {
  if (!body) return {};
  let s = isB64 ? Buffer.from(body, 'base64').toString('utf8') : body;
  try { return JSON.parse(s); } catch (e) { return {}; }
}
function normId(v) { return String(v == null ? '' : v); }
// 兼容本环境 doc(id).get() 返回 {data:[...]} 数组的形态
function docData(r) {
  const d = r && r.data;
  return Array.isArray(d) ? d[0] : d;
}
function publicRoom(r) {
  return {
    roomId: r._id,
    name: r.name || '',
    hostName: r.host ? r.host.name : '',
    hostSkin: r.host ? r.host.skin : 0,
    playerCount: (r.players || []).length,
    maxPlayers: r.maxPlayers || MAX_PLAYERS,
    mode: r.mode || 'survival',
    loot: r.loot ? 1 : 0, // 枪战子模式：1=捡枪模式（地上刷武器），0=普通模式
    seed: r.seed,
    createdAt: r.createdAt
  };
}

async function genRoomId() {
  for (let i = 0; i < 10; i++) {
    let id = '';
    for (let j = 0; j < 4; j++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    const c = await db.collection('mc_rooms').where({ _id: id }).count().catch(() => ({ total: 0 }));
    if (!c.total) return id;
  }
  throw new Error('房间号生成失败，请重试');
}

// ---------- 创建房间 ----------
async function createRoom(b) {
  const name = String(b.name || '房主').slice(0, 16);
  const skin = Math.min(Math.max(0, (b.skin | 0) || 0), SKIN_N - 1);
  const mode = b.mode === 'creative' ? 'creative' : (b.mode === 'shooter' ? 'shooter' : (b.mode === 'skyblock' ? 'skyblock' : 'survival'));
  const loot = b.loot ? 1 : 0; // 枪战捡枪模式标记
  const roomName = String(b.roomName || '方块世界').slice(0, 24); // 房间名与用户名分离，默认不带昵称
  const roomId = await genRoomId();
  // 客户端可指定 seed（从存档/当前世界开房）；无效则随机新世界
  let seed = Math.floor(Math.random() * 1000000000);
  const bs = Number(b.seed);
  if (Number.isFinite(bs) && bs >= 0 && bs <= 2147483647) seed = Math.floor(bs);
  const t = now();
  const room = {
    name: roomName,
    host: { id: '1', name: name, skin: skin },
    players: [{ id: '1', name: name, skin: skin, lastSeen: t }],
    maxPlayers: MAX_PLAYERS,
    mode: mode,
    loot: loot,
    seed: seed,
    status: 'open',
    createdAt: t,
    updatedAt: t
  };
  await db.collection('mc_rooms').doc(roomId).set(room);
  return ok({ roomId: roomId, playerId: '1', seed: seed, mode: mode, loot: loot, room: publicRoom(room) });
}

// ---------- 加入房间 ----------
async function joinRoom(b) {
  const roomId = String(b.roomId || '').toUpperCase().trim();
  if (!roomId) return fail('缺少房间号');
  const r = await db.collection('mc_rooms').doc(roomId).get().catch(() => ({ data: null }));
  const room = docData(r);
  if (!room || room.status !== 'open') return fail('房间不存在或已关闭', 404);
  if ((room.players || []).length >= (room.maxPlayers || MAX_PLAYERS)) return fail('房间已满', 409);
  const name = String(b.name || '玩家' + Math.floor(Math.random() * 900 + 100)).slice(0, 16);
  const skin = Math.min(Math.max(0, (b.skin | 0) || 0), SKIN_N - 1);
  let maxId = 1;
  for (const p of room.players) if (+p.id > maxId) maxId = +p.id;
  const id = String(maxId + 1);
  const t = now();
  room.players.push({ id: id, name: name, skin: skin, lastSeen: t });
  room.updatedAt = t;
  await db.collection('mc_rooms').doc(roomId).update({ players: room.players, updatedAt: t });
  return ok({
    roomId: roomId, playerId: id, seed: room.seed, mode: room.mode, loot: room.loot ? 1 : 0,
    host: room.host, players: room.players.map(p => ({ id: p.id, name: p.name, skin: p.skin }))
  });
}

// ---------- 房间列表 ----------
async function listRooms() {
  await cleanup();
  const r = await db.collection('mc_rooms').where({ status: 'open' }).limit(50).get().catch(() => ({ data: [] }));
  const rooms = (r.data || [])
    .filter(x => x && x.players && x.players.length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(publicRoom);
  return ok({ rooms: rooms });
}

// ---------- 轮询：信令 + 玩家列表 + 心跳 ----------
async function poll(q) {
  const roomId = normId(q.roomId);
  const playerId = normId(q.playerId);
  if (!roomId || !playerId) return fail('缺少参数');
  const t = now();
  const r = await db.collection('mc_rooms').doc(roomId).get().catch(() => ({ data: null }));
  const room = docData(r);
  if (!room || room.status !== 'open') return fail('房间不存在或已关闭', 410);
  const me = (room.players || []).find(p => normId(p.id) === playerId);
  if (!me) return fail('你已不在房间中', 404);

  // 心跳保活：更新自己 lastSeen 并写回 players
  // （修复：之前只改内存未写库，lastSeen 恒为加入时刻，加入 90s 后所有人被视为心跳过期、
  //   被其他玩家 poll 清出房间而掉线——"玩家没动一会就掉线"的根因）
  me.lastSeen = t;
  room.updatedAt = t;
  const alive = (room.players || []).filter(p =>
    normId(p.id) === playerId || normId(p.id) === '1' || (t - (p.lastSeen || 0)) < PLAYER_TTL
  );
  // alive 必然包含 me（playerId 匹配），且 me.lastSeen 已在上面更新为 t，整体写回即持久化心跳
  await db.collection('mc_rooms').doc(roomId).update({ players: alive, updatedAt: t });

  // 拉取发给我自己的信令
  const sigRes = await db.collection('mc_signals')
    .where({ roomId: roomId, to: playerId })
    .limit(50)
    .get().catch(() => ({ data: [] }));
  const signals = (sigRes.data || []).map(s => ({ from: s.from, type: s.type, data: s.data }));
  if (signals.length > 0) {
    const ids = (sigRes.data || []).map(s => s._id);
    await db.collection('mc_signals').where({ _id: _.in(ids) }).remove().catch(() => {});
  }

  return ok({
    room: publicRoom(room),
    players: alive.map(p => ({ id: p.id, name: p.name, skin: p.skin })),
    signals: signals
  });
}

// ---------- 信令投递 ----------
async function postSignal(b) {
  const roomId = normId(b.roomId);
  const from = normId(b.from);
  const to = normId(b.to);
  const type = normId(b.type);
  if (!roomId || !from || !to || !type) return fail('缺少参数');
  const data = b.data == null ? '' : String(b.data);
  if (type === 'offer' || type === 'answer') {
    if (data.length > 12000) return fail('信令过大');
  }
  await db.collection('mc_signals').add({
    roomId: roomId, from: from, to: to, type: type, data: data, createdAt: now()
  });
  return ok({});
}

// ---------- 离开 ----------
async function leave(b) {
  const roomId = normId(b.roomId);
  const playerId = normId(b.playerId);
  if (!roomId) return ok({});
  const r = await db.collection('mc_rooms').doc(roomId).get().catch(() => ({ data: null }));
  const room = docData(r);
  if (room && room.host) {
    const isHost = playerId === '1' || normId(room.host && room.host.id) === playerId;
    if (isHost) {
      // 房主离开 => 关房，清信令
      await db.collection('mc_rooms').doc(roomId).remove().catch(() => {});
      await db.collection('mc_signals').where({ roomId: roomId }).remove().catch(() => {});
    } else {
      const players = (room.players || []).filter(p => normId(p.id) !== playerId);
      await db.collection('mc_rooms').doc(roomId).update({ players: players, updatedAt: now() });
    }
  }
  return ok({});
}

// ---------- 房间详情 ----------
async function roomDetail(q) {
  const roomId = normId(q.roomId);
  if (!roomId) return fail('缺少参数');
  const r = await db.collection('mc_rooms').doc(roomId).get().catch(() => ({ data: null }));
  const rd = docData(r);
  if (!rd || rd.status !== 'open') return fail('房间不存在或已关闭', 404);
  return ok({ room: publicRoom(rd), host: rd.host, players: rd.players.map(p => ({ id: p.id, name: p.name, skin: p.skin })) });
}

// ---------- 更新房间模式（房主 /gamemode 时同步到列表） ----------
async function updateMode(b) {
  const roomId = normId(b.roomId);
  if (!roomId) return fail('缺少参数');
  const mode = b.mode === 'creative' ? 'creative' : (b.mode === 'shooter' ? 'shooter' : (b.mode === 'skyblock' ? 'skyblock' : 'survival'));
  await db.collection('mc_rooms').doc(roomId).update({ mode: mode, updatedAt: now() }).catch(() => {});
  return ok({});
}

// ---------- 清理过期数据 ----------
async function cleanup() {
  const t = now();
  const old = new Date(t - ROOM_TTL).getTime();
  const sigOld = new Date(t - SIGNAL_TTL).getTime();
  try {
    const r = await db.collection('mc_rooms').where({ updatedAt: _.lt(old) }).limit(50).get();
    for (const room of (r.data || [])) {
      await db.collection('mc_rooms').doc(room._id).remove().catch(() => {});
      await db.collection('mc_signals').where({ roomId: room._id }).remove().catch(() => {});
    }
  } catch (e) { /* 无索引时跳过 */ }
  try {
    await db.collection('mc_signals').where({ createdAt: _.lt(sigOld) }).limit(200).remove().catch(() => {});
  } catch (e) { /* ignore */ }
}

exports.main = async (event) => {
  try {
    const method = String(event.httpMethod || 'GET').toUpperCase();
    const path = String(event.path || '/').replace(/^\/mcroom/, '') || '/';
    if (method === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
    const body = parseBody(event.body, event.isBase64Encoded);
    const q = event.queryStringParameters || {};

    if (method === 'POST' && path === '/create') return await createRoom(body);
    if (method === 'POST' && path === '/join') return await joinRoom(body);
    if (method === 'GET' && path === '/list') return await listRooms();
    if (method === 'GET' && path === '/poll') return await poll(q);
    if (method === 'POST' && path === '/signal') return await postSignal(body);
    if (method === 'POST' && path === '/leave') return await leave(body);
    if (method === 'POST' && path === '/mode') return await updateMode(body);
    if (method === 'GET' && path === '/room') return await roomDetail(q);
    return fail('未知接口: ' + method + ' ' + path, 404);
  } catch (e) {
    return fail('服务器错误: ' + e.message, 500);
  }
};
