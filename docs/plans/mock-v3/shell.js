// The app shell every screen shares. `page` = which nav item is on; `title`/`sub` = header.
function shell({ page, title, sub, body, right = '' }) {
  const nav = [
    ['create','plus','Tạo video'],['pipeline','rss','Nguồn tự động'],['channels','tv','Kênh'],
    ['kits','palette','Bộ nhận diện'],['library','library','Thư viện','19'],['assets','folder','Kho tài nguyên'],
    ['guide','book','Hướng dẫn'],['settings','settings','Cài đặt'],
  ].map(([id,ic,l,c]) => `<a class="${id===page?'on':''}"><svg><use href="#${ic}"/></svg>${l}${c?`<span class="count num">${c}</span>`:''}</a>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div class="app">
  <aside class="side">
    <div class="lockup"><img src="img/wordmark.png" alt="DESOUL"><div class="sub">STUDIO</div></div>
    <a class="cta"><svg><use href="#plus"/></svg>Tạo video mới</a>
    <nav class="nav">${nav}</nav>
    <div class="tip"><b><svg style="width:14px;height:14px"><use href="#send"/></svg>Nhận video qua Telegram</b><p>Video render xong tự về chat của bạn, kèm cảnh báo khi lỗi.</p><a class="btn primary sm" style="width:100%">Kết nối ngay</a></div>
  </aside>
  <div class="main">
    <header class="top"><div><div class="title">${title}</div>${sub?`<div class="subtitle">${sub}</div>`:''}</div>
      <div class="right">${right}<span class="pill"><svg style="width:13px;height:13px"><use href="#dollar"/></svg>Tháng này <span class="num">$1.84</span></span>
      <span class="bell"><svg style="width:16px;height:16px"><use href="#bell"/></svg><i>1</i></span>
      <span class="user"><span class="avatar">B</span><span><div class="n">Chủ kênh</div><div class="e">3 kênh · owner</div></span></span></div>
    </header>
    <div class="content">${body}</div>
  </div></div>`);
}
