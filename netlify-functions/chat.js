let getStore = null;
try {
  const blobs = require('@netlify/blobs');
  getStore = blobs.getStore;
} catch (e) {
  console.error('[MTM] Blobs unavailable:', e.message);
}

const CEREBRAS_KEY = 'csk-v8rnfxfyyx9jky56crrfm26dmn4kfnj545f4y9d99j3ccyj3';
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const ADMIN_PW = 'mtm3000';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

function getDataStore() {
  if (!getStore) return null;
  try { return getStore('mtm-data'); } catch (e) { return null; }
}

function getLogStore() {
  if (!getStore) return null;
  try { return getStore('mtm-logs'); } catch (e) { return null; }
}

async function getJSON(store, key, fallback = null) {
  if (!store) return fallback;
  const raw = await store.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

async function setJSON(store, key, data) {
  if (!store) return;
  await store.set(key, JSON.stringify(data));
}

async function getXP(player) {
  const store = getDataStore();
  const all = await getJSON(store, 'xp', {});
  return all[player] || { xp: 0, level: 1, chats: 0, lastCheckIn: null, streak: 0 };
}

async function addXP(player, amount) {
  const store = getDataStore();
  if (!store) return null;
  const all = await getJSON(store, 'xp', {});
  const p = all[player] || { xp: 0, level: 1, chats: 0, lastCheckIn: null, streak: 0 };
  p.xp += amount;
  p.chats = (p.chats || 0) + 1;
  p.level = Math.floor(Math.sqrt(p.xp / 20)) + 1;
  all[player] = p;
  await setJSON(store, 'xp', all);
  return p;
}

// ===== Main Handler =====
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const q = event.queryStringParameters || {};
  const action = q.action || '';

  // ---- GET endpoints ----
  if (event.httpMethod === 'GET') {
    try {
      // Health check
      if (action === 'ping') {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, blobs: !!getStore }) };
      }

      const store = getDataStore();

      // Public conversations
      if (action === 'conversations') {
        const ls = getLogStore();
        if (!ls) return { statusCode: 200, headers, body: '[]' };
        const raw = await ls.get('public-conversations');
        return { statusCode: 200, headers, body: raw || '[]' };
      }

      // Player stats
      if (action === 'stats') {
        const all = await getJSON(store, 'xp', {});
        const player = q.player || '';
        if (player) {
          const p = all[player] || { xp: 0, level: 1, chats: 0, streak: 0 };
          return { statusCode: 200, headers, body: JSON.stringify(p) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(all) };
      }

      // Leaderboard
      if (action === 'leaderboard') {
        const all = await getJSON(store, 'xp', {});
        const list = Object.entries(all).map(([name, data]) => ({ player: name, ...data }));
        list.sort((a, b) => (b.xp || 0) - (a.xp || 0));
        return { statusCode: 200, headers, body: JSON.stringify(list.slice(0, 100)) };
      }

      // Polls
      if (action === 'polls') {
        const polls = await getJSON(store, 'polls', []);
        return { statusCode: 200, headers, body: JSON.stringify(polls) };
      }

      // Builds
      if (action === 'builds') {
        const builds = await getJSON(store, 'builds', []);
        builds.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
        return { statusCode: 200, headers, body: JSON.stringify(builds.slice(0, 200)) };
      }

      // Kudos
      if (action === 'kudos') {
        const all = await getJSON(store, 'kudos', {});
        const list = Object.entries(all).map(([name, data]) => ({ player: name, count: data.count || 0, recent: (data.recent || []).slice(0, 5) }));
        list.sort((a, b) => (b.count || 0) - (a.count || 0));
        return { statusCode: 200, headers, body: JSON.stringify(list.slice(0, 100)) };
      }

      // Events
      if (action === 'events') {
        const events = await getJSON(store, 'events', []);
        const now = new Date().toISOString();
        const upcoming = events.filter(e => e.dateTime > now).sort((a, b) => a.dateTime.localeCompare(b.dateTime));
        return { statusCode: 200, headers, body: JSON.stringify(upcoming.slice(0, 50)) };
      }

      // Admin logs
      if (q.pw === ADMIN_PW) {
        const ls = getLogStore();
        if (!ls) return { statusCode: 200, headers, body: '[]' };
        const raw = await ls.get('logs');
        return { statusCode: 200, headers, body: raw || '[]' };
      }

      return { statusCode: 404, headers, body: JSON.stringify({ error: 'unknown action' }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ---- POST endpoints ----
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);

      // Share conversation
      if (action === 'share') {
        const { playerName, title, messages } = body;
        if (!title || !messages || messages.length === 0) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'title and messages required' }) };
        }
        const logStore = getLogStore();
        const raw = await logStore.get('public-conversations');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          playerName: playerName || 'Anonymous',
          title: title.slice(0, 100),
          timestamp: new Date().toISOString(),
          messageCount: messages.length,
          preview: messages[0]?.content?.slice(0, 100) || '',
          messages: messages,
        });
        await logStore.set('public-conversations', JSON.stringify(list.slice(0, 200)));
        // XP for sharing
        if (playerName) await addXP(playerName, 25);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Daily check-in
      if (action === 'checkin') {
        const player = body.playerName;
        if (!player) return { statusCode: 400, headers, body: JSON.stringify({ error: 'playerName required' }) };
        const store = getDataStore();
        const all = await getJSON(store, 'xp', {});
        const p = all[player] || { xp: 0, level: 1, chats: 0, lastCheckIn: null, streak: 0 };
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        let isNew = false;
        if (p.lastCheckIn !== today) {
          isNew = true;
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const yStr = yesterday.toISOString().slice(0, 10);
          p.streak = p.lastCheckIn === yStr ? (p.streak || 0) + 1 : 1;
          p.lastCheckIn = today;
          p.xp += 10;
          p.level = Math.floor(Math.sqrt(p.xp / 20)) + 1;
          all[player] = p;
          await setJSON(store, 'xp', all);
        }
        return { statusCode: 200, headers, body: JSON.stringify({ streak: p.streak || 0, xp: p.xp, level: p.level, isNew }) };
      }

      // Create poll
      if (action === 'poll-create') {
        const { title, options, playerName } = body;
        if (!title || !options || options.length < 2) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'title and at least 2 options required' }) };
        }
        const store = getDataStore();
        const polls = await getJSON(store, 'polls', []);
        polls.unshift({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: title.slice(0, 200),
          options: options.map(o => ({ text: o.slice(0, 100), votes: 0 })),
          createdBy: playerName || 'Anonymous',
          timestamp: new Date().toISOString(),
          voters: [],
        });
        await setJSON(store, 'polls', JSON.stringify(polls.slice(0, 100)));
        if (playerName) await addXP(playerName, 5);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Vote on poll
      if (action === 'poll-vote') {
        const { pollId, optionIndex, playerName } = body;
        if (pollId === undefined || optionIndex === undefined) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'pollId and optionIndex required' }) };
        }
        const store = getDataStore();
        const polls = await getJSON(store, 'polls', []);
        const poll = polls.find(p => p.id === pollId);
        if (!poll) return { statusCode: 404, headers, body: JSON.stringify({ error: 'poll not found' }) };
        if (poll.voters?.includes(playerName)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'already voted' }) };
        }
        if (optionIndex < 0 || optionIndex >= poll.options.length) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid option' }) };
        }
        poll.options[optionIndex].votes += 1;
        if (!poll.voters) poll.voters = [];
        if (playerName) poll.voters.push(playerName);
        await setJSON(store, 'polls', polls);
        if (playerName) await addXP(playerName, 2);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Add build idea
      if (action === 'build-add') {
        const { title, description, materials, biome, playerName } = body;
        if (!title || !description) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'title and description required' }) };
        }
        const store = getDataStore();
        const builds = await getJSON(store, 'builds', []);
        builds.unshift({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: title.slice(0, 200),
          description: description.slice(0, 1000),
          materials: (materials || '').slice(0, 500),
          biome: (biome || 'Any').slice(0, 50),
          playerName: playerName || 'Anonymous',
          timestamp: new Date().toISOString(),
          upvotes: 0,
          voters: [],
        });
        await setJSON(store, 'builds', builds.slice(0, 200));
        if (playerName) await addXP(playerName, 10);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // Upvote build
      if (action === 'build-upvote') {
        const { buildId, playerName } = body;
        if (!buildId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'buildId required' }) };
        const store = getDataStore();
        const builds = await getJSON(store, 'builds', []);
        const build = builds.find(b => b.id === buildId);
        if (!build) return { statusCode: 404, headers, body: JSON.stringify({ error: 'build not found' }) };
        if (build.voters?.includes(playerName)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'already upvoted' }) };
        }
        build.upvotes = (build.upvotes || 0) + 1;
        if (!build.voters) build.voters = [];
        if (playerName) build.voters.push(playerName);
        await setJSON(store, 'builds', builds);
        if (playerName) await addXP(playerName, 1);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, upvotes: build.upvotes }) };
      }

      // Give kudos
      if (action === 'kudos') {
        const { targetPlayer, fromPlayer, message } = body;
        if (!targetPlayer || !fromPlayer) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'targetPlayer and fromPlayer required' }) };
        }
        if (targetPlayer === fromPlayer) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'cannot kudo yourself' }) };
        }
        const store = getDataStore();
        const all = await getJSON(store, 'kudos', {});
        if (!all[targetPlayer]) all[targetPlayer] = { count: 0, recent: [] };
        all[targetPlayer].count += 1;
        all[targetPlayer].recent.unshift({ from: fromPlayer, message: (message || '').slice(0, 200), time: new Date().toISOString() });
        await setJSON(store, 'kudos', all);
        if (fromPlayer) await addXP(fromPlayer, 3);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: all[targetPlayer].count }) };
      }

      // Create event
      if (action === 'event-create') {
        const { title, dateTime, description, playerName } = body;
        if (!title || !dateTime) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'title and dateTime required' }) };
        }
        const store = getDataStore();
        const events = await getJSON(store, 'events', []);
        events.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: title.slice(0, 200),
          dateTime,
          description: (description || '').slice(0, 1000),
          createdBy: playerName || 'Anonymous',
          createdAt: new Date().toISOString(),
        });
        await setJSON(store, 'events', events.slice(-200));
        if (playerName) await addXP(playerName, 5);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // ===== Default: Chat proxy =====
      console.log(`[MTM] Chat from ${body.playerName || '?'}: "${(body.messages?.filter(m => m.role === 'user').pop()?.content || '').slice(0, 80)}"`);

      // Strip non-Cerebras fields before forwarding
      const { playerName: _, ...cerebrasBody } = body;

      // Retry up to 3 times with exponential backoff on 429
      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          res = await fetch(CEREBRAS_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CEREBRAS_KEY}`,
            },
            body: JSON.stringify(cerebrasBody),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.status !== 429) break;
          // Rate limited — wait and retry
          const wait = Math.pow(2, attempt) * 1000;
          console.log(`[MTM] Rate limited, retry ${attempt + 1} in ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
        } catch (fetchErr) {
          clearTimeout(timeout);
          if (attempt === 2) throw new Error('Cerebras API error: ' + fetchErr.message);
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      let data, reply;
      try {
        data = await res.json();
        reply = data.choices?.[0]?.message?.content || '';
      } catch (parseErr) {
        throw new Error('Cerebras response parse error: ' + parseErr.message);
      }

      console.log(`[MTM] Reply to ${body.playerName || '?'}: "${reply.slice(0, 80)}"`);

      // Log + XP (async, don't block response)
      (async () => {
        try {
          const logStore = getLogStore();
          if (logStore) {
            const raw = await logStore.get('logs');
            const logs = raw ? JSON.parse(raw) : [];
            const userMsgs = body.messages?.filter(m => m.role === 'user');
            logs.push({
              id: Date.now(),
              timestamp: new Date().toISOString(),
              player: body.playerName || 'unknown',
              message: userMsgs?.[userMsgs.length - 1]?.content || '',
              response: reply,
              tokens: data.usage?.total_tokens || 0,
            });
            await logStore.set('logs', JSON.stringify(logs.slice(-1000)));
          }
          if (body.playerName) {
            await addXP(body.playerName, 5);
          }
        } catch (bgErr) {
          console.error('[MTM] Background error:', bgErr.message);
        }
      })();

      return { statusCode: res.status, headers, body: JSON.stringify(data) };
    } catch (e) {
      console.error('[MTM] Error:', e.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Chat error: ' + e.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST or GET only' }) };
};
