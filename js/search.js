// Journal search: filters the post list by title, excerpt and date.
// Every word must match (case- and accent-insensitive). ?q= in the URL is kept in sync.
(function () {
  const list = document.querySelector('.post-list');
  if (!list) return;
  const items = Array.from(list.children);
  const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const text = items.map(li => fold(li.textContent.replace(/\s+/g, ' ')));

  const box = document.createElement('div');
  box.className = 'post-search';
  box.innerHTML = '<input type="search" placeholder="Search ' + items.length +
    ' posts (press /)" aria-label="Search posts" autocomplete="off" spellcheck="false">' +
    '<span class="post-search-count" aria-live="polite"></span>';
  list.before(box);
  const input = box.querySelector('input');
  const count = box.querySelector('.post-search-count');
  const none = document.createElement('p');
  none.className = 'post-search-none';
  none.hidden = true;
  list.after(none);

  function run() {
    const q = input.value.trim();
    const words = fold(q).split(/\s+/).filter(Boolean);
    let shown = 0;
    items.forEach((li, i) => {
      const hit = words.every(w => text[i].includes(w));
      li.hidden = !hit;
      if (hit) shown++;
    });
    count.textContent = words.length ? shown + ' of ' + items.length : '';
    none.hidden = shown > 0;
    none.textContent = shown ? '' : 'No posts match “' + q + '”.';
    const url = new URL(location.href);
    if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }

  input.value = new URLSearchParams(location.search).get('q') || '';
  input.addEventListener('input', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; run(); input.blur(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== input &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });
  if (input.value) run();
})();
