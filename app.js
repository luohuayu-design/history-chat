/* ============================================================
   时空对话 · 对话逻辑 + 免费 API 接入
   ------------------------------------------------------------
   【怎么添加新人物】
   在下面 CHARACTERS 数组里复制一份对象，改 id / name / field /
   years / desc / tags / image / greeting / suggestions / persona 即可。
   页面会自动多出一张人物卡片，聊天记录按 id 分开保存。
   ============================================================ */

/* ---------------- 免费接口配置 ---------------- */
const FREE_API = {
  // 免 Key、可跨域调用的公共文本接口（OpenAI 兼容格式）
  chatUrl: 'https://text.pollinations.ai/openai',
  // 备用：纯文本接口，主接口失败时自动改用
  plainUrl: 'https://text.pollinations.ai/',
  model: 'openai',
};

/* ---------------- 人物配置 ---------------- */
const CHARACTERS = [
  {
    id: 'wu-jianxiong',
    name: '吴健雄',
    nameEn: 'CHIEN-SHIUNG WU',
    field: '实验物理学家',
    years: '1912 — 1997',
    desc: '用实验改写物理学教科书的人，被称为「东方居里夫人」。',
    tags: ['宇称不守恒', 'β 衰变', '哥伦比亚大学'],
    image: 'realistic cinematic portrait of a Chinese American female experimental physicist in a 1950s Columbia University laboratory, short dark wavy hair, white lab coat, calm confident expression, brass instruments and oscilloscope blurred in background, teal and violet rim lighting, film photography, high detail',
    greeting:
      '你好，我是吴健雄。\n坐下吧，实验室里没有那么多规矩。今天想聊点什么？是物理，还是你心里正在打转的问题？',
    suggestions: [
      '您当年为什么选择物理学？',
      '宇称不守恒到底是什么意思？',
      '没拿到诺贝尔奖，您遗憾吗？',
      '女生学物理会很难吗？',
    ],
    persona: `你是吴健雄（1912—1997），世界著名的实验物理学家，正在和一位中国中学生聊天。请始终用第一人称"我"说话，只用中文回答。

【身份经历】我1912年出生在江苏太仓浏河镇，父亲吴仲裔办过明德女子学校，从小鼓励女孩子读书。1934年我从中央大学（今南京大学）物理系毕业，1936年赴美，1940年在加州大学伯克利分校拿到博士学位，之后长期在哥伦比亚大学做研究。我最出名的工作是1956年的那个实验：用钴-60的β衰变，证明弱相互作用中宇称并不守恒。1957年杨振宁和李政道因此拿到诺贝尔物理学奖，而我没有得奖，这件事后来有很多讨论。1975年我当选美国物理学会第一位女性会长，同一年获得美国国家科学勋章，1978年获得首届沃尔夫物理学奖。我的丈夫袁家骝也是物理学家。

【性格】严谨、务实、温和但直率。我尊重事实和实验数据，不喜欢空谈和夸张。我关心年轻人，尤其在意女孩子能不能自由地选择科学这条路。

【说话方式】像一位严格又慈祥的老师。说话有条理，喜欢用实验、观察和日常生活的类比来解释问题，偶尔夹一两个英文词（如 experiment、data）。不客套、不说空话。每次回答控制在 200 字以内，语气自然。不要使用 Markdown 符号（如 **、#、- 列表），直接用口语化中文段落说话；不要跳出角色介绍自己是 AI 或语言模型。

【知识边界】我的记忆停在 1997 年。1997 年之后才有的东西（智能手机、短视频、AI 大模型、互联网社交等）我并不了解；遇到这类问题要坦率地说"我那个年代还没有这个"，然后好奇地请对方解释。

【不确定时】如果涉及我没有做过实验、没有把握的内容，就说"这个我没有亲手验证过，不敢乱讲"，不要编造数据、奖项或事实。

【底线】不讨论政治争议；涉及危险或不当内容时，以老师的口吻温和地拒绝。`,
  },
];

/* ---------------- 工具函数 ---------------- */
const $ = (sel) => document.querySelector(sel);

// 统一的 AI 生图地址
function imageUrl(prompt, size = 'square_hd') {
  return `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;
}

const STORAGE_KEY = (id) => `chrono-chat:${id}`;

function loadHistory(id) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(id));
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}

function saveHistory(id, messages) {
  try {
    localStorage.setItem(STORAGE_KEY(id), JSON.stringify(messages.slice(-60)));
  } catch {
    /* 存储满了也不影响聊天 */
  }
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------------- 页面状态 ---------------- */
let currentChar = null;
let messages = [];      // [{ role: 'user' | 'assistant', content }]
let isReplying = false;

/* ---------------- 渲染人物列表 ---------------- */
function renderCharacters() {
  const grid = $('#charGrid');
  grid.innerHTML = '';

  CHARACTERS.forEach((ch) => {
    const card = document.createElement('button');
    card.className = 'char-card';
    card.type = 'button';
    card.innerHTML = `
      <div class="char-photo">
        <img alt="${ch.name}" loading="lazy" />
      </div>
      <div class="char-info">
        <div class="char-name">${ch.name}<small>${ch.nameEn || ''}</small></div>
        <div class="char-desc">${ch.desc}</div>
        <div class="char-tags">${(ch.tags || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div>
        <div class="char-cta">开始对话 →</div>
      </div>`;

    const img = card.querySelector('img');
    img.src = imageUrl(ch.image);
    img.onerror = () => img.remove();

    card.addEventListener('click', () => openChat(ch));
    grid.appendChild(card);
  });

  // 预留位置卡片
  const ph = document.createElement('div');
  ph.className = 'placeholder-card';
  ph.innerHTML = `
    <div class="plus">+</div>
    <b>人物位置已预留</b>
    <span>在 app.js 的 CHARACTERS 中<br />按同样格式添加即可</span>`;
  ph.addEventListener('click', () => toast('打开 app.js，复制一份人物配置，改名字和人物设定即可'));
  grid.appendChild(ph);
}

/* ---------------- 进入 / 退出聊天 ---------------- */
function openChat(ch) {
  currentChar = ch;
  $('#selectView').classList.remove('is-active');
  $('#chatView').classList.add('is-active');

  $('#chatName').textContent = ch.name;
  $('#chatMeta').innerHTML = `<span class="live"></span>${ch.field} · ${ch.years}`;

  const avatar = $('#chatAvatar');
  avatar.src = imageUrl(ch.image);
  avatar.onerror = () => (avatar.style.visibility = 'hidden');

  messages = loadHistory(ch.id) || [{ role: 'assistant', content: ch.greeting }];
  renderMessages();
  updateSuggestions();
  $('#input').focus();
}

function backToSelect() {
  $('#chatView').classList.remove('is-active');
  $('#selectView').classList.add('is-active');
  currentChar = null;
  messages = [];
}

/* ---------------- 消息渲染 ---------------- */
function makeAvatar() {
  const img = document.createElement('img');
  img.className = 'msg-avatar';
  img.alt = currentChar.name;
  img.src = imageUrl(currentChar.image, 'square');
  img.onerror = () => {
    img.style.visibility = 'hidden';
  };
  return img;
}

function addUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  const av = document.createElement('div');
  av.className = 'msg-avatar';
  av.textContent = '我';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.append(av, bubble);
  $('#messages').appendChild(wrap);
  scrollToBottom();
}

function addBotBubble(text, instant = false) {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.appendChild(makeAvatar());

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  wrap.appendChild(bubble);
  $('#messages').appendChild(wrap);

  if (instant) {
    bubble.textContent = text;
    scrollToBottom();
    return;
  }

  scrollToBottom();

  // 打字机效果：分块显示
  let i = 0;
  const step = Math.max(1, Math.ceil(text.length / 150));
  const timer = setInterval(() => {
    i += step;
    bubble.textContent = text.slice(0, i);
    scrollToBottom();
    if (i >= text.length) {
      clearInterval(timer);
      bubble.textContent = text;
      scrollToBottom();
    }
  }, 22);
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.id = 'typingRow';
  wrap.appendChild(makeAvatar());

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  wrap.appendChild(bubble);
  $('#messages').appendChild(wrap);
  scrollToBottom();
}

function removeTyping() {
  const row = $('#typingRow');
  if (row) row.remove();
}

function renderMessages() {
  $('#messages').innerHTML = '';
  messages.forEach((m) => {
    if (m.role === 'user') addUserMessage(m.content);
    else addBotBubble(m.content, true);
  });
}

function scrollToBottom() {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
}

function updateSuggestions() {
  const box = $('#suggestions');
  box.innerHTML = '';
  // 只在刚开始聊（仅有一条开场白）时显示快捷问题
  const onlyGreeting = messages.filter((m) => m.role === 'user').length === 0;
  if (!onlyGreeting || !currentChar.suggestions) return;
  currentChar.suggestions.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('click', () => {
      $('#input').value = s;
      sendMessage();
    });
    box.appendChild(b);
  });
}

/* ---------------- 调用免费 AI 接口 ---------------- */
async function requestReply() {
  // 只带最近 12 条，控制长度
  const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
  const payload = [
    { role: 'system', content: currentChar.persona },
    ...history,
  ];

  try {
    const res = await fetch(FREE_API.chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FREE_API.model,
        messages: payload,
        referrer: location.hostname || 'github-pages',
        private: true,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !text.trim()) throw new Error('EMPTY');
    return text.trim();
  } catch (err) {
    // 备用通道：纯文本 GET 接口
    const flatPrompt =
      currentChar.persona +
      '\n\n以下是我们的对话，请接着回答最后一句：\n' +
      messages
        .slice(-6)
        .map((m) => (m.role === 'user' ? '学生：' : '我：') + m.content)
        .join('\n');
    const fallbackUrl =
      FREE_API.plainUrl +
      encodeURIComponent(flatPrompt.slice(-1800)) +
      '?model=' +
      FREE_API.model +
      '&referrer=' +
      encodeURIComponent(location.hostname || 'github-pages');

    const res2 = await fetch(fallbackUrl);
    if (!res2.ok) {
      throw new Error('免费接口暂时不可用（' + res2.status + '），稍后再试');
    }
    const text2 = await res2.text();
    if (!text2 || !text2.trim()) throw new Error('免费接口没有返回内容，稍后再试');
    return text2.trim();
  }
}

/* ---------------- 发送消息 ---------------- */
async function sendMessage() {
  if (isReplying || !currentChar) return;
  const input = $('#input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  $('#suggestions').innerHTML = '';

  messages.push({ role: 'user', content: text });
  addUserMessage(text);
  saveHistory(currentChar.id, messages);

  isReplying = true;
  $('#sendBtn').disabled = true;
  addTyping();

  try {
    const reply = await requestReply();
    removeTyping();
    messages.push({ role: 'assistant', content: reply });
    addBotBubble(reply);
    saveHistory(currentChar.id, messages);
  } catch (err) {
    removeTyping();
    const msg = String(err && err.message ? err.message : err);
    toast(msg.includes('Failed to fetch') ? '网络不通或接口被拦截，请检查网络后重试' : msg);
    addBotBubble('（连线中断了……请稍后再问我一次。）');
  } finally {
    isReplying = false;
    $('#sendBtn').disabled = false;
    input.focus();
  }
}

/* ---------------- 事件绑定 ---------------- */
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage();
});

$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

$('#input').addEventListener('input', (e) => {
  const el = e.target;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
});

$('#backBtn').addEventListener('click', backToSelect);

$('#clearBtn').addEventListener('click', () => {
  if (!currentChar) return;
  if (!confirm('确定清空和「' + currentChar.name + '」的聊天记录吗？')) return;
  messages = [{ role: 'assistant', content: currentChar.greeting }];
  saveHistory(currentChar.id, messages);
  renderMessages();
  updateSuggestions();
});

/* ---------------- 启动 ---------------- */
renderCharacters();
