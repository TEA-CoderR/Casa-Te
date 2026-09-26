'use strict';
const $=id=>document.getElementById(id);
const labels={awaiting_payment:'In attesa di pagamento',paid:'Pagato',preparing:'In preparazione',ready_for_pickup:'Pronto al ritiro',shipped:'Spedito',completed:'Completato',cancelled:'Annullato'};
const errors={VERSION_CONFLICT:'Ordine aggiornato da un altro operatore. Ricarica e riprova.',FORBIDDEN:'Operazione non autorizzata.',INVALID_CREDENTIALS:'Email o password non corretti.',RATE_LIMITED:'Troppi tentativi. Riprova tra 15 minuti.',UNAUTHENTICATED:'Sessione scaduta. Accedi nuovamente.'};
let token='',records=[],timer=null,loading=false;
function notify(message){$('notice').textContent=message;}
async function api(path,method='GET',value){
  const response=await fetch('/v2'+path,{method,headers:{Authorization:'Bearer '+token,...(value?{'Content-Type':'application/json'}:{})},body:value?JSON.stringify(value):undefined,signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok){if(response.status===401 && token)reset();throw new Error(errors[data.error]||'Operazione non riuscita. Riprova.');}return data;
}
function reset(){token='';records=[];clearInterval(timer);$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('orders').replaceChildren();$('detail').close();}
function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
function details(order){
  $('detail-content').replaceChildren(text('p',order.id),text('p',`Negozio: ${order.quote.storeId}`));
  for(const line of order.quote.lines)$('detail-content').append(text('p',`${line.quantity} × ${line.name} (${line.sku}) · ${money(line.unitPriceCents)}`));
  $('detail-content').append(text('p',`Articoli: ${money(order.quote.subtotalCents)} · Spedizione: ${money(order.quote.shippingCents)} · Totale: ${money(order.quote.totalCents)}`));$('detail').showModal();
}
const money=cents=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(cents/100);
function render(){
  $('orders').replaceChildren();const list=records.filter(o=>!$('filter').value||o.status===$('filter').value);$('empty').hidden=list.length>0;
  for(const o of list){
    const row=document.createElement('tr'),id=document.createElement('td'),link=text('button',o.id.slice(0,8).toUpperCase());link.addEventListener('click',()=>details(o));id.append(link,text('small',new Date(o.createdAt).toLocaleString('it-IT')));row.append(id);
    row.append(text('td',o.quote.storeId),text('td',o.quote.fulfilment==='store'?'Ritiro in negozio':'Domicilio'),text('td',money(o.quote.totalCents)));
    const state=document.createElement('td');state.append(text('span',labels[o.status],'status'));row.append(state);
    const action=document.createElement('td');
    const next={paid:['preparing','Avvia preparazione'],preparing:[o.quote.fulfilment==='store'?'ready_for_pickup':'shipped',o.quote.fulfilment==='store'?'Pronto al ritiro':'Conferma spedizione'],ready_for_pickup:['completed','Conferma ritiro']}[o.status];
    if(next){const b=text('button',next[1]);b.addEventListener('click',async()=>{if(!confirm(`Confermare: ${next[1]}?`))return;b.disabled=true;try{await api('/orders/'+o.id+'/status','PATCH',{version:o.version,status:next[0]});notify('');await load();}catch(e){notify(e.message);b.disabled=false;}});action.append(b);}else action.textContent='—';row.append(action);$('orders').append(row);
  }
}
async function load(){if(loading||!token)return;loading=true;try{records=(await api('/orders')).orders;render();$('updated').textContent='Ultimo aggiornamento: '+new Date().toLocaleTimeString('it-IT');}catch(e){notify(e.message);}finally{loading=false;}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const result=await api('/auth/login','POST',{email:$('email').value,password:$('password').value});if(result.account.role!=='operator'){token=result.token;await api('/auth/logout','POST',{});token='';throw new Error('Account non abilitato alle operazioni.');}token=result.token;$('password').value='';$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;notify('');await load();timer=setInterval(load,5000);}catch(e){notify(e.message);}finally{b.disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await api('/auth/logout','POST',{});reset();notify('');}catch(e){notify(e.message);}});
$('filter').addEventListener('change',render);$('refresh').addEventListener('click',load);$('close-detail').addEventListener('click',()=>$('detail').close());
