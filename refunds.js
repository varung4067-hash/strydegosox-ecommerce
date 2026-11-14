/* StrydeGoSox — Refund Center. Depends on admin.js. */
(() => {
  const TABS = [
    ['all', 'All'],
    ['eligible', 'Refundable'],
    ['refunded', 'Refunded'],
    ['attention', 'Attention']
  ];
  const STATUS = {
    eligible: ['green', 'Refundable'],
    refunded: ['red', 'Refunded'],
    attention: ['yellow', 'Review']
  };
  let tab = 'eligible', rows = [], summary = null, reqId = 0, timer = null, wired = false;
  const $ = s => document.querySelector(s);
  const A = () => window.SGS_ADMIN_API;
  const esc = v => A().escapeHtml(v);
  const money = n => A().money(n);
  const toast = m => A().toast(m);
  const fmt = d => d ? new Date(d).toLocaleString('en-IN') : '—';
  const isActive = () => !!document.querySelector('#refunds.active');

  async function loadSummary() {
    summary = await A().api('/admin/refunds/summary');
    renderStats(); renderTabs(); renderBadge();
  }
  async function loadRows() {
    const mine = ++reqId;
    const q = ($('#refundSearch')?.value || '').trim();
    const data = await A().api(`/admin/refunds/orders?${new URLSearchParams({ tab, q })}`);
    if (mine !== reqId) return;
    rows = data;
    renderTable();
  }
  async function refresh() { try { await Promise.all([loadSummary(), loadRows()]); } catch(e) { toast(e.message); } }

  function renderBadge() {
    const b = $('#refundBadge'); if (!b) return;
    const n = summary?.attention?.count || 0;
    b.textContent = n > 99 ? '99+' : String(n); b.hidden = n === 0;
    b.title = `${n} refund order${n === 1 ? '' : 's'} need attention`;
  }
  function renderStats() {
    if (!summary) return;
    const set = (id,v,sub) => { const a=$(`#${id}`), b=$(`#${id}Sub`); if(a)a.textContent=v; if(b)b.textContent=sub; };
    set('refundEligibleAmount', money(summary.eligible.amount), `${summary.eligible.count} eligible orders`);
    set('refundTotalAmount', money(summary.refunded.amount), `${summary.refunded.count} refunded orders`);
    set('refundPendingAmount', money(summary.attention.amount), `${summary.attention.count} orders needing attention`);
    set('refundSuccessRate', summary.successRate == null ? '—' : `${summary.successRate}%`, 'Based on completed refund actions');
  }
  function renderTabs() {
    if (!summary || !$('#refundTabs')) return;
    const counts = {all:summary.total, eligible:summary.eligible.count, refunded:summary.refunded.count, attention:summary.attention.count};
    $('#refundTabs').innerHTML = TABS.map(([k,l]) => `<button type="button" class="refund-tab ${tab===k?'active':''}" data-tab="${k}" role="tab" aria-selected="${tab===k}">${esc(l)} <span>${counts[k] ?? 0}</span></button>`).join('');
  }
  function classification(o) {
    if (o.paymentMethod !== 'razorpay') return 'attention';
    if (o.paymentStatus === 'refunded' || o.fulfillmentStatus === 'refunded') return 'refunded';
    if (o.refundInProgress) return 'attention';
    if (o.paymentStatus === 'captured' && o.razorpayPaymentId) return 'eligible';
    return 'attention';
  }
  function statusFor(o) { const c=classification(o); return STATUS[c] || STATUS.attention; }
  function details(o) {
    const out=[];
    if(o.razorpayPaymentId) out.push(`<span class="refund-id">Payment: ${esc(o.razorpayPaymentId)}</span>`);
    if(o.razorpayRefundId) out.push(`<span class="refund-id">Refund: ${esc(o.razorpayRefundId)}</span>`);
    if(o.refundedAt) out.push(`<span>Refunded ${esc(fmt(o.refundedAt))}</span>`);
    if(o.notes && classification(o)==='refunded') {
      const last = String(o.notes).split('\n').filter(Boolean).slice(-1)[0];
      if(last) out.push(`<span class="tiny-muted">${esc(last)}</span>`);
    }
    if(!out.length) out.push(`<span class="tiny-muted">Payment not captured or missing Razorpay payment ID</span>`);
    return `<div class="refund-detail">${out.join('')}</div>`;
  }
  function action(o) {
    const c=classification(o);
    const view=`<button type="button" class="action-btn" data-act="view" data-id="${esc(o._id)}">View</button>`;
    if(c==='eligible') return `<div class="refund-actions"><button type="button" class="action-btn primary" data-act="refund" data-id="${esc(o._id)}">Issue full refund</button>${view}</div>`;
    return `<div class="refund-actions">${view}</div>`;
  }
  function renderTable() {
    if(!$('#refundBody')) return;
    $('#refundCount').textContent=`${rows.length} ORDERS`;
    $('#refundBody').innerHTML=rows.length ? rows.map(o=>{
      const [color,label]=statusFor(o);
      return `<tr><td><strong>#${esc(o.orderNumber)}</strong><div class="tiny-muted">${esc(fmt(o.createdAt))}</div></td><td>${esc(o.customer?.name)}<div class="tiny-muted">${esc(o.customer?.email)}</div><div class="tiny-muted">${esc(o.customer?.phone)}</div></td><td><span class="refund-id">${esc(o.razorpayPaymentId || '—')}</span></td><td class="mono">${money(o.total)}</td><td><span class="status ${color}">${label}</span></td><td>${details(o)}</td><td>${action(o)}</td></tr>`;
    }).join('') : `<tr><td colspan="7" style="color:#666">No orders match this refund view.</td></tr>`;
  }
  function openModal(o) {
    let modal=$('#sgRefundModal'); if(!modal){modal=document.createElement('div');modal.id='sgRefundModal';modal.className='modal';document.body.appendChild(modal);}
    const remaining=Number(o.total)||0;
    modal.innerHTML=`<div class="modal-panel" style="width:min(560px,96vw)"><div class="modal-head"><div><div class="page-kicker">Refund order #${esc(o.orderNumber)}</div><h3>Issue full refund</h3></div><button type="button" class="close" data-close>×</button></div><form id="sgRefundForm" class="form-grid" novalidate><div class="field full"><div class="notice" style="margin-top:0">This will refund <strong>${esc(money(remaining))}</strong> to the customer's original Razorpay payment method. The server will verify the live payment before issuing the refund.</div></div><div class="field"><label>Customer</label><input value="${esc(o.customer?.name)}" disabled></div><div class="field"><label>Payment ID</label><input value="${esc(o.razorpayPaymentId || '')}" disabled></div><div class="field full"><label for="refundReason">Admin note (optional)</label><textarea id="refundReason" maxlength="300" placeholder="Reason for the refund, e.g. customer requested cancellation"></textarea></div><div class="field full"><label><input id="refundConfirm" type="checkbox" required style="width:auto;display:inline-block;margin-right:8px"> I confirm this is the correct order and want to issue the full refund.</label></div><div class="field full" id="refundErr" style="color:#ff6570;font-size:10px;min-height:15px"></div><div class="field full" style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="action-btn" data-close>Cancel</button><button type="submit" class="action-btn primary">Issue refund →</button></div></form></div>`;
    modal.classList.add('open');
    modal.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>modal.classList.remove('open')));
    modal.querySelector('#sgRefundForm').addEventListener('submit',async e=>{
      e.preventDefault(); const err=$('#refundErr'), btn=e.target.querySelector('button[type=submit]'); err.textContent='';
      if(!$('#refundConfirm').checked){err.textContent='Confirm the order before issuing the refund.';return;}
      btn.disabled=true; btn.textContent='Processing…';
      try { await A().api(`/admin/orders/${o._id}/refund`,{method:'POST',body:JSON.stringify({note:$('#refundReason').value.trim()})}); modal.classList.remove('open'); toast(`Refund issued for #${o.orderNumber}`); await refresh(); try{await window.renderOrders?.()}catch{} }
      catch(x){err.textContent=x.message; toast(x.message)} finally{btn.disabled=false;btn.textContent='Issue refund →';}
    });
  }
  function exportCSV(){
    if(!rows.length)return toast('No refund orders to export');
    const q=v=>`"${String(v??'').replaceAll('"','""')}"`;
    const head=['Order','Date','Customer','Email','Payment ID','Refund ID','Amount','Payment status','Fulfilment status','Refunded at'];
    const lines=rows.map(o=>[o.orderNumber,o.createdAt,o.customer?.name,o.customer?.email,o.razorpayPaymentId,o.razorpayRefundId,o.total,o.paymentStatus,o.fulfillmentStatus,o.refundedAt]);
    const csv='\ufeff'+[head,...lines].map(r=>r.map(q).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=`strydegosox-refunds-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0); toast('Refunds exported');
  }
  function wire(){
    if(wired)return; wired=true;
    $('#refundTabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;loadRows().then(renderTabs).catch(x=>toast(x.message));});
    $('#refundSearch').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>loadRows().catch(x=>toast(x.message)),300);});
    $('#refundRefreshBtn').addEventListener('click',()=>refresh().then(()=>toast('Refund data refreshed')));
    $('#refundExportBtn').addEventListener('click',exportCSV);
    $('#refundBody').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const o=rows.find(x=>String(x._id)===String(b.dataset.id));if(!o)return; if(b.dataset.act==='view') return window.viewOrder?.(o._id); if(b.dataset.act==='refund') return openModal(o);});
  }
  window.SGS_REFUNDS={async show(){wire();await refresh();},async refreshBadge(){try{summary=await A().api('/admin/refunds/summary');renderBadge();}catch{}}};
})();
