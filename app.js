(function () {
  let data = { meta: {}, cards: [], events: [], footnotes: [] };
  let currentCardFilter = 'all';
  let currentEventFilter = 'all';
  const openIds = new Set();

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  function cardId(c, i) {
    return 'card-' + i + '-' + (c.title || '').slice(0, 12).replace(/\W+/g, '_');
  }

  function signalClass(sig) {
    if (sig === 'go') return 'sig-go';
    if (sig === 'maybe') return 'sig-maybe';
    return 'sig-skip';
  }

  function statusClass(st) {
    const s = (st || '').toLowerCase();
    if (s.includes('open')) return 'status-open';
    if (s.includes('waitlist')) return 'status-waitlist';
    if (s.includes('sold-out') || s.includes('full')) return 'status-sold-out';
    return 'sig-skip';
  }

  function zoneBadge(z) {
    if (z === 'white') return '<span class="text-mint font-medium">白区</span>';
    if (z === 'gray') return '<span class="text-accent font-medium">灰边</span>';
    if (z === 'illegal') return '<span class="text-danger font-medium">非法</span>';
    return '<span class="text-ink-300">' + esc(z || '未标') + '</span>';
  }

  function cardMatches(c) {
    if (currentCardFilter === 'all') return true;
    if (currentCardFilter === 'go') return c.signal === 'go';
    if (currentCardFilter === 'maybe') return c.signal === 'maybe';
    if (currentCardFilter === 'white') return c.zone === 'white';
    if (currentCardFilter === 'gray') return c.zone === 'gray';
    if (currentCardFilter === 'r5') return Number(c.relevance) >= 5;
    if (currentCardFilter === 'r4') return Number(c.relevance) >= 4;
    return true;
  }

  function eventMatches(e) {
    if (currentEventFilter === 'all') return true;
    return (e.category || '').toLowerCase() === currentEventFilter;
  }

  function renderCardFilters() {
    const f = document.getElementById('filters');
    f.innerHTML = '';
    const filters = [
      { id: 'all', label: '全部' },
      { id: 'go', label: 'GO' },
      { id: 'maybe', label: 'MAYBE' },
      { id: 'white', label: '白区' },
      { id: 'gray', label: '灰边' },
      { id: 'r4', label: '相关度 ≥4' }
    ];
    filters.forEach((item) => {
      const btn = el('button', 'seg-btn' + (currentCardFilter === item.id ? ' active' : ''));
      btn.type = 'button';
      btn.textContent = item.label;
      btn.onclick = () => {
        currentCardFilter = item.id;
        render();
      };
      f.appendChild(btn);
    });
  }

  function renderEventFilters() {
    const f = document.getElementById('event-filters');
    if (!f) return;
    f.innerHTML = '';
    const categories = [
      { id: 'all', label: '全部' },
      { id: 'ai', label: 'AI' },
      { id: 'build', label: 'Build' },
      { id: 'hackathon', label: 'Hackathon' },
      { id: 'startup', label: 'Startup' }
    ];
    categories.forEach((cat) => {
      const btn = el('button', 'seg-btn text-xs py-1 px-3 min-h-[32px]' + (currentEventFilter === cat.id ? ' active' : ''));
      btn.type = 'button';
      btn.textContent = cat.label;
      btn.onclick = () => {
        currentEventFilter = cat.id;
        renderEvents();
      };
      f.appendChild(btn);
    });
  }

  function listBlock(label, items, textClass) {
    if (!items || !items.length) return '';
    return '<div class="mt-3.5">' +
      '<p class="text-[11px] uppercase tracking-wider text-ink-400 font-mono mb-1.5">' + esc(label) + '</p>' +
      '<ul class="list-disc list-outside pl-4 space-y-1 text-sm ' + (textClass || 'text-ink-100') + '">' +
      items.map((it) => '<li>' + esc(it) + '</li>').join('') +
      '</ul></div>';
  }

  function urlsBlock(urls) {
    if (!urls || !urls.length) return '';
    return '<div class="mt-3.5">' +
      '<p class="text-[11px] uppercase tracking-wider text-ink-400 font-mono mb-1.5">公开源</p>' +
      '<ul class="space-y-1 text-xs font-mono">' +
      urls.map((u) => {
        let label = u.replace(/^https?:\/\//, '');
        if (label.length > 55) label = label.slice(0, 52) + '…';
        return '<li><a class="text-accent-soft hover:underline break-all inline-flex items-center gap-1" href="' + esc(u) + '" target="_blank" rel="noopener">' +
          '<span>🔗</span><span>' + esc(label) + '</span></a></li>';
      }).join('') +
      '</ul></div>';
  }

  function columnsBlock(cols) {
    if (!cols) return '';
    return '<div class="mt-3.5 pt-3 border-t border-ink-700/60">' +
      '<p class="text-[11px] uppercase tracking-wider text-ink-400 font-mono mb-2">三栏规则划分</p>' +
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">' +
        '<div class="p-2.5 rounded-xl border border-mint/25 bg-mint/5 text-xs">' +
          '<div class="text-mint font-semibold mb-1 flex items-center gap-1"><span>🟢</span><span>白区（合法进场）</span></div>' +
          '<p class="text-ink-200 leading-relaxed">' + esc(cols.white || '无') + '</p>' +
        '</div>' +
        '<div class="p-2.5 rounded-xl border border-accent/25 bg-accent/5 text-xs">' +
          '<div class="text-accent font-semibold mb-1 flex items-center gap-1"><span>🟡</span><span>灰边（违规风险与干净替代）</span></div>' +
          '<p class="text-ink-200 leading-relaxed">' + esc(cols.gray || '无') + '</p>' +
        '</div>' +
        '<div class="p-2.5 rounded-xl border border-danger/25 bg-danger/5 text-xs">' +
          '<div class="text-danger font-semibold mb-1 flex items-center gap-1"><span>🔴</span><span>非法（只警示不碰）</span></div>' +
          '<p class="text-ink-200 leading-relaxed">' + esc(cols.illegal || '无') + '</p>' +
        '</div>' +
      '</div></div>';
  }

  function winnersLosersBlock(wl) {
    if (!wl) return '';
    let winnersText = '';
    let losersText = '';
    if (typeof wl === 'string') {
      return '<div class="mt-3.5">' +
        '<p class="text-[11px] uppercase tracking-wider text-ink-400 font-mono mb-1">谁赢谁亏</p>' +
        '<p class="text-xs text-ink-200 leading-relaxed">' + esc(wl) + '</p></div>';
    }
    if (wl.winners) winnersText = wl.winners;
    if (wl.losers) losersText = wl.losers;
    return '<div class="mt-3.5">' +
      '<p class="text-[11px] uppercase tracking-wider text-ink-400 font-mono mb-1.5">谁赢谁亏</p>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">' +
        (winnersText ? '<div class="p-2 rounded-lg bg-ink-800/80 border border-ink-700/60"><span class="text-mint font-semibold">赢家：</span><span class="text-ink-200">' + esc(winnersText) + '</span></div>' : '') +
        (losersText ? '<div class="p-2 rounded-lg bg-ink-800/80 border border-ink-700/60"><span class="text-danger font-semibold">亏家：</span><span class="text-ink-200">' + esc(losersText) + '</span></div>' : '') +
      '</div></div>';
  }

  function cardNode(c, i) {
    const id = cardId(c, i);
    const open = openIds.has(id);
    const art = el('article', 'card rounded-2xl p-4 sm:p-5 transition duration-150');

    // Header
    const top = el('div', 'flex items-start justify-between gap-3');
    top.appendChild(el('h3', 'text-base sm:text-lg font-bold leading-snug flex-1 text-ink-100', esc(c.title)));
    
    const badgeWrap = el('div', 'flex items-center gap-1.5 shrink-0');
    const badge = el('span', 'text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ' + signalClass(c.signal));
    badge.textContent = (c.signal || 'skip').toUpperCase();
    badgeWrap.appendChild(badge);
    top.appendChild(badgeWrap);
    art.appendChild(top);

    // Signal why
    if (c.signal_why) {
      art.appendChild(el('p', 'mt-2 text-xs text-accent-soft leading-relaxed',
        '<span class="text-ink-400 font-medium">建议理由 · </span>' + esc(c.signal_why)));
    }

    // Three user-facing primaries: problem / why seam / monetize
    const problem = c.problem || c.pain || '';
    const whySeam = c.why_seam || c.mismatch || '';
    const monetize = c.how_to_monetize || c.monetize || '';
    const triad = el('div', 'mt-3 grid grid-cols-1 gap-2');
    triad.innerHTML =
      '<div class="p-3 rounded-xl bg-ink-900/90 border border-ink-700/70">' +
        '<div class="text-[11px] uppercase tracking-wider text-mint font-mono font-semibold mb-1">解决什么问题</div>' +
        '<p class="text-sm text-ink-200 leading-relaxed">' + esc(problem || '（待补）') + '</p></div>' +
      '<div class="p-3 rounded-xl bg-ink-900/90 border border-accent/30">' +
        '<div class="text-[11px] uppercase tracking-wider text-accent font-mono font-semibold mb-1 flex items-center gap-1">' +
        '<span>⚡</span><span>为什么是机会缝隙</span></div>' +
        '<p class="text-sm text-ink-200 leading-relaxed">' + esc(whySeam || '（待补）') + '</p></div>' +
      '<div class="p-3 rounded-xl bg-ink-900/90 border border-mint/25">' +
        '<div class="text-[11px] uppercase tracking-wider text-mint font-mono font-semibold mb-1">怎么赚钱</div>' +
        '<p class="text-sm text-ink-200 leading-relaxed">' + esc(monetize || '（待补）') + '</p></div>';
    art.appendChild(triad);

    // Keep mismatch only if distinct from why_seam
    if (c.mismatch && c.why_seam && c.mismatch !== c.why_seam) {
      art.appendChild(el('div', 'mt-2 p-2.5 rounded-xl bg-ink-900/60 border border-ink-700/50',
        '<div class="text-[11px] uppercase tracking-wider text-ink-400 font-mono mb-1">错配补充</div>' +
        '<p class="text-xs text-ink-300 leading-relaxed">' + esc(c.mismatch) + '</p>'));
    }

    // Meta bar: zone, relevance, clean_entry teaser
    const meta = el('div', 'mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-400');
    let metaHtml = '<div><span class="text-ink-400">分区:</span> ' + zoneBadge(c.zone) + '</div>' +
      '<div><span class="text-ink-400">相关度:</span> <span class="font-mono text-accent-soft font-semibold">' + esc(c.relevance || '—') + '/5</span></div>';
    if (c.actions_48h && c.actions_48h.length) {
      metaHtml += '<div class="text-ink-300"><span class="text-ink-400">48h首动:</span> ' + esc(c.actions_48h[0]) + '</div>';
    }
    meta.innerHTML = metaHtml;
    art.appendChild(meta);

    // Expandable Details
    const detail = el('div', open ? 'mt-4 pt-3 border-t border-ink-700/60' : 'hidden');
    detail.id = 'd-' + id;
    let html = '';

    // 为何可能合法 & 监管风险
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">' +
      '<div class="p-2.5 rounded-xl bg-ink-800/60 border border-ink-700/50">' +
        '<div class="text-[11px] font-semibold text-mint uppercase tracking-wider font-mono mb-1">为何可能合法</div>' +
        '<p class="text-ink-200 leading-relaxed">' + esc(c.why_legal) + '</p>' +
      '</div>' +
      '<div class="p-2.5 rounded-xl bg-ink-800/60 border border-ink-700/50">' +
        '<div class="text-[11px] font-semibold text-danger uppercase tracking-wider font-mono mb-1">监管风险</div>' +
        '<p class="text-ink-200 leading-relaxed">' + esc(c.regulatory_risk) + '</p>' +
      '</div>' +
    '</div>';

    // 谁赢谁亏
    html += winnersLosersBlock(c.winners_losers);

    // 48h 动作
    html += listBlock('48h 动作清单', c.actions_48h, 'text-ink-100');

    // 禁止项
    html += listBlock('禁止项 (Don\'ts)', c.donts, 'text-danger');

    // 干净进场
    if (c.clean_entry) {
      html += '<div class="mt-3.5"><p class="text-[11px] uppercase tracking-wider text-ink-400 font-mono mb-1">干净进场路径</p>' +
        '<p class="text-xs text-mint leading-relaxed">' + esc(c.clean_entry) + '</p></div>';
    }

    // 三栏规则划分
    html += columnsBlock(c.columns);

    // 公开源
    html += urlsBlock(c.urls);

    detail.innerHTML = html;
    art.appendChild(detail);

    // Toggle button
    const tog = el('button', 'mt-3.5 inline-flex items-center text-xs font-semibold text-accent-soft hover:text-accent transition py-1');
    tog.type = 'button';
    tog.textContent = open ? '收起完整字段 ▲' : '展开：合法 / 风险 / 48h动作 / 禁止项 / 三栏 ▼';
    tog.onclick = () => {
      if (openIds.has(id)) openIds.delete(id);
      else openIds.add(id);
      renderCards();
    };
    art.appendChild(tog);

    return art;
  }

  function eventNode(ev) {
    const div = el('div', 'p-4 rounded-2xl bg-ink-900/90 border border-ink-700/70 flex flex-col justify-between');

    const top = el('div', 'flex items-start justify-between gap-2');
    const title = el('h4', 'text-sm font-semibold text-ink-100 leading-snug', esc(ev.title));
    top.appendChild(title);

    const badges = el('div', 'flex items-center gap-1 shrink-0');
    const catBadge = el('span', 'text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700');
    catBadge.textContent = ev.category || 'tech';
    badges.appendChild(catBadge);

    const stBadge = el('span', 'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ' + statusClass(ev.status));
    stBadge.textContent = (ev.status || 'open').toUpperCase();
    badges.appendChild(stBadge);
    top.appendChild(badges);
    div.appendChild(top);

    const meta = el('div', 'mt-2 space-y-1 text-xs text-ink-400');
    meta.innerHTML = '<div class="flex items-center gap-1.5"><span class="text-ink-400">时间:</span> <span class="text-ink-200 font-mono">' + esc(ev.when) + '</span></div>' +
      '<div class="flex items-center gap-1.5"><span class="text-ink-400">地点:</span> <span class="text-ink-200">' + esc(ev.where) + '</span></div>';
    div.appendChild(meta);

    if (ev.why_relevant) {
      div.appendChild(el('p', 'mt-2.5 text-xs text-ink-300 leading-relaxed bg-ink-800/50 p-2 rounded-lg border border-ink-700/40',
        '<span class="text-accent-soft font-medium">看点 · </span>' + esc(ev.why_relevant)));
    }

    const foot = el('div', 'mt-3 pt-2.5 border-t border-ink-800/80 flex items-center justify-between text-xs');
    const sigBadge = el('span', 'text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ' + signalClass(ev.signal));
    sigBadge.textContent = 'SIGNAL: ' + (ev.signal || 'go').toUpperCase();
    foot.appendChild(sigBadge);

    if (ev.url) {
      const link = el('a', 'text-xs text-mint hover:underline font-mono inline-flex items-center gap-1');
      link.href = ev.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.innerHTML = '<span>报名/活动页</span> ↗';
      foot.appendChild(link);
    }
    div.appendChild(foot);

    return div;
  }

  function renderCards() {
    const list = document.getElementById('list');
    list.innerHTML = '';
    const cards = (data.cards || []).filter(cardMatches);
    if (!cards.length) {
      list.appendChild(el('p', 'text-sm text-ink-400 py-6 text-center', '当前筛选下无匹配机会卡片。'));
    } else {
      cards.forEach((c, i) => list.appendChild(cardNode(c, i)));
    }
  }

  function renderEvents() {
    const elist = document.getElementById('events-list');
    if (!elist) return;
    elist.innerHTML = '';
    const events = (data.events || []).filter(eventMatches);
    if (!events.length) {
      elist.appendChild(el('p', 'col-span-full text-sm text-ink-400 py-6 text-center', '当前筛选下无匹配活动。'));
    } else {
      events.forEach((ev) => elist.appendChild(eventNode(ev)));
    }
    const epill = document.getElementById('events-count-pill');
    if (epill) epill.textContent = (data.events || []).length + ' 活动';
  }

  function renderFootnotes() {
    const wrap = document.getElementById('footnotes');
    const flist = document.getElementById('footnotes-list');
    if (!wrap || !flist) return;
    const fnotes = data.footnotes || [];
    if (!fnotes.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    flist.innerHTML = '';
    fnotes.forEach((fn) => {
      const item = el('div', 'p-2.5 rounded-xl border border-danger/30 bg-danger/5 text-xs text-ink-300');
      let h = '<p class="font-semibold text-danger mb-0.5">' + esc(fn.hook || '合规提示') + '</p>' +
        '<p class="text-ink-400 leading-relaxed">' + esc(fn.note || '') + '</p>';
      if (fn.clean_alt) {
        h += '<p class="mt-1 text-mint leading-relaxed"><span class="text-ink-400">干净替代:</span> ' + esc(fn.clean_alt) + '</p>';
      }
      item.innerHTML = h;
      flist.appendChild(item);
    });
  }

  function render() {
    const m = data.meta || {};
    const metaEl = document.getElementById('meta');
    if (metaEl) {
      metaEl.textContent = (m.date || '') +
        (m.note ? ' · ' + m.note : '') +
        (m.digger ? ' · 挖掘: ' + m.digger : '') +
        (m.filter ? ' · 终审: ' + m.filter : '');
    }
    const how = document.getElementById('how-to-read');
    if (how) how.textContent = m.how_to_read || '';

    const countPill = document.getElementById('count-pill');
    if (countPill) countPill.textContent = (data.cards || []).length + ' 机会';

    renderCardFilters();
    renderCards();
    renderFootnotes();

    renderEventFilters();
    renderEvents();
  }

  fetch('./seams.json?t=' + Date.now())
    .then((r) => r.json())
    .then((j) => {
      data = j;
      render();
    })
    .catch((err) => {
      console.error(err);
      const metaEl = document.getElementById('meta');
      if (metaEl) metaEl.textContent = 'seams.json 加载失败';
    });
})();
