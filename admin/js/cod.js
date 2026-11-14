/* StrydeGoSox — Cash on Delivery section of the admin dashboard.
   Depends on admin.js, which exposes window.SGS_ADMIN_API. */
(() => {
  const BUCKET_LABEL = {
    awaiting_dispatch: 'Awaiting dispatch',
    in_transit: 'In transit',
    to_collect: 'Delivered, cash not recorded',
    collected: 'Cash collected',
    remitted: 'Remitted',
    failed: 'Failed / returned',
    other: 'Other'
  };
  const BUCKET_COLOR = {
    awaiting_dispatch: 'yellow',
    in_transit: 'blue',
    to_collect: 'red',
    collected: 'green',
    remitted: 'green',
    failed: 'red',
    other: 'yellow'
  };
  const TABS = [
    ['all', 'All'],
    ['awaiting_dispatch', 'Awaiting dispatch'],
    ['in_transit', 'In transit'],
    ['to_collect', 'Cash not recorded'],
    ['collected', 'Collected'],
    ['remitted', 'Remitted'],
    ['failed', 'Failed / returned']
  ];
  const FAIL_REASONS = [
    'Customer refused the parcel',
    'Customer unreachable',
    'Wrong or incomplete address',
    'Customer asked to cancel',
    'Other'
  ];

  let bucket = 'all';
  let rows = [];
  let summary = null;
  let selected = new Set();
  let reqId = 0;
  let searchTimer = null;
  let wired = false;

  const $ = s => document.querySelector(s);
  const A = () => window.SGS_ADMIN_API;
  const esc = v => A().escapeHtml(v);
  const money = n => A().money(n);
  const toast = m => A().toast(m);
  const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const fmtDateTime = d => (d ? new Date(d).toLocaleString('en-IN') : '');
  const isHttps = u => /^https:\/\//i.test(String(u || ''));

  /* ---------------- data ---------------- */

  async function loadSummary() {
    summary = await A().api('/admin/cod/summary');
    renderBadge();
    if (isActive()) renderStats();
  }

  async function loadRows() {
    const mine = ++reqId;
    const q = ($('#codSearch')?.value || '').trim();
    const data = await A().api(`/admin/cod/orders?${new URLSearchParams({ bucket, q })}`);
    if (mine !== reqId) return; // a newer request superseded this one
    rows = data;
    const visible = new Set(rows.map(r => String(r._id)));
    selected = new Set([...selected].filter(id => visible.has(id)));
    renderTable();
  }

  async function refresh() {
    try {
      await Promise.all([loadSummary(), loadRows()]);
    } catch (e) {
      toast(e.message);
    }
  }

  function isActive() {
    return !!document.querySelector('#cod.active');
  }

  /* ---------------- rendering ---------------- */

  function renderBadge() {
    const badge = $('#codBadge');
    if (!badge) return;
    const n = summary?.needsAttention || 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n === 0;
    badge.title = `${n} COD order${n === 1 ? '' : 's'} need cash recorded`;
  }

  function renderStats() {
    if (!summary) return;
    const b = summary.buckets;
    const set = (id, v, sub) => {
      const el = $(`#${id}`);
      if (el) el.textContent = v;
      const s = $(`#${id}Sub`);
      if (s && sub !== undefined) s.textContent = sub;
    };
    const n = (c, word = 'order') => `${c} ${word}${c === 1 ? '' : 's'}`;
    const short = x => { const d = x.amount - x.collected; return d > 0.005 ? ` · ${money(d)} short-collected` : ''; };
    set('codOutstanding', money(summary.cashOutstanding), `${n(b.in_transit.count + b.to_collect.count)} with couriers or customers`);
    set('codAwaiting', money(summary.awaitingRemittance), n(b.collected.count) + short(b.collected));
    set('codRemitted', money(summary.remitted), n(b.remitted.count) + short(b.remitted));
    set('codFailRate', summary.failureRate === null ? '—' : `${summary.failureRate}%`, `${b.failed.count} failed or returned`);

    $('#codTabs').innerHTML = TABS.map(([key, label]) => {
      const count = key === 'all' ? summary.totalOrders : b[key]?.count ?? 0;
      return `<button type="button" class="cod-tab ${key === bucket ? 'active' : ''}" data-tab="${key}" role="tab" aria-selected="${key === bucket}">${esc(label)} <span>${count}</span></button>`;
    }).join('');
  }

  function detailsFor(o) {
    const k = o.codBucket;
    const lines = [];
    if (k === 'awaiting_dispatch') lines.push('Ready to ship');
    if (k === 'in_transit') {
      if (o.trackingNumber) {
        const label = esc(o.trackingNumber);
        lines.push(isHttps(o.trackingUrl) ? `<a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener" style="text-decoration:underline">${label}</a>` : label);
      }
      if (o.shippedAt) lines.push(`Shipped ${fmtDate(o.shippedAt)}`);
    }
    if (k === 'to_collect') lines.push(`Delivered ${fmtDate(o.deliveredAt)}. Record the cash received.`);
    if (k === 'collected' || k === 'remitted') {
      const short = Number(o.total) - Number(o.codCollectedAmount ?? o.total);
      lines.push(`Collected ${fmtDate(o.codCollectedAt)}${o.codCollectedBy ? ` by ${esc(o.codCollectedBy)}` : ''}`);
      if (short > 0) lines.push(`<span class="low">Short by ${money(short)}</span>`);
      if (o.codCollectionNote) lines.push(esc(o.codCollectionNote));
    }
    if (k === 'remitted') lines.push(`Remitted ${fmtDate(o.codRemittedAt)}, ref ${esc(o.codRemittanceRef)}`);
    if (k === 'failed') {
      lines.push(esc(o.codFailureReason || 'Order cancelled'));
      if (o.cancelledAt) lines.push(fmtDate(o.cancelledAt));
    }
    return lines.map(l => `<div class="tiny-muted" style="margin-top:0;line-height:1.5">${l}</div>`).join('');
  }

  function actionsFor(o) {
    const id = esc(o._id);
    const btn = (act, label, cls = '') => `<button type="button" class="action-btn ${cls}" data-act="${act}" data-id="${id}">${label}</button>`;
    const out = [];
    switch (o.codBucket) {
      case 'awaiting_dispatch':
        out.push(btn('ship', 'Mark shipped', 'primary'), btn('fail', 'Cancel'));
        break;
      case 'in_transit':
        out.push(btn('collect', 'Record cash', 'primary'), btn('fail', 'Delivery failed'));
        break;
      case 'to_collect':
        out.push(btn('collect', 'Record cash', 'primary'));
        break;
      case 'collected':
        out.push(btn('undo', 'Undo'));
        break;
      default:
        break;
    }
    out.push(btn('view', 'View'), btn('invoice', 'Invoice ↓'));
    return `<div style="display:flex;gap:6px;flex-wrap:wrap">${out.join('')}</div>`;
  }

  function renderTable() {
    $('#codCount').textContent = `${rows.length} ORDERS`;
    const body = $('#codBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" style="color:#666">${bucket === 'all' ? 'No Cash on Delivery orders yet.' : 'No orders in this stage.'}</td></tr>`;
    } else {
      body.innerHTML = rows.map(o => {
        const canSelect = o.codBucket === 'collected';
        const collected = o.codBucket === 'collected' || o.codBucket === 'remitted';
        const amount = collected ? Number(o.codCollectedAmount ?? o.total) : Number(o.total);
        return `<tr>
          <td style="width:34px">${canSelect ? `<input type="checkbox" data-sel="${esc(o._id)}" ${selected.has(String(o._id)) ? 'checked' : ''} aria-label="Select order ${esc(o.orderNumber)} for remittance">` : ''}</td>
          <td><strong>#${esc(o.orderNumber)}</strong><div class="tiny-muted">${esc(fmtDateTime(o.createdAt))}</div></td>
          <td>${esc(o.customer?.name)}<div class="tiny-muted">${esc(o.customer?.phone)}</div><div class="tiny-muted">${esc(o.shipping?.city)} — ${esc(o.shipping?.pin)}</div></td>
          <td class="mono">${money(amount)}${collected && amount !== Number(o.total) ? `<div class="tiny-muted">of ${money(o.total)}</div>` : ''}</td>
          <td><span class="status ${BUCKET_COLOR[o.codBucket] || 'yellow'}">${esc(BUCKET_LABEL[o.codBucket] || o.codBucket)}</span></td>
          <td style="max-width:240px">${detailsFor(o)}</td>
          <td>${actionsFor(o)}</td>
        </tr>`;
      }).join('');
    }
    const all = $('#codSelectAll');
    const selectable = rows.filter(o => o.codBucket === 'collected');
    if (all) {
      all.checked = selectable.length > 0 && selectable.every(o => selected.has(String(o._id)));
      all.disabled = selectable.length === 0;
    }
    updateRemitButton();
  }

  function updateRemitButton() {
    const btn = $('#codRemitBtn');
    if (!btn) return;
    btn.textContent = selected.size ? `Record remittance (${selected.size})` : 'Record remittance';
    btn.disabled = selected.size === 0;
    btn.style.opacity = selected.size ? '1' : '.5';
  }

  /* ---------------- modal ---------------- */

  function openModal({ kicker, title, body, confirm, onSubmit }) {
    let modal = $('#sgCodModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'sgCodModal';
      modal.className = 'modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal-panel" style="width:min(520px,96vw)">
      <div class="modal-head"><div><div class="page-kicker">${esc(kicker)}</div><h3>${esc(title)}</h3></div><button type="button" class="close" data-close aria-label="Close">×</button></div>
      <form id="sgCodForm" class="form-grid" novalidate>${body}
        <div class="field full" id="sgCodError" style="color:#ff6570;font-size:11px;min-height:14px" role="alert"></div>
        <div class="field full" style="display:flex;justify-content:flex-end;flex-direction:row;gap:8px">
          <button type="button" class="action-btn" data-close>Cancel</button>
          <button type="submit" class="action-btn primary">${esc(confirm)}</button>
        </div></form></div>`;
    modal.classList.add('open');
    const close = () => modal.classList.remove('open');
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    const form = modal.querySelector('#sgCodForm');
    const err = modal.querySelector('#sgCodError');
    const first = form.querySelector('input,select,textarea');
    if (first) first.focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const submit = form.querySelector('button[type=submit]');
      err.textContent = '';
      submit.disabled = true;
      try {
        const done = await onSubmit(form);
        if (done === false) return;
        close();
      } catch (x) {
        err.textContent = x.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  const find = id => rows.find(r => String(r._id) === String(id));

  function collectDialog(o) {
    const shipped = o.fulfillmentStatus === 'shipped';
    openModal({
      kicker: `Order #${o.orderNumber}`,
      title: 'Record cash collected',
      confirm: 'Record cash',
      body: `<div class="field full"><div class="notice" style="margin-top:0">${shipped
        ? 'This marks the order as paid and delivered, and sends the customer the delivered email.'
        : 'This marks the order as paid.'}</div></div>
        <div class="field"><label>Order total</label><input value="${esc(money(o.total))}" disabled></div>
        <div class="field"><label for="codAmount">Cash collected (₹)</label><input id="codAmount" type="number" min="1" max="${esc(o.total)}" step="0.01" value="${esc(o.total)}" required></div>
        <div class="field full"><label for="codNote">Note (required if the amount differs)</label><textarea id="codNote" maxlength="300" style="min-height:64px"></textarea></div>`,
      onSubmit: async form => {
        const amount = Number(form.querySelector('#codAmount').value);
        const note = form.querySelector('#codNote').value.trim();
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the amount of cash collected');
        if (amount > Number(o.total)) throw new Error('Collected amount cannot be more than the order total');
        if (amount !== Number(o.total) && !note) throw new Error('Add a note explaining why the amount differs');
        await A().api(`/admin/cod/orders/${o._id}/collect`, { method: 'POST', body: JSON.stringify({ amount, note }) });
        toast(`Cash recorded for #${o.orderNumber}`);
        await refreshAll();
      }
    });
  }

  function failDialog(o) {
    openModal({
      kicker: `Order #${o.orderNumber}`,
      title: o.fulfillmentStatus === 'processing' ? 'Cancel COD order' : 'Delivery failed',
      confirm: 'Confirm',
      body: `<div class="field full"><div class="notice" style="margin-top:0">The order is cancelled, stock goes back to inventory and the customer receives a cancellation email. No cash is expected.</div></div>
        <div class="field full"><label for="codReason">Reason</label><select id="codReason">${FAIL_REASONS.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
        <div class="field full"><label for="codReasonNote">Details (optional)</label><textarea id="codReasonNote" maxlength="200" style="min-height:64px"></textarea></div>`,
      onSubmit: async form => {
        const base = form.querySelector('#codReason').value;
        const extra = form.querySelector('#codReasonNote').value.trim();
        const reason = extra ? `${base}: ${extra}` : base;
        await A().api(`/admin/cod/orders/${o._id}/failed`, { method: 'POST', body: JSON.stringify({ reason }) });
        toast(`Order #${o.orderNumber} cancelled and stock restored`);
        await refreshAll();
      }
    });
  }

  function remitDialog() {
    const picked = rows.filter(r => selected.has(String(r._id)) && r.codBucket === 'collected');
    if (!picked.length) return toast('Select collected orders first');
    const total = picked.reduce((a, r) => a + Number(r.codCollectedAmount ?? r.total), 0);
    openModal({
      kicker: 'Courier payout',
      title: 'Record remittance',
      confirm: 'Mark as remitted',
      body: `<div class="field full"><div class="notice" style="margin-top:0">${picked.length} order${picked.length === 1 ? '' : 's'} · ${esc(money(total))} collected. Check this against the amount in your courier or bank statement.</div></div>
        <div class="field full"><label for="codRef">Remittance reference (bank UTR or courier payout ID)</label><input id="codRef" maxlength="120" required></div>`,
      onSubmit: async form => {
        const reference = form.querySelector('#codRef').value.trim();
        if (reference.length < 3) throw new Error('Enter the remittance reference');
        const res = await A().api('/admin/cod/remit', { method: 'POST', body: JSON.stringify({ orderIds: picked.map(r => r._id), reference }) });
        selected.clear();
        toast(res.skipped ? `${res.remitted} remitted, ${res.skipped} skipped` : `${res.remitted} order${res.remitted === 1 ? '' : 's'} marked as remitted`);
        await refreshAll();
      }
    });
  }

  async function undo(o) {
    if (!confirm(`Undo the cash collection for #${o.orderNumber}? The order goes back to "Delivered, cash not recorded".`)) return;
    try {
      await A().api(`/admin/cod/orders/${o._id}/undo-collection`, { method: 'POST' });
      toast('Collection undone');
      await refreshAll();
    } catch (e) {
      toast(e.message);
    }
  }

  /* Refresh COD data and the rest of the dashboard (overview totals, orders list). */
  async function refreshAll() {
    await refresh();
    try { await window.renderOrders?.(); } catch { /* orders view is optional */ }
  }

  function exportCSV() {
    if (!rows.length) return toast('No COD orders to export');
    const q = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const head = ['Order', 'Date', 'Customer', 'Phone', 'City', 'PIN', 'Stage', 'Order total', 'Cash collected', 'Collected on', 'Collected by', 'Note', 'Remitted on', 'Remittance ref', 'Failure reason', 'Tracking'];
    const lines = rows.map(o => [o.orderNumber, new Date(o.createdAt).toISOString(), o.customer?.name, o.customer?.phone, o.shipping?.city, o.shipping?.pin,
      BUCKET_LABEL[o.codBucket], o.total, o.codCollectedAmount ?? '', o.codCollectedAt ? new Date(o.codCollectedAt).toISOString() : '', o.codCollectedBy,
      o.codCollectionNote, o.codRemittedAt ? new Date(o.codRemittedAt).toISOString() : '', o.codRemittanceRef, o.codFailureReason, o.trackingNumber]);
    const csv = '\ufeff' + [head, ...lines].map(r => r.map(q).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `strydegosox-cod-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('COD orders exported');
  }

  /* ---------------- events ---------------- */

  function wire() {
    if (wired) return;
    wired = true;

    $('#codTabs').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (!t || t.dataset.tab === bucket) return;
      bucket = t.dataset.tab;
      selected.clear();
      renderStats();
      loadRows().catch(x => toast(x.message));
    });

    $('#codSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadRows().catch(x => toast(x.message)), 300);
    });

    $('#codExportBtn').addEventListener('click', exportCSV);
    $('#codRefreshBtn').addEventListener('click', () => refresh().then(() => toast('COD data refreshed')));
    $('#codRemitBtn').addEventListener('click', remitDialog);

    $('#codSelectAll').addEventListener('change', e => {
      rows.filter(o => o.codBucket === 'collected').forEach(o => {
        e.target.checked ? selected.add(String(o._id)) : selected.delete(String(o._id));
      });
      renderTable();
    });

    $('#codBody').addEventListener('change', e => {
      const cb = e.target.closest('[data-sel]');
      if (!cb) return;
      cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
      const selectable = rows.filter(o => o.codBucket === 'collected');
      $('#codSelectAll').checked = selectable.length > 0 && selectable.every(o => selected.has(String(o._id)));
      updateRemitButton();
    });

    $('#codBody').addEventListener('click', async e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const o = find(b.dataset.id);
      if (!o) return toast('Order not found. Refresh and try again.');
      switch (b.dataset.act) {
        case 'view': return window.viewOrder?.(o._id);
        case 'invoice': return window.downloadInvoice?.(o._id);
        case 'collect': return collectDialog(o);
        case 'fail': return failDialog(o);
        case 'undo': return undo(o);
        case 'ship':
          await window.updateOrderStatus?.(o._id, 'shipped'); // asks for tracking details
          return refresh();
        default: return undefined;
      }
    });
  }

  window.SGS_COD = {
    async show() {
      wire();
      await refresh();
    },
    async refreshBadge() {
      try { await loadSummary(); } catch { /* the badge is informational */ }
    }
  };
})();
