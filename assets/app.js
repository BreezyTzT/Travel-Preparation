/* ══════════════════════════════════════════
   三亚旅行计划 · 渲染与交互
   数据源：#travel-data（由 travel-data.json 同步）
   ══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── 数据 ─── */
  var DATA;
  try {
    DATA = JSON.parse(document.getElementById('travel-data').textContent);
  } catch (e) {
    document.body.innerHTML = '<p style="padding:40px 20px;text-align:center;color:#8798a0">' +
      '旅行数据加载失败，请重新打开页面</p>';
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var EV_ICON = {
    flight: '✈️', transfer: '🚕', hotel: '🏨',
    activity: '📍', meal: '🍽', free: '☀️'
  };

  /* ─── 工具 ─── */

  // "2026-09-22" + "21:30" → 本地 Date（避免 iOS 对连字符格式的解析差异）
  function toDate(dateStr, timeStr) {
    if (!dateStr) return null;
    var d = dateStr.split('-').map(Number);
    var t = (timeStr || '00:00').split(':').map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function diffDays(from, to) {
    return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
  }

  function md(dateStr) { // "2026-09-22" → "09-22"
    return dateStr.split('-').slice(1).join('-');
  }

  function dotted(dateStr) { // → "2026.09.22"
    return dateStr.replace(/-/g, '.');
  }

  function money(n) {
    return '¥' + Number(n).toLocaleString('zh-CN');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loc(ref) {
    return (ref && DATA.locations && DATA.locations[ref]) || null;
  }

  // 高德地图关键词检索（坐标为约值，故用关键词而非打点）
  function mapUrl(l) {
    if (!l || !l.map_keyword) return null;
    return 'https://uri.amap.com/search?keyword=' + encodeURIComponent(l.map_keyword) +
           (l.city ? '&city=' + encodeURIComponent(l.city) : '');
  }

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 1900);
  }

  function copyText(text) {
    var ok = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length); // iOS 需要
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { ok = false; }

    if (ok) { toast('地址已复制'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        function () { toast('地址已复制'); },
        function () { toast('复制失败，请长按文字手动复制'); }
      );
    } else {
      toast('复制失败，请长按文字手动复制');
    }
  }

  /* ═══════════ S0 Hero ═══════════ */

  function renderHero() {
    var t = DATA.trip;

    $('heroDest').textContent = [t.country, t.province, t.destination_cities.join('/')]
      .filter(Boolean).join(' · ');
    $('heroTitle').textContent = t.title;
    $('heroSubtitle').textContent = t.subtitle || '';

    var s = toDate(t.start_date), e = toDate(t.end_date);
    var wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    $('heroDates').textContent = dotted(t.start_date) + ' – ' + md(t.end_date) +
      ' · ' + wd[s.getDay()] + '至' + wd[e.getDay()];

    $('heroAreas').innerHTML = (t.destination_areas || [])
      .map(function (a) { return '<span class="area-chip">' + esc(a) + '</span>'; }).join('');

    var badges = [
      t.duration_days + ' 天',
      t.hotel_nights + ' 晚住宿',
      DATA.flights.length + ' 段航班',
      (DATA.travelers && DATA.travelers.count ? DATA.travelers.count + ' 人' : null)
    ].filter(Boolean);

    $('heroBadges').innerHTML = badges
      .map(function (b) { return '<span class="badge-stat">' + esc(b) + '</span>'; }).join('');
  }

  // Hero 倒计时：按天，随旅程阶段切换文案
  function tickHero() {
    var t = DATA.trip;
    var now = new Date();
    var start = toDate(t.start_date), end = toDate(t.end_date);
    var toStart = diffDays(now, start);
    var box = $('heroCountdown');

    box.classList.remove('is-live');

    if (toStart > 0) {
      $('cdNum').textContent = 'D-' + toStart;
      $('cdLabel').textContent = '距出发还有 ' + toStart + ' 天';
    } else if (toStart === 0) {
      $('cdNum').textContent = '今天出发';
      $('cdLabel').textContent = '✈️ 一路顺风';
      box.classList.add('is-live');
    } else if (diffDays(now, end) >= 0) {
      var nth = diffDays(start, now) + 1;
      $('cdNum').textContent = '第 ' + nth + ' / ' + t.duration_days + ' 天';
      $('cdLabel').textContent = '旅程进行中';
      box.classList.add('is-live');
    } else {
      $('cdNum').textContent = '已结束';
      $('cdLabel').textContent = '旅程已结束，期待下一次';
    }
  }

  /* ═══════════ S1 航班轮播 ═══════════ */

  function flightCard(f) {
    var dl = loc(f.depart_location_ref), al = loc(f.arrive_location_ref);
    var isPast = new Date() > toDate(f.depart_date, f.depart_time);
    var wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var dd = toDate(f.depart_date);

    var perks = (f.included_services || [])
      .map(function (p) { return '<span class="perk">' + esc(p) + '</span>'; }).join('');

    return '' +
    '<article class="fcard' + (isPast ? ' is-past' : '') + '" data-flight="' + esc(f.id) + '">' +
      '<div class="fcard__top">' +
        '<span class="fcard__dir">' + esc(f.direction) + '</span>' +
        '<span class="fcard__status' + (isPast ? ' is-done' : '') + '">' +
          (isPast ? '已完成' : esc(f.status)) +
        '</span>' +
      '</div>' +

      '<div class="fcard__airline">' +
        '<span>' + esc(f.airline) + '</span>' +
        '<span class="fcard__no">' + esc(f.flight_no) + '</span>' +
      '</div>' +

      '<div class="fcard__route">' +
        '<div class="rt rt--from">' +
          '<div class="rt__time">' + esc(f.depart_time) + '</div>' +
          '<div class="rt__code">' + esc(f.depart_code || '') + '</div>' +
          '<div class="rt__place">' + esc(dl ? dl.short_name : f.from_city) + '</div>' +
          (f.depart_terminal ? '<div class="rt__terminal">' + esc(f.depart_terminal) + ' 航站楼</div>' : '') +
        '</div>' +

        '<div class="rt__mid">' +
          '<span class="rt__dur">' + esc(f.duration) + '</span>' +
          '<span class="rt__line"></span>' +
        '</div>' +

        '<div class="rt rt--to">' +
          '<div class="rt__time">' + esc(f.arrive_time) +
            (f.overnight ? '<span class="rt__plus1">+1</span>' : '') +
          '</div>' +
          '<div class="rt__code">' + esc(f.arrive_code || '') + '</div>' +
          '<div class="rt__place">' + esc(al ? al.short_name : f.to_city) + '</div>' +
          (al && al.confirmed === false ? '<div class="rt__terminal">机场待确认</div>' : '') +
        '</div>' +
      '</div>' +

      '<div class="fcard__date">' + esc(md(f.depart_date)) + ' ' + wd[dd.getDay()] +
        (f.overnight ? ' · 次日凌晨抵达' : '') +
      '</div>' +

      '<div class="fcard__perf"></div>' +

      '<div class="fcard__cd" data-cd="' + esc(f.depart_date) + 'T' + esc(f.depart_time) + '">' +
        '<span>⏱</span><span class="fcard__cdtext">—</span>' +
      '</div>' +

      '<div class="fcard__foot">' +
        '<span class="fcard__price">' + money(f.price) + '</span>' +
        '<span class="fcard__perks">' + perks + '</span>' +
      '</div>' +
    '</article>';
  }

  function renderFlights() {
    var wrap = $('flightCarousel');
    wrap.innerHTML = DATA.flights.map(flightCard).join('');

    $('flightDots').innerHTML = DATA.flights
      .map(function (_, i) { return '<span class="dot' + (i === 0 ? ' is-active' : '') + '"></span>'; })
      .join('');

    // 滑动时同步页码点
    var dots = $('flightDots').children;
    var raf;
    wrap.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var cards = wrap.children;
        if (!cards.length) return;
        var center = wrap.scrollLeft + wrap.clientWidth / 2;
        var best = 0, bestDist = Infinity;
        for (var i = 0; i < cards.length; i++) {
          var c = cards[i];
          var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        for (var j = 0; j < dots.length; j++) {
          dots[j].classList.toggle('is-active', j === best);
        }
      });
    }, { passive: true });

    // 默认定位到「下一趟即将起飞」的航班
    var now = new Date();
    var idx = DATA.flights.findIndex(function (f) {
      return toDate(f.depart_date, f.depart_time) > now;
    });
    if (idx > 0) {
      var target = wrap.children[idx];
      wrap.scrollLeft = target.offsetLeft - (wrap.clientWidth - target.offsetWidth) / 2;
    }
  }

  // 航班倒计时：到秒，24h 内变警示色，起飞后转「已起飞」
  function tickFlights() {
    var now = Date.now();
    var nodes = document.querySelectorAll('[data-cd]');

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var raw = node.getAttribute('data-cd').split('T');
      var ms = toDate(raw[0], raw[1]).getTime() - now;
      var text = node.querySelector('.fcard__cdtext');

      node.classList.remove('is-soon', 'is-done');

      if (ms <= 0) {
        node.classList.add('is-done');
        text.textContent = '已起飞';
        continue;
      }

      var sec = Math.floor(ms / 1000);
      var d = Math.floor(sec / 86400);
      var h = Math.floor(sec % 86400 / 3600);
      var m = Math.floor(sec % 3600 / 60);
      var s = sec % 60;
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

      if (d > 0) {
        text.textContent = '距起飞 ' + d + ' 天 ' + pad(h) + ':' + pad(m) + ':' + pad(s);
      } else {
        node.classList.add('is-soon');
        text.textContent = '即将起飞 · ' + pad(h) + ':' + pad(m) + ':' + pad(s);
      }
    }
  }

  /* ═══════════ S2 每日行程 ═══════════ */

  function hotelById(id) {
    return DATA.hotels.filter(function (h) { return h.id === id; })[0] || null;
  }

  // 单条事件
  function eventRow(ev) {
    var l = loc(ev.location_ref);
    var url = mapUrl(l);
    var actions = '';

    if (l && l.address) {
      actions = '<div class="ev__actions">' +
        (url ? '<a class="btn-mini btn-mini--primary" href="' + esc(url) +
               '" target="_blank" rel="noopener">导航</a>' : '') +
        '<button class="btn-mini" data-copy="' + esc(l.name + ' ' + l.address) + '">复制地址</button>' +
      '</div>';
    }

    return '' +
    '<div class="ev">' +
      '<div class="ev__time' + (ev.time ? '' : ' ev__time--tbd') + '">' +
        (ev.time ? esc(ev.time) : '待定') +
      '</div>' +
      '<div class="ev__ico">' + (EV_ICON[ev.type] || '📍') + '</div>' +
      '<div class="ev__body">' +
        '<div class="ev__title">' + esc(ev.title) + '</div>' +
        (l ? '<div class="ev__loc">' + esc(l.name) +
             (l.address ? ' · ' + esc(l.address) : '') + '</div>' : '') +
        (ev.note ? '<div class="ev__note">' + esc(ev.note) +
                   (ev.confirmed === false ? '（待确认）' : '') + '</div>' : '') +
        actions +
      '</div>' +
    '</div>';
  }

  function dayDetail(day) {
    var html = '';

    // 当天住宿条
    if (day.accommodation) {
      var h = hotelById(day.accommodation_ref);
      html += '<div class="staybar">🛏 今晚住 <strong>' + esc(day.accommodation) + '</strong>' +
              (h ? ' · ' + esc(h.room_type.split('（')[0]) : '') + '</div>';
    } else {
      html += '<div class="staybar staybar--none">🛏 ' +
              esc(day.accommodation_note || '当天无住宿') + '</div>';
    }

    // 已确定事件 + activities，按时间排序；无时间的归到「待定」组
    var all = (day.events || []).concat(day.activities || []);
    var timed = all.filter(function (e) { return !!e.time; })
                   .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    var untimed = all.filter(function (e) { return !e.time; });

    if (timed.length) {
      html += '<div class="events">' + timed.map(eventRow).join('') + '</div>';
    }

    if (untimed.length) {
      html += '<div class="grouplabel">时间待定 / 全天</div>' +
              '<div class="events">' + untimed.map(eventRow).join('') + '</div>';
    }

    // 占位：activities 尚未填写
    if (!(day.activities || []).length) {
      html += '<div class="tbd">' +
        '<div class="tbd__title">🗓 当天行程待定</div>' +
        '<div class="tbd__sub">' +
          (all.length ? '除以上已定事项外，具体玩法出发前补充' : '出发前补充具体安排') +
        '</div>' +
      '</div>';
    }

    return html;
  }

  function dayCard(day, state) {
    var tags = (day.tags || []).slice();
    var tagHtml = '';

    if (state === 'today') tagHtml += '<span class="tag tag--today">今天</span>';
    tagHtml += tags.map(function (t) {
      var cls = t === '换住宿' ? 'tag tag--switch' : 'tag';
      return '<span class="' + cls + '">' + esc(t) + '</span>';
    }).join('');

    // 摘要 chips：航班 / 住宿 / 安排数
    var chips = [];
    var flightEv = (day.events || []).filter(function (e) { return e.type === 'flight'; });
    if (flightEv.length) {
      var fe = flightEv[0];
      var no = (fe.title.match(/[A-Z0-9]{2}\d{3,4}/) || [''])[0];
      chips.push('<span class="chip"><span class="chip__ico">✈️</span>' +
        esc((fe.time ? fe.time + ' ' : '') + (no || '航班')) + '</span>');
    }

    if (day.accommodation) {
      var short = loc(hotelById(day.accommodation_ref) &&
                      hotelById(day.accommodation_ref).location_ref);
      chips.push('<span class="chip"><span class="chip__ico">🏨</span>' +
        esc(short ? short.short_name : day.accommodation) + '</span>');
    } else {
      chips.push('<span class="chip chip--muted"><span class="chip__ico">🛏</span>无住宿</span>');
    }

    var actCount = (day.activities || []).length;
    chips.push('<span class="chip' + (actCount ? '' : ' chip--muted') + '">' +
      '<span class="chip__ico">📍</span>' +
      (actCount ? actCount + ' 项安排' : '行程待定') + '</span>');

    var cls = 'day' + (state === 'today' ? ' is-today' : state === 'past' ? ' is-past' : '');

    return '' +
    '<section class="' + cls + '" data-day="' + day.day + '">' +
      '<div class="day__card">' +
        '<div class="day__head" role="button" tabindex="0" aria-expanded="false">' +
          '<div class="day__main">' +
            '<div class="day__meta">' +
              '<span class="day__no">DAY ' + day.day + '</span>' +
              '<span class="day__date">' + esc(md(day.date)) + ' ' + esc(day.weekday) + '</span>' +
              tagHtml +
            '</div>' +
            '<h3 class="day__route">' + esc(day.location_label) + '</h3>' +
            '<div class="day__chips">' + chips.join('') + '</div>' +
          '</div>' +
          '<div class="day__arrow" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="day__detail"><div class="day__inner">' +
          dayDetail(day) +
        '</div></div>' +
      '</div>' +
    '</section>';
  }

  function renderDays() {
    var today = startOfDay(new Date()).getTime();

    $('dayTimeline').innerHTML = DATA.itinerary.map(function (day) {
      var d = toDate(day.date).getTime();
      var state = d === today ? 'today' : d < today ? 'past' : 'future';
      return dayCard(day, state);
    }).join('');

    // 展开/收起：高度显式过渡，结束后置为 auto，保证内容变化后不被裁切
    function collapse(day) {
      var box = day.querySelector('.day__detail');
      box.style.height = box.scrollHeight + 'px';
      requestAnimationFrame(function () { box.style.height = '0px'; });
      day.classList.remove('is-open');
      day.querySelector('.day__head').setAttribute('aria-expanded', 'false');
    }

    function expand(day) {
      var box = day.querySelector('.day__detail');
      var inner = box.querySelector('.day__inner');
      box.style.height = inner.offsetHeight + 'px';
      day.classList.add('is-open');
      day.querySelector('.day__head').setAttribute('aria-expanded', 'true');

      var done = function (e) {
        if (e && e.propertyName !== 'height') return;
        if (day.classList.contains('is-open')) box.style.height = 'auto';
        box.removeEventListener('transitionend', done);
      };
      box.addEventListener('transitionend', done);
      setTimeout(done, 400); // transition 未触发时的兜底
    }

    // 手风琴：互斥展开，展开后滚动到卡片顶部
    $('dayTimeline').addEventListener('click', function (e) {
      var head = e.target.closest ? e.target.closest('.day__head') : null;
      if (!head) return;
      if (e.target.closest('.btn-mini') || e.target.closest('a')) return;

      var day = head.closest('.day');
      var willOpen = !day.classList.contains('is-open');

      var opened = $('dayTimeline').querySelectorAll('.day.is-open');
      for (var i = 0; i < opened.length; i++) collapse(opened[i]);

      if (willOpen) {
        expand(day);
        setTimeout(function () {
          var navH = $('navbar').offsetHeight;
          var y = day.getBoundingClientRect().top + window.pageYOffset - navH - 8;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }, 130);
      }
    });

    // 键盘可达
    $('dayTimeline').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('day__head')) {
        e.preventDefault();
        e.target.click();
      }
    });

    // 默认展开：旅途中展开今天，否则展开 DAY 1
    var target = document.querySelector('.day.is-today') || document.querySelector('.day');
    if (target) {
      var box = target.querySelector('.day__detail');
      box.style.height = 'auto';
      target.classList.add('is-open');
      target.querySelector('.day__head').setAttribute('aria-expanded', 'true');
    }
  }

  /* ═══════════ S3 住宿 ═══════════ */

  function renderHotels() {
    var nights = DATA.hotels.reduce(function (s, h) { return s + h.nights; }, 0);
    $('hotelNightsHint').textContent = DATA.hotels.length + ' 家 · 共 ' + nights + ' 晚';

    $('hotelList').innerHTML = DATA.hotels.map(function (h) {
      var l = loc(h.location_ref);
      var url = mapUrl(l);
      var payCls = h.payment_alert ? 'pay pay--alert' : 'pay pay--paid';

      return '' +
      '<article class="card hotel">' +
        '<div class="hotel__top">' +
          '<h3 class="hotel__name">' + esc(h.name) + '</h3>' +
          '<span class="hotel__area">' + esc(h.area) + '</span>' +
        '</div>' +

        '<div class="hotel__dates">' +
          '<span>' + esc(md(h.check_in)) + ' → ' + esc(md(h.check_out)) + '</span>' +
          '<span class="hotel__nights">' + h.nights + ' 晚 · ' + h.rooms + ' 间</span>' +
          (h.covers_days ? '<span class="hotel__covers">DAY ' +
            h.covers_days.join('–') + '</span>' : '') +
        '</div>' +

        '<div class="kv"><span class="kv__k">房型</span>' +
          '<span class="kv__v">' + esc(h.room_type) + '</span></div>' +
        '<div class="kv"><span class="kv__k">地址</span>' +
          '<span class="kv__v">' + esc(h.address) + '</span></div>' +
        '<div class="kv"><span class="kv__k">状态</span>' +
          '<span class="kv__v">' + esc(h.status) + '</span></div>' +

        '<div class="' + payCls + '">' +
          (h.payment_alert ? '💰 ' : '✓ ') + esc(h.payment) + ' ' + money(h.price) +
        '</div>' +

        (h.payment_confirmed === false && h.payment_note ?
          '<p class="pay__note">⚠️ 金额待核对：' + esc(h.payment_note) + '</p>' : '') +

        '<div class="hotel__actions">' +
          (url ? '<a class="btn-mini btn-mini--primary" href="' + esc(url) +
                 '" target="_blank" rel="noopener">导航</a>' : '') +
          '<button class="btn-mini" data-copy="' + esc(h.name + ' ' + h.address) + '">复制地址</button>' +
          (h.phone ? '<a class="btn-mini" href="tel:' + esc(h.phone) + '">打电话</a>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ═══════════ S4 交通 ═══════════ */

  function renderTransport() {
    var list = (DATA.transport && DATA.transport.local_transport) || [];
    var extra = []
      .concat(DATA.transport.car_rental || [])
      .concat(DATA.transport.trains || []);

    if (!list.length && !extra.length) {
      $('sec-transport').style.display = 'none';
      var nav = document.querySelector('[data-target="sec-transport"]');
      if (nav) nav.style.display = 'none';
      return;
    }

    $('transportList').innerHTML = list.map(function (t) {
      var l = loc(t.to_location_ref);
      var url = mapUrl(l);

      return '' +
      '<article class="card tp">' +
        '<div class="tp__head">' +
          '<span class="tp__type">' + esc(t.type) + '</span>' +
          '<span class="tp__date">' + esc(md(t.date)) + '</span>' +
          (t.confirmed === false ? '<span class="pill-tbd">待确认</span>' : '') +
        '</div>' +
        '<div class="tp__route">' + esc(t.from) +
          '<span class="tp__arrow">→</span>' + esc(t.to) + '</div>' +
        '<div class="tp__facts">' +
          (t.distance ? '<span>📏 ' + esc(t.distance) + '</span>' : '') +
          (t.eta ? '<span>⏱ ' + esc(t.eta) + '</span>' : '') +
        '</div>' +
        (t.note ? '<div class="tp__note">' + esc(t.note) + '</div>' : '') +
        (url ? '<div class="hotel__actions">' +
          '<a class="btn-mini btn-mini--primary" href="' + esc(url) +
          '" target="_blank" rel="noopener">导航到终点</a></div>' : '') +
      '</article>';
    }).join('');
  }

  /* ═══════════ S5 提醒 / 费用 / 清单 ═══════════ */

  function renderReminders() {
    $('reminderList').innerHTML = (DATA.reminders || []).map(function (r) {
      return '' +
      '<article class="card tip tip--' + esc(r.level || 'normal') + '">' +
        '<span class="tip__ico">' + esc(r.icon || '•') + '</span>' +
        '<div>' +
          '<h3 class="tip__title">' + esc(r.title) + '</h3>' +
          '<p class="tip__detail">' + esc(r.detail) + '</p>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderCost() {
    var t = DATA.trip;
    var b = t.known_cost_breakdown || {};
    var people = (DATA.travelers && DATA.travelers.count) || null;

    var rows =
      '<div class="cost__row"><span>机票（2 段）</span><span>' + money(b.flights) + '</span></div>' +
      '<div class="cost__row"><span>住宿（4 晚）</span><span>' + money(b.hotels) + '</span></div>';

    // 只对住宿算人均：机票是否单人价未确认，算总人均会给出错误数字
    if (people && b.hotels) {
      rows += '<div class="cost__row"><span>住宿人均（' + people + ' 人）</span><span>' +
              money(Math.round(b.hotels / people)) + '</span></div>';
    }

    $('costCard').innerHTML = '' +
      '<div class="cost__total">' +
        '<span class="cost__label">已知总额</span>' +
        '<span class="cost__num">' + money(t.known_cost_total) + '</span>' +
      '</div>' +
      '<div class="cost__rows">' + rows + '</div>' +
      (t.cost_note ? '<p class="cost__note">' + esc(t.cost_note) + '</p>' : '');
  }

  function renderPacking() {
    var KEY = 'sanya-packing-v1';
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { saved = {}; }

    $('packingList').innerHTML = (DATA.packing_list || []).map(function (item, i) {
      var on = !!saved[i];
      return '<li class="pk' + (on ? ' is-on' : '') + '" data-pk="' + i + '">' +
        '<span class="pk__box"></span><span class="pk__text">' + esc(item) + '</span></li>';
    }).join('');

    $('packingList').addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('.pk') : null;
      if (!li) return;
      li.classList.toggle('is-on');
      saved[li.getAttribute('data-pk')] = li.classList.contains('is-on');
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (err) {}
    });
  }

  function renderFooter() {
    var n = (DATA.travelers && DATA.travelers.count) || null;
    $('footerMeta').textContent = '最后更新：' + DATA.meta.generated_at +
      (n ? ' · ' + n + ' 人同行' : '') + ' · v' + DATA.meta.version;
  }

  /* ═══════════ 导航 scroll-spy ═══════════ */

  function initNav() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.navbar__item'));

    items.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var sec = $(item.getAttribute('data-target'));
        if (!sec) return;
        var y = sec.getBoundingClientRect().top + window.pageYOffset - $('navbar').offsetHeight;
        window.scrollTo({ top: y, behavior: 'smooth' });
      });
    });

    var sections = items
      .map(function (i) { return $(i.getAttribute('data-target')); })
      .filter(Boolean);

    var ticking = false;
    function spy() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var line = window.pageYOffset + $('navbar').offsetHeight + 40;
        var active = 0;
        sections.forEach(function (s, i) {
          if (s.offsetTop <= line) active = i;
        });
        items.forEach(function (it, i) {
          it.classList.toggle('is-active', i === active);
        });
      });
    }

    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }

  /* ═══════════ 全局：复制地址 ═══════════ */

  function initCopy() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-copy]') : null;
      if (!btn) return;
      e.preventDefault();
      copyText(btn.getAttribute('data-copy'));
    });
  }

  /* ═══════════ 启动 ═══════════ */

  renderHero();
  renderFlights();
  renderDays();
  renderHotels();
  renderTransport();
  renderReminders();
  renderCost();
  renderPacking();
  renderFooter();
  initNav();
  initCopy();

  tickHero();
  tickFlights();
  setInterval(tickFlights, 1000);
  setInterval(tickHero, 60000);

  // 从后台切回时立即校正倒计时
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tickHero(); tickFlights(); }
  });
})();
