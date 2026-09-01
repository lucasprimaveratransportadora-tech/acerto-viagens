const CAMPOS=['data','empresa_pagadora','motorista','valor_total','valor_adiantamento'];
function podeEditar(f,c){ return Boolean(f&&CAMPOS.includes(c)&&f.status!=='CANCELADO'&&!(f.status==='PAGO'&&c.startsWith('valor_'))&&!(c==='valor_adiantamento'&&f.forma_pagamento!=='ADIANTAMENTO_SALDO')); }
function numero(v){ const s=String(v).trim(); const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s; return Number(normalized); }
function brl(n){ return Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function validarEdicao(f,c,v){
  if(!podeEditar(f,c)) return {ok:false,erro:'Campo bloqueado para este frete.'};
  if(['motorista','empresa_pagadora'].includes(c)){ const x=String(v).trim(); return x?{ok:true,patch:{[c]:x}}:{ok:false,erro:'Campo não pode ficar vazio.'}; }
  if(c==='data') return /^\d{4}-\d{2}-\d{2}$/.test(v)?{ok:true,patch:{data:v}}:{ok:false,erro:'Data inválida.'};
  const n=numero(v); if(!Number.isFinite(n)||n<0||(c==='valor_total'&&n<=0)) return {ok:false,erro:'Valor inválido.'};
  if(c==='valor_total'&&n<Number(f.valor_pago||0)) return {ok:false,erro:`Já foram baixados R$ ${brl(f.valor_pago)} nesse frete.`};
  if(c==='valor_adiantamento'&&n>Number(f.valor_total)) return {ok:false,erro:'Adiantamento não pode superar o total.'};
  return {ok:true,patch:{[c]:n}};
}
module.exports={podeEditar,validarEdicao};
