'use strict';
(() => {
  const isLocalPreview = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API_URL = isLocalPreview
    ? '/chat'
    : 'https://1529785241-cw41hwjsxl.ap-guangzhou.tencentscf.com/chat';
  const $ = id => document.getElementById(id);
  const connection = $('connection'), codeInput = $('access-code'), connect = $('connect');
  const codeError = $('code-error'), chatError = $('chat-error'), composer = $('composer');
  const conversation = $('conversation'), empty = $('empty'), prompt = $('prompt');
  const send = $('send'), newChat = $('new-chat'), lock = $('lock');
  const webKeywords = $('web-keywords');
  const webKeywordsRow = $('web-keywords-row');
  const encoder = new TextEncoder();
  const markdown = typeof window.markdownit === 'function'
    ? window.markdownit({ html: false, breaks: true }).disable('image')
    : null;
  if (markdown) {
    markdown.validateLink = url => /^https?:\/\//i.test(url);
    markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
      tokens[index].attrSet('target', '_blank');
      tokens[index].attrSet('rel', 'noopener noreferrer');
      return renderer.renderToken(tokens, index, options);
    };
  }
  const eventInstructions = [
    '你是习概课汇报的资料助手，主题为新时代的中国外交，聚焦中国参与的国际援助与人道合作。用中文回答用户指定的事件和追问。',
    '收到问题直接处理，先看本轮检索线索和对话上下文。最符合的是一个事件，就直接讲；用户明确要列举、多举例或比较时，直接给出多个相关事件。仅当用户明显在指某一个事件，且检索后仍有两个或更多同样吻合的候选、选错会改变答案时，列出两三个候选，问一句是哪件事。其余情况按最合理的理解回答，必要时一句话交代采用的理解。',
    '事件明确且信息足够时，用“事件概况”“援助行动与结果”“理念解读”三个短段落组织首次讲解，约300至450字。具体追问直接回答，并采用当前对话中已经确认的事件信息。',
    '交代时间、地点、当事方、需求、行动和已知结果。区分政府、民间组织、企业与国际机构的角色。仅在有依据时判定项目属于无偿援助、技术合作、人道救援、贷款或其他合作形式。',
    '将事实、当事方表态和分析分开。理念解读选择一到两个与行动直接相关的观点，逐一说明事实依据。把承诺、计划、实际交付和公开报道的结果分别表述。单一案例不足以支持的成效或因果结论留作待核实。',
    '用明确、自然的语气，把答案放在前面。只指出影响结论的关键不确定性，避免反复提示、质疑或要求用户补资料。检索线索和用户给出的资料可以据实引用；仅凭新闻标题不能确认报道正文的细节。没有检索线索时，按有把握的知识直接答，不编造故事、引语、链接、出处或数据，也不冒称查证过。'
  ].join('\n');
  let accessCode = '', history = [], pending = null;

  function showError(element, message = '') {
    element.textContent = message;
    element.hidden = !message;
  }
  function updateControls() {
    prompt.disabled = !accessCode;
    webKeywords.disabled = !accessCode;
    send.disabled = !accessCode || (!pending && !prompt.value.trim());
    send.textContent = pending ? '停止' : '发送';
    send.setAttribute('aria-label', pending ? '停止等待回答' : '发送消息');
    newChat.disabled = Boolean(pending) || !history.length;
    lock.disabled = Boolean(pending);
  }
  function resetChat() {
    history = [];
    conversation.replaceChildren(empty);
    empty.hidden = false;
    prompt.value = '';
    webKeywords.value = '';
    showError(chatError);
    updateControls();
  }
  function appendText(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  }
  function message(role, text, thinking = false) {
    const article = document.createElement('article');
    article.className = 'message ' + role + (thinking ? ' thinking' : '');
    const label = document.createElement('p');
    label.className = 'message-label';
    label.textContent = role === 'user' ? '你' : 'DeepSeek';
    const content = document.createElement(role === 'assistant' ? 'div' : 'p');
    content.className = 'message-content';
    content.textContent = text;
    article.append(label, content);
    empty.hidden = true;
    conversation.append(article);
    conversation.scrollTop = conversation.scrollHeight;
    return { article, content };
  }
  async function request(body, code, signal) {
    const response = await fetch(API_URL, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-Demo-Code': code },
      body: JSON.stringify(body)
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('接口返回异常，请稍后重试。'); }
    return { response, data };
  }
  connection.addEventListener('submit', async event => {
    event.preventDefault();
    if (connect.disabled) return;
    const code = codeInput.value.trim();
    if (code.length < 12) { showError(codeError, '口令至少需要 12 位。'); return; }
    showError(codeError);
    codeInput.removeAttribute('aria-invalid');
    connect.disabled = true;
    codeInput.disabled = true;
    connect.textContent = '连接中';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      // Authentication runs before message validation; this checks the code without a model call.
      const { response, data } = await request({ messages: [] }, code, controller.signal);
      if (response.status !== 400 || !String(data.error).startsWith('messages 需包含')) {
        throw new Error(data.error || '连接未成功，请稍后重试。');
      }
      accessCode = code;
      codeInput.value = '';
      connection.hidden = true;
      lock.hidden = false;
      updateControls();
      prompt.focus();
    } catch (error) {
      showError(codeError, controller.signal.aborted ? '连接超时，请重试。' :
        error instanceof TypeError ? '连接失败，请检查网络后重试。' : error.message);
      codeInput.setAttribute('aria-invalid', 'true');
    } finally {
      clearTimeout(timer);
      connect.disabled = false;
      codeInput.disabled = false;
      connect.textContent = '连接';
      if (!connection.hidden) codeInput.focus();
    }
  });
  prompt.addEventListener('input', updateControls);
  codeInput.addEventListener('input', () => {
    showError(codeError);
    codeInput.removeAttribute('aria-invalid');
  });
  prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !pending) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });
  composer.addEventListener('submit', event => {
    event.preventDefault();
    if (pending) { pending.abort(); return; }
    const text = prompt.value.trim();
    if (text) sendMessage(text);
  });
  async function sendMessage(text) {
    if (!accessCode || pending) return;
    showError(chatError);
    let userMessage, assistantMessage;
    const keywords = webKeywordsRow.hidden ? '' : webKeywords.value.trim();
    prompt.value = '';
    webKeywords.value = '';
    const controller = new AbortController();
    pending = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 110000);
    updateControls();
    try {
      const context = history.slice();
      const instructions = { role: 'system', content: eventInstructions };
      const body = { messages: [], stream: false, max_tokens: 1024 };
      if (keywords) body.search_keywords = keywords;
      const current = { role: 'user', content: text };
      for (;;) {
        body.messages = [instructions, ...context, current];
        const chars = body.messages.reduce((sum, item) => sum + item.content.length, 0);
        if (body.messages.length <= 40 && chars <= 24000 && encoder.encode(JSON.stringify(body)).length <= 65536) break;
        if (!context.length) throw new Error('本次消息过长，请缩短后再试。');
        context.splice(0, 2);
      }
      userMessage = message('user', text);
      assistantMessage = message('assistant', '正在思考…', true);
      const { response, data } = await request(body, accessCode, controller.signal);
      if (!response.ok) throw Object.assign(new Error(data.error || '发送失败，请稍后重试。'), { status: response.status });
      if (typeof data.reply !== 'string') throw new Error('回答格式异常，请重新发送。');
      history = [...context, current, { role: 'assistant', content: data.reply }];
      if (markdown) {
        assistantMessage.content.classList.add('markdown');
        // markdown-it escapes raw HTML and the link policy only permits HTTP(S).
        assistantMessage.content.innerHTML = markdown.render(data.reply);
      } else {
        assistantMessage.content.textContent = data.reply;
      }
      if (Array.isArray(data.search_sources) && data.search_sources.length) {
        const details = document.createElement('details');
        appendText(details, 'summary', '本次检索线索');
        const list = document.createElement('ol');
        for (const source of data.search_sources) {
          const item = document.createElement('li');
          const link = appendText(item, 'a', source.title);
          if (/^https?:\/\//i.test(source.url)) {
            link.href = source.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
          }
          list.append(item);
        }
        details.append(list);
        assistantMessage.article.append(details);
      }
      assistantMessage.article.classList.remove('thinking');
      conversation.scrollTop = conversation.scrollHeight;
    } catch (error) {
      userMessage?.article.remove();
      assistantMessage?.article.remove();
      if (!prompt.value) prompt.value = text;
      if (!webKeywords.value) webKeywords.value = keywords;
      if (!history.length) empty.hidden = false;
      showError(chatError, controller.signal.aborted ? (timedOut ? '等待回答超时，可以重新发送。' : '已停止等待。') :
        error instanceof TypeError ? '发送失败，请检查网络后重试。' : error.message);
      if (error.status === 401) {
        accessCode = '';
        connection.hidden = false;
        lock.hidden = true;
        showError(codeError, '口令已失效，请重新连接。');
      }
    } finally {
      clearTimeout(timer);
      pending = null;
      updateControls();
      (accessCode ? prompt : codeInput).focus();
    }
  }
  newChat.addEventListener('click', () => { resetChat(); prompt.focus(); });
  lock.addEventListener('click', () => {
    accessCode = '';
    resetChat();
    connection.hidden = false;
    lock.hidden = true;
    showError(codeError);
    codeInput.focus();
  });
  updateControls();
})();
