/* StrydeGoSox — production admin command center */
(() => {
  const API_BASE = (window.SGS_ADMIN_CONFIG && window.SGS_ADMIN_CONFIG.apiBase) || '/api';
  const CART_KEY = 'sg_admin_cart_v1';
  let products = [];
  let orders = [];
  let customers = [];
  let dashboard = null;
  let storeSettings = null;
  let cart = loadCart();
  let liveTimer = null;
  let latestOrderId = null;

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

  function loadCart(){ try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]')}catch{return[]}}
  function saveCart(){localStorage.setItem(CART_KEY,JSON.stringify(cart))}
  function toast(msg){ const el=$('#toastText'), t=$('#toast'); if(!el||!t)return; el.textContent=msg;t.classList.add('show');clearTimeout(window._sgToast);window._sgToast=setTimeout(()=>t.classList.remove('show'),2500); }
  // Admin authentication is kept in the HTTP-only sg_auth cookie.
  // Never persist the JWT in localStorage.
  function token(){return true}
  function authHeaders(){return {}}

  async function api(path, options={}){
    const headers={
      'Content-Type':'application/json',
      ...authHeaders(),
      ...(options.headers||{})
    };

    const res=await fetch(`${API_BASE}${path}`,{
      ...options,
      credentials:'include',
      headers
    });

    let data=null;
    try{
      data=await res.json();
    }catch{}

    if(res.status===401){
      showLogin();
      throw new Error(data?.error||'Admin session expired. Please sign in again.');
    }

    if(!res.ok){
      throw new Error(data?.error||data?.message||'Request failed');
    }

    return data;
  }

  async function logout(){
    const button = $('#adminLogoutBtn');
    if (button) { button.disabled = true; button.textContent = 'Signing out…'; }
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.warn('Admin logout request failed:', e.message);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Sign out'; }
      clearInterval(liveTimer);
      liveTimer = null;
      showLogin();
      toast('Signed out');
    }
  }

  function showLogin(){
    let modal=$('#sgAdminLogin');
    if(!modal){
      modal=document.createElement('div');modal.id='sgAdminLogin';modal.innerHTML=`<div class="sg-login-backdrop"></div><div class="sg-login-panel"><div class="sg-login-mark"></div><div class="page-kicker">StrydeGoSox / Secure Access</div><h1 class="display">Admin<br><span>Command Center.</span></h1><p>Sign in to manage products, inventory, orders and payments.</p><form id="sgLoginForm"><label>Email<input id="sgLoginEmail" type="email" autocomplete="username" required></label><label>Password<input id="sgLoginPassword" type="password" autocomplete="current-password" required></label><button type="submit">Enter dashboard →</button><div id="sgLoginError"></div></form></div>`;document.body.appendChild(modal);
      const style=document.createElement('style');style.textContent=`#sgAdminLogin{position:fixed;inset:0;z-index:9999;display:grid;place-items:center}.sg-login-backdrop{position:absolute;inset:0;background:radial-gradient(circle at 70% 30%,rgba(226,29,43,.18),transparent 40%),rgba(3,3,3,.94);backdrop-filter:blur(12px)}.sg-login-panel{position:relative;width:min(480px,92vw);padding:38px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(145deg,#111215,#0b0c0e);box-shadow:0 35px 120px rgba(0,0,0,.65)}.sg-login-mark{width:38px;height:38px;border:1.5px solid #fff;border-radius:50%;background:conic-gradient(from 220deg,#e21d2b 0 140deg,#080808 140deg 360deg);margin-bottom:25px}.sg-login-panel h1{font-size:52px;margin-top:16px}.sg-login-panel h1 span{color:#e21d2b}.sg-login-panel p{color:#85878c;font-size:12px;line-height:1.7;margin:17px 0 25px}.sg-login-panel form{display:grid;gap:14px}.sg-login-panel label{display:grid;gap:7px;color:#777;font:9px JetBrains Mono,monospace;letter-spacing:.12em;text-transform:uppercase}.sg-login-panel input{background:#08090b;border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;padding:13px;outline:none;font-size:12px}.sg-login-panel input:focus{border-color:#e21d2b}.sg-login-panel button{min-height:50px;border-radius:999px;background:#e21d2b;color:#fff;font:700 10px JetBrains Mono,monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}.sg-login-panel button:disabled{opacity:.6}.sg-login-panel #sgLoginError{min-height:15px;color:#ff6570;font-size:10px}`;document.head.appendChild(style);
      $('#sgLoginForm').addEventListener('submit',login);
    }
    modal.style.display='grid';document.querySelector('.app').style.visibility='hidden';
  }
  async function login(e){e.preventDefault();const btn=e.target.querySelector('button'),err=$('#sgLoginError');btn.disabled=true;err.textContent='';try{const data=await fetch(`${API_BASE}/auth/admin/login`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#sgLoginEmail').value,password:$('#sgLoginPassword').value})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Login failed');return d});$('#sgAdminLogin').style.display='none';document.querySelector('.app').style.visibility='visible';await boot();}catch(x){err.textContent=x.message}finally{btn.disabled=false}}

  function statusClass(s){return ['processing'].includes(s)?'yellow':['shipped'].includes(s)?'blue':['delivered'].includes(s)?'green':['cancelled','refunded'].includes(s)?'red':'yellow'}
  function labelStatus(s){return String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

  function relativeTime(value){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<60)return 'just now';if(seconds<3600)return `${Math.floor(seconds/60)} min ago`;if(seconds<86400)return `${Math.floor(seconds/3600)} hr ago`;return `${Math.floor(seconds/86400)} days ago`}
  function renderLiveActivity(){const target=$('#liveActivity');if(!target)return;const recent=(dashboard?.recent||[]).slice(0,4);target.innerHTML=recent.map(order=>{const paid=order.paymentStatus==='captured';const status=paid?'paid':order.fulfillmentStatus;const title=paid?'Payment captured':`Order ${labelStatus(order.fulfillmentStatus)}`;const icon=paid?'Rs':order.fulfillmentStatus==='cancelled'?'x':'+';return `<div class="activity-item"><div class="activity-icon">${icon}</div><div class="activity-copy"><strong>${escapeHtml(title)}</strong><span>Order #${escapeHtml(order.orderNumber)} - ${relativeTime(order.createdAt)}</span></div><span class="status ${paid?'green':statusClass(order.fulfillmentStatus)}">${escapeHtml(labelStatus(status))}</span></div>`}).join('')||'<div class="activity-item"><div class="activity-copy"><strong>No recent activity</strong><span>New orders will appear here.</span></div></div>'}
  window.SGS_ADMIN_API={api,money,escapeHtml,toast,labelStatus,relativeTime,statusClass};
  window.showView=async function(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));const titles={overview:'Overview',products:'Products',inventory:'Inventory',orders:'Orders',customers:'Customers',store:'Store / Cart',payments:'Payments',cod:'Cash on Delivery',refunds:'Refunds',settings:'Settings'};$('#pageTitle').textContent=titles[id]||'Overview';if(id==='products')await renderProducts();if(id==='inventory')await renderInventory();if(id==='orders')await renderOrders();if(id==='customers')await renderCustomers();if(id==='store')await renderStore();if(id==='cod'&&window.SGS_COD)await window.SGS_COD.show();if(id==='refunds'&&window.SGS_REFUNDS)await window.SGS_REFUNDS.show();window.scrollTo({top:0,behavior:'smooth'})}
  $$('.nav button').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  $('#adminLogoutBtn')?.addEventListener('click', logout);

  async function loadAll(){
    [dashboard,products,orders,customers,storeSettings]=await Promise.all([api('/admin/dashboard'),api('/admin/products'),api('/admin/orders'),api('/admin/customers'),api('/admin/settings')]);
    renderDashboard();await renderProducts();await renderInventory();await renderOrders();await renderCustomers();await renderStore();renderPaymentView();renderStoreSettings();updateCartCount();
  }

  async function liveSync(){
    if(!token()) return;
    try {
      const fresh = await api('/admin/dashboard');
      const incoming = fresh?.recent?.[0]?._id ? String(fresh.recent[0]._id) : null;
      if (latestOrderId && incoming && incoming !== latestOrderId) {
        toast('New order received — dashboard updated');
        if ($('#orderTable') && document.querySelector('#orders.active')) orders = await api('/admin/orders');
      }
      latestOrderId = incoming || latestOrderId;
      dashboard = fresh;
      renderDashboard();
      if (window.SGS_COD) window.SGS_COD.refreshBadge();
      const live = $('#liveStatus');
      if(live){ live.style.opacity='1'; live.innerHTML='<i></i> Live sync'; }
    } catch (e) {
      const live = $('#liveStatus');
      if(live){ live.style.opacity='.55'; live.innerHTML='<i style="background:#e21d2b;box-shadow:none"></i> Reconnecting'; }
    }
  }

  function startLiveSync(){
    clearInterval(liveTimer);
    liveTimer = setInterval(liveSync, 15000);
    setTimeout(liveSync, 2500);
  }
  function renderDashboard(){
    if(!dashboard)return;
    renderLiveActivity();
    $('#salesStat').textContent=money(dashboard.sales);$('#ordersStat').textContent=dashboard.orders.toLocaleString('en-IN');$('#stockStat').textContent=dashboard.units.toLocaleString('en-IN');
    const low=$$('#overview .stat-card')[2]?.querySelector('.stat-change');if(low)low.textContent=`● ${dashboard.lowStock} items low stock`;
    const days=[];for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*86400000);days.push(d.toISOString().slice(0,10))}const map=new Map((dashboard.daily||[]).map(x=>[x._id,x.total]));const vals=days.map(d=>map.get(d)||0);const max=Math.max(...vals,1);
    $('#salesChart').innerHTML=vals.map((v,i)=>`<div class="bar-wrap"><div style="width:100%;height:100%;display:flex;align-items:end"><div class="bar" style="height:${Math.max(4,v/max*100)}%"></div></div><div class="bar-label">${new Date(days[i]).toLocaleDateString('en-IN',{weekday:'short'}).toUpperCase()}</div></div>`).join('');
    $('#recentOrders').innerHTML=(dashboard.recent||[]).slice(0,6).map(o=>`<tr><td><strong>#${escapeHtml(o.orderNumber)}</strong></td><td>${escapeHtml(o.customer?.name)}</td><td>${o.items?.map(i=>`${i.quantity} × ${escapeHtml(i.name)}`).join(', ')}</td><td>${money(o.total)}</td><td>${escapeHtml(o.paymentMethod)}</td><td><span class="status ${o.paymentStatus==='captured'?'green':statusClass(o.fulfillmentStatus)}">${labelStatus(o.paymentStatus==='captured'?'paid':o.fulfillmentStatus)}</span></td></tr>`).join('')||'<tr><td colspan="6" style="color:#666">No orders yet.</td></tr>';
  }

  window.renderProducts=async function(){
    if(!products.length)products=await api('/admin/products');const q=($('#productSearch')?.value||'').toLowerCase(),f=$('#productFilter')?.value||'all';const rows=products.filter(p=>(f==='all'||p.status===f)&&`${p.name} ${p.sku}`.toLowerCase().includes(q));$('#productCount').textContent=`${rows.length} PRODUCTS`;
    $('#productTable').innerHTML=rows.map(p=>`<tr><td><div class="product-cell"><div class="thumb"><img src="${escapeHtml(p.image)}" onerror="this.style.display='none'"></div><div><strong>${escapeHtml(p.name)}</strong><div class="tiny-muted">${escapeHtml(p.description)}</div></div></div></td><td class="mono">${escapeHtml(p.sku)}</td><td class="mono">${money(p.price)}<div class="tiny-muted">${p.compareAtPrice?money(p.compareAtPrice):''}</div></td><td class="mono ${p.stock-p.reserved<=p.reorderPoint?'low':''}">${p.stock-p.reserved}</td><td><span class="status ${p.status==='active'?'green':'yellow'}">${p.status}</span></td><td><button class="action-btn" onclick="editProduct('${p._id}')">Edit</button> <button class="action-btn" onclick="deleteProduct('${p._id}')">Remove</button></td></tr>`).join('')||'<tr><td colspan="6" style="color:#666">No products found.</td></tr>';
  }
  window.renderInventory=async function(){
    if(!products.length)products=await api('/admin/products');const total=products.reduce((a,p)=>a+p.stock,0),low=products.filter(p=>p.stock-p.reserved<=p.reorderPoint&&p.status==='active').length,out=products.filter(p=>p.stock-p.reserved<=0&&p.status==='active').length,value=products.reduce((a,p)=>a+p.stock*p.price,0);$('#inventoryTotal').textContent=total.toLocaleString('en-IN');const cards=$$('#inventory .stat-card');if(cards[1])cards[1].querySelector('.stat-value').textContent=low;if(cards[2])cards[2].querySelector('.stat-value').textContent=out;if(cards[3])cards[3].querySelector('.stat-value').textContent=money(value);
    $('#inventoryTable').innerHTML=products.map(p=>{const available=p.stock-p.reserved;return `<tr><td><strong>${escapeHtml(p.name)}</strong><div class="tiny-muted">${escapeHtml(p.sku)}</div></td><td class="mono ${available<=p.reorderPoint?'low':''}">${available}</td><td class="mono">${p.reorderPoint}</td><td><span class="status ${available<=0?'red':available<=p.reorderPoint?'yellow':'green'}">${available<=0?'Out':available<=p.reorderPoint?'Low':'Healthy'}</span></td><td><button class="action-btn" onclick="adjustStock('${p._id}',-1)">−</button> <button class="action-btn" onclick="adjustStock('${p._id}',1)">+</button> <button class="action-btn" onclick="adjustStock('${p._id}',10)">+10</button></td></tr>`}).join('');
  }
  window.renderOrders=async function(){
    const q=($('#orderSearch')?.value||'').trim();const f=$('#orderFilter')?.value||'all';orders=await api(`/admin/orders?${new URLSearchParams({q,status:f==='all'?'':f})}`);$('#orderCount').textContent=`${orders.length} ORDERS`;
    $('#orderTable').innerHTML=orders.map(o=>`<tr><td><strong>#${escapeHtml(o.orderNumber)}</strong><div class="tiny-muted">${new Date(o.createdAt).toLocaleString('en-IN')}</div></td><td>${escapeHtml(o.customer?.name)}<div class="tiny-muted">${escapeHtml(o.customer?.email)}</div></td><td>${o.items?.map(i=>`${i.quantity} × ${escapeHtml(i.name)}`).join(', ')}</td><td class="mono">${money(o.total)}</td><td><span class="status ${o.paymentStatus==='captured'?'green':o.paymentStatus==='failed'?'red':'yellow'}">${labelStatus(o.paymentStatus)}</span><div class="tiny-muted">${escapeHtml(o.paymentMethod)}</div></td><td><span class="status ${statusClass(o.fulfillmentStatus)}">${labelStatus(o.fulfillmentStatus)}</span></td><td><button class="action-btn" onclick="viewOrder('${o._id}')">View</button> <button class="action-btn" onclick="downloadInvoice('${o._id}')">Invoice ↓</button> <select class="select" style="padding:7px" onchange="updateOrderStatus('${o._id}',this.value)"><option value="">Update</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select>${o.paymentMethod==='razorpay'&&o.paymentStatus==='captured'?` <button class="action-btn" onclick="refundOrder('${o._id}')">Refund</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7" style="color:#666">No orders found.</td></tr>';
  }
  window.exportOrdersCSV=function(){
    if(!orders.length)return toast('No orders to export');
    const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
    const rows=[['Order','Date','Customer','Email','Phone','Address','City','PIN','Products','Subtotal','Shipping','Tax','Total','Payment Method','Payment Status','Fulfilment Status'],...orders.map(o=>[o.orderNumber,new Date(o.createdAt).toISOString(),o.customer?.name,o.customer?.email,o.customer?.phone,o.shipping?.address,o.shipping?.city,o.shipping?.pin,(o.items||[]).map(i=>`${i.quantity} x ${i.name}`).join(' | '),o.subtotal,o.shippingFee,o.tax,o.total,o.paymentMethod,o.paymentStatus,o.fulfillmentStatus])];
    const blob=new Blob([rows.map(r=>r.map(esc).join(',')).join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`strydegosox-orders-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);toast('Orders exported');
  }

  window.exportProductsCSV=function(){
    if(!products.length)return toast('No products to export');
    const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
    const rows=[['Name','SKU','Description','Price','Compare-at Price','Stock','Reserved','Available','Reorder Point','Status'],...products.map(p=>[p.name,p.sku,p.description,p.price,p.compareAtPrice,p.stock,p.reserved,p.stock-p.reserved,p.reorderPoint,p.status])];
    const blob=new Blob([rows.map(r=>r.map(esc).join(',')).join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`strydegosox-products-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);toast('Products exported');
  }

  window.exportCustomersCSV=async function(){
    if(!customers.length){try{customers=await api('/admin/customers')}catch(e){return toast(e.message)}}
    if(!customers.length)return toast('No customers to export');
    const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
    const rows=[['Name','Email','Phone','Orders','Total Spent','Last Order'],...customers.map(c=>[c.name,c._id,c.phone,c.orders,c.spent,new Date(c.lastOrder).toISOString()])];
    const blob=new Blob([rows.map(r=>r.map(esc).join(',')).join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`strydegosox-customers-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);toast('Customers exported');
  }

  window.downloadInvoice=async function(id){
    let o=orders.find(x=>String(x._id)===String(id));
    if(!o){try{const list=await api('/admin/orders');o=list.find(x=>String(x._id)===String(id))}catch(e){return toast(e.message)}}
    if(!o)return toast('Order not found');

    const rowsHtml=(o.items||[]).map(i=>`<tr><td>${escapeHtml(i.name)}<div class="sku">${escapeHtml(i.sku||'')}</div></td><td class="c">${i.quantity}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${money(i.lineTotal)}</td></tr>`).join('');
    const paymentLabel=o.paymentMethod==='cod'?'Cash on Delivery':'Razorpay';
    const paidBadge=o.paymentStatus==='captured'?'PAID':o.paymentMethod==='cod'?'DUE ON DELIVERY':labelStatus(o.paymentStatus).toUpperCase();
    const issued=new Date(o.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    const gstin=(window.SGS_ADMIN_CONFIG&&window.SGS_ADMIN_CONFIG.gstin)||'';
    const generated=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${escapeHtml(o.orderNumber)} — StrydeGoSox</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111;padding:48px;max-width:820px;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #e21d2b;padding-bottom:22px;margin-bottom:30px}
  .brand{display:flex;align-items:center;gap:12px}
  .mark{width:34px;height:34px;border-radius:50%;border:1.5px solid #111;background:conic-gradient(from 220deg,#e21d2b 0 140deg,#111 140deg 360deg)}
  .brand strong{font-size:20px;letter-spacing:.02em}
  .brand strong span{color:#e21d2b}
  .gstin{font:600 11px 'Courier New',monospace;color:#444;margin-top:6px;letter-spacing:.04em}
  .head-right{text-align:right}
  .head-right h1{font-size:22px;letter-spacing:.06em;color:#111}
  .head-right .num{font:600 13px 'Courier New',monospace;color:#e21d2b;margin-top:6px}
  .meta{display:flex;justify-content:space-between;gap:30px;margin-bottom:30px}
  .meta .block h4{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:8px}
  .meta .block p{font-size:13px;line-height:1.6}
  .badge{display:inline-block;padding:5px 12px;border-radius:999px;font:700 10px 'Courier New',monospace;letter-spacing:.08em;margin-top:8px}
  .badge.paid{background:#e7f9f0;color:#1c9d5e}
  .badge.due{background:#fff4e0;color:#a8710a}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{text-align:left;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#888;padding:10px 8px;border-bottom:2px solid #111}
  td{padding:12px 8px;font-size:13px;border-bottom:1px solid #eee;vertical-align:top}
  td .sku{font-size:10px;color:#999;margin-top:3px;font-family:'Courier New',monospace}
  .c{text-align:center}.r{text-align:right}
  .totals{width:280px;margin-left:auto;margin-bottom:36px}
  .totals .row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#555}
  .totals .row.total{border-top:2px solid #111;margin-top:6px;padding-top:12px;font-size:17px;font-weight:700;color:#111}
  .foot{border-top:1px solid #eee;padding-top:20px;font-size:11px;color:#999;line-height:1.7}
  @media print{body{padding:0 12px}}
</style></head>
<body>
  <div class="head">
    <div><div class="brand"><div class="mark"></div><strong>STRYDE<span>GO</span>SOX</strong></div><div class="gstin">GSTIN: ${escapeHtml(gstin)}</div></div>
    <div class="head-right"><h1>INVOICE</h1><div class="num">#${escapeHtml(o.orderNumber)}</div></div>
  </div>
  <div class="meta">
    <div class="block">
      <h4>Billed &amp; shipped to</h4>
      <p><strong>${escapeHtml(o.customer?.name)}</strong><br>${escapeHtml(o.customer?.email)}<br>${escapeHtml(o.customer?.phone)}<br>${escapeHtml(o.shipping?.address)}<br>${escapeHtml(o.shipping?.city)} — ${escapeHtml(o.shipping?.pin)}</p>
    </div>
    <div class="block" style="text-align:right">
      <h4>Order details</h4>
      <p>Date issued: ${issued}<br>Payment method: ${escapeHtml(paymentLabel)}<br>Fulfilment: ${escapeHtml(labelStatus(o.fulfillmentStatus))}</p>
      <div class="badge ${o.paymentStatus==='captured'?'paid':'due'}">${escapeHtml(paidBadge)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
    <div class="row"><span>Shipping</span><span>${o.shippingFee?money(o.shippingFee):'FREE'}</span></div>
    ${o.tax?`<div class="row"><span>Tax</span><span>${money(o.tax)}</span></div>`:''}
    <div class="row total"><span>Total</span><span>${money(o.total)}</span></div>
  </div>
  <div class="foot">StrydeGoSox · GSTIN: ${escapeHtml(gstin)}<br>Thank you for shopping with StrydeGoSox.<br>This invoice was generated on ${generated}. For questions about this order, reply with order number ${escapeHtml(o.orderNumber)}.</div>
</body></html>`;

    const win=window.open('','_blank');
    if(!win){toast('Allow pop-ups to download the invoice');return}
    win.document.open();win.document.write(html);win.document.close();
    setTimeout(()=>{try{win.focus();win.print()}catch(e){}},400);
  };

  window.renderCustomers=async function(){customers=await api('/admin/customers');const stats=$$('#customers .stat-card');if(stats[0])stats[0].querySelector('.stat-value').textContent=customers.length.toLocaleString('en-IN');const totalSpent=customers.reduce((a,c)=>a+c.spent,0),totalOrders=customers.reduce((a,c)=>a+c.orders,0);if(stats[2])stats[2].querySelector('.stat-value').textContent=money(totalOrders?totalSpent/totalOrders:0);if(stats[3])stats[3].querySelector('.stat-value').textContent=money(customers.length?totalSpent/customers.length:0);const tbody=$('#customers tbody');if(tbody)tbody.innerHTML=customers.map(c=>`<tr><td><strong>${escapeHtml(c.name)}</strong><div class="tiny-muted">${escapeHtml(c._id)}</div></td><td>${c.orders}</td><td>${money(c.spent)}</td><td>${new Date(c.lastOrder).toLocaleDateString('en-IN')}</td><td><span class="status ${c.orders>3?'green':c.orders>1?'blue':'yellow'}">${c.orders>3?'Loyal':c.orders>1?'Returning':'New'}</span></td></tr>`).join('')||'<tr><td colspan="5" style="color:#666">No customers yet.</td></tr>'}

  window.openProductModal=function(){ $('#productModalTitle').textContent='Add product';$('#productForm').reset();$('#productId').value='';$('#productImage').value='assets/tin-closed.png';$('#productModal').classList.add('open') }
  window.editProduct=function(id){const p=products.find(x=>String(x._id)===String(id));if(!p)return;$('#productModalTitle').textContent='Edit product';$('#productId').value=p._id;$('#productName').value=p.name;$('#productSku').value=p.sku;$('#productPrice').value=p.price;$('#productCompare').value=p.compareAtPrice||'';$('#productQty').value=p.stock;$('#productReorder').value=p.reorderPoint;$('#productStatus').value=p.status;$('#productImage').value=p.image||'';$('#productDescription').value=p.description||'';$('#productModal').classList.add('open')}
  window.closeModal=function(id){$('#'+id)?.classList.remove('open')}
  window.deleteProduct=async function(id){const p=products.find(x=>String(x._id)===String(id));if(!p||!confirm(`Archive ${p.name}?`))return;try{await api(`/admin/products/${id}`,{method:'DELETE'});toast('Product archived');products=await api('/admin/products');await renderProducts();await renderInventory();await renderStore()}catch(e){toast(e.message)}}
  window.adjustStock=async function(id,delta){try{await api(`/admin/inventory/${id}`,{method:'PATCH',body:JSON.stringify({delta})});products=await api('/admin/products');await renderInventory();await renderProducts();toast('Inventory updated')}catch(e){toast(e.message)}}
  $('#productForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#productId').value;const body={name:$('#productName').value.trim(),sku:$('#productSku').value.trim(),price:Number($('#productPrice').value),compareAtPrice:Number($('#productCompare').value||0),stock:Number($('#productQty').value),reorderPoint:Number($('#productReorder').value),status:$('#productStatus').value,image:$('#productImage').value.trim(),description:$('#productDescription').value.trim()};try{await api(id?`/admin/products/${id}`:'/admin/products',{method:id?'PATCH':'POST',body:JSON.stringify(body)});closeModal('productModal');products=await api('/admin/products');await renderProducts();await renderInventory();await renderStore();toast(id?'Product updated':'Product added')}catch(x){toast(x.message)}});

  window.viewOrder=async function(id){const o=orders.find(x=>String(x._id)===String(id))||await api(`/admin/orders`).then(list=>list.find(x=>String(x._id)===String(id)));if(!o)return;let modal=$('#sgOrderDetail');if(!modal){modal=document.createElement('div');modal.id='sgOrderDetail';modal.className='modal';document.body.appendChild(modal)}modal.classList.add('open');modal.innerHTML=`<div class="modal-panel"><div class="modal-head"><div><div class="page-kicker">Order detail</div><h3>#${escapeHtml(o.orderNumber)}</h3></div><div style="display:flex;gap:8px;align-items:center"><button class="action-btn primary" onclick="downloadInvoice('${o._id}')">Invoice ↓</button><button class="close" onclick="closeModal('sgOrderDetail')">×</button></div></div><div class="card" style="padding:15px;margin-bottom:12px"><strong>${escapeHtml(o.customer.name)}</strong><div class="tiny-muted">${escapeHtml(o.customer.email)} · ${escapeHtml(o.customer.phone)}</div><div class="tiny-muted" style="margin-top:8px">${escapeHtml(o.shipping.address)}, ${escapeHtml(o.shipping.city)} — ${escapeHtml(o.shipping.pin)}</div></div><div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${o.items.map(i=>`<tr><td>${escapeHtml(i.name)}<div class="tiny-muted">${escapeHtml(i.sku)}</div></td><td>${i.quantity}</td><td>${money(i.unitPrice)}</td><td>${money(i.lineTotal)}</td></tr>`).join('')}</tbody></table></div><div class="summary"><div class="sum-row"><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div class="sum-row"><span>Shipping</span><strong>${o.shippingFee?money(o.shippingFee):'FREE'}</strong></div><div class="sum-row total"><span>Total</span><strong>${money(o.total)}</strong></div></div></div>`}
window.updateOrderStatus = async function(
  id,
  status
) {

  if (!status) {
    return;
  }


  try {

    const body = {
      status
    };


    /*
     * When the admin marks an order as shipped,
     * ask for the courier tracking information.
     */

    if (status === 'shipped') {

      const trackingNumber =
        prompt(
          'Enter the courier tracking number:'
        );


      if (
        trackingNumber === null
      ) {
        return;
      }


      body.trackingNumber =
        trackingNumber.trim();


      const trackingUrl =
        prompt(
          'Enter the tracking URL (optional):'
        );


      if (
        trackingUrl !== null
      ) {

        body.trackingUrl =
          trackingUrl.trim();

      }

    }


    await api(
      `/admin/orders/${id}/status`,
      {
        method: 'PATCH',

        body:
          JSON.stringify(body)
      }
    );


    if (
      status === 'processing'
    ) {

      toast(
        'Order confirmed — customer email sent.'
      );

    }
    else if (
      status === 'shipped'
    ) {

      toast(
        'Order dispatched — tracking email sent.'
      );

    }
    else if (
      status === 'delivered'
    ) {

      toast(
        'Order delivered — customer email sent.'
      );

    }
    else {

      toast(
        'Order status updated'
      );

    }


    await renderOrders();

    await loadAll();


  } catch (e) {

    toast(
      e.message
    );

  }

};
  window.refundOrder=async function(id){if(!confirm('Issue a full Razorpay refund for this order?'))return;try{await api(`/admin/orders/${id}/refund`,{method:'POST'});toast('Refund issued successfully');await renderOrders();await loadAll()}catch(e){toast(e.message)}}

  function updateCartCount(){const n=cart.reduce((a,i)=>a+i.qty,0);if($('#cartCount'))$('#cartCount').textContent=n;if($('#storeCartCount'))$('#storeCartCount').textContent=n}
  window.addToCart=function(id){const p=products.find(x=>String(x._id)===String(id));if(!p)return;if((p.stock-p.reserved)<1)return toast('Out of stock');const i=cart.find(x=>x.id===id);if(i){if(i.qty>=p.stock-p.reserved)return toast('Stock limit reached');i.qty++}else cart.push({id,qty:1});saveCart();updateCartCount();toast('Added to admin cart')}
  window.changeCart=function(id,d){const i=cart.find(x=>String(x.id)===String(id));if(!i)return;i.qty+=d;if(i.qty<=0)cart=cart.filter(x=>String(x.id)!==String(id));saveCart();renderCart()}
  window.openCart=function(){renderCart();$('#cartDrawer').classList.add('open')};window.closeCart=function(){$('#cartDrawer').classList.remove('open')};
  function renderCart(){const el=$('#cartItems'),summary=$('#cartSummary');if(!el||!summary)return;if(!cart.length){el.innerHTML='<div style="padding:50px 0;text-align:center;color:#666;font-size:11px">Your cart is empty.</div>';summary.innerHTML='';return}el.innerHTML=cart.map(i=>{const p=products.find(x=>String(x._id)===String(i.id));return p?`<div class="cart-item"><div class="thumb"><img src="${escapeHtml(p.image)}"></div><div class="cart-info"><strong>${escapeHtml(p.name)}</strong><div class="tiny-muted">${money(p.price)} each</div><div class="qty"><button onclick="changeCart('${p._id}',-1)">−</button><span>${i.qty}</span><button onclick="changeCart('${p._id}',1)">+</button></div></div><div class="cart-price">${money(p.price*i.qty)}</div></div>`:''}).join('');const subtotal=cart.reduce((a,i)=>{const p=products.find(x=>String(x._id)===String(i.id));return a+(p?p.price*i.qty:0)},0);const shipping=subtotal>=1999?0:99;summary.innerHTML=`<div class="sum-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div class="sum-row"><span>Shipping</span><strong>${shipping?money(shipping):'FREE'}</strong></div><div class="sum-row total"><span>Total</span><strong>${money(subtotal+shipping)}</strong></div>`}
  window.openCheckout=function(){if(!cart.length)return toast('Admin cart is empty');toast('Use the storefront for customer checkout testing');}
  async function renderStore(){if(!products.length)products=await api('/admin/products');$('#storeProducts').innerHTML=products.filter(p=>p.status==='active').map(p=>`<div class="card"><div class="thumb" style="width:100%;height:180px;margin-bottom:15px"><img src="${escapeHtml(p.image)}"></div><div style="font-size:12px;font-weight:800">${escapeHtml(p.name)}</div><div class="tiny-muted">${escapeHtml(p.description)}</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><strong class="mono">${money(p.price)}</strong><button class="action-btn primary" onclick="addToCart('${p._id}')">Add to cart</button></div></div>`).join('');updateCartCount()}
  function renderPaymentView(){const payments=dashboard?.payments||{},stats=$$('#payments .stat-card');if(stats[0])stats[0].querySelector('.stat-value').textContent=money(payments.captured||0);if(stats[1])stats[1].querySelector('.stat-value').textContent=money((payments.pending||0)+(payments.authorized||0));if(stats[2])stats[2].querySelector('.stat-value').textContent=money(payments.refunded||0);const text=$$('#payments .activity-item');if(text[1])text[1].querySelector('.status').textContent='Connected';if(text[1])text[1].querySelector('.status').className='status green';if(text[2])text[2].querySelector('.status').textContent='Server verified';if(text[2])text[2].querySelector('.status').className='status green';if(text[3])text[3].querySelector('.status').textContent='Configured after deploy';}
  function renderStoreSettings(){const fee=$('#shippingFee');if(fee&&storeSettings)fee.value=storeSettings.shippingFee;}
  window.saveStoreSettings=async function(){const fee=Number($('#shippingFee')?.value);if(!Number.isFinite(fee)||fee<0)return toast('Enter a valid delivery fee');try{storeSettings=await api('/admin/settings',{method:'PATCH',body:JSON.stringify({shippingFee:fee})});renderStoreSettings();toast('Delivery fee saved')}catch(e){toast(e.message)}}

  function patchStaticUI(){const viewStore=$('.top-actions .top-btn');if(viewStore){viewStore.textContent='View Store ↗';viewStore.onclick=()=>{window.location.href=(window.SGS_ADMIN_CONFIG&&window.SGS_ADMIN_CONFIG.storefrontUrl)||'../frontend/index.html'}}const avatar=$('.avatar');if(avatar)avatar.title='Admin';}
  async function boot(){patchStaticUI();try{await loadAll(); if(window.SGS_COD)window.SGS_COD.refreshBadge();if(window.SGS_REFUNDS)window.SGS_REFUNDS.refreshBadge(); latestOrderId = dashboard?.recent?.[0]?._id ? String(dashboard.recent[0]._id) : null; startLiveSync();}catch(e){console.error(e);toast(e.message)}}
  document.addEventListener('DOMContentLoaded',async()=>{
    const app=document.querySelector('.app');

    if(app){
      app.style.visibility='hidden';
    }

    /*
     * The admin session comes from the secure sg_auth HTTP-only cookie.
     * The dashboard deliberately does not persist an admin JWT in browser
     * storage. This also lets admin.html be opened directly after login.
     */
    try{
      await api('/admin/me');

      if(app){
        app.style.visibility='visible';
      }

      await boot();

    }catch(error){

      console.error('Admin bootstrap failed:',error);

      if(app){
        app.style.visibility='hidden';
      }

      showLogin();
    }
  });
})();
