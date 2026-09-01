import { api } from './api.js';

function parseMoney(v){ const s=String(v).trim(); return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s); }
function canEdit(f,c){ return f.status!=='CANCELADO' && !(f.status==='PAGO'&&c.startsWith('valor_')) && !(c==='valor_adiantamento'&&f.forma_pagamento!=='ADIANTAMENTO_SALDO'); }

export function wireInlineFrete({ state, renderTable, loadAll, showErrorBanner }) {
  const tbody=document.getElementById('ftTbody'); if(!tbody||tbody.dataset.inlineWired)return; tbody.dataset.inlineWired='1';
  tbody.addEventListener('click',ev=>{
    const cell=ev.target.closest('[data-inline-field]'); if(!cell||cell.querySelector('input'))return;
    ev.preventDefault(); ev.stopPropagation(); const f=state.items.find(x=>x.id===cell.closest('tr').dataset.freteId); const field=cell.dataset.inlineField;
    if(!f||!canEdit(f,field))return;
    const old=field==='data'?String(f.data).slice(0,10):f[field]??''; const input=document.createElement('input'); input.className='ft-inline-input'; input.type=field==='data'?'date':'text'; input.inputMode=field.startsWith('valor_')?'decimal':'text'; input.value=old; cell.replaceChildren(input); input.focus(); input.select(); let done=false;
    const finish=async save=>{ if(done)return; done=true; if(!save){renderTable();return;} let value=input.value.trim(); if(field.startsWith('valor_'))value=parseMoney(value); if((field.startsWith('valor_')&&!Number.isFinite(value))||value===''){showErrorBanner('Valor inválido.');renderTable();return;} if(field==='valor_total'&&value<Number(f.valor_pago||0)){showErrorBanner(`Já foram baixados R$ ${Number(f.valor_pago).toLocaleString('pt-BR',{minimumFractionDigits:2})} nesse frete.`);renderTable();return;} try{await api.patch(`/api/fretes-terceiros/${f.id}`,{[field]:value});await loadAll();}catch(e){showErrorBanner(e.message);renderTable();}};
    input.onkeydown=e=>{if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false);}; input.onblur=()=>finish(true);
  },true);
}
