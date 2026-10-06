'use strict';

// ===== 分類 =====
const CATEGORIES = {
  expense: ['食費', '日用品', '交通費', '娯楽', '交際費', '衣服・美容', 'サブスク', '通信費', '住居・光熱費', '税金・社会保険', '医療', 'その他'],
  income: ['生活費（事業から）', 'その他の収入'],
};
const ADJUST_CATEGORY = '調整';

// ===== データ（端末内の localStorage のみに保存） =====
// records: { id, type: 'expense'|'income'|'adjust', date: 'YYYY-MM-DD', amount, category, memo, createdAt }
// amount は expense / income では正の整数、adjust では符号付き（増えたら +、減ったら -）
const STORAGE_KEY = 'kakeibo-v1';

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.records)) return data;
  } catch (e) { /* 壊れていたら初期化 */ }
  return { initialBalance: null, records: [] };
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 総額に対する増減（支出はマイナス）
function signedAmount(r) {
  return r.type === 'expense' ? -r.amount : r.amount;
}

function currentTotal() {
  let total = state.initialBalance || 0;
  for (const r of state.records) total += signedAmount(r);
  return total;
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function addRecord(record) {
  const r = {
    id: newId(),
    createdAt: new Date().toISOString(),
    ...record,
  };
  state.records.push(r);
  saveState();
  return r;
}

function updateRecord(id, changes) {
  const r = state.records.find(r => r.id === id);
  if (!r) return;
  Object.assign(r, changes);
  saveState();
}

function removeRecord(id) {
  state.records = state.records.filter(r => r.id !== id);
  saveState();
}

// ===== ユーティリティ =====
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatYen(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(n).toLocaleString('ja-JP')}`;
}

function formatSignedYen(n) {
  return (n > 0 ? '+' : '') + formatYen(n);
}

function toDateString(d) {
  const pad = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayString() {
  return toDateString(new Date());
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 10月6日（月）
function formatDayLabel(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

// 全角数字も受け付け、数字以外を取り除いて整数にする
function parseAmount(text) {
  const digits = text
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[^0-9]/g, '');
  return digits === '' ? null : Number(digits);
}

// 入力中の金額欄を 1,234 形式に整える
function attachAmountFormatter(input, onChange) {
  input.addEventListener('input', () => {
    const n = parseAmount(input.value);
    input.value = n === null ? '' : n.toLocaleString('ja-JP');
    if (onChange) onChange(n);
  });
}

function renderTypeToggle(container, type) {
  container.querySelectorAll('.type-btn').forEach(b => {
    b.setAttribute('aria-checked', String(b.dataset.type === type));
  });
}

function renderCategoryChips(container, type, selected, onSelect) {
  container.innerHTML = '';
  for (const name of CATEGORIES[type]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = name;
    b.setAttribute('aria-pressed', String(name === selected));
    b.addEventListener('click', () => onSelect(name));
    container.appendChild(b);
  }
}

// 収入は分類が2つなので最初の分類を選んでおく。支出は選ばせる
function defaultCategory(type) {
  return type === 'income' ? CATEGORIES.income[0] : null;
}

const $ = id => document.getElementById(id);

// データが変わったら、表示中の画面をまとめて更新する
function refresh() {
  renderTotal();
  if (!$('view-calendar').hidden) renderCalendar();
  if (!$('view-summary').hidden) renderSummary();
}

// ===== 総額表示 =====
function renderTotal() {
  const el = $('total');
  if (state.initialBalance === null) {
    el.textContent = '—';
    el.classList.remove('negative');
    return;
  }
  const total = currentTotal();
  el.textContent = formatYen(total);
  el.classList.toggle('negative', total < 0);
}

// ===== タブ =====
function showTab(name) {
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== name; });
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.tab === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  if (name === 'calendar') renderCalendar();
  if (name === 'summary') renderSummary();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

// ===== 入力画面 =====
const entry = {
  type: 'expense',
  category: null,
};

function renderEntryCategories() {
  renderCategoryChips($('categories'), entry.type, entry.category, name => {
    entry.category = name;
    renderEntryCategories();
    hideError();
  });
}

$('entry-type').querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', () => {
  if (entry.type === b.dataset.type) return;
  entry.type = b.dataset.type;
  entry.category = defaultCategory(entry.type);
  renderTypeToggle($('entry-type'), entry.type);
  renderEntryCategories();
}));

function showError(msg) { const e = $('form-error'); e.textContent = msg; e.hidden = false; }
function hideError() { $('form-error').hidden = true; }

attachAmountFormatter($('amount'), hideError);

function resetForm() {
  $('amount').value = '';
  $('memo').value = '';
  $('date').value = todayString();
  entry.category = defaultCategory(entry.type);
  renderEntryCategories();
}

$('entry-form').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseAmount($('amount').value);
  if (!amount) return showError('金額を入力してください');
  if (!entry.category) return showError('分類を選んでください');
  const date = $('date').value || todayString();

  const r = addRecord({
    type: entry.type,
    date,
    amount,
    category: entry.category,
    memo: $('memo').value.trim(),
  });
  refresh();
  resetForm();
  $('amount').blur();
  $('memo').blur();
  showToast(`${r.category} ${formatSignedYen(signedAmount(r))} を保存しました`, r.id);
});

// ===== カレンダー画面 =====
// 表示中の月はカレンダーと集計で共通
const cal = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0始まり
  selectedDate: null,           // 'YYYY-MM-DD'（日付をタップしたときだけ）
};

function monthPrefix() {
  return toDateString(new Date(cal.year, cal.month, 1)).slice(0, 8); // 'YYYY-MM-'
}

function moveMonth(delta) {
  const d = new Date(cal.year, cal.month + delta, 1);
  cal.year = d.getFullYear();
  cal.month = d.getMonth();
  cal.selectedDate = null;
  summary.category = null;
  refresh();
}

$('cal-prev').addEventListener('click', () => moveMonth(-1));
$('cal-next').addEventListener('click', () => moveMonth(1));
$('list-clear').addEventListener('click', () => { cal.selectedDate = null; renderCalendar(); });

function renderCalendar() {
  const { year, month } = cal;
  $('cal-title').textContent = `${year}年${month + 1}月`;

  // 日付ごとの収入・支出（調整は含めない）
  const daily = new Map();
  for (const r of state.records) {
    if (r.type === 'adjust') continue;
    const t = daily.get(r.date) || { income: 0, expense: 0 };
    t[r.type] += r.amount;
    daily.set(r.date, t);
  }

  // マス目：その月の1日を含む週の日曜から、月末を含む週の土曜まで
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  const today = todayString();
  const grid = $('cal-days');
  grid.innerHTML = '';

  for (let i = 0; i < cells; i++) {
    const d = new Date(year, month, 1 - first.getDay() + i);
    const ds = toDateString(d);
    const inMonth = d.getMonth() === month;
    const t = daily.get(ds);

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cal-day';
    if (!inMonth) b.classList.add('other');
    if (ds === today) b.classList.add('today');
    if (ds === cal.selectedDate) b.classList.add('selected');
    b.setAttribute('aria-label', formatDayLabel(ds));

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = d.getDate();
    b.appendChild(num);

    if (t && t.expense) b.appendChild(amountSpan(t.expense, 'expense'));
    if (t && t.income) b.appendChild(amountSpan(t.income, 'income'));

    b.addEventListener('click', () => {
      if (!inMonth) {
        cal.year = d.getFullYear();
        cal.month = d.getMonth();
        cal.selectedDate = ds;
        summary.category = null;
      } else {
        cal.selectedDate = cal.selectedDate === ds ? null : ds;
      }
      renderCalendar();
    });
    grid.appendChild(b);
  }

  // 月の合計
  const monthRecords = state.records.filter(r => r.date.startsWith(monthPrefix()));
  let income = 0, expense = 0, adjust = 0;
  for (const r of monthRecords) {
    if (r.type === 'income') income += r.amount;
    else if (r.type === 'expense') expense += r.amount;
    else adjust += r.amount;
  }
  $('sum-income').textContent = formatYen(income);
  $('sum-expense').textContent = formatYen(expense);
  const net = income - expense;
  $('sum-net').textContent = formatSignedYen(net);
  $('sum-net').className = net > 0 ? 'income' : net < 0 ? 'expense' : '';

  const hasAdjust = monthRecords.some(r => r.type === 'adjust');
  $('sum-adjust').hidden = !hasAdjust;
  $('sum-adjust').textContent = `調整 ${formatSignedYen(adjust)}（収入・支出には含めていません）`;

  // 一覧
  const listRecords = cal.selectedDate
    ? state.records.filter(r => r.date === cal.selectedDate)
    : monthRecords;
  $('list-title').textContent = cal.selectedDate
    ? `${formatDayLabel(cal.selectedDate)}の記録`
    : `${month + 1}月の記録`;
  $('list-clear').hidden = !cal.selectedDate;
  renderRecordList($('record-list'), listRecords, !cal.selectedDate);
}

function amountSpan(n, cls) {
  const s = document.createElement('span');
  s.className = `amt ${cls}`;
  s.textContent = n.toLocaleString('ja-JP');
  return s;
}

// 日付ごとにまとめた記録の一覧。showDayHeaders が false なら日付の見出しを省く
function renderRecordList(list, records, showDayHeaders) {
  list.innerHTML = '';
  if (records.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '記録はありません';
    list.appendChild(p);
    return;
  }

  // 新しい日付順、同じ日の中は後から入れたものを上に
  const sorted = [...records].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  let group = null;
  let currentDate = null;
  for (const r of sorted) {
    if (r.date !== currentDate) {
      currentDate = r.date;
      group = document.createElement('div');
      group.className = 'day-group';
      if (showDayHeaders) {
        const h = document.createElement('h4');
        h.textContent = formatDayLabel(r.date);
        group.appendChild(h);
      }
      group.appendChild(document.createElement('ul'));
      list.appendChild(group);
    }
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'record';

    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = r.category;
    const memo = document.createElement('span');
    memo.className = 'memo';
    memo.textContent = r.memo || '';
    const amt = document.createElement('span');
    amt.className = `amount ${r.type}`;
    amt.textContent = formatSignedYen(signedAmount(r));

    b.append(cat, memo, amt);
    b.addEventListener('click', () => openEdit(r.id));
    li.appendChild(b);
    group.querySelector('ul').appendChild(li);
  }
}

// ===== 集計画面 =====
const summary = {
  category: null, // 分類をタップしたときだけ、その分類の記録を表示
};

$('sm-prev').addEventListener('click', () => moveMonth(-1));
$('sm-next').addEventListener('click', () => moveMonth(1));
$('sm-back').addEventListener('click', () => {
  summary.category = null;
  renderSummary();
  window.scrollTo(0, 0);
});

function renderSummary() {
  $('sm-title').textContent = `${cal.year}年${cal.month + 1}月`;
  const prefix = monthPrefix();
  const monthRecords = state.records.filter(r => r.date.startsWith(prefix));
  const expenses = monthRecords.filter(r => r.type === 'expense');

  $('sm-main').hidden = !!summary.category;
  $('sm-detail').hidden = !summary.category;

  if (summary.category) {
    const records = expenses.filter(r => r.category === summary.category);
    $('sm-detail-title').textContent = summary.category;
    $('sm-detail-total').textContent = formatYen(records.reduce((s, r) => s + r.amount, 0));
    renderRecordList($('sm-detail-list'), records, true);
    return;
  }

  // 分類ごとの合計（金額の大きい順）
  const totals = new Map();
  for (const r of expenses) totals.set(r.category, (totals.get(r.category) || 0) + r.amount);
  const rows = [...totals].sort((a, b) => b[1] - a[1]);
  const total = expenses.reduce((s, r) => s + r.amount, 0);

  $('sm-total').textContent = formatYen(total);
  $('sm-adjust').hidden = !monthRecords.some(r => r.type === 'adjust');

  const list = $('cat-bars');
  list.innerHTML = '';
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'この月の支出はありません';
    list.appendChild(li);
    return;
  }

  for (const [name, amount] of rows) {
    const share = amount / total;
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cat-row';
    b.innerHTML = `
      <span class="name"></span>
      <span class="value"></span>
      <span class="pct"></span>
      <svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4"/></svg>
      <span class="bar" aria-hidden="true"><span></span></span>`;
    b.querySelector('.name').textContent = name;
    b.querySelector('.value').textContent = formatYen(amount);
    b.querySelector('.pct').textContent = formatPercent(share);
    b.querySelector('.bar span').style.width = `${share * 100}%`;
    b.addEventListener('click', () => {
      summary.category = name;
      renderSummary();
      window.scrollTo(0, 0);
    });
    li.appendChild(b);
    list.appendChild(li);
  }
}

// 0.1% 単位。0.1% に満たないものは 0.0% ではなく <0.1% と出す
function formatPercent(share) {
  const p = share * 100;
  if (p > 0 && p < 0.1) return '<0.1%';
  return `${p.toFixed(1)}%`;
}

// ===== 記録の修正・削除 =====
const editDialog = $('edit-dialog');
const edit = { id: null, type: null, category: null };

function renderEditCategories() {
  renderCategoryChips($('edit-categories'), edit.type, edit.category, name => {
    edit.category = name;
    renderEditCategories();
    $('edit-error').hidden = true;
  });
}

$('edit-type').querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', () => {
  if (edit.type === b.dataset.type) return;
  edit.type = b.dataset.type;
  // 切り替えた先に今の分類が無ければ選び直してもらう
  if (!CATEGORIES[edit.type].includes(edit.category)) edit.category = defaultCategory(edit.type);
  renderTypeToggle($('edit-type'), edit.type);
  renderEditCategories();
}));

attachAmountFormatter($('edit-amount'), () => { $('edit-error').hidden = true; });

function openEdit(id) {
  const r = state.records.find(r => r.id === id);
  if (!r) return;
  edit.id = id;
  edit.type = r.type;
  edit.category = r.category;
  const isAdjust = r.type === 'adjust';

  // 調整は金額・分類を変えず、日付とメモの修正と削除だけにする
  $('edit-title').textContent = isAdjust ? '調整の記録' : '記録を修正';
  $('edit-type').hidden = isAdjust;
  $('edit-amount-field').hidden = isAdjust;
  $('edit-category-field').hidden = isAdjust;
  $('edit-adjust-info').hidden = !isAdjust;

  if (isAdjust) {
    $('edit-adjust-amount').textContent = formatSignedYen(r.amount);
  } else {
    $('edit-amount').value = r.amount.toLocaleString('ja-JP');
    renderTypeToggle($('edit-type'), edit.type);
    renderEditCategories();
  }
  $('edit-date').value = r.date;
  $('edit-memo').value = r.memo || '';
  $('edit-error').hidden = true;
  editDialog.showModal();
  // iPhone で開いた瞬間にキーボードが出ないように
  document.activeElement && document.activeElement.blur();
}

$('edit-cancel').addEventListener('click', () => editDialog.close());

$('edit-form').addEventListener('submit', e => {
  const showEditError = msg => {
    e.preventDefault();
    $('edit-error').textContent = msg;
    $('edit-error').hidden = false;
  };
  const changes = {
    date: $('edit-date').value || todayString(),
    memo: $('edit-memo').value.trim(),
  };
  if (edit.type !== 'adjust') {
    const amount = parseAmount($('edit-amount').value);
    if (!amount) return showEditError('金額を入力してください');
    if (!edit.category) return showEditError('分類を選んでください');
    Object.assign(changes, { type: edit.type, amount, category: edit.category });
  }
  updateRecord(edit.id, changes);
  refresh();
  showToast('修正しました');
});

$('edit-delete').addEventListener('click', () => {
  if (!confirm('この記録を削除しますか？')) return;
  const r = state.records.find(r => r.id === edit.id);
  removeRecord(edit.id);
  editDialog.close();
  refresh();
  deletedRecord = r;
  showToast('削除しました', null, true);
});

// ===== トースト（取り消し付き） =====
let toastTimer = null;
let toastRecordId = null; // 保存の取り消し用
let deletedRecord = null; // 削除の取り消し用

function showToast(text, recordId, canRestore) {
  $('toast-text').textContent = text;
  toastRecordId = recordId || null;
  if (!canRestore) deletedRecord = null;
  $('toast-undo').hidden = !toastRecordId && !deletedRecord;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
    toastRecordId = null;
    deletedRecord = null;
  }, 5000);
}

$('toast-undo').addEventListener('click', () => {
  if (toastRecordId) {
    removeRecord(toastRecordId);
  } else if (deletedRecord) {
    state.records.push(deletedRecord);
    saveState();
  }
  refresh();
  showToast('取り消しました');
});

// ===== 初回設定：今ある全額 =====
const setupDialog = $('setup-dialog');
attachAmountFormatter($('setup-amount'), () => { $('setup-error').hidden = true; });
setupDialog.addEventListener('cancel', e => e.preventDefault()); // Esc で閉じさせない

$('setup-form').addEventListener('submit', e => {
  const amount = parseAmount($('setup-amount').value);
  if (amount === null) {
    e.preventDefault();
    $('setup-error').textContent = '金額を入力してください（0円でもOK）';
    $('setup-error').hidden = false;
    return;
  }
  state.initialBalance = amount;
  saveState();
  if (!meta.firstUsedAt) {
    meta.firstUsedAt = new Date().toISOString();
    saveMeta();
  }
  refresh();
});

// ===== 実際の総額に合わせる =====
const adjustDialog = $('adjust-dialog');
let adjustDiff = null;

function updateAdjustDiff(actual) {
  const diffEl = $('adjust-diff');
  $('adjust-error').hidden = true;
  if (actual === null) {
    adjustDiff = null;
    diffEl.textContent = '—';
    diffEl.style.color = '';
    return;
  }
  adjustDiff = actual - currentTotal();
  diffEl.textContent = formatSignedYen(adjustDiff);
  diffEl.style.color = adjustDiff > 0 ? 'var(--income)' : adjustDiff < 0 ? 'var(--expense)' : '';
}

attachAmountFormatter($('adjust-amount'), updateAdjustDiff);

$('open-adjust').addEventListener('click', () => {
  if (state.initialBalance === null) return setupDialog.showModal();
  $('adjust-current').textContent = formatYen(currentTotal());
  $('adjust-amount').value = '';
  updateAdjustDiff(null);
  adjustDialog.showModal();
});

$('adjust-cancel').addEventListener('click', () => adjustDialog.close());

$('adjust-form').addEventListener('submit', e => {
  if (adjustDiff === null) {
    e.preventDefault();
    $('adjust-error').textContent = '実際の総額を入力してください';
    $('adjust-error').hidden = false;
    return;
  }
  if (adjustDiff === 0) {
    showToast('総額は一致しています');
    return;
  }
  const r = addRecord({
    type: 'adjust',
    date: todayString(),
    amount: adjustDiff,
    category: ADJUST_CATEGORY,
    memo: '',
  });
  refresh();
  showToast(`調整 ${formatSignedYen(adjustDiff)} を記録しました`, r.id);
});

// ===== バックアップ（CSV の書き出し・復元） =====
// 記録とは別に、バックアップの日付などを保存する（復元しても消えないように）
const META_KEY = 'kakeibo-meta';

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || {};
  } catch (e) {
    return {};
  }
}

let meta = loadMeta(); // { firstUsedAt, lastBackupAt, remindedOn }

function saveMeta() {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

// CSV の1列目。最初の総額も「初期総額」の行として書き出す
const TYPE_LABELS = { initial: '初期総額', expense: '支出', income: '収入', adjust: '調整' };
const CSV_HEADER = ['種類', '日付', '金額', '分類', 'メモ', 'ID', '作成日時'];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv() {
  const rows = [CSV_HEADER, [TYPE_LABELS.initial, '', state.initialBalance ?? 0, '', '', '', '']];
  const sorted = [...state.records].sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  for (const r of sorted) {
    rows.push([TYPE_LABELS[r.type], r.date, r.amount, r.category, r.memo || '', r.id, r.createdAt]);
  }
  // 先頭の BOM は、Excel や Numbers で開いたときに文字化けさせないため
  return '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// 2026-10-06 のほか、表計算ソフトで保存し直されたときの 2026/10/6 も受け付ける
function normalizeDate(s) {
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null; // 2月30日など
  return toDateString(d);
}

// CSV の中身を確かめて、新しいデータを作る。おかしな行があればその行番号を添えてエラーにする
function stateFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('ファイルが空です。');
  const head = rows[0].map(h => h.trim());
  for (const name of ['種類', '日付', '金額', '分類']) {
    if (!head.includes(name)) throw new Error('この家計簿から書き出したCSVではないようです。');
  }
  const typeOf = Object.fromEntries(Object.entries(TYPE_LABELS).map(([k, v]) => [v, k]));

  let initialBalance = null;
  const records = [];
  const ids = new Set();
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const get = name => (head.includes(name) ? (row[head.indexOf(name)] ?? '').trim() : '');
    const fail = msg => { throw new Error(`${line}行目：${msg}`); };

    const type = typeOf[get('種類')];
    if (!type) fail(`種類「${get('種類')}」が読み取れません。`);

    const amountText = get('金額').replace(/[,¥]/g, '');
    if (!/^-?\d+$/.test(amountText)) fail(`金額「${get('金額')}」が読み取れません。`);
    const amount = Number(amountText);

    if (type === 'initial') {
      initialBalance = amount;
      return;
    }

    const date = normalizeDate(get('日付'));
    if (!date) fail(`日付「${get('日付')}」が読み取れません。`);

    const category = type === 'adjust' ? ADJUST_CATEGORY : get('分類');
    if (type !== 'adjust') {
      if (amount <= 0) fail('金額は1円以上にしてください。');
      if (!CATEGORIES[type].includes(category)) fail(`分類「${category}」はありません。`);
    }

    let id = get('ID');
    if (!id || ids.has(id)) id = newId();
    ids.add(id);

    records.push({
      id,
      type,
      date,
      amount,
      category,
      memo: get('メモ'),
      createdAt: get('作成日時') || new Date().toISOString(),
    });
  });

  if (initialBalance === null) throw new Error('「初期総額」の行がありません。');
  return { initialBalance, records };
}

// 2026年10月6日
function formatFullDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function renderBackupInfo() {
  $('backup-last').textContent = meta.lastBackupAt ? formatFullDate(meta.lastBackupAt) : 'まだありません';
}

async function exportCsv() {
  const name = `kakeibo-backup-${todayString()}.csv`;
  const file = new File([buildCsv()], name, { type: 'text/csv' });
  try {
    // iPhone では共有シートから「"ファイル"に保存」できるようにする。Mac では普通にダウンロード
    const isTouch = matchMedia('(pointer: coarse)').matches;
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (e) {
    if (e.name !== 'AbortError') alert(`書き出せませんでした。\n${e.message}`);
    return; // 共有シートを閉じたときは、バックアップしたことにしない
  }
  meta.lastBackupAt = new Date().toISOString();
  saveMeta();
  renderBackupInfo();
  showToast('CSVを書き出しました');
}

function startImport() {
  $('import-file').value = '';
  $('import-file').click();
}

$('import-file').addEventListener('change', async () => {
  const file = $('import-file').files[0];
  if (!file) return;

  let next;
  try {
    next = stateFromCsv(await file.text());
  } catch (e) {
    alert(`読み込めませんでした。データは変わっていません。\n\n${e.message}`);
    return;
  }

  const total = next.initialBalance + next.records.reduce((s, r) => s + signedAmount(r), 0);
  const ok = confirm(
    `「${file.name}」から復元します。\n\n` +
    `記録：${next.records.length}件\n総額：${formatYen(total)}\n\n` +
    '今のデータはこの内容に置き換わります。よろしいですか？'
  );
  if (!ok) return;

  state = next;
  saveState();
  if (!meta.firstUsedAt) {
    meta.firstUsedAt = new Date().toISOString();
    saveMeta();
  }
  cal.selectedDate = null;
  summary.category = null;
  for (const d of [setupDialog, $('backup-dialog')]) if (d.open) d.close();
  refresh();
  showToast('復元しました');
});

$('open-backup').addEventListener('click', () => {
  renderBackupInfo();
  $('backup-dialog').showModal();
});
$('backup-export').addEventListener('click', exportCsv);
$('backup-import').addEventListener('click', startImport);
$('backup-close').addEventListener('click', () => $('backup-dialog').close());
$('setup-restore').addEventListener('click', startImport);

// ===== バックアップのおすすめ =====
// 前回のバックアップ（まだなら使い始めた日）から1か月以上経っていたら表示する。
// 「あとで」を押した日はもう出さない
const remindDialog = $('remind-dialog');

function checkBackupReminder() {
  if (state.initialBalance === null || state.records.length === 0) return;
  if (document.querySelector('dialog[open]')) return;

  const base = meta.lastBackupAt || meta.firstUsedAt;
  if (!base) {
    meta.firstUsedAt = new Date().toISOString();
    saveMeta();
    return;
  }
  const due = new Date(base);
  due.setMonth(due.getMonth() + 1);
  if (new Date() < due) return;
  if (meta.remindedOn === todayString()) return;

  $('remind-text').textContent =
    (meta.lastBackupAt
      ? `前回のバックアップ（${formatFullDate(meta.lastBackupAt)}）から1か月以上経っています。`
      : 'まだ一度もバックアップを取っていません。') +
    'データはこの端末の中にしかないので、CSVに書き出しておくと安心です。';
  remindDialog.showModal();
}

function remindLater() {
  meta.remindedOn = todayString();
  saveMeta();
}

$('remind-later').addEventListener('click', () => {
  remindLater();
  remindDialog.close();
});
remindDialog.addEventListener('cancel', remindLater);
$('remind-export').addEventListener('click', () => {
  remindDialog.close();
  exportCsv();
});

// ホーム画面のアプリは閉じずに裏に残ることが多いので、表に戻ったときにも確かめる
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkBackupReminder();
});

// ===== 起動 =====
renderTypeToggle($('entry-type'), entry.type);
resetForm();
renderTotal();
if (state.initialBalance === null) setupDialog.showModal();
else checkBackupReminder();

// ブラウザにデータを消されにくくする（対応ブラウザのみ）
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// オフラインでも開けるように
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
