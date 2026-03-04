import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

const SB  = 'https://fjvomoxzeyheyvxwwkyf.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdm9tb3h6ZXloZXl2eHd3a3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NTk5NjcsImV4cCI6MjA4ODEzNTk2N30.6LWSBToqzXm162QoNSpw52y8YUcHZLy_4dlkzEGvPmw';

const NAVY='#0F2744',GOLD='#C9A84C',GRN='#1A6B2A',RED='#B0291E',YLW='#B8860B';

async function req(path,opts={},tok=null){
  const res=await fetch(SB+path,{...opts,headers:{'apikey':KEY,'Content-Type':'application/json',...(tok&&{'Authorization':'Bearer '+tok}),...opts.headers}});
  const txt=await res.text();
  return{ok:res.ok,status:res.status,data:txt?JSON.parse(txt):{}};
}
const login  =(e,p)=>req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:e,password:p})});
const signup =(e,p,d)=>req('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:e,password:p,data:d})});
const getAll =(t,tok)=>req(`/rest/v1/${t}?select=*&order=created_at.asc`,{},tok);
const ins    =(t,tok,b)=>req(`/rest/v1/${t}`,{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(b)},tok);
const upd    =(t,tok,id,b)=>req(`/rest/v1/${t}?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(b)},tok);
const del    =(t,tok,id)=>req(`/rest/v1/${t}?id=eq.${id}`,{method:'DELETE'},tok);
function calc(p,ft){
  const cdu=+p.direct_cost||0,vol=Math.max(+p.monthly_volume||1,1),cfu=ft/vol;
  const cvp=((+p.tax_pct||0)+(+p.commission_pct||0)+(+p.card_fee_pct||0)+(+p.default_rate_pct||0)+(+p.other_cv_pct||0))/100;
  const ml=(+p.desired_margin||0)/100,base=cdu+cfu,dn=1-cvp-ml;
  const pMin=cvp<1?base/(1-cvp):0,pIdeal=dn>0?base/dn:0;
  const pv=+p.current_price>0?+p.current_price:pIdeal;
  const mcU=pv-cdu-pv*cvp,mcP=pv>0?(mcU/pv)*100:0,pe=mcP>0?ft/(mcP/100):0;
  let sem='none';
  if(+p.current_price>0) sem=+p.current_price<pMin?'red':+p.current_price>=pIdeal?'green':'yellow';
  return{cdu,cfu,cvp:cvp*100,base,pMin,pIdeal,mkp:dn>0?1/dn:0,mcU,mcP,pe,sem};
}

const fN=(v,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fR=v=>'R$ '+fN(v);
const fP=v=>fN(v,1)+'%';
const SEM={
  green:{c:GRN,bg:'#EAFAEE',e:'🟢',l:'SAUDÁVEL'},
  yellow:{c:YLW,bg:'#FFF8E0',e:'🟡',l:'ATENÇÃO'},
  red:{c:RED,bg:'#FFF0EE',e:'🔴',l:'PREJUÍZO'},
  none:{c:'#999',bg:'#f5f5f5',e:'⚪',l:'—'},
};

const Btn=({ch,onClick,v='primary',sm,full,disabled})=>(
  <button onClick={onClick} disabled={disabled} style={{padding:sm?'8px 14px':'11px 22px',border:'none',borderRadius:8,cursor:disabled?'not-allowed':'pointer',fontWeight:700,fontSize:sm?12:14,width:full?'100%':'auto',background:v==='primary'?NAVY:v==='gold'?GOLD:v==='red'?RED:'#e8e8e8',color:v==='sec'?'#444':'#fff',opacity:disabled?0.6:1}}>{ch}</button>
);

const Inp=({label,val,set,type='number',pre,hint,ph})=>(
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:'block',fontSize:11,fontWeight:700,color:'#666',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>}
    <div style={{display:'flex',alignItems:'center',border:'1.5px solid #ddd',borderRadius:8,overflow:'hidden',background:'#fff'}}>
      {pre&&<span style={{padding:'10px',background:'#f5f5f5',color:'#888',fontSize:13,borderRight:'1px solid #ddd',whiteSpace:'nowrap'}}>{pre}</span>}
      <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{flex:1,border:'none',outline:'none',padding:'10px 12px',fontSize:14,background:'transparent'}}/>
    </div>
    {hint&&<p style={{margin:'3px 0 0',fontSize:11,color:'#aaa'}}>{hint}</p>}
  </div>
);

const Card=({title,value,sub,color=NAVY})=>(
  <div style={{background:'#fff',border:`2px solid ${color}22`,borderRadius:12,padding:'14px 18px',flex:1,minWidth:130}}>
    <p style={{margin:0,fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:.5}}>{title}</p>
    <p style={{margin:'5px 0 2px',fontSize:22,fontWeight:900,color}}>{value}</p>
    {sub&&<p style={{margin:0,fontSize:11,color:'#aaa'}}>{sub}</p>}
  </div>
);
function AuthScreen({onAuth}){
  const[mode,setMode]=useState('login');
  const[email,setEmail]=useState('');
  const[pass,setPass]=useState('');
  const[name,setName]=useState('');
  const[co,setCo]=useState('');
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState('');
  const submit=async()=>{
    if(!email||!pass){setErr('Preencha email e senha');return;}
    setErr('');setLoading(true);
    try{
      if(mode==='login'){
        const r=await login(email,pass);
        if(!r.ok){setErr('Email ou senha incorretos');return;}
        onAuth({token:r.data.access_token,user:r.data.user});
      }else{
        const r=await signup(email,pass,{full_name:name,company_name:co});
        if(!r.ok){setErr(r.data.msg||'Erro ao criar conta');return;}
        const r2=await login(email,pass);
        if(r2.ok)onAuth({token:r2.data.access_token,user:r2.data.user});
        else setErr('Conta criada! Faça login.');
      }
    }catch(e){setErr('Erro de conexão');}
    finally{setLoading(false);}
  };
  return(
    <div style={{minHeight:'100vh',background:`linear-gradient(135deg,${NAVY},#1B3A6B)`,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:36,width:'100%',maxWidth:400,boxShadow:'0 20px 60px #0005'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <p style={{margin:'0 0 4px',fontSize:26,fontWeight:900}}><span style={{color:NAVY}}>Precificação </span><span style={{color:GOLD}}>Inteligente</span></p>
          <p style={{margin:0,fontSize:13,color:'#aaa'}}>Método dos 3Cs · Rafael Contador</p>
        </div>
        <div style={{display:'flex',background:'#f5f5f5',borderRadius:10,padding:4,marginBottom:22,gap:4}}>
          {[['login','Entrar'],['register','Criar Conta']].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'9px',border:'none',borderRadius:7,background:mode===m?NAVY:'transparent',color:mode===m?'#fff':'#777',fontWeight:700,cursor:'pointer',fontSize:13}}>{l}</button>
          ))}
        </div>
        {mode==='register'&&<><Inp label="Seu nome" val={name} set={setName} type="text" ph="Rafael Contador"/><Inp label="Empresa" val={co} set={setCo} type="text" ph="Minha Empresa"/></>}
        <Inp label="Email" val={email} set={setEmail} type="email" ph="seu@email.com"/>
        <Inp label="Senha" val={pass} set={setPass} type="password" ph="••••••••"/>
        {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{err}</p>}
        <Btn ch={loading?'Aguarde...':(mode==='login'?'Entrar':'Criar Conta Grátis')} onClick={submit} v="gold" full disabled={loading}/>
      </div>
    </div>
  );
}
function ProdForm({prod,tok,uid,fixedTotal,onSave,onCancel}){
  const isNew=!prod?.id;
  const blank={name:'',direct_cost:'0',monthly_volume:'100',tax_pct:'8',commission_pct:'5',card_fee_pct:'2.5',default_rate_pct:'2',other_cv_pct:'0',desired_margin:'20',current_price:'0'};
  const[f,setF]=useState(prod||blank);
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState('');
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const r=calc(f,fixedTotal);
  const save=async()=>{
    if(!f.name.trim()){setErr('Informe o nome');return;}
    setLoading(true);setErr('');
    const body={...f,user_id:uid,updated_at:new Date().toISOString()};
    const res=isNew?await ins('products',tok,body):await upd('products',tok,prod.id,body);
    setLoading(false);
    if(!res.ok){setErr('Erro ao salvar. Execute o SQL no Supabase primeiro.');return;}
    onSave(Array.isArray(res.data)?res.data[0]:res.data);
  };
  const F2=(k,label,pre,hint)=><Inp key={k} label={label} val={f[k]||''} set={v=>s(k,v)} pre={pre} hint={hint}/>;
  return(
    <div style={{background:'#fff',borderRadius:14,padding:28,boxShadow:'0 2px 12px #0002'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
        <h2 style={{margin:0,color:NAVY,fontSize:18}}>{isNew?'+ Novo Produto':'Editar Produto'}</h2>
        <Btn ch="Cancelar" onClick={onCancel} v="sec" sm/>
      </div>
      {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,marginBottom:14}}>{err}</p>}
      <Inp label="Nome do Produto ou Serviço" val={f.name} set={v=>s('name',v)} type="text" ph="Ex: Consultoria Mensal"/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        {F2('direct_cost','Custo Direto / Unidade','R$','Matéria-prima, mão de obra')}
        {F2('monthly_volume','Volume Mensal','un.','Unidades por mês')}
        {F2('tax_pct','Impostos','%')}
        {F2('commission_pct','Comissão','%')}
        {F2('card_fee_pct','Taxa Cartão','%')}
        {F2('default_rate_pct','Inadimplência','%')}
        {F2('desired_margin','Margem Desejada','%','% de lucro líquido')}
        {F2('current_price','Preço Atual','R$','0 = produto novo')}
      </div>
      <div style={{background:'#f8f9fc',borderRadius:10,padding:16,margin:'8px 0 20px'}}>
        <p style={{margin:'0 0 10px',fontSize:12,fontWeight:700,color:'#888',textTransform:'uppercase'}}>Preview</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <Card title="Preço Mínimo" value={fR(r.pMin)} color={RED}/>
          <Card title="Preço Ideal" value={fR(r.pIdeal)} color={GRN}/>
          <Card title="Markup" value={fN(r.mkp,2)+'×'} color={NAVY}/>
          <Card title="MC%" value={fP(r.mcP)} color={NAVY}/>
        </div>
      </div>
      <Btn ch={loading?'Salvando...':(isNew?'💾 Salvar e Calcular':'💾 Salvar')} onClick={save} v="gold" full disabled={loading||!f.name.trim()}/>
    </div>
  );
}
function ProdDetail({prod,fixedTotal,onEdit,onBack}){
  const r=calc(prod,fixedTotal),sc=SEM[r.sem]||SEM.none;
  const[tab,setTab]=useState('res');
  const[dsc,setDsc]=useState('10');
  const[np,setNp]=useState('6');
  const[tx,setTx]=useState('2.99');
  const vol=+prod.monthly_volume||1;
  const d=+dsc/100,pvD=r.pIdeal*(1-d),mcD=pvD-r.cdu-pvD*(r.cvp/100);
  const mc0=r.pIdeal*(r.mcP/100),vN=mcD>0?Math.ceil((mc0*vol)/mcD):0,vA=vol>0?((vN-vol)/vol)*100:0;
  const n=Math.max(+np||1,1),tm=+tx/100,tJ=r.pIdeal*tm*n,tP=r.pIdeal+tJ,jP=(tJ/r.pIdeal)*100;
  const TABS=[['res','📊 Resultado'],['dsc','🎯 Desconto'],['par','💳 Parcelas']];
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <div><p style={{margin:0,fontSize:12,color:'#aaa'}}>Precificação</p><h2 style={{margin:0,color:NAVY,fontSize:20}}>{prod.name}</h2></div>
        <div style={{display:'flex',gap:8}}><Btn ch="✏️ Editar" onClick={onEdit} v="sec" sm/><Btn ch="← Voltar" onClick={onBack} v="sec" sm/></div>
      </div>
      <div style={{display:'flex',gap:4,background:'#fff',borderRadius:10,padding:4}}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'9px',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,background:tab===k?NAVY:'transparent',color:tab===k?'#fff':'#777'}}>{l}</button>
        ))}
      </div>
      {tab==='res'&&<>
        {r.sem!=='none'&&<div style={{background:sc.bg,border:`2px solid ${sc.c}`,borderRadius:12,padding:'16px 22px',display:'flex',alignItems:'center',gap:14}}><span style={{fontSize:38}}>{sc.e}</span><div><p style={{margin:0,fontSize:18,fontWeight:800,color:sc.c}}>{sc.l}</p><p style={{margin:'3px 0 0',fontSize:13,color:'#555'}}>Você cobra <strong>{fR(prod.current_price)}</strong> · Ideal: <strong>{fR(r.pIdeal)}</strong></p></div></div>}
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Card title="Preço Mínimo" value={fR(r.pMin)} sub="Sem prejuízo" color={RED}/>
          <Card title="Preço Ideal" value={fR(r.pIdeal)} sub={`Markup ${fN(r.mkp,2)}×`} color={GRN}/>
          <Card title="MC%" value={fP(r.mcP)} sub={`MC: ${fR(r.mcU)}`} color={NAVY}/>
        </div>
        <div style={{background:'#fff',borderRadius:12,padding:20}}>
          <h4 style={{margin:'0 0 14px',color:NAVY,fontSize:14}}>Composição do Preço — {fR(r.pIdeal)}</h4>
          {[{l:'Custo Direto',v:r.cdu,c:'#c0392b'},{l:'Custo Fixo Rateado',v:r.cfu,c:'#e67e22'},{l:'Custos Variáveis',v:r.pIdeal*(r.cvp/100),c:'#e74c3c'},{l:`Lucro (${prod.desired_margin}%)`,v:r.pIdeal*(+prod.desired_margin/100),c:GRN}].map((b,i)=>{
            const w=r.pIdeal>0?Math.min((b.v/r.pIdeal)*100,100):0;
            return<div key={i} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:12,color:'#555'}}>{b.l}</span><span style={{fontSize:12,fontWeight:700}}>{fR(b.v)} <span style={{color:'#aaa',fontWeight:400}}>({fP(w)})</span></span></div>
              <div style={{background:'#f0f0f0',borderRadius:4,height:8}}><div style={{width:`${w}%`,height:'100%',background:b.c,borderRadius:4}}/></div>
            </div>;
          })}
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <div style={{flex:1,background:'#fff',borderRadius:12,padding:18,minWidth:180}}><h4 style={{margin:'0 0 8px',color:NAVY,fontSize:13}}>Ponto de Equilíbrio</h4><p style={{margin:0,fontSize:22,fontWeight:800,color:NAVY}}>{fR(r.pe)}<span style={{fontSize:11,color:'#aaa'}}>/mês</span></p><p style={{margin:'4px 0 0',fontSize:11,color:'#aaa'}}>+20% segurança: {fR(r.pe*1.2)}/mês</p></div>
          <div style={{flex:1,background:'#fff',borderRadius:12,padding:18,minWidth:180}}><h4 style={{margin:'0 0 8px',color:NAVY,fontSize:13}}>Custos / Unidade</h4><p style={{margin:0,fontSize:13,color:'#555'}}>Direto: <strong>{fR(r.cdu)}</strong></p><p style={{margin:'4px 0',fontSize:13,color:'#555'}}>Fixo rateado: <strong>{fR(r.cfu)}</strong></p><p style={{margin:0,fontSize:13,color:'#555'}}>CV%: <strong>{fP(r.cvp)}</strong></p></div>
        </div>
      </>}
      {tab==='dsc'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>Simulador de Desconto</h3>
        <p style={{margin:'0 0 20px',fontSize:13,color:'#888'}}>Quanto volume extra você precisa para compensar?</p>
        <Inp label="Desconto" val={dsc} set={setDsc} pre="%"/>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:13,color:'#555'}}>Preço com desconto</span><strong style={{fontSize:18,color:NAVY}}>{fR(pvD)}</strong></div>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:13,color:'#555'}}>Nova MC por unidade</span><strong style={{fontSize:18,color:mcD>0?GRN:RED}}>{fR(Math.max(mcD,0))}</strong></div>
          <div style={{background:vA>100?'#fff0ee':vA>30?'#fff8e0':'#eafaee',border:`2px solid ${vA>100?RED:vA>30?YLW:GRN}`,borderRadius:8,padding:'14px 16px'}}>
            <p style={{margin:0,fontSize:12,color:'#888'}}>Para manter o mesmo lucro você precisa vender:</p>
            <p style={{margin:'4px 0',fontSize:24,fontWeight:900,color:NAVY}}>{vN} unidades/mês</p>
            <p style={{margin:0,fontSize:13,fontWeight:700,color:vA>100?RED:YLW}}>+{fP(vA)} a mais que hoje ({vol} un.)</p>
            {vA>100&&<p style={{margin:'6px 0 0',fontSize:12,color:RED,fontWeight:600}}>⚠️ Praticamente inviável</p>}
          </div>
        </div>
      </div>}
      {tab==='par'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>Simulador de Parcelamento</h3>
        <p style={{margin:'0 0 20px',fontSize:13,color:'#888'}}>Quanto custa oferecer parcelamento?</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Inp label="Parcelas" val={np} set={setNp} pre="×"/>
          <Inp label="Taxa mensal" val={tx} set={setTx} pre="%" hint="a.m."/>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:13,color:'#555'}}>Valor da parcela</span><strong style={{fontSize:18,color:NAVY}}>{fR(tP/n)} × {n}×</strong></div>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:13,color:'#555'}}>Total pago</span><strong style={{fontSize:18,color:NAVY}}>{fR(tP)}</strong></div>
          <div style={{background:'#fff0ee',border:`2px solid ${RED}`,borderRadius:8,padding:'14px 16px'}}><p style={{margin:0,fontSize:12,color:'#888'}}>Custo financeiro (sai da sua margem)</p><p style={{margin:'4px 0',fontSize:22,fontWeight:800,color:RED}}>{fR(tJ)} ({fP(jP)})</p></div>
        </div>
      </div>}
    </div>
  );
}
function CostsScreen({costs,tok,uid,onUpdate}){
  const[name,setName]=useState('');
  const[amt,setAmt]=useState('');
  const[loading,setLoading]=useState(false);
  const total=costs.reduce((s,c)=>s+(+c.amount||0),0);
  const add=async()=>{
    if(!name.trim()||!amt)return;
    setLoading(true);
    await ins('fixed_costs',tok,{name:name.trim(),amount:+amt,user_id:uid});
    onUpdate();setName('');setAmt('');setLoading(false);
  };
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2 style={{margin:0,color:NAVY}}>💰 Custos Fixos Mensais</h2>
        <div style={{background:GOLD,borderRadius:10,padding:'8px 18px'}}><p style={{margin:0,fontSize:11,color:NAVY,fontWeight:700}}>TOTAL</p><p style={{margin:0,fontSize:20,fontWeight:900,color:NAVY}}>{fR(total)}/mês</p></div>
      </div>
      <div style={{background:'#fff',borderRadius:12,padding:20}}>
        <h4 style={{margin:'0 0 14px',color:NAVY,fontSize:14}}>Adicionar Custo</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <Inp label="Nome" val={name} set={setName} type="text" ph="Ex: Aluguel"/>
          <Inp label="Valor mensal" val={amt} set={setAmt} pre="R$"/>
        </div>
        <Btn ch={loading?'Salvando...':'+ Adicionar'} onClick={add} v="gold" disabled={!name.trim()||!amt||loading}/>
      </div>
      <div style={{background:'#fff',borderRadius:12,padding:20}}>
        {costs.length===0?<p style={{color:'#aaa',textAlign:'center',padding:'20px 0',margin:0}}>Nenhum custo cadastrado.</p>
        :costs.map(c=>(
          <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #f0f0f0'}}>
            <span style={{fontSize:14,color:'#333'}}>{c.name}</span>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <strong style={{fontSize:15,color:NAVY}}>{fR(c.amount)}</strong>
              <button onClick={()=>{del('fixed_costs',tok,c.id).then(onUpdate);}} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({products,costs,fixedTotal,onOpenProd}){
  const cnt={green:0,yellow:0,red:0};
  products.forEach(p=>{const r=calc(p,fixedTotal);if(cnt[r.sem]!==undefined)cnt[r.sem]++;});
  const problemas=products.filter(p=>{const r=calc(p,fixedTotal);return r.sem==='red'||r.sem==='yellow';});
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <h2 style={{margin:0,color:NAVY}}>📊 Visão Geral</h2>
      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        <Card title="Produtos" value={products.length} color={NAVY}/>
        <Card title="Custos Fixos/Mês" value={fR(fixedTotal)} color={YLW}/>
        <Card title="🟢 Saudável" value={cnt.green} color={GRN}/>
        <Card title="🟡 Atenção" value={cnt.yellow} color={YLW}/>
        <Card title="🔴 Prejuízo" value={cnt.red} color={RED}/>
      </div>
      {problemas.length>0&&<div style={{background:'#fff',borderRadius:12,padding:20}}>
        <h4 style={{margin:'0 0 14px',color:RED,fontSize:14}}>⚠️ Produtos que precisam de atenção</h4>
        {problemas.map(p=>{const r=calc(p,fixedTotal),sc=SEM[r.sem];return(
          <div key={p.id} onClick={()=>onOpenProd(p)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:sc.bg,marginBottom:8,cursor:'pointer',border:`1.5px solid ${sc.c}33`}}>
            <div><p style={{margin:0,fontSize:14,fontWeight:700,color:'#333'}}>{sc.e} {p.name}</p><p style={{margin:'2px 0 0',fontSize:12,color:'#777'}}>Cobra {fR(p.current_price)} · Ideal: {fR(r.pIdeal)}</p></div>
            <span style={{fontSize:12,fontWeight:700,color:sc.c}}>{sc.l} →</span>
          </div>
        );})}
      </div>}
      {products.length===0&&<div style={{background:'#fff',borderRadius:12,padding:40,textAlign:'center'}}>
        <p style={{fontSize:40,margin:'0 0 12px'}}>📦</p>
        <h3 style={{margin:'0 0 8px',color:NAVY}}>Comece adicionando um produto</h3>
        <p style={{margin:0,color:'#aaa',fontSize:14}}>Vá em "Produtos" e clique em "+ Novo".</p>
      </div>}
    </div>
  );
}

function App(){
  const[session,setSession]=useState(null);
  const[screen,setScreen]=useState('dash');
  const[products,setProducts]=useState([]);
  const[costs,setCosts]=useState([]);
  const[selected,setSelected]=useState(null);
  const[editing,setEditing]=useState(null);
  const[adding,setAdding]=useState(false);
  const[loading,setLoading]=useState(false);
  const tok=session?.token,uid=session?.user?.id;
  const fixedTotal=costs.reduce((s,c)=>s+(+c.amount||0),0);
  const load=async()=>{
    if(!tok)return;setLoading(true);
    const[pr,cr]=await Promise.all([getAll('products',tok),getAll('fixed_costs',tok)]);
    if(Array.isArray(pr.data))setProducts(pr.data);
    if(Array.isArray(cr.data))setCosts(cr.data);
    setLoading(false);
  };
  useEffect(()=>{load();},[tok]);
  if(!session)return<AuthScreen onAuth={s=>{setSession(s);setScreen('dash');}}/>;
  const goto=s=>{setScreen(s);setSelected(null);setEditing(null);setAdding(false);};
  return(
    <div style={{fontFamily:"'Segoe UI',Arial,sans-serif",background:'#F0F2F8',minHeight:'100vh'}}>
      <div style={{background:NAVY,padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between',height:52,position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <span style={{fontWeight:900,fontSize:15}}><span style={{color:'#fff'}}>Precificação </span><span style={{color:GOLD}}>Inteligente</span></span>
          <div style={{display:'flex',gap:2}}>
            {[['dash','📊 Início'],['products','📦 Produtos'],['costs','💰 Custos']].map(([s,l])=>(
              <button key={s} onClick={()=>goto(s)} style={{padding:'6px 12px',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,background:screen===s?GOLD:'transparent',color:screen===s?NAVY:'#aaa'}}>{l}</button>
            ))}
          </div>
        </div>
        <button onClick={()=>setSession(null)} style={{padding:'7px 14px',border:'none',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:12,background:'#e8e8e8',color:'#444'}}>Sair</button>
      </div>
      <div style={{maxWidth:860,margin:'0 auto',padding:'24px 16px'}}>
        {loading&&<p style={{color:'#aaa',textAlign:'center'}}>Carregando...</p>}
        {screen==='dash'&&!loading&&<Dashboard products={products} costs={costs} fixedTotal={fixedTotal} onOpenProd={p=>{setSelected(p);setScreen('products');}}/>}
        {screen==='products'&&!loading&&<>
          {editing?<ProdForm prod={editing} tok={tok} uid={uid} fixedTotal={fixedTotal} onSave={saved=>{load();setEditing(null);setSelected(saved);}} onCancel={()=>setEditing(null)}/>
          :adding?<ProdForm tok={tok} uid={uid} fixedTotal={fixedTotal} onSave={saved=>{load();setAdding(false);setSelected(saved);}} onCancel={()=>setAdding(false)}/>
          :selected?<ProdDetail prod={selected} fixedTotal={fixedTotal} onEdit={()=>setEditing(selected)} onBack={()=>setSelected(null)}/>
          :<div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h2 style={{margin:0,color:NAVY}}>📦 Produtos / Serviços</h2>
              <Btn ch="+ Novo" onClick={()=>setAdding(true)} v="gold"/>
            </div>
            {products.length===0?<div style={{background:'#fff',borderRadius:12,padding:40,textAlign:'center'}}>
              <p style={{fontSize:40,margin:'0 0 12px'}}>📦</p>
              <h3 style={{margin:'0 0 8px',color:NAVY}}>Nenhum produto ainda</h3>
              <Btn ch="+ Criar Primeiro Produto" onClick={()=>setAdding(true)} v="gold"/>
            </div>
            :products.map(p=>{const r=calc(p,fixedTotal),sc=SEM[r.sem]||SEM.none;return(
              <div key={p.id} onClick={()=>setSelected(p)} style={{background:'#fff',borderRadius:12,padding:'16px 20px',cursor:'pointer',boxShadow:'0 2px 6px #0001',display:'flex',justifyContent:'space-between',alignItems:'center',borderLeft:`5px solid ${sc.c}`}}>
                <div><p style={{margin:0,fontSize:15,fontWeight:700,color:NAVY}}>{sc.e} {p.name}</p><p style={{margin:'3px 0 0',fontSize:12,color:'#aaa'}}>Ideal: {fR(r.pIdeal)} · MC%: {fP(r.mcP)} · PE: {fR(r.pe)}/mês</p></div>
                <div style={{textAlign:'right'}}><p style={{margin:0,fontSize:13,fontWeight:700,color:sc.c}}>{sc.l}</p><p style={{margin:'2px 0 0',fontSize:12,color:'#aaa'}}>→ detalhes</p></div>
              </div>
            );})}
          </div>}
        </>}
        {screen==='costs'&&!loading&&<CostsScreen costs={costs} tok={tok} uid={uid} onUpdate={load}/>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
