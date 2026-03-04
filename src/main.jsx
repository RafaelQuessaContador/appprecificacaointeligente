import { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

const SB  = 'https://fjvomoxzeyheyvxwwkyf.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdm9tb3h6ZXloZXl2eHd3a3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NTk5NjcsImV4cCI6MjA4ODEzNTk2N30.6LWSBToqzXm162QoNSpw52y8YUcHZLy_4dlkzEGvPmw';
const NAVY='#0F2744',GOLD='#C9A84C',GRN='#1A6B2A',RED='#B0291E',YLW='#B8860B',CREME='#FFF8E7';

async function req(path,opts={},tok=null){
  const res=await fetch(SB+path,{...opts,headers:{'apikey':KEY,'Content-Type':'application/json',...(tok&&{'Authorization':'Bearer '+tok}),...opts.headers}});
  const txt=await res.text();
  return{ok:res.ok,status:res.status,data:txt?JSON.parse(txt):{}};
}
const login  =(e,p)=>req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:e,password:p})});
const signup =(e,p,d)=>req('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:e,password:p,data:d})});
const resetPw=(e)=>req('/auth/v1/recover',{method:'POST',body:JSON.stringify({email:e})});
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
  const peUnits=mcU>0?Math.ceil(ft/mcU):0;
  let sem='none';
  if(+p.current_price>0) sem=+p.current_price<pMin?'red':+p.current_price>=pIdeal?'green':'yellow';
  return{cdu,cfu,cvp:cvp*100,base,pMin,pIdeal,mkp:dn>0?1/dn:0,mcU,mcP,pe,peUnits,sem};
}

function calcPackageCost(pkgPrice,pkgQty,freight=0,loss=0){
  const totalCost=(+pkgPrice||0)+(+freight||0);
  const unitCost=+pkgQty>0?totalCost/+pkgQty:0;
  const lossMulti=1+(+loss||0)/100;
  return{unitCost,unitCostWithLoss:unitCost*lossMulti};
}

function calcRecipe(ingredients,ft,vol,cvp,ml){
  const totalDirectCost=ingredients.reduce((s,i)=>{
    const unitCost=+i.pkg_price>0&&+i.pkg_qty>0?(+i.pkg_price+(+i.pkg_freight||0))/+i.pkg_qty:+i.unit_cost||0;
    const withLoss=unitCost*(1+(+i.loss_pct||0)/100);
    return s+withLoss*(+i.qty_used||0);
  },0);
  const cfu=Math.max(+vol||1,1)>0?(+ft||0)/Math.max(+vol||1,1):0;
  const base=totalDirectCost+cfu;
  const dn=1-(+cvp||0)/100-(+ml||0)/100;
  const pIdeal=dn>0?base/dn:0;
  const pMin=(+cvp||0)/100<1?base/(1-(+cvp||0)/100):0;
  return{totalDirectCost,cfu,base,pIdeal,pMin};
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
const PROD_TYPES=[
  {k:'product',l:'📦 Produto'},
  {k:'service',l:'🛠️ Serviço'},
  {k:'hourly', l:'⏱️ Por Hora'},
  {k:'monthly',l:'📅 Mensalidade'},
];
const FIXED_COST_SUGGESTIONS=['Aluguel','Energia Elétrica','Água','Internet','Telefone','Pró-labore','Salários','Contador','Sistema/Software','Seguro','Manutenção','Marketing','Transporte','Outros'];
const Btn=({ch,onClick,v='primary',sm,full,disabled})=>(
  <button onClick={onClick} disabled={disabled} style={{padding:sm?'8px 14px':'11px 22px',border:'none',borderRadius:8,cursor:disabled?'not-allowed':'pointer',fontWeight:700,fontSize:sm?12:14,width:full?'100%':'auto',background:v==='primary'?NAVY:v==='gold'?GOLD:v==='red'?RED:v==='green'?GRN:'#e8e8e8',color:v==='sec'?'#444':'#fff',opacity:disabled?0.6:1}}>{ch}</button>
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

const PwInp=({label,val,set})=>{
  const[show,setShow]=useState(false);
  return(
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:'block',fontSize:11,fontWeight:700,color:'#666',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>}
      <div style={{display:'flex',alignItems:'center',border:'1.5px solid #ddd',borderRadius:8,overflow:'hidden',background:'#fff'}}>
        <input type={show?'text':'password'} value={val} onChange={e=>set(e.target.value)} placeholder="••••••••" style={{flex:1,border:'none',outline:'none',padding:'10px 12px',fontSize:14,background:'transparent'}}/>
        <button onClick={()=>setShow(s=>!s)} type="button" style={{padding:'10px 12px',background:'none',border:'none',cursor:'pointer',color:'#888',fontSize:16}}>{show?'🙈':'👁️'}</button>
      </div>
    </div>
  );
};

const Card=({title,value,sub,color=NAVY})=>(
  <div style={{background:'#fff',border:`2px solid ${color}22`,borderRadius:12,padding:'14px 18px',flex:1,minWidth:130}}>
    <p style={{margin:0,fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:.5}}>{title}</p>
    <p style={{margin:'5px 0 2px',fontSize:22,fontWeight:900,color}}>{value}</p>
    {sub&&<p style={{margin:0,fontSize:11,color:'#aaa'}}>{sub}</p>}
  </div>
);

const Select=({label,val,set,options})=>(
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:'block',fontSize:11,fontWeight:700,color:'#666',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>}
    <select value={val} onChange={e=>set(e.target.value)} style={{width:'100%',border:'1.5px solid #ddd',borderRadius:8,padding:'10px 12px',fontSize:14,background:'#fff',outline:'none'}}>
      {options.map(o=><option key={o.k||o} value={o.k||o}>{o.l||o}</option>)}
    </select>
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
  const[info,setInfo]=useState('');
  const[forgot,setForgot]=useState(false);
  const[fEmail,setFEmail]=useState('');

  useEffect(()=>{
    const hash=window.location.hash;
    if(hash&&hash.includes('access_token')){
      const params=new URLSearchParams(hash.replace('#',''));
      const token=params.get('access_token');
      if(token){
        req('/auth/v1/user',{},token).then(r=>{
          if(r.ok)onAuth({token,user:r.data});
        });
      }
    }
  },[]);

  const googleLogin=()=>{
    window.location.href=`${SB}/auth/v1/authorize?provider=google&redirect_to=${window.location.origin}`;
  };

  const sendReset=async()=>{
    if(!fEmail){setErr('Informe seu email');return;}
    setLoading(true);setErr('');
    await resetPw(fEmail);
    setInfo('Email de recuperação enviado! Verifique sua caixa de entrada.');
    setLoading(false);setForgot(false);
  };

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
        else setInfo('Conta criada! Faça login.');
      }
    }catch(e){setErr('Erro de conexão');}
    finally{setLoading(false);}
  };

  if(forgot)return(
    <div style={{minHeight:'100vh',background:`linear-gradient(135deg,${NAVY},#1B3A6B)`,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:36,width:'100%',maxWidth:400,boxShadow:'0 20px 60px #0005'}}>
        <h3 style={{margin:'0 0 6px',color:NAVY}}>Recuperar Senha</h3>
        <p style={{margin:'0 0 20px',fontSize:13,color:'#888'}}>Informe seu email e enviaremos um link para redefinir a senha.</p>
        <Inp label="Email" val={fEmail} set={setFEmail} type="email" ph="seu@email.com"/>
        {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{err}</p>}
        {info&&<p style={{color:GRN,fontSize:13,background:'#eafaee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{info}</p>}
        <div style={{display:'flex',gap:10}}>
          <Btn ch="← Voltar" onClick={()=>setForgot(false)} v="sec" full/>
          <Btn ch={loading?'Enviando...':'Enviar Link'} onClick={sendReset} v="gold" full disabled={loading}/>
        </div>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:'100vh',background:`linear-gradient(135deg,${NAVY},#1B3A6B)`,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:36,width:'100%',maxWidth:400,boxShadow:'0 20px 60px #0005'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <p style={{margin:'0 0 4px',fontSize:26,fontWeight:900}}><span style={{color:NAVY}}>Precificação </span><span style={{color:GOLD}}>Inteligente</span></p>
          <p style={{margin:0,fontSize:13,color:'#aaa'}}>Método dos 3Cs · Rafael Quessa Contador</p>
        </div>
        <button onClick={googleLogin} style={{width:'100%',padding:'11px',border:'1.5px solid #ddd',borderRadius:8,background:'#fff',cursor:'pointer',fontSize:14,fontWeight:600,color:'#444',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:16}}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.1 0 5.8 1.1 8 2.9l6-6C34.5 3.1 29.6 1 24 1 14.8 1 7 6.7 3.7 14.6l7 5.4C12.4 13.8 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.1-10 6.1-17z"/><path fill="#FBBC05" d="M10.7 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7-5.4A23.9 23.9 0 0 0 .5 24c0 3.9.9 7.5 2.8 10.7l7.4-6.1z"/><path fill="#34A853" d="M24 47c5.4 0 10-1.8 13.3-4.8l-7.5-5.8c-1.8 1.2-4.1 2-5.8 2-6.3 0-11.6-4.3-13.5-10l-7.4 6.1C7 41.3 14.8 47 24 47z"/></svg>
          Entrar com Google
        </button>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <div style={{flex:1,height:1,background:'#eee'}}/><span style={{fontSize:12,color:'#aaa'}}>ou</span><div style={{flex:1,height:1,background:'#eee'}}/>
        </div>
        <div style={{display:'flex',background:'#f5f5f5',borderRadius:10,padding:4,marginBottom:22,gap:4}}>
          {[['login','Entrar'],['register','Criar Conta']].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'9px',border:'none',borderRadius:7,background:mode===m?NAVY:'transparent',color:mode===m?'#fff':'#777',fontWeight:700,cursor:'pointer',fontSize:13}}>{l}</button>
          ))}
        </div>
        {mode==='register'&&<><Inp label="Seu nome" val={name} set={setName} type="text" ph="Rafael Quessa Contador"/><Inp label="Empresa" val={co} set={setCo} type="text" ph="Minha Empresa"/></>}
        <Inp label="Email" val={email} set={setEmail} type="email" ph="seu@email.com"/>
        <PwInp label="Senha" val={pass} set={setPass}/>
        {mode==='login'&&<p onClick={()=>setForgot(true)} style={{margin:'-8px 0 14px',fontSize:12,color:NAVY,cursor:'pointer',textAlign:'right',textDecoration:'underline'}}>Esqueci minha senha</p>}
        {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{err}</p>}
        {info&&<p style={{color:GRN,fontSize:13,background:'#eafaee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{info}</p>}
        <Btn ch={loading?'Aguarde...':(mode==='login'?'Entrar':'Criar Conta Grátis')} onClick={submit} v="gold" full disabled={loading}/>
      </div>
    </div>
  );
}
function PackageCalc(){
  const[pkgPrice,setPkgPrice]=useState('');
  const[pkgQty,setPkgQty]=useState('');
  const[freight,setFreight]=useState('0');
  const[loss,setLoss]=useState('0');
  const r=calcPackageCost(pkgPrice,pkgQty,freight,loss);
  return(
    <div style={{background:'#fff',borderRadius:12,padding:24,marginTop:16}}>
      <h4 style={{margin:'0 0 4px',color:NAVY,fontSize:15}}>📦 Custo Unitário de Pacote</h4>
      <p style={{margin:'0 0 16px',fontSize:13,color:'#888'}}>Para itens comprados em pacote, caixa ou fardo</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <Inp label="Preço do pacote" val={pkgPrice} set={setPkgPrice} pre="R$"/>
        <Inp label="Quantidade no pacote" val={pkgQty} set={setPkgQty} pre="un."/>
        <Inp label="Frete (opcional)" val={freight} set={setFreight} pre="R$"/>
        <Inp label="Perda/Desperdício" val={loss} set={setLoss} pre="%" hint="Ex: 5 para 5%"/>
      </div>
      {r.unitCost>0&&(
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:8}}>
          <Card title="Custo Unitário" value={fR(r.unitCost)} color={NAVY}/>
          <Card title="Com Perda Ajustada" value={fR(r.unitCostWithLoss)} color={+loss>0?YLW:NAVY}/>
        </div>
      )}
    </div>
  );
}

function RecipeCalc({fixedTotal}){
  const[name,setName]=useState('');
  const[vol,setVol]=useState('100');
  const[cvp,setCvp]=useState('17.5');
  const[ml,setMl]=useState('20');
  const[ings,setIngs]=useState([{id:1,name:'',pkg_price:'',pkg_qty:'',pkg_freight:'0',loss_pct:'0',qty_used:''}]);
  const nextId=()=>Math.max(...ings.map(i=>i.id))+1;
  const addIng=()=>setIngs(x=>[...x,{id:nextId(),name:'',pkg_price:'',pkg_qty:'',pkg_freight:'0',loss_pct:'0',qty_used:''}]);
  const setIng=(id,k,v)=>setIngs(x=>x.map(i=>i.id===id?{...i,[k]:v}:i));
  const remIng=id=>setIngs(x=>x.filter(i=>i.id!==id));
  const r=calcRecipe(ings,fixedTotal,vol,cvp,ml);
  const ingRows=ings.map(i=>{
    const uc=+i.pkg_price>0&&+i.pkg_qty>0?(+i.pkg_price+(+i.pkg_freight||0))/+i.pkg_qty:0;
    const ucL=uc*(1+(+i.loss_pct||0)/100);
    const total=ucL*(+i.qty_used||0);
    return{...i,uc,ucL,total};
  });
  const totalDirect=ingRows.reduce((s,i)=>s+i.total,0);
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <h2 style={{margin:0,color:NAVY}}>🍽️ Ficha Técnica</h2>
      <div style={{background:'#fff',borderRadius:12,padding:24}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:16}}>
          <Inp label="Nome do Produto" val={name} set={setName} type="text" ph="Ex: Bolo de Chocolate"/>
          <Inp label="Volume Mensal" val={vol} set={setVol} pre="un."/>
          <Inp label="Total CV%" val={cvp} set={setCvp} pre="%" hint="Impostos+comissão+cartão"/>
          <Inp label="Margem Desejada" val={ml} set={setMl} pre="%"/>
        </div>
        <h4 style={{margin:'0 0 12px',color:NAVY,fontSize:14}}>Insumos</h4>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f0f4ff'}}>
                {['Insumo','Preço Pacote','Qtd Pacote','Frete','Perda%','Qtd Usada','Custo Unit.','c/Perda','Total',''].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:11,fontWeight:700,color:'#666',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingRows.map(i=>(
                <tr key={i.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                  <td style={{padding:'6px 4px'}}><input value={i.name} onChange={e=>setIng(i.id,'name',e.target.value)} placeholder="Ex: Farinha" style={{border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',width:100,fontSize:13}}/></td>
                  <td style={{padding:'6px 4px'}}><input type="number" value={i.pkg_price} onChange={e=>setIng(i.id,'pkg_price',e.target.value)} placeholder="0,00" style={{border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',width:80,fontSize:13}}/></td>
                  <td style={{padding:'6px 4px'}}><input type="number" value={i.pkg_qty} onChange={e=>setIng(i.id,'pkg_qty',e.target.value)} placeholder="un." style={{border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',width:70,fontSize:13}}/></td>
                  <td style={{padding:'6px 4px'}}><input type="number" value={i.pkg_freight} onChange={e=>setIng(i.id,'pkg_freight',e.target.value)} placeholder="0,00" style={{border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',width:70,fontSize:13}}/></td>
                  <td style={{padding:'6px 4px'}}><input type="number" value={i.loss_pct} onChange={e=>setIng(i.id,'loss_pct',e.target.value)} placeholder="0" style={{border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',width:60,fontSize:13}}/></td>
                  <td style={{padding:'6px 4px'}}><input type="number" value={i.qty_used} onChange={e=>setIng(i.id,'qty_used',e.target.value)} placeholder="0" style={{border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',width:70,fontSize:13}}/></td>
                  <td style={{padding:'6px 10px',color:'#555'}}>{fR(i.uc)}</td>
                  <td style={{padding:'6px 10px',color:+i.loss_pct>0?YLW:'#555'}}>{fR(i.ucL)}</td>
                  <td style={{padding:'6px 10px',fontWeight:700,color:NAVY}}>{fR(i.total)}</td>
                  <td><button onClick={()=>remIng(i.id)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16}}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:12}}><Btn ch="+ Adicionar Insumo" onClick={addIng} v="sec" sm/></div>
      </div>
      {totalDirect>0&&(
        <div style={{background:'#fff',borderRadius:12,padding:24}}>
          <h4 style={{margin:'0 0 16px',color:NAVY,fontSize:15}}>Resultado — {name||'Produto'}</h4>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
            <Card title="Custo Direto Total" value={fR(totalDirect)} color={RED}/>
            <Card title="Custo Fixo Rateado" value={fR(r.cfu)} color={YLW}/>
            <Card title="Custo Total Unitário" value={fR(r.base)} color={NAVY}/>
            <Card title="Preço Mínimo" value={fR(r.pMin)} color={RED}/>
            <Card title="Preço Ideal" value={fR(r.pIdeal)} color={GRN}/>
          </div>
          <div style={{background:'#f8f9fc',borderRadius:10,padding:16}}>
            <h5 style={{margin:'0 0 10px',color:NAVY,fontSize:13}}>Composição por insumo</h5>
            {ingRows.filter(i=>i.name&&i.total>0).map(i=>{
              const pct=totalDirect>0?(i.total/totalDirect)*100:0;
              return<div key={i.id} style={{marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{fontSize:12,color:'#555'}}>{i.name}</span>
                  <span style={{fontSize:12,fontWeight:700}}>{fR(i.total)} <span style={{color:'#aaa',fontWeight:400}}>({fP(pct)})</span></span>
                </div>
                <div style={{background:'#e8e8e8',borderRadius:4,height:6}}><div style={{width:`${Math.min(pct,100)}%`,height:'100%',background:NAVY,borderRadius:4}}/></div>
              </div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
function ProdForm({prod,tok,uid,fixedTotal,onSave,onCancel}){
  const isNew=!prod?.id;
  const blank={name:'',type:'product',direct_cost:'0',monthly_volume:'100',tax_pct:'8',commission_pct:'5',card_fee_pct:'2.5',default_rate_pct:'2',other_cv_pct:'0',desired_margin:'20',current_price:'0'};
  const[f,setF]=useState(prod||blank);
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState('');
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const r=calc(f,fixedTotal);
  const typeLabel={product:'Custo Direto / Unidade',service:'Custo Direto / Serviço',hourly:'Custo por Hora (mão de obra)',monthly:'Custo Direto por Cliente'};
  const volLabel={product:'Volume Mensal (unidades)',service:'Serviços por Mês',hourly:'Horas Vendidas por Mês',monthly:'Clientes Mensalistas'};
  const save=async()=>{
    if(!f.name.trim()){setErr('Informe o nome');return;}
    setLoading(true);setErr('');
    const body={...f,user_id:uid,updated_at:new Date().toISOString()};
    const res=isNew?await ins('products',tok,body):await upd('products',tok,prod.id,body);
    setLoading(false);
    if(!res.ok){setErr('Erro ao salvar. Verifique se o SQL foi executado no Supabase.');return;}
    onSave(Array.isArray(res.data)?res.data[0]:res.data);
  };
  const F2=(k,label,pre,hint)=><Inp key={k} label={label} val={f[k]||''} set={v=>s(k,v)} pre={pre} hint={hint}/>;
  return(
    <div style={{background:'#fff',borderRadius:14,padding:28,boxShadow:'0 2px 12px #0002'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
        <h2 style={{margin:0,color:NAVY,fontSize:18}}>{isNew?'+ Novo':'Editar'}</h2>
        <Btn ch="Cancelar" onClick={onCancel} v="sec" sm/>
      </div>
      {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,marginBottom:14}}>{err}</p>}
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14}}>
        <Inp label="Nome" val={f.name} set={v=>s('name',v)} type="text" ph="Ex: Consultoria Mensal"/>
        <Select label="Tipo" val={f.type||'product'} set={v=>s('type',v)} options={PROD_TYPES}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        {F2('direct_cost',typeLabel[f.type]||typeLabel.product,'R$',f.type==='hourly'?'Custo da sua hora trabalhada':f.type==='monthly'?'Custo direto por cliente':undefined)}
        {F2('monthly_volume',volLabel[f.type]||volLabel.product,f.type==='hourly'?'h':'un.')}
        {F2('tax_pct','Impostos','%')}
        {F2('commission_pct','Comissão','%')}
        {F2('card_fee_pct','Taxa Cartão','%')}
        {F2('default_rate_pct','Inadimplência','%')}
        {F2('desired_margin','Margem Desejada','%','% de lucro líquido')}
        {F2('current_price',f.type==='hourly'?'Valor/Hora Atual':f.type==='monthly'?'Mensalidade Atual':'Preço Atual','R$','0 = novo')}
      </div>
      <div style={{background:'#f8f9fc',borderRadius:10,padding:16,margin:'8px 0 20px'}}>
        <p style={{margin:'0 0 10px',fontSize:12,fontWeight:700,color:'#888',textTransform:'uppercase'}}>Preview</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <Card title="Preço Mínimo" value={fR(r.pMin)} color={RED}/>
          <Card title="Preço Ideal" value={fR(r.pIdeal)} color={GRN}/>
          <Card title="Markup" value={fN(r.mkp,2)+'×'} color={NAVY}/>
          <Card title="PE" value={`${r.peUnits} un.`} color={NAVY}/>
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
  const typeLabel={product:'unidades',service:'serviços',hourly:'horas',monthly:'clientes'};
  const unit=typeLabel[prod.type]||'unidades';
  const d=+dsc/100,pvD=r.pIdeal*(1-d),mcD=pvD-r.cdu-pvD*(r.cvp/100);
  const mc0=r.pIdeal*(r.mcP/100),vN=mcD>0?Math.ceil((mc0*vol)/mcD):0,vA=vol>0?((vN-vol)/vol)*100:0;
  const n=Math.max(+np||1,1),tm=+tx/100,tJ=r.pIdeal*tm*n,tP=r.pIdeal+tJ,jP=(tJ/r.pIdeal)*100;
  const TABS=[['res','📊 Resultado'],['pe','🎯 Equilíbrio'],['dsc','💸 Desconto'],['par','💳 Parcelas']];
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <div>
          <p style={{margin:0,fontSize:12,color:'#aaa'}}>{PROD_TYPES.find(t=>t.k===prod.type)?.l||'Produto'}</p>
          <h2 style={{margin:0,color:NAVY,fontSize:20}}>{prod.name}</h2>
        </div>
        <div style={{display:'flex',gap:8}}><Btn ch="✏️ Editar" onClick={onEdit} v="sec" sm/><Btn ch="← Voltar" onClick={onBack} v="sec" sm/></div>
      </div>
      <div style={{display:'flex',gap:4,background:'#fff',borderRadius:10,padding:4,flexWrap:'wrap'}}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'9px',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,minWidth:80,background:tab===k?NAVY:'transparent',color:tab===k?'#fff':'#777'}}>{l}</button>
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
          <div style={{flex:1,background:'#fff',borderRadius:12,padding:18,minWidth:180}}><h4 style={{margin:'0 0 8px',color:NAVY,fontSize:13}}>Custos / Unidade</h4><p style={{margin:0,fontSize:13,color:'#555'}}>Direto: <strong>{fR(r.cdu)}</strong></p><p style={{margin:'4px 0',fontSize:13,color:'#555'}}>Fixo rateado: <strong>{fR(r.cfu)}</strong></p><p style={{margin:0,fontSize:13,color:'#555'}}>CV%: <strong>{fP(r.cvp)}</strong></p></div>
        </div>
      </>}
      {tab==='pe'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>🎯 Ponto de Equilíbrio</h3>
        <p style={{margin:'0 0 20px',fontSize:13,color:'#888'}}>Quantidade mínima para cobrir todos os custos</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
          <Card title={`PE em ${unit}`} value={`${r.peUnits} ${unit}`} sub="Para cobrir custos fixos" color={NAVY}/>
          <Card title="PE em Valor" value={fR(r.pe)} sub="Faturamento mínimo/mês" color={NAVY}/>
          <Card title="PE +20% Segurança" value={fR(r.pe*1.2)} sub="Meta recomendada" color={GRN}/>
        </div>
        <div style={{background:'#f8f9fc',borderRadius:10,padding:16}}>
          <p style={{margin:0,fontSize:13,color:'#555'}}>Você vende atualmente <strong>{vol} {unit}/mês</strong>.</p>
          {vol>=r.peUnits
            ?<p style={{margin:'8px 0 0',fontSize:13,color:GRN,fontWeight:700}}>✅ Acima do PE! Margem de segurança: {fP((vol-r.peUnits)/r.peUnits*100)}</p>
            :<p style={{margin:'8px 0 0',fontSize:13,color:RED,fontWeight:700}}>⚠️ Abaixo do PE! Precisa de mais {r.peUnits-vol} {unit}/mês.</p>
          }
        </div>
      </div>}
      {tab==='dsc'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>Simulador de Desconto</h3>
        <p style={{margin:'0 0 20px',fontSize:13,color:'#888'}}>Quanto volume extra para compensar o desconto?</p>
        <Inp label="Desconto" val={dsc} set={setDsc} pre="%"/>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:'#555'}}>Preço com desconto</span><strong style={{fontSize:18,color:NAVY}}>{fR(pvD)}</strong></div>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:'#555'}}>Nova MC</span><strong style={{fontSize:18,color:mcD>0?GRN:RED}}>{fR(Math.max(mcD,0))}</strong></div>
          <div style={{background:vA>100?'#fff0ee':vA>30?'#fff8e0':'#eafaee',border:`2px solid ${vA>100?RED:vA>30?YLW:GRN}`,borderRadius:8,padding:'14px 16px'}}>
            <p style={{margin:0,fontSize:12,color:'#888'}}>Para manter o mesmo lucro você precisa vender:</p>
            <p style={{margin:'4px 0',fontSize:24,fontWeight:900,color:NAVY}}>{vN} {unit}/mês</p>
            <p style={{margin:0,fontSize:13,fontWeight:700,color:vA>100?RED:YLW}}>+{fP(vA)} a mais que hoje ({vol} {unit})</p>
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
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:'#555'}}>Valor da parcela</span><strong style={{fontSize:18,color:NAVY}}>{fR(tP/n)} × {n}×</strong></div>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:'#555'}}>Total pago</span><strong style={{fontSize:18,color:NAVY}}>{fR(tP)}</strong></div>
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
  const[custom,setCustom]=useState(false);
  const total=costs.reduce((s,c)=>s+(+c.amount||0),0);
  const add=async()=>{
    if(!name.trim()||!amt)return;
    setLoading(true);
    await ins('fixed_costs',tok,{name:name.trim(),amount:+amt,user_id:uid});
    onUpdate();setName('');setAmt('');setCustom(false);setLoading(false);
  };
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2 style={{margin:0,color:NAVY}}>💰 Custos Fixos Mensais</h2>
        <div style={{background:GOLD,borderRadius:10,padding:'8px 18px'}}><p style={{margin:0,fontSize:11,color:NAVY,fontWeight:700}}>TOTAL</p><p style={{margin:0,fontSize:20,fontWeight:900,color:NAVY}}>{fR(total)}/mês</p></div>
      </div>
      <div style={{background:'#fff',borderRadius:12,padding:20}}>
        <h4 style={{margin:'0 0 12px',color:NAVY,fontSize:14}}>Selecione ou crie um custo fixo</h4>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
          {FIXED_COST_SUGGESTIONS.map(s=>(
            <button key={s} onClick={()=>{setName(s);setCustom(false);}} style={{padding:'6px 12px',border:`1.5px solid ${name===s?GOLD:'#ddd'}`,borderRadius:20,background:name===s?CREME:'#fff',cursor:'pointer',fontSize:12,fontWeight:name===s?700:400,color:name===s?NAVY:'#555'}}>{s}</button>
          ))}
          <button onClick={()=>{setName('');setCustom(true);}} style={{padding:'6px 12px',border:`1.5px solid ${custom?GOLD:'#ddd'}`,borderRadius:20,background:custom?CREME:'#fff',cursor:'pointer',fontSize:12,fontWeight:custom?700:400,color:custom?NAVY:'#555'}}>✏️ Personalizado</button>
        </div>
        {custom&&<Inp label="Nome personalizado" val={name} set={setName} type="text" ph="Descreva o custo fixo"/>}
        {name&&<div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'end'}}>
          <Inp label={`Valor mensal — ${name}`} val={amt} set={setAmt} pre="R$"/>
          <div style={{marginBottom:14}}><Btn ch={loading?'...':'+ Adicionar'} onClick={add} v="gold" disabled={!amt||loading}/></div>
        </div>}
      </div>
      <div style={{background:'#fff',borderRadius:12,padding:20}}>
        {costs.length===0?<p style={{color:'#aaa',textAlign:'center',padding:'20px 0',margin:0}}>Nenhum custo cadastrado ainda.</p>
        :costs.map(c=>(
          <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #f0f0f0'}}>
            <span style={{fontSize:14,color:'#333'}}>{c.name}</span>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <strong style={{fontSize:15,color:NAVY}}>{fR(c.amount)}</strong>
              <button onClick={()=>del('fixed_costs',tok,c.id).then(onUpdate)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16}}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <PackageCalc/>
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
        <Card title="Produtos/Serviços" value={products.length} color={NAVY}/>
        <Card title="Custos Fixos/Mês" value={fR(fixedTotal)} color={YLW}/>
        <Card title="🟢 Saudável" value={cnt.green} color={GRN}/>
        <Card title="🟡 Atenção" value={cnt.yellow} color={YLW}/>
        <Card title="🔴 Prejuízo" value={cnt.red} color={RED}/>
      </div>
      {problemas.length>0&&<div style={{background:'#fff',borderRadius:12,padding:20}}>
        <h4 style={{margin:'0 0 14px',color:RED,fontSize:14}}>⚠️ Atenção necessária</h4>
        {problemas.map(p=>{const r=calc(p,fixedTotal),sc=SEM[r.sem];return(
          <div key={p.id} onClick={()=>onOpenProd(p)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:sc.bg,marginBottom:8,cursor:'pointer',border:`1.5px solid ${sc.c}33`}}>
            <div><p style={{margin:0,fontSize:14,fontWeight:700,color:'#333'}}>{sc.e} {p.name}</p><p style={{margin:'2px 0 0',fontSize:12,color:'#777'}}>Cobra {fR(p.current_price)} · Ideal: {fR(r.pIdeal)}</p></div>
            <span style={{fontSize:12,fontWeight:700,color:sc.c}}>{sc.l} →</span>
          </div>
        );})}
      </div>}
      {products.length===0&&<div style={{background:'#fff',borderRadius:12,padding:40,textAlign:'center'}}>
        <p style={{fontSize:40,margin:'0 0 12px'}}>📦</p>
        <h3 style={{margin:'0 0 8px',color:NAVY}}>Comece adicionando um produto ou serviço</h3>
        <p style={{margin:0,color:'#aaa',fontSize:14}}>Vá em "Produtos" e clique em "+ Novo".</p>
      </div>}
    </div>
  );
}

function InfoScreen(){
  const sections=[
    {e:'📊',t:'Dashboard',d:'Visão geral de todos os seus produtos. O semáforo mostra quais precisam de atenção.'},
    {e:'📦',t:'Produtos / Serviços',d:'Cadastre produtos, serviços, serviços por hora ou mensalidades. O sistema calcula automaticamente preço mínimo, ideal, markup e ponto de equilíbrio.'},
    {e:'💰',t:'Custos Fixos',d:'Cadastre todos os custos fixos mensais. Eles são rateados automaticamente por produto. Use a lista de sugestões ou crie personalizado.'},
    {e:'🍽️',t:'Ficha Técnica',d:'Para produtos com vários insumos (ramo alimentício). Liste ingredientes, quantidades e perdas — o custo unitário é calculado automaticamente.'},
    {e:'📦',t:'Custo de Pacote',d:'Na aba Custos Fixos você encontra a calculadora de custo unitário para itens comprados em pacote, incluindo frete e percentual de perda.'},
    {e:'🎯',t:'Ponto de Equilíbrio',d:'Dentro de cada produto, veja exatamente quantas unidades/horas/serviços precisa vender por mês para cobrir todos os custos.'},
    {e:'💸',t:'Simulador de Desconto',d:'Antes de dar um desconto, veja quanto volume extra precisaria vender para compensar. Evita prejuízo por impulso.'},
    {e:'💳',t:'Simulador de Parcelas',d:'Calcule o custo real de oferecer parcelamento e quanto sai da sua margem se você absorver os juros.'},
    {e:'🟢',t:'Semáforo de Lucratividade',d:'Verde = saudável. Amarelo = margem comprimida. Vermelho = prejuízo. Compara com o preço atual praticado.'},
  ];
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{background:NAVY,borderRadius:14,padding:28}}>
        <h2 style={{margin:'0 0 8px',color:GOLD}}>Precificação Inteligente</h2>
        <p style={{margin:'0 0 4px',fontSize:14,color:'#B8C9E8'}}>Método dos 3Cs — Custos · Concorrência · Clientes</p>
        <p style={{margin:0,fontSize:13,color:'#8CA8D0'}}>Desenvolvido por Rafael Quessa Contador</p>
      </div>
      <div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 20px',color:NAVY}}>Como usar o app</h3>
        {sections.map((s,i)=>(
          <div key={i} style={{display:'flex',gap:14,marginBottom:18,paddingBottom:18,borderBottom:i<sections.length-1?'1px solid #f0f0f0':'none'}}>
            <span style={{fontSize:28,flexShrink:0}}>{s.e}</span>
            <div><p style={{margin:'0 0 4px',fontSize:14,fontWeight:700,color:NAVY}}>{s.t}</p><p style={{margin:0,fontSize:13,color:'#666',lineHeight:1.5}}>{s.d}</p></div>
          </div>
        ))}
      </div>
      <div style={{background:'#f8f9fc',borderRadius:12,padding:20,textAlign:'center'}}>
        <p style={{margin:'0 0 4px',fontSize:13,color:'#888'}}>Dúvidas ou sugestões?</p>
        <p style={{margin:0,fontSize:14,fontWeight:700,color:NAVY}}>rafaelquessacontador.com.br</p>
      </div>
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
  const load=useCallback(async()=>{
    if(!tok)return;setLoading(true);
    const[pr,cr]=await Promise.all([getAll('products',tok),getAll('fixed_costs',tok)]);
    if(Array.isArray(pr.data))setProducts(pr.data);
    if(Array.isArray(cr.data))setCosts(cr.data);
    setLoading(false);
  },[tok]);
  useEffect(()=>{load();},[load]);
  if(!session)return<AuthScreen onAuth={s=>{setSession(s);setScreen('dash');}}/>;
  const goto=s=>{setScreen(s);setSelected(null);setEditing(null);setAdding(false);};
  const NAV=[['dash','📊','Início'],['products','📦','Produtos'],['costs','💰','Custos'],['recipe','🍽️','Ficha'],['info','ℹ️','Sobre']];
  return(
    <div style={{fontFamily:"'Segoe UI',Arial,sans-serif",background:'#F0F2F8',minHeight:'100vh'}}>
      <div style={{background:NAVY,padding:'0 16px',display:'flex',alignItems:'center',justifyContent:'space-between',height:52,position:'sticky',top:0,zIndex:10}}>
        <span style={{fontWeight:900,fontSize:14,whiteSpace:'nowrap'}}><span style={{color:'#fff'}}>Precificação </span><span style={{color:GOLD}}>Inteligente</span></span>
        <div style={{display:'flex',gap:2}}>
          {NAV.map(([s,e,l])=>(
            <button key={s} onClick={()=>goto(s)} style={{padding:'4px 8px',border:'none',borderRadius:6,cursor:'pointer',background:screen===s?GOLD:'transparent',color:screen===s?NAVY:'#aaa',textAlign:'center'}}>
              <div style={{fontSize:16}}>{e}</div>
              <div style={{fontSize:10,fontWeight:700}}>{l}</div>
            </button>
          ))}
        </div>
        <button onClick={()=>setSession(null)} style={{padding:'7px 10px',border:'none',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:11,background:'#e8e8e8',color:'#444',whiteSpace:'nowrap'}}>Sair</button>
      </div>
      <div style={{maxWidth:900,margin:'0 auto',padding:'24px 16px'}}>
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
              <h3 style={{margin:'0 0 8px',color:NAVY}}>Nenhum item ainda</h3>
              <Btn ch="+ Criar Primeiro" onClick={()=>setAdding(true)} v="gold"/>
            </div>
            :products.map(p=>{const r=calc(p,fixedTotal),sc=SEM[r.sem]||SEM.none,tl=PROD_TYPES.find(t=>t.k===p.type);return(
              <div key={p.id} style={{background:'#fff',borderRadius:12,padding:'16px 20px',boxShadow:'0 2px 6px #0001',display:'flex',justifyContent:'space-between',alignItems:'center',borderLeft:`5px solid ${sc.c}`}}>
                <div onClick={()=>setSelected(p)} style={{flex:1,cursor:'pointer'}}>
                  <p style={{margin:0,fontSize:15,fontWeight:700,color:NAVY}}>{sc.e} {p.name} <span style={{fontSize:11,color:'#aaa',fontWeight:400}}>{tl?.l}</span></p>
                  <p style={{margin:'3px 0 0',fontSize:12,color:'#aaa'}}>Ideal: {fR(r.pIdeal)} · MC%: {fP(r.mcP)} · PE: {r.peUnits} un.</p>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:sc.c}}>{sc.l}</span>
                  <button onClick={async(e)=>{e.stopPropagation();if(window.confirm(`Excluir "${p.name}"?`)){await del('products',tok,p.id);load();}}} style={{background:'none',border:'none',color:'#3d3131',cursor:'pointer',fontSize:18,padding:'4px 6px'}} title="Excluir">🗑️</button>
                </div>
              </div>
            );})}
        {screen==='costs'&&!loading&&<CostsScreen costs={costs} tok={tok} uid={uid} onUpdate={load}/>}
        {screen==='recipe'&&!loading&&<RecipeCalc fixedTotal={fixedTotal}/>}
        {screen==='info'&&<InfoScreen/>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
