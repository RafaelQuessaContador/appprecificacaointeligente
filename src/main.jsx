import { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";

const SB  = 'https://fjvomoxzeyheyvxwwkyf.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdm9tb3h6ZXloZXl2eHd3a3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NTk5NjcsImV4cCI6MjA4ODEzNTk2N30.6LWSBToqzXm162QoNSpw52y8YUcHZLy_4dlkzEGvPmw';
const NAVY='#0F2744',GOLD='#C9A84C',GRN='#1A6B2A',RED='#B0291E',YLW='#B8860B',CREME='#FFF8E7';

// ── API ──────────────────────────────────────────────────────
async function req(path,opts={},tok=null){
  const res=await fetch(SB+path,{...opts,headers:{'apikey':KEY,'Content-Type':'application/json',...(tok&&{'Authorization':'Bearer '+tok}),...opts.headers}});
  const txt=await res.text();
  return{ok:res.ok,status:res.status,data:txt?JSON.parse(txt):{}};
}
const login   =(e,p)=>req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:e,password:p})});
const signup  =(e,p,d)=>req('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:e,password:p,data:d})});
const resetPw =(e,url)=>req('/auth/v1/recover',{method:'POST',body:JSON.stringify({email:e,redirect_to:url})});
const refreshToken=(rt)=>req('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:rt})});
const getAll  =(t,tok,q='')=>req(`/rest/v1/${t}?select=*${q}&order=created_at.asc`,{},tok);
const ins     =(t,tok,b)=>req(`/rest/v1/${t}`,{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(b)},tok);
const upd     =(t,tok,id,b)=>req(`/rest/v1/${t}?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(b)},tok);
const del     =(t,tok,id)=>req(`/rest/v1/${t}?id=eq.${id}`,{method:'DELETE'},tok);
const delWhere=(t,tok,col,val)=>req(`/rest/v1/${t}?${col}=eq.${val}`,{method:'DELETE'},tok);

const fN=(v,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fR=v=>'R$ '+fN(v);
const fP=v=>fN(v,1)+'%';

const PROD_TYPES=[{k:'product',l:'📦 Produto'},{k:'service',l:'🛠️ Serviço'},{k:'hourly',l:'⏱️ Por Hora'},{k:'monthly',l:'📅 Mensalidade'}];
const UNITS=['un','kg','g','mg','l','ml','m','cm','mm','pacote','caixa','fardo','dose','porção'];
const FIXED_COST_SUGGESTIONS=['Aluguel','Energia Elétrica','Água','Internet','Telefone','Pró-labore','Salários','Contador','Sistema/Software','Seguro','Manutenção','Marketing','Transporte','Outros'];
const SEM={green:{c:GRN,bg:'#EAFAEE',e:'🟢',l:'SAUDÁVEL'},yellow:{c:YLW,bg:'#FFF8E0',e:'🟡',l:'ATENÇÃO'},red:{c:RED,bg:'#FFF0EE',e:'🔴',l:'PREJUÍZO'},none:{c:'#999',bg:'#f5f5f5',e:'⚪',l:'—'}};
// ── ENGINE ───────────────────────────────────────────────────
function calcFixed(products,fixedTotal){
  const sharedProds=products.filter(p=>p.allocation_type!=='individual');
  const sharedVol=sharedProds.reduce((s,p)=>s+Math.max(+p.monthly_volume||1,1),0);
  return products.map(p=>{
    if(p.allocation_type==='individual'){
      const qty=Math.max(+p.allocation_qty||1,1);
      return{...p,_cfu:fixedTotal/qty,_fixedShare:fixedTotal};
    }
    const vol=Math.max(+p.monthly_volume||1,1);
    const cfu=sharedVol>0?(fixedTotal/sharedVol):0;
    return{...p,_cfu:cfu,_fixedShare:fixedTotal};
  });
}

// CORRIGIDO: PE usa total dos custos fixos, não parcela rateada
function calc(p,cfu,fixedTotal){
  const _cfu=cfu!==undefined?cfu:(p._cfu||0);
  const _ft=fixedTotal!==undefined?fixedTotal:(p._fixedTotal||0);
  const cdu=+p.direct_cost||0;
  const cvp=((+p.tax_pct||0)+(+p.commission_pct||0)+(+p.card_fee_pct||0)+(+p.default_rate_pct||0)+(+p.other_cv_pct||0))/100;
  const ml=(+p.desired_margin||0)/100;
  const base=cdu+_cfu;
  const dn=1-cvp-ml;
  const pMin=cvp<1?base/(1-cvp):0;
  const pIdeal=dn>0?base/dn:0;
  const pv=+p.current_price>0?+p.current_price:pIdeal;
  const mcU=pv-cdu-pv*cvp;
  const mcP=pv>0?(mcU/pv)*100:0;
  // PE correto: usa TOTAL dos custos fixos da empresa
  const pe=mcP>0?_ft/(mcP/100):0;
  const peUnits=mcU>0?Math.ceil(_ft/mcU):0;
  let sem='none';
  if(+p.current_price>0)
    sem=+p.current_price<pMin?'red':+p.current_price>=pIdeal?'green':'yellow';
  return{cdu,cfu:_cfu,cvp:cvp*100,base,pMin,pIdeal,mkp:dn>0?1/dn:0,mcU,mcP,pe,peUnits,sem};
}

function calcRecipeIngredients(ings){
  return ings.map(i=>{
    const uc=+i.pkg_price>0&&+i.pkg_qty>0?(+i.pkg_price+(+i.pkg_freight||0))/+i.pkg_qty:+i.unit_cost||0;
    const ucL=uc*(1+(+i.loss_pct||0)/100);
    const total=ucL*(+i.qty_used||0);
    return{...i,uc,ucL,total};
  });
}

// CORRIGIDO: MC% ponderada por volume no PE geral
function calcDashboard(products,fixedTotal){
  const withCfu=calcFixed(products,fixedTotal);
  const totalFat=withCfu.reduce((s,p)=>{
    const r=calc(p,p._cfu,fixedTotal);
    const pv=+p.current_price>0?+p.current_price:r.pIdeal;
    return s+pv*Math.max(+p.monthly_volume||1,1);
  },0);
  const totalMcVal=withCfu.reduce((s,p)=>{
    const r=calc(p,p._cfu,fixedTotal);
    const pv=+p.current_price>0?+p.current_price:r.pIdeal;
    return s+r.mcU*Math.max(+p.monthly_volume||1,1);
  },0);
  // MC% ponderada = total MC valor / total faturamento
  const mcPctPonderada=totalFat>0?(totalMcVal/totalFat)*100:0;
  const peGeral=mcPctPonderada>0?fixedTotal/(mcPctPonderada/100):0;
  return{withCfu,totalFat,mcPctPonderada,peGeral};
}
// ── TOAST ────────────────────────────────────────────────────
function useToast(){
  const[toasts,setToasts]=useState([]);
  const show=useCallback((msg,type='success')=>{
    const id=Date.now();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3000);
  },[]);
  return{toasts,show};
}

function ToastContainer({toasts}){
  return(
    <div style={{position:'fixed',top:64,right:16,zIndex:1000,display:'flex',flexDirection:'column',gap:8}}>
      {toasts.map(t=>(
        <div key={t.id} style={{
          background:t.type==='success'?GRN:t.type==='error'?RED:YLW,
          color:'#fff',padding:'12px 20px',borderRadius:10,
          fontSize:14,fontWeight:700,boxShadow:'0 4px 16px #0003',
          animation:'slideIn .2s ease',minWidth:220,maxWidth:320
        }}>
          {t.type==='success'?'✅ ':t.type==='error'?'❌ ':'⚠️ '}{t.msg}
        </div>
      ))}
    </div>
  );
}

// ── UI ATOMS ─────────────────────────────────────────────────
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
      const refresh=params.get('refresh_token');
      if(token){
        req('/auth/v1/user',{},token).then(r=>{
          if(r.ok){
            onAuth({token,refresh_token:refresh,user:r.data});
            window.history.replaceState(null,'',window.location.pathname);
          }
        });
      }
    }
  },[]);

  const googleLogin=()=>{
    window.location.href=`${SB}/auth/v1/authorize?provider=google&redirect_to=${window.location.origin}${window.location.pathname}`;
  };

  const sendReset=async()=>{
    if(!fEmail){setErr('Informe seu email');return;}
    setLoading(true);setErr('');
    const redirectUrl=`${window.location.origin}${window.location.pathname}`;
    await resetPw(fEmail,redirectUrl);
    setInfo('Email enviado! Verifique sua caixa de entrada.');
    setLoading(false);
  };

  const submit=async()=>{
    if(!email||!pass){setErr('Preencha email e senha');return;}
    setErr('');setLoading(true);
    try{
      if(mode==='login'){
        const r=await login(email,pass);
        if(!r.ok){setErr('Email ou senha incorretos');return;}
        onAuth({token:r.data.access_token,refresh_token:r.data.refresh_token,user:r.data.user});
      }else{
        const r=await signup(email,pass,{full_name:name,company_name:co});
        if(!r.ok){setErr(r.data.msg||'Erro ao criar conta');return;}
        const r2=await login(email,pass);
        if(r2.ok)onAuth({token:r2.data.access_token,refresh_token:r2.data.refresh_token,user:r2.data.user});
        else setInfo('Conta criada! Faça login.');
      }
    }catch(e){setErr('Erro de conexão');}
    finally{setLoading(false);}
  };

  if(forgot)return(
    <div style={{minHeight:'100vh',background:`linear-gradient(135deg,${NAVY},#1B3A6B)`,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:36,width:'100%',maxWidth:400,boxShadow:'0 20px 60px #0005'}}>
        <h3 style={{margin:'0 0 6px',color:NAVY}}>Recuperar Senha</h3>
        <p style={{margin:'0 0 20px',fontSize:13,color:'#888'}}>Informe seu email para receber o link de redefinição.</p>
        <Inp label="Email" val={fEmail} set={setFEmail} type="email" ph="seu@email.com"/>
        {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{err}</p>}
        {info&&<p style={{color:GRN,fontSize:13,background:'#eafaee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{info}</p>}
        <div style={{display:'flex',gap:10}}>
          <Btn ch="← Voltar" onClick={()=>{setForgot(false);setInfo('');setErr('');}} v="sec" full/>
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
// CORRIGIDO: Tabela responsiva no celular com layout em cards em telas pequenas
function IngredientsForm({productId,tok,uid,existingIngs,onSave,toast}){
  const[ings,setIngs]=useState(existingIngs&&existingIngs.length>0
    ?existingIngs.map(i=>({...i}))
    :[{id:'new_1',name:'',pkg_price:'',pkg_qty:'',pkg_freight:'0',loss_pct:'0',qty_used:'',unit:'un'}]
  );
  const[saving,setSaving]=useState(false);
  const[isMobile,setIsMobile]=useState(window.innerWidth<640);

  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<640);
    window.addEventListener('resize',onResize);
    return()=>window.removeEventListener('resize',onResize);
  },[]);

  const nextId=()=>'new_'+Date.now();
  const addIng=()=>setIngs(x=>[...x,{id:nextId(),name:'',pkg_price:'',pkg_qty:'',pkg_freight:'0',loss_pct:'0',qty_used:'',unit:'un'}]);
  const setIng=(id,k,v)=>setIngs(x=>x.map(i=>i.id===id?{...i,[k]:v}:i));
  const remIng=id=>setIngs(x=>x.filter(i=>i.id!==id));
  const rows=calcRecipeIngredients(ings);
  const totalDirect=rows.reduce((s,i)=>s+i.total,0);

  const save=async()=>{
    setSaving(true);
    await delWhere('ingredients',tok,'product_id',productId);
    const valid=ings.filter(i=>i.name&&i.name.trim()&&+i.qty_used>0);
    for(const i of valid){
      await ins('ingredients',tok,{
        product_id:productId,user_id:uid,
        name:i.name.trim(),pkg_price:+i.pkg_price||0,
        pkg_qty:+i.pkg_qty||1,pkg_freight:+i.pkg_freight||0,
        loss_pct:+i.loss_pct||0,qty_used:+i.qty_used||0,unit:i.unit||'un'
      });
    }
    setSaving(false);
    toast('Insumos salvos com sucesso!');
    onSave(valid);
  };

  const inpStyle={border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',fontSize:12,width:'100%',boxSizing:'border-box'};

  return(
    <div style={{marginTop:20,borderTop:'2px dashed #e0e0e0',paddingTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <h4 style={{margin:0,color:NAVY,fontSize:14}}>🧪 Ficha Técnica — Insumos</h4>
        {totalDirect>0&&<span style={{fontSize:13,fontWeight:700,color:RED}}>Total: {fR(totalDirect)}</span>}
      </div>

      {isMobile?(
        // Layout em cards para celular
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {rows.map((i,idx)=>(
            <div key={i.id} style={{background:'#f8f9fc',borderRadius:10,padding:14,border:'1px solid #e0e0e0'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <span style={{fontSize:12,fontWeight:700,color:NAVY}}>Insumo {idx+1}</span>
                <button onClick={()=>remIng(i.id)} style={{background:RED,border:'none',color:'#fff',cursor:'pointer',fontSize:12,borderRadius:6,padding:'4px 8px'}}>✕ Remover</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>NOME</label>
                  <input value={i.name} onChange={e=>setIng(i.id,'name',e.target.value)} placeholder="Ex: Farinha" style={inpStyle}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>UNIDADE</label>
                  <select value={i.unit||'un'} onChange={e=>setIng(i.id,'unit',e.target.value)} style={inpStyle}>
                    {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>QTD USADA</label>
                  <input type="number" value={i.qty_used} onChange={e=>setIng(i.id,'qty_used',e.target.value)} placeholder="0" style={inpStyle}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>PREÇO PACOTE</label>
                  <input type="number" value={i.pkg_price} onChange={e=>setIng(i.id,'pkg_price',e.target.value)} placeholder="0,00" style={inpStyle}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>QTD PACOTE</label>
                  <input type="number" value={i.pkg_qty} onChange={e=>setIng(i.id,'pkg_qty',e.target.value)} placeholder="un." style={inpStyle}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>FRETE</label>
                  <input type="number" value={i.pkg_freight} onChange={e=>setIng(i.id,'pkg_freight',e.target.value)} placeholder="0,00" style={inpStyle}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>PERDA %</label>
                  <input type="number" value={i.loss_pct} onChange={e=>setIng(i.id,'loss_pct',e.target.value)} placeholder="0" style={inpStyle}/>
                </div>
              </div>
              {i.total>0&&<div style={{marginTop:8,padding:'8px 10px',background:'#fff',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:12,color:'#888'}}>Custo unit: {fR(i.uc)} · c/perda: {fR(i.ucL)}</span>
                <strong style={{fontSize:13,color:NAVY}}>{fR(i.total)}</strong>
              </div>}
            </div>
          ))}
        </div>
      ):(
        // Tabela para desktop
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f0f4ff'}}>
                {['Insumo','Unid.','Preço Pacote','Qtd Pacote','Frete','Perda%','Qtd Usada','Custo Unit.','c/Perda','Total',''].map(h=>(
                  <th key={h} style={{padding:'8px',textAlign:'left',fontSize:11,fontWeight:700,color:'#666',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(i=>(
                <tr key={i.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                  <td style={{padding:'4px'}}><input value={i.name} onChange={e=>setIng(i.id,'name',e.target.value)} placeholder="Ex: Farinha" style={{...inpStyle,width:90}}/></td>
                  <td style={{padding:'4px'}}>
                    <select value={i.unit||'un'} onChange={e=>setIng(i.id,'unit',e.target.value)} style={{...inpStyle,width:64}}>
                      {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{padding:'4px'}}><input type="number" value={i.pkg_price} onChange={e=>setIng(i.id,'pkg_price',e.target.value)} placeholder="0,00" style={{...inpStyle,width:75}}/></td>
                  <td style={{padding:'4px'}}><input type="number" value={i.pkg_qty} onChange={e=>setIng(i.id,'pkg_qty',e.target.value)} placeholder="un." style={{...inpStyle,width:65}}/></td>
                  <td style={{padding:'4px'}}><input type="number" value={i.pkg_freight} onChange={e=>setIng(i.id,'pkg_freight',e.target.value)} placeholder="0,00" style={{...inpStyle,width:65}}/></td>
                  <td style={{padding:'4px'}}><input type="number" value={i.loss_pct} onChange={e=>setIng(i.id,'loss_pct',e.target.value)} placeholder="0" style={{...inpStyle,width:55}}/></td>
                  <td style={{padding:'4px'}}><input type="number" value={i.qty_used} onChange={e=>setIng(i.id,'qty_used',e.target.value)} placeholder="0" style={{...inpStyle,width:65}}/></td>
                  <td style={{padding:'6px 8px',color:'#555',whiteSpace:'nowrap'}}>{fR(i.uc)}</td>
                  <td style={{padding:'6px 8px',color:+i.loss_pct>0?YLW:'#555',whiteSpace:'nowrap'}}>{fR(i.ucL)}</td>
                  <td style={{padding:'6px 8px',fontWeight:700,color:NAVY,whiteSpace:'nowrap'}}>{fR(i.total)}</td>
                  <td style={{padding:'4px'}}><button onClick={()=>remIng(i.id)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16,padding:'4px'}}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{display:'flex',gap:10,marginTop:12,alignItems:'center',flexWrap:'wrap'}}>
        <Btn ch="+ Insumo" onClick={addIng} v="sec" sm/>
        <Btn ch={saving?'Salvando...':'💾 Salvar Insumos'} onClick={save} v="gold" sm disabled={saving}/>
      </div>
    </div>
  );
}
// CORRIGIDO: Botão excluir separado visualmente + toast de sucesso
function ProdForm({prod,tok,uid,products,fixedTotal,onSave,onCancel,onDelete,toast}){
  const isNew=!prod?.id;
  const blank={name:'',type:'product',direct_cost:'0',monthly_volume:'100',tax_pct:'8',commission_pct:'5',card_fee_pct:'2.5',default_rate_pct:'2',other_cv_pct:'0',desired_margin:'20',current_price:'0',allocation_type:'shared',allocation_qty:'1'};
  const[f,setF]=useState(prod||blank);
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState('');
  const[showIngs,setShowIngs]=useState(false);
  const[ings,setIngs]=useState([]);
  const[savedId,setSavedId]=useState(prod?.id||null);
  const[delConfirm,setDelConfirm]=useState(false);
  const s=(k,v)=>setF(x=>({...x,[k]:v}));

  const sharedVol=calcFixed(products,fixedTotal).filter(p=>p.allocation_type!=='individual').reduce((s,p)=>s+Math.max(+p.monthly_volume||1,1),0);
  const cfu=f.allocation_type==='individual'
    ?fixedTotal/Math.max(+f.allocation_qty||1,1)
    :sharedVol>0?(fixedTotal/sharedVol):0;
  const r=calc(f,cfu,fixedTotal);

  useEffect(()=>{
    if(prod?.id){
      getAll('ingredients',tok,`&product_id=eq.${prod.id}`).then(res=>{
        if(Array.isArray(res.data))setIngs(res.data);
      });
    }
  },[prod?.id]);

  const save=async()=>{
    if(!f.name.trim()){setErr('Informe o nome');return;}
    setLoading(true);setErr('');
    const body={...f,user_id:uid,updated_at:new Date().toISOString()};
    const res=isNew?await ins('products',tok,body):await upd('products',tok,prod.id,body);
    setLoading(false);
    if(!res.ok){setErr('Erro ao salvar. Verifique o Supabase.');return;}
    const saved=Array.isArray(res.data)?res.data[0]:res.data;
    setSavedId(saved?.id||prod?.id);
    toast('Produto salvo com sucesso!');
    onSave(saved);
  };

  const doDelete=async()=>{
    await delWhere('ingredients',tok,'product_id',prod.id);
    await del('products',tok,prod.id);
    toast('Produto excluído.','warn');
    onDelete();
  };

  const typeLabel={product:'Custo Direto / Unidade',service:'Custo Direto / Serviço',hourly:'Custo por Hora',monthly:'Custo Direto por Cliente'};
  const volLabel={product:'Volume Mensal (unidades)',service:'Serviços por Mês',hourly:'Horas Vendidas por Mês',monthly:'Clientes Mensalistas'};
  const F2=(k,label,pre,hint)=><Inp key={k} label={label} val={f[k]||''} set={v=>s(k,v)} pre={pre} hint={hint}/>;

  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* CORRIGIDO: Botão excluir em bloco separado abaixo do formulário */}
      <div style={{background:'#fff',borderRadius:14,padding:28,boxShadow:'0 2px 12px #0002'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
          <h2 style={{margin:0,color:NAVY,fontSize:18}}>{isNew?'+ Novo':'✏️ Editar'}</h2>
          <Btn ch="← Cancelar" onClick={onCancel} v="sec" sm/>
        </div>
        {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,marginBottom:14}}>{err}</p>}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14}}>
          <Inp label="Nome" val={f.name} set={v=>s('name',v)} type="text" ph="Ex: Consultoria Mensal"/>
          <Select label="Tipo" val={f.type||'product'} set={v=>s('type',v)} options={PROD_TYPES}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          {F2('direct_cost',typeLabel[f.type]||typeLabel.product,'R$')}
          {F2('monthly_volume',volLabel[f.type]||volLabel.product,f.type==='hourly'?'h':'un.')}
          {F2('tax_pct','Impostos','%')}
          {F2('commission_pct','Comissão','%')}
          {F2('card_fee_pct','Taxa Cartão','%')}
          {F2('default_rate_pct','Inadimplência','%')}
          {F2('desired_margin','Margem Desejada','%','% lucro líquido')}
          {F2('current_price',f.type==='hourly'?'Valor/Hora Atual':f.type==='monthly'?'Mensalidade Atual':'Preço Atual','R$','0 = novo')}
        </div>

        <div style={{background:'#f8f9fc',borderRadius:10,padding:16,marginBottom:16}}>
          <p style={{margin:'0 0 10px',fontSize:12,fontWeight:700,color:'#888',textTransform:'uppercase'}}>Rateio de Custos Fixos</p>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            {[['shared','🔀 Dividir com todos'],['individual','🎯 Rateio individual']].map(([k,l])=>(
              <button key={k} onClick={()=>s('allocation_type',k)} style={{flex:1,padding:'8px',border:`2px solid ${f.allocation_type===k?GOLD:'#ddd'}`,borderRadius:8,background:f.allocation_type===k?CREME:'#fff',cursor:'pointer',fontSize:12,fontWeight:700,color:f.allocation_type===k?NAVY:'#777'}}>{l}</button>
            ))}
          </div>
          {f.allocation_type==='individual'&&<Inp label="Volume para rateio individual" val={f.allocation_qty} set={v=>s('allocation_qty',v)} pre="un." hint="Quantidade base para calcular custo fixo deste produto"/>}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:8}}>
            <Card title="CF / Unidade" value={fR(cfu)} sub={`Total: ${fR(cfu*Math.max(+f.monthly_volume||1,1))}`} color={YLW}/>
            <Card title="Preço Mínimo" value={fR(r.pMin)} color={RED}/>
            <Card title="Preço Ideal" value={fR(r.pIdeal)} color={GRN}/>
            <Card title="Markup" value={fN(r.mkp,2)+'×'} color={NAVY}/>
          </div>
        </div>

        <Btn ch={loading?'Salvando...':(isNew?'💾 Salvar e Calcular':'💾 Salvar')} onClick={save} v="gold" full disabled={loading||!f.name.trim()}/>

        <div style={{marginTop:16}}>
          <button onClick={()=>setShowIngs(x=>!x)} style={{background:'none',border:'none',cursor:'pointer',color:NAVY,fontWeight:700,fontSize:14,padding:0}}>
            {showIngs?'▼':'▶'} 🧪 {showIngs?'Ocultar':'Adicionar'} Ficha Técnica (Insumos)
          </button>
          {showIngs&&(savedId
            ?<IngredientsForm productId={savedId} tok={tok} uid={uid} existingIngs={ings} onSave={setIngs} toast={toast}/>
            :<p style={{fontSize:13,color:YLW,marginTop:8}}>⚠️ Salve o produto primeiro para adicionar insumos.</p>
          )}
        </div>
      </div>

      {/* CORRIGIDO: Zona de exclusão separada visualmente em bloco vermelho */}
      {!isNew&&(
        <div style={{background:'#fff0ee',border:`2px solid ${RED}33`,borderRadius:14,padding:20}}>
          <h4 style={{margin:'0 0 8px',color:RED,fontSize:14}}>⚠️ Zona de Perigo</h4>
          <p style={{margin:'0 0 14px',fontSize:13,color:'#888'}}>A exclusão remove o produto e todos os insumos permanentemente.</p>
          {!delConfirm?(
            <Btn ch="🗑️ Excluir este produto" onClick={()=>setDelConfirm(true)} v="red" sm/>
          ):(
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:RED,fontWeight:700}}>Tem certeza? Não tem volta!</span>
              <Btn ch="✅ Sim, excluir definitivamente" onClick={doDelete} v="red" sm/>
              <Btn ch="Cancelar" onClick={()=>setDelConfirm(false)} v="sec" sm/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function ProdDetail({prod,tok,fixedTotal,products,onEdit,onBack}){
  const withCfu=calcFixed(products,fixedTotal);
  const pWithCfu=withCfu.find(x=>x.id===prod.id)||{...prod,_cfu:0};
  const r=calc(pWithCfu,pWithCfu._cfu,fixedTotal);
  const sc=SEM[r.sem]||SEM.none;
  const[tab,setTab]=useState('res');
  const[dsc,setDsc]=useState('10');
  const[np,setNp]=useState('6');
  const[tx,setTx]=useState('2.99');
  const[ings,setIngs]=useState([]);
  const vol=+prod.monthly_volume||1;
  const unit={product:'unidades',service:'serviços',hourly:'horas',monthly:'clientes'}[prod.type]||'unidades';
  const d=+dsc/100,pvD=r.pIdeal*(1-d),mcD=pvD-r.cdu-pvD*(r.cvp/100);
  const mc0=r.pIdeal*(r.mcP/100),vN=mcD>0?Math.ceil((mc0*vol)/mcD):0,vA=vol>0?((vN-vol)/vol)*100:0;
  const n=Math.max(+np||1,1),tm=+tx/100,tJ=r.pIdeal*tm*n,tP=r.pIdeal+tJ,jP=r.pIdeal>0?(tJ/r.pIdeal)*100:0;

  // CORRIGIDO: Carregar insumos corretamente
  useEffect(()=>{
    if(prod?.id){
      getAll('ingredients',tok,`&product_id=eq.${prod.id}`).then(res=>{
        if(Array.isArray(res.data))setIngs(res.data);
      });
    }
  },[prod?.id,tok]);

  const ingRows=calcRecipeIngredients(ings);
  const totalIngCost=ingRows.reduce((s,i)=>s+i.total,0);
  const hasIngs=ings.length>0;
  const TABS=[['res','📊 Resultado'],['pe','🎯 Equilíbrio'],['dsc','💸 Desconto'],['par','💳 Parcelas'],...(hasIngs?[['ing','🧪 Insumos']]:[])];;

  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <div>
          <p style={{margin:0,fontSize:12,color:'#aaa'}}>{PROD_TYPES.find(t=>t.k===prod.type)?.l||'Produto'}</p>
          <h2 style={{margin:0,color:NAVY,fontSize:20}}>{prod.name}</h2>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn ch="✏️ Editar" onClick={onEdit} v="sec" sm/>
          <Btn ch="← Voltar" onClick={onBack} v="sec" sm/>
        </div>
      </div>
      <div style={{display:'flex',gap:4,background:'#fff',borderRadius:10,padding:4,flexWrap:'wrap'}}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'9px',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,minWidth:80,background:tab===k?NAVY:'transparent',color:tab===k?'#fff':'#777'}}>{l}</button>
        ))}
      </div>

      {tab==='res'&&<>
        {r.sem!=='none'&&<div style={{background:sc.bg,border:`2px solid ${sc.c}`,borderRadius:12,padding:'16px 22px',display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:38}}>{sc.e}</span>
          <div><p style={{margin:0,fontSize:18,fontWeight:800,color:sc.c}}>{sc.l}</p><p style={{margin:'3px 0 0',fontSize:13,color:'#555'}}>Você cobra <strong>{fR(prod.current_price)}</strong> · Ideal: <strong>{fR(r.pIdeal)}</strong></p></div>
        </div>}
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Card title="Preço Mínimo" value={fR(r.pMin)} sub="Sem prejuízo" color={RED}/>
          <Card title="Preço Ideal" value={fR(r.pIdeal)} sub={`Markup ${fN(r.mkp,2)}×`} color={GRN}/>
          <Card title="MC%" value={fP(r.mcP)} sub={`MC unit: ${fR(r.mcU)}`} color={NAVY}/>
        </div>
        <div style={{background:'#fff',borderRadius:12,padding:20}}>
          <h4 style={{margin:'0 0 14px',color:NAVY,fontSize:14}}>Composição — {fR(r.pIdeal)}</h4>
          {[{l:'Custo Direto',v:r.cdu,c:'#c0392b'},{l:'Custo Fixo / Unidade',v:r.cfu,c:'#e67e22'},{l:'Custos Variáveis',v:r.pIdeal*(r.cvp/100),c:'#e74c3c'},{l:`Lucro (${prod.desired_margin}%)`,v:r.pIdeal*(+prod.desired_margin/100),c:GRN}].map((b,i)=>{
            const w=r.pIdeal>0?Math.min((b.v/r.pIdeal)*100,100):0;
            return<div key={i} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span style={{fontSize:12,color:'#555'}}>{b.l}</span>
                <span style={{fontSize:12,fontWeight:700}}>{fR(b.v)} <span style={{color:'#aaa',fontWeight:400}}>({fP(w)})</span></span>
              </div>
              <div style={{background:'#f0f0f0',borderRadius:4,height:8}}><div style={{width:`${w}%`,height:'100%',background:b.c,borderRadius:4}}/></div>
            </div>;
          })}
        </div>
      </>}

      {tab==='pe'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>🎯 Ponto de Equilíbrio</h3>
        <p style={{margin:'0 0 16px',fontSize:13,color:'#888'}}>Quantidade mínima para cobrir TODOS os custos fixos da empresa</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
          <Card title={`PE em ${unit}`} value={`${r.peUnits} ${unit}`} sub="Total da empresa" color={NAVY}/>
          <Card title="PE em Valor" value={fR(r.pe)} sub="Faturamento mínimo/mês" color={NAVY}/>
          <Card title="PE +20% Segurança" value={fR(r.pe*1.2)} sub="Meta recomendada" color={GRN}/>
        </div>
        <div style={{background:'#f8f9fc',borderRadius:10,padding:16}}>
          <p style={{margin:0,fontSize:13,color:'#555'}}>Você vende <strong>{vol} {unit}/mês</strong>.</p>
          {vol>=r.peUnits
            ?<p style={{margin:'8px 0 0',fontSize:13,color:GRN,fontWeight:700}}>✅ Acima do PE! Margem de segurança: {fP((vol-r.peUnits)/Math.max(r.peUnits,1)*100)}</p>
            :<p style={{margin:'8px 0 0',fontSize:13,color:RED,fontWeight:700}}>⚠️ Abaixo do PE! Faltam {r.peUnits-vol} {unit}/mês.</p>
          }
        </div>
      </div>}

      {tab==='dsc'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>Simulador de Desconto</h3>
        <p style={{margin:'0 0 16px',fontSize:13,color:'#888'}}>Quanto volume extra para compensar o desconto?</p>
        <Inp label="Desconto" val={dsc} set={setDsc} pre="%"/>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:'#555'}}>Preço com desconto</span><strong style={{fontSize:18,color:NAVY}}>{fR(pvD)}</strong></div>
          <div style={{background:'#f9f9f9',borderRadius:8,padding:'12px 16px',display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:'#555'}}>Nova MC</span><strong style={{fontSize:18,color:mcD>0?GRN:RED}}>{fR(Math.max(mcD,0))}</strong></div>
          <div style={{background:vA>100?'#fff0ee':vA>30?'#fff8e0':'#eafaee',border:`2px solid ${vA>100?RED:vA>30?YLW:GRN}`,borderRadius:8,padding:'14px 16px'}}>
            <p style={{margin:0,fontSize:12,color:'#888'}}>Para manter o lucro você precisa vender:</p>
            <p style={{margin:'4px 0',fontSize:24,fontWeight:900,color:NAVY}}>{vN} {unit}/mês</p>
            <p style={{margin:0,fontSize:13,fontWeight:700,color:vA>100?RED:YLW}}>+{fP(vA)} a mais ({vol} {unit} hoje)</p>
            {vA>100&&<p style={{margin:'6px 0 0',fontSize:12,color:RED,fontWeight:600}}>⚠️ Praticamente inviável</p>}
          </div>
        </div>
      </div>}

      {tab==='par'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>Simulador de Parcelamento</h3>
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

      {tab==='ing'&&hasIngs&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>🧪 Ficha Técnica</h3>
        <p style={{margin:'0 0 16px',fontSize:13,color:'#888'}}>Insumos cadastrados para este produto</p>
        {ingRows.map((i,idx)=>(
          <div key={idx} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f0f0f0'}}>
            <div>
              <p style={{margin:0,fontSize:14,fontWeight:600,color:'#333'}}>{i.name} <span style={{fontSize:11,color:'#aaa'}}>({i.qty_used} {i.unit})</span></p>
              <p style={{margin:'2px 0 0',fontSize:12,color:'#888'}}>Unit: {fR(i.uc)} · c/perda: {fR(i.ucL)}</p>
            </div>
            <strong style={{color:NAVY,fontSize:15,whiteSpace:'nowrap'}}>{fR(i.total)}</strong>
          </div>
        ))}
        <div style={{marginTop:12,padding:'12px 16px',background:'#f8f9fc',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,color:NAVY}}>Custo Direto Total</span>
          <strong style={{color:RED,fontSize:18}}>{fR(totalIngCost)}</strong>
        </div>
      </div>}
    </div>
  );
}
function CostsScreen({costs,tok,uid,onUpdate,toast}){
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
    toast('Custo fixo adicionado!');
  };
  const remove=async(id,nome)=>{
    await del('fixed_costs',tok,id);
    onUpdate();
    toast(`"${nome}" removido.`,'warn');
  };
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <h2 style={{margin:0,color:NAVY}}>💰 Custos Fixos Mensais</h2>
        <div style={{background:GOLD,borderRadius:10,padding:'8px 18px'}}>
          <p style={{margin:0,fontSize:11,color:NAVY,fontWeight:700}}>TOTAL</p>
          <p style={{margin:0,fontSize:20,fontWeight:900,color:NAVY}}>{fR(total)}/mês</p>
        </div>
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
        <h4 style={{margin:'0 0 14px',color:NAVY,fontSize:14}}>Custos cadastrados</h4>
        {costs.length===0
          ?<p style={{color:'#aaa',textAlign:'center',padding:'20px 0',margin:0}}>Nenhum custo cadastrado ainda.</p>
          :costs.map(c=>(
            <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #f0f0f0'}}>
              <span style={{fontSize:14,color:'#333'}}>{c.name}</span>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <strong style={{fontSize:15,color:NAVY}}>{fR(c.amount)}</strong>
                <button onClick={()=>remove(c.id,c.name)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16,padding:'4px 6px'}} title="Remover">✕</button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function InfoScreen(){
  const sections=[
    {e:'📊',t:'Dashboard',d:'Visão geral com semáforo, ponto de equilíbrio geral da empresa e médias ponderadas.'},
    {e:'📦',t:'Produtos / Serviços',d:'Cadastre produtos, serviços, por hora ou mensalidades. Preço mínimo, ideal, markup e PE calculados automaticamente.'},
    {e:'🧪',t:'Ficha Técnica',d:'Dentro de cada produto, clique em "Adicionar Ficha Técnica" para listar insumos com quantidades e perdas.'},
    {e:'💰',t:'Custos Fixos',d:'Cadastre os custos fixos mensais. Rateio compartilhado divide igualmente por unidade entre todos os produtos.'},
    {e:'🎯',t:'Ponto de Equilíbrio',d:'Mostra quantas unidades/horas/serviços você precisa vender para cobrir TODOS os custos fixos da empresa.'},
    {e:'💸',t:'Simulador de Desconto',d:'Veja quanto volume extra você precisa para compensar um desconto antes de concedê-lo.'},
    {e:'💳',t:'Simulador de Parcelas',d:'Calcule o custo real do parcelamento e o impacto na sua margem.'},
    {e:'🟢',t:'Semáforo',d:'Verde = saudável. Amarelo = margem comprimida. Vermelho = prejuízo. Baseado no preço atual vs ideal.'},
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
function Dashboard({products,costs,fixedTotal,onOpenProd}){
  const{withCfu,totalFat,mcPctPonderada,peGeral}=calcDashboard(products,fixedTotal);
  const cnt={green:0,yellow:0,red:0};
  withCfu.forEach(p=>{const r=calc(p,p._cfu,fixedTotal);if(cnt[r.sem]!==undefined)cnt[r.sem]++;});
  const problemas=withCfu.filter(p=>{const r=calc(p,p._cfu,fixedTotal);return r.sem==='red'||r.sem==='yellow';});

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

      {products.length>0&&(
        <div style={{background:'#fff',borderRadius:12,padding:24}}>
          <h4 style={{margin:'0 0 16px',color:NAVY,fontSize:15}}>🎯 Ponto de Equilíbrio Geral da Empresa</h4>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
            <Card title="PE Mínimo" value={fR(peGeral)} sub="Faturamento para cobrir custos" color={NAVY}/>
            <Card title="PE +20% Segurança" value={fR(peGeral*1.2)} sub="Meta recomendada" color={GRN}/>
            <Card title="Faturamento Estimado" value={fR(totalFat)} sub="Preços atuais × volumes" color={totalFat>=peGeral?GRN:RED}/>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
            <Card title="MC% Ponderada" value={fP(mcPctPonderada)} sub="Por volume de vendas" color={NAVY}/>
            <Card title="Custos Fixos Totais" value={fR(fixedTotal)} sub="/mês" color={YLW}/>
          </div>
          {/* Barra de progresso do PE */}
          <div style={{marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{fontSize:12,color:'#888'}}>Progresso até o PE</span>
              <span style={{fontSize:12,fontWeight:700,color:totalFat>=peGeral?GRN:RED}}>{peGeral>0?fP(Math.min((totalFat/peGeral)*100,100)):'—'}</span>
            </div>
            <div style={{background:'#e8e8e8',borderRadius:8,height:14,overflow:'hidden'}}>
              <div style={{width:`${peGeral>0?Math.min((totalFat/peGeral)*100,100):0}%`,height:'100%',background:totalFat>=peGeral*1.2?GRN:totalFat>=peGeral?YLW:RED,borderRadius:8,transition:'width .5s ease'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
              <span style={{fontSize:10,color:'#aaa'}}>R$ 0</span>
              <span style={{fontSize:10,color:'#aaa'}}>PE: {fR(peGeral)}</span>
              <span style={{fontSize:10,color:GRN}}>Meta: {fR(peGeral*1.2)}</span>
            </div>
          </div>
          <div style={{background:totalFat>=peGeral*1.2?'#eafaee':totalFat>=peGeral?'#fff8e0':'#fff0ee',border:`2px solid ${totalFat>=peGeral*1.2?GRN:totalFat>=peGeral?YLW:RED}`,borderRadius:10,padding:'14px 18px',marginTop:8}}>
            {totalFat>=peGeral*1.2
              ?<p style={{margin:0,fontSize:14,fontWeight:700,color:GRN}}>✅ Empresa saudável! Faturamento {fP((totalFat/peGeral-1)*100)} acima do PE.</p>
              :totalFat>=peGeral
              ?<p style={{margin:0,fontSize:14,fontWeight:700,color:YLW}}>⚠️ Acima do PE, mas abaixo da meta de segurança. Faltam {fR(peGeral*1.2-totalFat)}/mês.</p>
              :<p style={{margin:0,fontSize:14,fontWeight:700,color:RED}}>🔴 Abaixo do PE! Faltam {fR(peGeral-totalFat)}/mês para cobrir os custos fixos.</p>
            }
          </div>
        </div>
      )}

      {problemas.length>0&&<div style={{background:'#fff',borderRadius:12,padding:20}}>
        <h4 style={{margin:'0 0 14px',color:RED,fontSize:14}}>⚠️ Atenção necessária</h4>
        {problemas.map(p=>{
          const r=calc(p,p._cfu,fixedTotal),sc=SEM[r.sem];
          return(
            <div key={p.id} onClick={()=>onOpenProd(p)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:sc.bg,marginBottom:8,cursor:'pointer',border:`1.5px solid ${sc.c}33`}}>
              <div><p style={{margin:0,fontSize:14,fontWeight:700,color:'#333'}}>{sc.e} {p.name}</p><p style={{margin:'2px 0 0',fontSize:12,color:'#777'}}>Cobra {fR(p.current_price)} · Ideal: {fR(r.pIdeal)}</p></div>
              <span style={{fontSize:12,fontWeight:700,color:sc.c}}>{sc.l} →</span>
            </div>
          );
        })}
      </div>}

      {products.length===0&&<div style={{background:'#fff',borderRadius:12,padding:40,textAlign:'center'}}>
        <p style={{fontSize:40,margin:'0 0 12px'}}>📦</p>
        <h3 style={{margin:'0 0 8px',color:NAVY}}>Comece adicionando um produto ou serviço</h3>
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
  const{toasts,show:toast}=useToast();
  const tok=session?.token;
  const uid=session?.user?.id;
  const fixedTotal=costs.reduce((s,c)=>s+(+c.amount||0),0);

  // CORRIGIDO: Renovação automática do token JWT a cada 50 minutos
  useEffect(()=>{
    if(!session?.refresh_token)return;
    const interval=setInterval(async()=>{
      const r=await refreshToken(session.refresh_token);
      if(r.ok){
        setSession(s=>({...s,token:r.data.access_token,refresh_token:r.data.refresh_token}));
      }
    },50*60*1000);
    return()=>clearInterval(interval);
  },[session?.refresh_token]);

  const load=useCallback(async()=>{
    if(!tok)return;
    setLoading(true);
    const[pr,cr]=await Promise.all([getAll('products',tok),getAll('fixed_costs',tok)]);
    if(Array.isArray(pr.data))setProducts(pr.data);
    if(Array.isArray(cr.data))setCosts(cr.data);
    setLoading(false);
  },[tok]);

  useEffect(()=>{load();},[load]);

  if(!session)return<AuthScreen onAuth={s=>{setSession(s);setScreen('dash');}}/>;

  const goto=s=>{setScreen(s);setSelected(null);setEditing(null);setAdding(false);};
  const NAV=[['dash','📊','Início'],['products','📦','Produtos'],['costs','💰','Custos'],['info','ℹ️','Sobre']];

  return(
    <div style={{fontFamily:"'Segoe UI',Arial,sans-serif",background:'#F0F2F8',minHeight:'100vh'}}>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
      <ToastContainer toasts={toasts}/>
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
          {editing
            ?<ProdForm prod={editing} tok={tok} uid={uid} products={products} fixedTotal={fixedTotal} toast={toast} onSave={saved=>{load();setEditing(null);setSelected(saved);}} onCancel={()=>setEditing(null)} onDelete={()=>{load();setEditing(null);setSelected(null);}}/>
            :adding
            ?<ProdForm tok={tok} uid={uid} products={products} fixedTotal={fixedTotal} toast={toast} onSave={saved=>{load();setAdding(false);setSelected(saved);}} onCancel={()=>setAdding(false)} onDelete={()=>{}}/>
            :selected
            ?<ProdDetail prod={selected} tok={tok} fixedTotal={fixedTotal} products={products} onEdit={()=>setEditing(selected)} onBack={()=>setSelected(null)}/>
            :<div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h2 style={{margin:0,color:NAVY}}>📦 Produtos / Serviços</h2>
                <Btn ch="+ Novo" onClick={()=>setAdding(true)} v="gold"/>
              </div>
              {products.length===0
                ?<div style={{background:'#fff',borderRadius:12,padding:40,textAlign:'center'}}>
                  <p style={{fontSize:40,margin:'0 0 12px'}}>📦</p>
                  <h3 style={{margin:'0 0 8px',color:NAVY}}>Nenhum item ainda</h3>
                  <Btn ch="+ Criar Primeiro" onClick={()=>setAdding(true)} v="gold"/>
                </div>
                :products.map(p=>{
                  const withCfu=calcFixed(products,fixedTotal);
                  const pCfu=withCfu.find(x=>x.id===p.id)||p;
                  const r=calc(pCfu,pCfu._cfu,fixedTotal),sc=SEM[r.sem]||SEM.none;
                  const tl=PROD_TYPES.find(t=>t.k===p.type);
                  return(
                    <div key={p.id} onClick={()=>setSelected(p)} style={{background:'#fff',borderRadius:12,padding:'16px 20px',cursor:'pointer',boxShadow:'0 2px 6px #0001',display:'flex',justifyContent:'space-between',alignItems:'center',borderLeft:`5px solid ${sc.c}`}}>
                      <div>
                        <p style={{margin:0,fontSize:15,fontWeight:700,color:NAVY}}>{sc.e} {p.name} <span style={{fontSize:11,color:'#aaa',fontWeight:400}}>{tl?.l}</span></p>
                        <p style={{margin:'3px 0 0',fontSize:12,color:'#aaa'}}>Ideal: {fR(r.pIdeal)} · MC%: {fP(r.mcP)} · PE: {r.peUnits} un.</p>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <p style={{margin:0,fontSize:13,fontWeight:700,color:sc.c}}>{sc.l}</p>
                        <p style={{margin:'2px 0 0',fontSize:12,color:'#aaa'}}>→</p>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          }
        </>}
        {screen==='costs'&&!loading&&<CostsScreen costs={costs} tok={tok} uid={uid} onUpdate={load} toast={toast}/>}
        {screen==='info'&&<InfoScreen/>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
