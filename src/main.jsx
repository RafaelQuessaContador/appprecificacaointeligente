import { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

const SB  = 'https://fjvomoxzeyheyvxwwkyf.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdm9tb3h6ZXloZXl2eHd3a3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NTk5NjcsImV4cCI6MjA4ODEzNTk2N30.6LWSBToqzXm162QoNSpw52y8YUcHZLy_4dlkzEGvPmw';
const NAVY='#0F2744',GOLD='#C9A84C',GRN='#1A6B2A',RED='#B0291E',YLW='#B8860B',CREME='#FFF8E7';
const ADMIN_EMAIL='jrrafaelcontador@gmail.com'; // ← seu email de admin

// ── API ──────────────────────────────────────────────────────
async function req(path,opts={},tok=null){
  const res=await fetch(SB+path,{...opts,headers:{'apikey':KEY,'Content-Type':'application/json',...(tok&&{'Authorization':'Bearer '+tok}),...opts.headers}});
  const txt=await res.text();
  return{ok:res.ok,status:res.status,data:txt?JSON.parse(txt):{}};
}
const login        =(e,p)=>req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:e,password:p})});
const signup       =(e,p,d)=>req('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:e,password:p,data:d})});
const resetPw      =(e,url)=>req('/auth/v1/recover',{method:'POST',body:JSON.stringify({email:e,redirect_to:url})});
const refreshToken =(rt)=>req('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:rt})});
const getAll       =(t,tok,q='')=>req(`/rest/v1/${t}?select=*${q}&order=created_at.asc`,{},tok);
const getOne       =(t,tok,col,val)=>req(`/rest/v1/${t}?${col}=eq.${val}&select=*`,{},tok);
const ins          =(t,tok,b)=>req(`/rest/v1/${t}`,{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify(b)},tok);
const upsert       =(t,tok,b)=>req(`/rest/v1/${t}`,{method:'POST',headers:{'Prefer':'return=representation,resolution=merge-duplicates'},body:JSON.stringify(b)},tok);
const upd          =(t,tok,id,b)=>req(`/rest/v1/${t}?id=eq.${id}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(b)},tok);
const del          =(t,tok,id)=>req(`/rest/v1/${t}?id=eq.${id}`,{method:'DELETE'},tok);
const delWhere     =(t,tok,col,val)=>req(`/rest/v1/${t}?${col}=eq.${val}`,{method:'DELETE'},tok);

const fN=(v,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fR=v=>'R$ '+fN(v);
const fP=v=>fN(v,1)+'%';

// ── PLANOS ───────────────────────────────────────────────────
const PLAN_LIMITS={free:{products:5,label:'Gratuito',color:'#888'},palestra:{products:999,label:'Palestra',color:GOLD},pro:{products:999,label:'Profissional',color:GRN}};

async function loadPlan(tok,uid){
  const r=await getOne('user_plans',tok,'user_id',uid);
  if(Array.isArray(r.data)&&r.data.length>0)return r.data[0];
  return{plan:'free',user_id:uid};
}

async function activateCode(tok,uid,code){
  const r=await req(`/rest/v1/access_codes?code=eq.${code.toUpperCase().trim()}&select=*`,{},tok);
  if(!r.ok||!Array.isArray(r.data)||r.data.length===0)return{ok:false,msg:'Código inválido ou não encontrado.'};
  const ac=r.data[0];
  if(ac.used_by&&ac.used_by!==uid)return{ok:false,msg:'Este código já foi utilizado por outro usuário.'};
  if(ac.expires_at&&new Date(ac.expires_at)<new Date())return{ok:false,msg:'Este código expirou.'};
  await upd('access_codes',tok,ac.id,{used_by:uid,used_at:new Date().toISOString()});
  await upsert('user_plans',tok,{user_id:uid,plan:ac.type||'palestra',activated_via:code.toUpperCase().trim(),activated_at:new Date().toISOString()});
  return{ok:true,plan:ac.type||'palestra'};
}

// Gerar código aleatório
function gerarCodigo(prefix='PI'){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code='';
  for(let i=0;i<8;i++)code+=chars[Math.floor(Math.random()*chars.length)];
  return`${prefix}-${code}`;
}

const PROD_TYPES=[{k:'product',l:'📦 Produto'},{k:'service',l:'🛠️ Serviço'},{k:'hourly',l:'⏱️ Por Hora'},{k:'monthly',l:'📅 Mensalidade'}];
const UNITS=['un','kg','g','mg','l','ml','m','cm','mm','pacote','caixa','fardo','dose','porção'];
const FIXED_COST_SUGGESTIONS=['Aluguel','Energia Elétrica','Água','Internet','Telefone','Pró-labore','Salários','Contador','Sistema/Software','Seguro','Manutenção','Marketing','Transporte','Outros'];
const REGIMES=['Simples Nacional','MEI','Lucro Presumido','Lucro Real','Autônomo'];
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

function calcDashboard(products,fixedTotal){
  const withCfu=calcFixed(products,fixedTotal);
  const totalFat=withCfu.reduce((s,p)=>{
    const r=calc(p,p._cfu,fixedTotal);
    const pv=+p.current_price>0?+p.current_price:r.pIdeal;
    return s+pv*Math.max(+p.monthly_volume||1,1);
  },0);
  const totalMcVal=withCfu.reduce((s,p)=>{
    const r=calc(p,p._cfu,fixedTotal);
    return s+r.mcU*Math.max(+p.monthly_volume||1,1);
  },0);
  const mcPctPonderada=totalFat>0?(totalMcVal/totalFat)*100:0;
  const peGeral=mcPctPonderada>0?fixedTotal/(mcPctPonderada/100):0;
  return{withCfu,totalFat,mcPctPonderada,peGeral};
}

// ── TOAST ────────────────────────────────────────────────────
function useToast(){
  const[toasts,setToasts]=useState([]);
  const show=((msg,type='success')=>{
    const id=Date.now();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);
  });
  return{toasts,show};
}
function ToastContainer({toasts}){
  return(
    <div style={{position:'fixed',top:64,right:16,zIndex:1000,display:'flex',flexDirection:'column',gap:8}}>
      {toasts.map(t=>(
        <div key={t.id} style={{background:t.type==='success'?GRN:t.type==='error'?RED:YLW,color:'#fff',padding:'12px 20px',borderRadius:10,fontSize:14,fontWeight:700,boxShadow:'0 4px 16px #0003',animation:'slideIn .2s ease',minWidth:220,maxWidth:320}}>
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

// ── GRÁFICOS SVG ─────────────────────────────────────────────
function PieChart({data,size=180}){
  const total=data.reduce((s,d)=>s+d.value,0);
  if(total===0)return<p style={{color:'#aaa',fontSize:13,textAlign:'center'}}>Sem dados</p>;
  let angle=-Math.PI/2;
  const cx=size/2,cy=size/2,r=size/2-10;
  const slices=data.map(d=>{
    const pct=d.value/total;
    const start=angle;
    angle+=pct*2*Math.PI;
    const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start);
    const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle);
    const large=pct>0.5?1:0;
    return{...d,path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`,pct};
  });
  return(
    <div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',justifyContent:'center'}}>
      <svg width={size} height={size}>
        {slices.map((s,i)=>(<path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2}><title>{s.label}: {fP(s.pct*100)}</title></path>))}
      </svg>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {slices.map((s,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:14,height:14,borderRadius:3,background:s.color,flexShrink:0}}/>
            <span style={{fontSize:13,color:'#555'}}>{s.label}</span>
            <span style={{fontSize:13,fontWeight:700,color:s.color}}>{s.value} <span style={{color:'#aaa',fontWeight:400}}>({fP(s.pct*100)})</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({data,maxVal}){
  const max=maxVal||Math.max(...data.map(d=>d.value),1);
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {data.map((d,i)=>(
        <div key={i}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{fontSize:12,color:'#555',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{d.label}</span>
            <span style={{fontSize:12,fontWeight:700,color:d.color||NAVY,marginLeft:8,whiteSpace:'nowrap'}}>{d.display||fP(d.value)}</span>
          </div>
          <div style={{background:'#f0f0f0',borderRadius:6,height:10,overflow:'hidden'}}>
            <div style={{width:`${Math.min((d.value/max)*100,100)}%`,height:'100%',background:d.color||NAVY,borderRadius:6,transition:'width .4s ease'}}/>
          </div>
        </div>
      ))}
    </div>
  );
}
// ── ADMIN PANEL ──────────────────────────────────────────────
function AdminPanel({tok,toast}){
  const[codes,setCodes]=useState([]);
  const[loading,setLoading]=useState(true);
  const[qty,setQty]=useState('10');
  const[prefix,setPrefix]=useState('PI');
  const[notes,setNotes]=useState('');
  const[generating,setGenerating]=useState(false);

  const load=async()=>{
    setLoading(true);
    const r=await getAll('access_codes',tok,'&order=created_at.desc');
    if(Array.isArray(r.data))setCodes(r.data);
    setLoading(false);
  };

  useEffect(()=>{load();},[]);

  const generate=async()=>{
    setGenerating(true);
    const n=Math.min(Math.max(+qty||1,1),100);
    let created=0;
    for(let i=0;i<n;i++){
      const code=gerarCodigo(prefix||'PI');
      await ins('access_codes',tok,{code,type:'palestra',notes:notes||`Lote ${new Date().toLocaleDateString('pt-BR')}`,created_at:new Date().toISOString()});
      created++;
    }
    toast(`${created} códigos gerados!`);
    setGenerating(false);
    load();
  };

  const copyAll=()=>{
    const unused=codes.filter(c=>!c.used_by).map(c=>c.code).join('\n');
    navigator.clipboard.writeText(unused);
    toast(`${codes.filter(c=>!c.used_by).length} códigos copiados!`);
  };

  const removeCode=async(id)=>{
    await del('access_codes',tok,id);
    toast('Código removido.','warn');
    load();
  };

  const unused=codes.filter(c=>!c.used_by).length;
  const used=codes.filter(c=>c.used_by).length;

  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{background:NAVY,borderRadius:14,padding:24,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,color:GOLD,fontSize:20}}>👑 Painel Admin</h2>
          <p style={{margin:'4px 0 0',fontSize:13,color:'rgba(255,255,255,.5)'}}>Gerencie os códigos de acesso da palestra</p>
        </div>
        <div style={{display:'flex',gap:12'}}>
          <div style={{textAlign:'center',background:'rgba(255,255,255,.08)',borderRadius:10,padding:'10px 20px'}}>
            <p style={{margin:0,fontSize:24,fontWeight:900,color:GRN}}>{unused}</p>
            <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.4)'}}>disponíveis</p>
          </div>
          <div style={{textAlign:'center',background:'rgba(255,255,255,.08)',borderRadius:10,padding:'10px 20px'}}>
            <p style={{margin:0,fontSize:24,fontWeight:900,color:GOLD}}>{used}</p>
            <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.4)'}}>utilizados</p>
          </div>
        </div>
      </div>

      {/* Gerar códigos */}
      <div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h4 style={{margin:'0 0 16px',color:NAVY,fontSize:14}}>🎟️ Gerar Novos Códigos</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr',gap:12,marginBottom:12}}>
          <Inp label="Quantidade" val={qty} set={setQty} ph="10"/>
          <Inp label="Prefixo" val={prefix} set={setPrefix} type="text" ph="PI"/>
          <Inp label="Observação (opcional)" val={notes} set={setNotes} type="text" ph="Ex: Palestra Manaus - Março 2026"/>
        </div>
        <div style={{display:'flex',gap:10}}>
          <Btn ch={generating?'Gerando...':'🎟️ Gerar Códigos'} onClick={generate} v="gold" disabled={generating}/>
          {unused>0&&<Btn ch={`📋 Copiar ${unused} disponíveis`} onClick={copyAll} v="sec"/>}
        </div>
      </div>

      {/* Lista de códigos */}
      <div style={{background:'#fff',borderRadius:12,padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h4 style={{margin:0,color:NAVY,fontSize:14}}>📋 Todos os Códigos ({codes.length})</h4>
          <Btn ch="🔄 Atualizar" onClick={load} v="sec" sm/>
        </div>
        {loading?<p style={{color:'#aaa',textAlign:'center'}}>Carregando...</p>
        :codes.length===0?<p style={{color:'#aaa',textAlign:'center',padding:'20px 0'}}>Nenhum código gerado ainda.</p>
        :<div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f0f4ff'}}>
                {['Código','Status','Observação','Criado em','Usado em',''].map(h=>(
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#666',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.map(c=>(
                <tr key={c.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                  <td style={{padding:'10px 12px'}}>
                    <code style={{background:'#f5f5f5',padding:'4px 10px',borderRadius:6,fontSize:13,fontWeight:700,letterSpacing:1,color:NAVY}}>{c.code}</code>
                  </td>
                  <td style={{padding:'10px 12px'}}>
                    <span style={{background:c.used_by?'#FFF0EE':'#EAFAEE',color:c.used_by?RED:GRN,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>
                      {c.used_by?'✅ Usado':'🟢 Disponível'}
                    </span>
                  </td>
                  <td style={{padding:'10px 12px',color:'#666',fontSize:12}}>{c.notes||'—'}</td>
                  <td style={{padding:'10px 12px',color:'#aaa',fontSize:11,whiteSpace:'nowrap'}}>{c.created_at?new Date(c.created_at).toLocaleDateString('pt-BR'):'—'}</td>
                  <td style={{padding:'10px 12px',color:'#aaa',fontSize:11,whiteSpace:'nowrap'}}>{c.used_at?new Date(c.used_at).toLocaleDateString('pt-BR'):'—'}</td>
                  <td style={{padding:'10px 12px'}}>
                    {!c.used_by&&<button onClick={()=>removeCode(c.id)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16}}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}

// ── ACTIVATE CODE SCREEN ─────────────────────────────────────
function ActivateCodeScreen({tok,uid,onActivated,onSkip}){
  const[code,setCode]=useState('');
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState('');

  const activate=async()=>{
    if(!code.trim()){setErr('Digite o código');return;}
    setLoading(true);setErr('');
    const r=await activateCode(tok,uid,code);
    setLoading(false);
    if(!r.ok){setErr(r.msg);return;}
    onActivated(r.plan);
  };

  return(
    <div style={{minHeight:'100vh',background:`linear-gradient(135deg,${NAVY},#1B3A6B)`,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:36,width:'100%',maxWidth:420,boxShadow:'0 20px 60px #0005'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:12}}>🎟️</div>
          <h2 style={{margin:'0 0 8px',color:NAVY,fontSize:22}}>Você tem um código de acesso?</h2>
          <p style={{margin:0,fontSize:14,color:'#888',lineHeight:1.6}}>Se você participou da <strong>Palestra Precificação Inteligente</strong> e adquiriu o acesso ao app, insira o código abaixo.</p>
        </div>
        <div style={{background:CREME,border:`2px solid ${GOLD}44`,borderRadius:12,padding:16,marginBottom:20}}>
          <p style={{margin:0,fontSize:13,color:'#666',textAlign:'center'}}>🎓 O código foi enviado por email após a compra da palestra ou entregue presencialmente.</p>
        </div>
        <Inp label="Código de acesso" val={code} set={v=>setCode(v.toUpperCase())} type="text" ph="Ex: PI-ABC12345"/>
        {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{err}</p>}
        <Btn ch={loading?'Verificando...':'🔓 Ativar Acesso'} onClick={activate} v="gold" full disabled={loading||!code.trim()}/>
        <button onClick={onSkip} style={{width:'100%',marginTop:12,padding:'10px',background:'none',border:'none',cursor:'pointer',fontSize:13,color:'#aaa'}}>
          Continuar com plano gratuito (até 5 produtos)
        </button>
      </div>
    </div>
  );
}
// ── AUTH ─────────────────────────────────────────────────────
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
          if(r.ok){onAuth({token,refresh_token:refresh,user:r.data});window.history.replaceState(null,'',window.location.pathname);}
        });
      }
    }
  },[]);

  const googleLogin=()=>{window.location.href=`${SB}/auth/v1/authorize?provider=google&redirect_to=${window.location.origin}${window.location.pathname}`;};
  const sendReset=async()=>{
    if(!fEmail){setErr('Informe seu email');return;}
    setLoading(true);setErr('');
    await resetPw(fEmail,`${window.location.origin}${window.location.pathname}`);
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
        <p style={{margin:'0 0 20px',fontSize:13,color:'#888'}}>Informe seu email para receber o link.</p>
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
        {mode==='register'&&<><Inp label="Seu nome" val={name} set={setName} type="text" ph="Rafael Quessa"/><Inp label="Empresa" val={co} set={setCo} type="text" ph="Minha Empresa"/></>}
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

// ── EMPRESA ───────────────────────────────────────────────────
function CompanyScreen({tok,uid,toast}){
  const blank={name:'',cnpj:'',address:'',city:'',state:'',phone:'',email:'',website:'',owner:'',regime:'Simples Nacional'};
  const[f,setF]=useState(blank);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  useEffect(()=>{
    getOne('company_info',tok,'user_id',uid).then(r=>{
      if(Array.isArray(r.data)&&r.data.length>0)setF(r.data[0]);
      setLoading(false);
    });
  },[]);
  const save=async()=>{
    setSaving(true);
    const body={...f,user_id:uid,updated_at:new Date().toISOString()};
    const res=await upsert('company_info',tok,body);
    setSaving(false);
    if(res.ok)toast('Dados da empresa salvos!');
    else toast('Erro ao salvar.','error');
  };
  if(loading)return<p style={{color:'#aaa',textAlign:'center',padding:40}}>Carregando...</p>;
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <h2 style={{margin:0,color:NAVY}}>🏢 Dados da Empresa</h2>
      <div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h4 style={{margin:'0 0 16px',color:NAVY,fontSize:14}}>Informações Gerais</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Inp label="Nome da Empresa" val={f.name||''} set={v=>s('name',v)} type="text" ph="Minha Empresa Ltda"/>
          <Inp label="CNPJ / CPF" val={f.cnpj||''} set={v=>s('cnpj',v)} type="text" ph="00.000.000/0001-00"/>
          <Inp label="Responsável" val={f.owner||''} set={v=>s('owner',v)} type="text" ph="Rafael Quessa"/>
          <div style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:'#666',marginBottom:4,textTransform:'uppercase',letterSpacing:.5}}>Regime Tributário</label>
            <select value={f.regime||'Simples Nacional'} onChange={e=>s('regime',e.target.value)} style={{width:'100%',border:'1.5px solid #ddd',borderRadius:8,padding:'10px 12px',fontSize:14,background:'#fff',outline:'none'}}>
              {REGIMES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <h4 style={{margin:'8px 0 16px',color:NAVY,fontSize:14}}>Contato</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Inp label="Telefone / WhatsApp" val={f.phone||''} set={v=>s('phone',v)} type="text" ph="(11) 99999-9999"/>
          <Inp label="Email Comercial" val={f.email||''} set={v=>s('email',v)} type="text" ph="contato@empresa.com"/>
          <Inp label="Website" val={f.website||''} set={v=>s('website',v)} type="text" ph="www.empresa.com.br"/>
          <Inp label="Endereço" val={f.address||''} set={v=>s('address',v)} type="text" ph="Rua das Flores, 123"/>
          <Inp label="Cidade" val={f.city||''} set={v=>s('city',v)} type="text" ph="São Paulo"/>
          <Inp label="Estado" val={f.state||''} set={v=>s('state',v)} type="text" ph="SP"/>
        </div>
        <Btn ch={saving?'Salvando...':'💾 Salvar Dados'} onClick={save} v="gold" full disabled={saving}/>
      </div>
    </div>
  );
}
// ── PDF ───────────────────────────────────────────────────────
function gerarPDF(products,costs,fixedTotal,company){
  const withCfu=calcFixed(products,fixedTotal);
  const{totalFat,mcPctPonderada,peGeral}=calcDashboard(products,fixedTotal);
  const semLabel={green:'SAUDÁVEL',yellow:'ATENÇÃO',red:'PREJUÍZO',none:'—'};
  const rows=withCfu.map(p=>{const r=calc(p,p._cfu,fixedTotal);return{...p,r,pv:+p.current_price>0?+p.current_price:0};});
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Relatório</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:11px;color:#333;padding:20px;}
.header{background:#0F2744;color:#fff;padding:20px 24px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
.header h1{font-size:20px;color:#C9A84C;}.header p{font-size:11px;color:#B8C9E8;margin-top:4px;}.ci{font-size:11px;color:#B8C9E8;text-align:right;}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
.card{background:#f8f9fc;border-radius:8px;padding:12px;border:1px solid #e0e0e0;}
.card .label{font-size:9px;color:#888;text-transform:uppercase;font-weight:700;margin-bottom:4px;}
.card .value{font-size:16px;font-weight:900;color:#0F2744;}.card .sub{font-size:9px;color:#aaa;margin-top:2px;}
.st{font-size:13px;font-weight:700;color:#0F2744;margin:16px 0 10px;padding-bottom:6px;border-bottom:2px solid #C9A84C;}
table{width:100%;border-collapse:collapse;margin-bottom:16px;}
th{background:#0F2744;color:#fff;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;}
td{padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:10px;}tr:nth-child(even) td{background:#f8f9fc;}
.sem{padding:3px 8px;border-radius:4px;font-size:9px;font-weight:700;display:inline-block;}
.sem-green{background:#EAFAEE;color:#1A6B2A;}.sem-yellow{background:#FFF8E0;color:#B8860B;}.sem-red{background:#FFF0EE;color:#B0291E;}.sem-none{background:#f5f5f5;color:#999;}
.bar{background:#e8e8e8;border-radius:4px;height:8px;overflow:hidden;margin-top:4px;}.bar-fill{height:100%;border-radius:4px;}
.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;color:#aaa;font-size:9px;}
@media print{.no-print{display:none;}}
</style></head><body>
<div class="header">
  <div><h1>Precificação Inteligente</h1><p>Relatório Completo · Método dos 3Cs · Rafael Quessa Contador</p>
  <p>Gerado em: ${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p></div>
  <div class="ci">${company?.name?`<div style="font-size:14px;font-weight:700;color:#C9A84C;">${company.name}</div>`:''} 
  ${company?.cnpj?`<div>CNPJ: ${company.cnpj}</div>`:''} ${company?.owner?`<div>${company.owner}</div>`:''} 
  ${company?.regime?`<div>${company.regime}</div>`:''} ${company?.phone?`<div>${company.phone}</div>`:''}</div>
</div>
<div class="summary">
  <div class="card"><div class="label">Total de Produtos</div><div class="value">${products.length}</div></div>
  <div class="card"><div class="label">Custos Fixos/Mês</div><div class="value">${fR(fixedTotal)}</div></div>
  <div class="card"><div class="label">Faturamento Estimado</div><div class="value">${fR(totalFat)}</div></div>
  <div class="card"><div class="label">PE Geral</div><div class="value">${fR(peGeral)}</div></div>
</div>
<div class="st">📦 Relatório Detalhado de Produtos</div>
<table><thead><tr><th>Produto</th><th>Tipo</th><th>Custo Direto</th><th>CF/Un.</th><th>Preço Mínimo</th><th>Preço Ideal</th><th>Preço Atual</th><th>MC%</th><th>Markup</th><th>PE (un.)</th><th>Status</th></tr></thead>
<tbody>${rows.map(p=>`<tr><td><strong>${p.name}</strong></td><td>${PROD_TYPES.find(t=>t.k===p.type)?.l||'Produto'}</td><td>${fR(p.r.cdu)}</td><td>${fR(p.r.cfu)}</td><td style="color:#B0291E;font-weight:700;">${fR(p.r.pMin)}</td><td style="color:#1A6B2A;font-weight:700;">${fR(p.r.pIdeal)}</td><td>${p.pv>0?fR(p.pv):'—'}</td><td>${fP(p.r.mcP)}</td><td>${fN(p.r.mkp,2)}×</td><td>${p.r.peUnits} un.</td><td><span class="sem sem-${p.r.sem}">${semLabel[p.r.sem]}</span></td></tr>`).join('')}</tbody></table>
${costs.length>0?`<div class="st">💰 Custos Fixos Mensais</div>
<table><thead><tr><th>Descrição</th><th>Valor Mensal</th><th>% do Total</th></tr></thead>
<tbody>${costs.map(c=>`<tr><td>${c.name}</td><td><strong>${fR(c.amount)}</strong></td><td>${fixedTotal>0?fP((c.amount/fixedTotal)*100):'—'}</td></tr>`).join('')}
<tr style="background:#f0f4ff;"><td><strong>TOTAL</strong></td><td><strong style="color:#0F2744;">${fR(fixedTotal)}</strong></td><td><strong>100%</strong></td></tr></tbody></table>`:''}
<div class="footer"><span>Precificação Inteligente · Método dos 3Cs · Rafael Quessa Contador</span><span>jrrafaelcontadorcontador.com.br</span></div>
<div class="no-print" style="margin-top:20px;text-align:center;">
  <button onclick="window.print()" style="background:#0F2744;color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
  <button onclick="window.close()" style="background:#e8e8e8;color:#444;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-left:10px;">✕ Fechar</button>
</div></body></html>`;
  const win=window.open('','_blank');
  if(win){win.document.write(html);win.document.close();}
}

// ── INGREDIENTS FORM ─────────────────────────────────────────
function IngredientsForm({productId,tok,uid,existingIngs,onSave,toast}){
  const[ings,setIngs]=useState(existingIngs&&existingIngs.length>0?existingIngs.map(i=>({...i})):[{id:'new_1',name:'',pkg_price:'',pkg_qty:'',pkg_freight:'0',loss_pct:'0',qty_used:'',unit:'un'}]);
  const[saving,setSaving]=useState(false);
  const[isMobile,setIsMobile]=useState(window.innerWidth<640);
  useEffect(()=>{const r=()=>setIsMobile(window.innerWidth<640);window.addEventListener('resize',r);return()=>window.removeEventListener('resize',r);},[]);
  const addIng=()=>setIngs(x=>[...x,{id:'new_'+Date.now(),name:'',pkg_price:'',pkg_qty:'',pkg_freight:'0',loss_pct:'0',qty_used:'',unit:'un'}]);
  const setIng=(id,k,v)=>setIngs(x=>x.map(i=>i.id===id?{...i,[k]:v}:i));
  const remIng=id=>setIngs(x=>x.filter(i=>i.id!==id));
  const rows=calcRecipeIngredients(ings);
  const totalDirect=rows.reduce((s,i)=>s+i.total,0);
  const save=async()=>{
    setSaving(true);
    await delWhere('ingredients',tok,'product_id',productId);
    const valid=ings.filter(i=>i.name&&i.name.trim()&&+i.qty_used>0);
    for(const i of valid){await ins('ingredients',tok,{product_id:productId,user_id:uid,name:i.name.trim(),pkg_price:+i.pkg_price||0,pkg_qty:+i.pkg_qty||1,pkg_freight:+i.pkg_freight||0,loss_pct:+i.loss_pct||0,qty_used:+i.qty_used||0,unit:i.unit||'un'});}
    setSaving(false);toast('Insumos salvos!');onSave(valid);
  };
  const inp={border:'1px solid #ddd',borderRadius:6,padding:'6px 8px',fontSize:12,width:'100%',boxSizing:'border-box'};
  return(
    <div style={{marginTop:20,borderTop:'2px dashed #e0e0e0',paddingTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <h4 style={{margin:0,color:NAVY,fontSize:14}}>🧪 Ficha Técnica — Insumos</h4>
        {totalDirect>0&&<span style={{fontSize:13,fontWeight:700,color:RED}}>Total: {fR(totalDirect)}</span>}
      </div>
      {isMobile?(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {rows.map((i,idx)=>(
            <div key={i.id} style={{background:'#f8f9fc',borderRadius:10,padding:14,border:'1px solid #e0e0e0'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontSize:12,fontWeight:700,color:NAVY}}>Insumo {idx+1}</span>
                <button onClick={()=>remIng(i.id)} style={{background:RED,border:'none',color:'#fff',cursor:'pointer',fontSize:12,borderRadius:6,padding:'4px 8px'}}>✕</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={{gridColumn:'1/-1'}}><label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>NOME</label><input value={i.name} onChange={e=>setIng(i.id,'name',e.target.value)} placeholder="Ex: Farinha" style={inp}/></div>
                <div><label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>UNIDADE</label><select value={i.unit||'un'} onChange={e=>setIng(i.id,'unit',e.target.value)} style={inp}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
                <div><label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>QTD USADA</label><input type="number" value={i.qty_used} onChange={e=>setIng(i.id,'qty_used',e.target.value)} style={inp}/></div>
                <div><label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>PREÇO PACOTE</label><input type="number" value={i.pkg_price} onChange={e=>setIng(i.id,'pkg_price',e.target.value)} style={inp}/></div>
                <div><label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>QTD PACOTE</label><input type="number" value={i.pkg_qty} onChange={e=>setIng(i.id,'pkg_qty',e.target.value)} style={inp}/></div>
                <div><label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>FRETE</label><input type="number" value={i.pkg_freight} onChange={e=>setIng(i.id,'pkg_freight',e.target.value)} style={inp}/></div>
                <div><label style={{fontSize:11,color:'#888',display:'block',marginBottom:3}}>PERDA %</label><input type="number" value={i.loss_pct} onChange={e=>setIng(i.id,'loss_pct',e.target.value)} style={inp}/></div>
              </div>
              {i.total>0&&<div style={{marginTop:8,padding:'8px 10px',background:'#fff',borderRadius:8,display:'flex',justifyContent:'space-between'}}><span style={{fontSize:12,color:'#888'}}>Unit: {fR(i.uc)} · c/perda: {fR(i.ucL)}</span><strong style={{fontSize:13,color:NAVY}}>{fR(i.total)}</strong></div>}
            </div>
          ))}
        </div>
      ):(
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'#f0f4ff'}}>{['Insumo','Unid.','Preço Pacote','Qtd Pacote','Frete','Perda%','Qtd Usada','Custo Unit.','c/Perda','Total',''].map(h=><th key={h} style={{padding:'8px',textAlign:'left',fontSize:11,fontWeight:700,color:'#666',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
            <tbody>{rows.map(i=>(
              <tr key={i.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                <td style={{padding:'4px'}}><input value={i.name} onChange={e=>setIng(i.id,'name',e.target.value)} placeholder="Ex: Farinha" style={{...inp,width:90}}/></td>
                <td style={{padding:'4px'}}><select value={i.unit||'un'} onChange={e=>setIng(i.id,'unit',e.target.value)} style={{...inp,width:64}}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
                <td style={{padding:'4px'}}><input type="number" value={i.pkg_price} onChange={e=>setIng(i.id,'pkg_price',e.target.value)} placeholder="0,00" style={{...inp,width:75}}/></td>
                <td style={{padding:'4px'}}><input type="number" value={i.pkg_qty} onChange={e=>setIng(i.id,'pkg_qty',e.target.value)} placeholder="un." style={{...inp,width:65}}/></td>
                <td style={{padding:'4px'}}><input type="number" value={i.pkg_freight} onChange={e=>setIng(i.id,'pkg_freight',e.target.value)} placeholder="0,00" style={{...inp,width:65}}/></td>
                <td style={{padding:'4px'}}><input type="number" value={i.loss_pct} onChange={e=>setIng(i.id,'loss_pct',e.target.value)} placeholder="0" style={{...inp,width:55}}/></td>
                <td style={{padding:'4px'}}><input type="number" value={i.qty_used} onChange={e=>setIng(i.id,'qty_used',e.target.value)} placeholder="0" style={{...inp,width:65}}/></td>
                <td style={{padding:'6px 8px',color:'#555',whiteSpace:'nowrap'}}>{fR(i.uc)}</td>
                <td style={{padding:'6px 8px',color:+i.loss_pct>0?YLW:'#555',whiteSpace:'nowrap'}}>{fR(i.ucL)}</td>
                <td style={{padding:'6px 8px',fontWeight:700,color:NAVY,whiteSpace:'nowrap'}}>{fR(i.total)}</td>
                <td><button onClick={()=>remIng(i.id)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16,padding:'4px'}}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{display:'flex',gap:10,marginTop:12,flexWrap:'wrap'}}>
        <Btn ch="+ Insumo" onClick={addIng} v="sec" sm/>
        <Btn ch={saving?'Salvando...':'💾 Salvar Insumos'} onClick={save} v="gold" sm disabled={saving}/>
      </div>
    </div>
  );
}
function ProdForm({prod,tok,uid,products,fixedTotal,onSave,onCancel,onDelete,toast,plan}){
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
  const limit=PLAN_LIMITS[plan?.plan||'free']?.products||5;
  const sharedVol=calcFixed(products,fixedTotal).filter(p=>p.allocation_type!=='individual').reduce((s,p)=>s+Math.max(+p.monthly_volume||1,1),0);
  const cfu=f.allocation_type==='individual'?fixedTotal/Math.max(+f.allocation_qty||1,1):sharedVol>0?(fixedTotal/sharedVol):0;
  const r=calc(f,cfu,fixedTotal);
  useEffect(()=>{if(prod?.id){getAll('ingredients',tok,`&product_id=eq.${prod.id}`).then(res=>{if(Array.isArray(res.data))setIngs(res.data);});}},[prod?.id]);
  const save=async()=>{
    if(!f.name.trim()){setErr('Informe o nome');return;}
    if(isNew&&products.length>=limit){setErr(`Seu plano permite até ${limit} produtos. Ative um código para desbloquear.`);return;}
    setLoading(true);setErr('');
    const body={...f,user_id:uid,updated_at:new Date().toISOString()};
    const res=isNew?await ins('products',tok,body):await upd('products',tok,prod.id,body);
    setLoading(false);
    if(!res.ok){setErr('Erro ao salvar.');return;}
    const saved=Array.isArray(res.data)?res.data[0]:res.data;
    setSavedId(saved?.id||prod?.id);
    toast('Produto salvo!');onSave(saved);
  };
  const doDelete=async()=>{
    await delWhere('ingredients',tok,'product_id',prod.id);
    await del('products',tok,prod.id);
    toast('Produto excluído.','warn');onDelete();
  };
  const typeLabel={product:'Custo Direto / Unidade',service:'Custo Direto / Serviço',hourly:'Custo por Hora',monthly:'Custo por Cliente'};
  const volLabel={product:'Volume Mensal (unidades)',service:'Serviços por Mês',hourly:'Horas por Mês',monthly:'Clientes Mensalistas'};
  const F2=(k,label,pre,hint)=><Inp key={k} label={label} val={f[k]||''} set={v=>s(k,v)} pre={pre} hint={hint}/>;
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* Aviso de limite plano free */}
      {isNew&&products.length>=limit&&(
        <div style={{background:CREME,border:`2px solid ${GOLD}`,borderRadius:12,padding:16,display:'flex',gap:12,alignItems:'center'}}>
          <span style={{fontSize:28}}>🎟️</span>
          <div>
            <p style={{margin:0,fontSize:14,fontWeight:700,color:NAVY}}>Limite do plano gratuito atingido ({limit} produtos)</p>
            <p style={{margin:'4px 0 0',fontSize:13,color:'#666'}}>Ative um código da palestra para cadastrar produtos ilimitados.</p>
          </div>
        </div>
      )}
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
          {F2('tax_pct','Impostos','%')}{F2('commission_pct','Comissão','%')}
          {F2('card_fee_pct','Taxa Cartão','%')}{F2('default_rate_pct','Inadimplência','%')}
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
          {f.allocation_type==='individual'&&<Inp label="Volume para rateio individual" val={f.allocation_qty} set={v=>s('allocation_qty',v)} pre="un."/>}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:8}}>
            <Card title="CF / Unidade" value={fR(cfu)} sub={`Total: ${fR(cfu*Math.max(+f.monthly_volume||1,1))}`} color={YLW}/>
            <Card title="Preço Mínimo" value={fR(r.pMin)} color={RED}/>
            <Card title="Preço Ideal" value={fR(r.pIdeal)} color={GRN}/>
            <Card title="Markup" value={fN(r.mkp,2)+'×'} color={NAVY}/>
          </div>
        </div>
        <Btn ch={loading?'Salvando...':(isNew?'💾 Salvar e Calcular':'💾 Salvar')} onClick={save} v="gold" full disabled={loading||!f.name.trim()||(isNew&&products.length>=limit)}/>
        <div style={{marginTop:16}}>
          <button onClick={()=>setShowIngs(x=>!x)} style={{background:'none',border:'none',cursor:'pointer',color:NAVY,fontWeight:700,fontSize:14,padding:0}}>
            {showIngs?'▼':'▶'} 🧪 {showIngs?'Ocultar':'Adicionar'} Ficha Técnica
          </button>
          {showIngs&&(savedId
            ?<IngredientsForm productId={savedId} tok={tok} uid={uid} existingIngs={ings} onSave={setIngs} toast={toast}/>
            :<p style={{fontSize:13,color:YLW,marginTop:8}}>⚠️ Salve o produto primeiro.</p>
          )}
        </div>
      </div>
      {!isNew&&(
        <div style={{background:'#fff0ee',border:`2px solid ${RED}33`,borderRadius:14,padding:20}}>
          <h4 style={{margin:'0 0 8px',color:RED,fontSize:14}}>⚠️ Zona de Perigo</h4>
          <p style={{margin:'0 0 14px',fontSize:13,color:'#888'}}>A exclusão remove o produto e todos os insumos permanentemente.</p>
          {!delConfirm
            ?<Btn ch="🗑️ Excluir este produto" onClick={()=>setDelConfirm(true)} v="red" sm/>
            :<div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:RED,fontWeight:700}}>Tem certeza?</span>
              <Btn ch="✅ Sim, excluir" onClick={doDelete} v="red" sm/>
              <Btn ch="Cancelar" onClick={()=>setDelConfirm(false)} v="sec" sm/>
            </div>
          }
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
  useEffect(()=>{if(prod?.id){getAll('ingredients',tok,`&product_id=eq.${prod.id}`).then(res=>{if(Array.isArray(res.data))setIngs(res.data);});}},[prod?.id,tok]);
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
        {TABS.map(([k,l])=>(<button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'9px',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:700,minWidth:80,background:tab===k?NAVY:'transparent',color:tab===k?'#fff':'#777'}}>{l}</button>))}
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
          {[{l:'Custo Direto',v:r.cdu,c:'#c0392b'},{l:'Custo Fixo/Un.',v:r.cfu,c:'#e67e22'},{l:'Custos Variáveis',v:r.pIdeal*(r.cvp/100),c:'#e74c3c'},{l:`Lucro (${prod.desired_margin}%)`,v:r.pIdeal*(+prod.desired_margin/100),c:GRN}].map((b,i)=>{
            const w=r.pIdeal>0?Math.min((b.v/r.pIdeal)*100,100):0;
            return<div key={i} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:12,color:'#555'}}>{b.l}</span><span style={{fontSize:12,fontWeight:700}}>{fR(b.v)} <span style={{color:'#aaa',fontWeight:400}}>({fP(w)})</span></span></div>
              <div style={{background:'#f0f0f0',borderRadius:4,height:8}}><div style={{width:`${w}%`,height:'100%',background:b.c,borderRadius:4}}/></div>
            </div>;
          })}
        </div>
      </>}
      {tab==='pe'&&<div style={{background:'#fff',borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 4px',color:NAVY}}>🎯 Ponto de Equilíbrio</h3>
        <p style={{margin:'0 0 16px',fontSize:13,color:'#888'}}>Quantidade mínima para cobrir todos os custos fixos</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
          <Card title={`PE em ${unit}`} value={`${r.peUnits} ${unit}`} color={NAVY}/>
          <Card title="PE em Valor" value={fR(r.pe)} sub="/mês" color={NAVY}/>
          <Card title="PE +20%" value={fR(r.pe*1.2)} sub="Meta segura" color={GRN}/>
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
        <h3 style={{margin:'0 0 16px',color:NAVY}}>🧪 Ficha Técnica</h3>
        {ingRows.map((i,idx)=>(
          <div key={idx} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f0f0f0'}}>
            <div><p style={{margin:0,fontSize:14,fontWeight:600,color:'#333'}}>{i.name} <span style={{fontSize:11,color:'#aaa'}}>({i.qty_used} {i.unit})</span></p><p style={{margin:'2px 0 0',fontSize:12,color:'#888'}}>Unit: {fR(i.uc)} · c/perda: {fR(i.ucL)}</p></div>
            <strong style={{color:NAVY,fontSize:15,whiteSpace:'nowrap'}}>{fR(i.total)}</strong>
          </div>
        ))}
        <div style={{marginTop:12,padding:'12px 16px',background:'#f8f9fc',borderRadius:10,display:'flex',justifyContent:'space-between'}}>
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
  const remove=async(id,nome)=>{await del('fixed_costs',tok,id);onUpdate();toast(`"${nome}" removido.`,'warn');};
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
                <button onClick={()=>remove(c.id,c.name)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:16,padding:'4px 6px'}}>✕</button>
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
    {e:'📊',t:'Dashboard',d:'Visão geral com gráficos, semáforo, ponto de equilíbrio geral e médias ponderadas.'},
    {e:'📦',t:'Produtos / Serviços',d:'Cadastre produtos, serviços, por hora ou mensalidades. Preço mínimo, ideal e markup calculados automaticamente.'},
    {e:'🧪',t:'Ficha Técnica',d:'Dentro de cada produto, clique em "Adicionar Ficha Técnica" para listar insumos com quantidades e perdas.'},
    {e:'💰',t:'Custos Fixos',d:'Cadastre os custos fixos mensais. Rateio compartilhado divide igualmente entre todos os produtos.'},
    {e:'🏢',t:'Empresa',d:'Cadastre os dados da sua empresa: nome, CNPJ, regime tributário e contato. Aparecem no relatório PDF.'},
    {e:'🖨️',t:'Relatório PDF',d:'No Dashboard clique em "Gerar PDF" para exportar todos os produtos com preços, margens e semáforo.'},
    {e:'🎟️',t:'Código de Acesso',d:'Se você participou da palestra e adquiriu o acesso ao app, ative seu código em Perfil → Ativar Código.'},
    {e:'🎯',t:'Ponto de Equilíbrio',d:'Mostra quantas unidades você precisa vender para cobrir todos os custos fixos da empresa.'},
    {e:'💸',t:'Simulador de Desconto',d:'Veja quanto volume extra você precisa para compensar um desconto antes de concedê-lo.'},
    {e:'💳',t:'Simulador de Parcelas',d:'Calcule o custo real do parcelamento e o impacto na sua margem.'},
    {e:'🟢',t:'Semáforo',d:'Verde = saudável. Amarelo = margem comprimida. Vermelho = prejuízo.'},
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
    </div>
  );
}
function Dashboard({products,costs,fixedTotal,onOpenProd,tok,uid}){
  const{withCfu,totalFat,mcPctPonderada,peGeral}=calcDashboard(products,fixedTotal);
  const cnt={green:0,yellow:0,red:0};
  withCfu.forEach(p=>{const r=calc(p,p._cfu,fixedTotal);if(cnt[r.sem]!==undefined)cnt[r.sem]++;});
  const problemas=withCfu.filter(p=>{const r=calc(p,p._cfu,fixedTotal);return r.sem==='red'||r.sem==='yellow';});
  const[company,setCompany]=useState(null);
  useEffect(()=>{getOne('company_info',tok,'user_id',uid).then(r=>{if(Array.isArray(r.data)&&r.data.length>0)setCompany(r.data[0]);});},[]);
  const pieStatus=[{label:'Saudável',value:cnt.green,color:GRN},{label:'Atenção',value:cnt.yellow,color:YLW},{label:'Prejuízo',value:cnt.red,color:RED}].filter(d=>d.value>0);
  const totalCD=withCfu.reduce((s,p)=>s+(+p.direct_cost||0)*Math.max(+p.monthly_volume||1,1),0);
  const lucro=Math.max(totalFat-totalCD-fixedTotal,0);
  const pieComp=[{label:'Custos Diretos',value:totalCD,color:'#c0392b'},{label:'Custos Fixos',value:fixedTotal,color:YLW},{label:'Lucro Estimado',value:lucro,color:GRN}].filter(b=>b.value>0);
  const barMargem=withCfu.map(p=>{const r=calc(p,p._cfu,fixedTotal);return{label:p.name,value:Math.max(r.mcP,0),color:r.mcP>=20?GRN:r.mcP>=10?YLW:RED,display:fP(r.mcP)};}).sort((a,b)=>b.value-a.value).slice(0,8);
  const barCustos=[{label:'Custos Diretos',value:totalCD,color:'#c0392b',display:fR(totalCD)},{label:'Custos Fixos',value:fixedTotal,color:YLW,display:fR(fixedTotal)},{label:'Lucro Estimado',value:lucro,color:GRN,display:fR(lucro)}];
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <h2 style={{margin:0,color:NAVY}}>📊 Visão Geral</h2>
        {products.length>0&&<Btn ch="🖨️ Gerar PDF" onClick={()=>gerarPDF(products,costs,fixedTotal,company)} v="gold" sm/>}
      </div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        <Card title="Produtos/Serviços" value={products.length} color={NAVY}/>
        <Card title="Custos Fixos/Mês" value={fR(fixedTotal)} color={YLW}/>
        <Card title="🟢 Saudável" value={cnt.green} color={GRN}/>
        <Card title="🟡 Atenção" value={cnt.yellow} color={YLW}/>
        <Card title="🔴 Prejuízo" value={cnt.red} color={RED}/>
      </div>
      {products.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div style={{background:'#fff',borderRadius:12,padding:20}}><h4 style={{margin:'0 0 16px',color:NAVY,fontSize:14}}>🥧 Status dos Produtos</h4>{pieStatus.length>0?<PieChart data={pieStatus} size={160}/>:<p style={{color:'#aaa',fontSize:13,textAlign:'center',padding:'20px 0'}}>Cadastre produtos com preço atual</p>}</div>
          <div style={{background:'#fff',borderRadius:12,padding:20}}><h4 style={{margin:'0 0 16px',color:NAVY,fontSize:14}}>🥧 Composição do Faturamento</h4>{totalFat>0?<PieChart data={pieComp} size={160}/>:<p style={{color:'#aaa',fontSize:13,textAlign:'center',padding:'20px 0'}}>Sem dados suficientes</p>}</div>
        </div>
      )}
      {barMargem.length>0&&<div style={{background:'#fff',borderRadius:12,padding:20}}><h4 style={{margin:'0 0 16px',color:NAVY,fontSize:14}}>📊 Margem % por Produto</h4><BarChart data={barMargem}/></div>}
      {totalFat>0&&<div style={{background:'#fff',borderRadius:12,padding:20}}><h4 style={{margin:'0 0 16px',color:NAVY,fontSize:14}}>📊 Composição Financeira Mensal</h4><BarChart data={barCustos} maxVal={Math.max(...barCustos.map(d=>d.value),1)}/></div>}
      {products.length>0&&(
        <div style={{background:'#fff',borderRadius:12,padding:24}}>
          <h4 style={{margin:'0 0 16px',color:NAVY,fontSize:15}}>🎯 Ponto de Equilíbrio Geral</h4>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
            <Card title="PE Mínimo" value={fR(peGeral)} sub="Faturamento para cobrir custos" color={NAVY}/>
            <Card title="PE +20%" value={fR(peGeral*1.2)} sub="Meta recomendada" color={GRN}/>
            <Card title="Faturamento Estimado" value={fR(totalFat)} color={totalFat>=peGeral?GRN:RED}/>
            <Card title="MC% Ponderada" value={fP(mcPctPonderada)} color={NAVY}/>
          </div>
          <div style={{background:'#e8e8e8',borderRadius:8,height:14,overflow:'hidden',marginBottom:6}}>
            <div style={{width:`${peGeral>0?Math.min((totalFat/peGeral)*100,100):0}%`,height:'100%',background:totalFat>=peGeral*1.2?GRN:totalFat>=peGeral?YLW:RED,borderRadius:8,transition:'width .5s ease'}}/>
          </div>
          <div style={{background:totalFat>=peGeral*1.2?'#eafaee':totalFat>=peGeral?'#fff8e0':'#fff0ee',border:`2px solid ${totalFat>=peGeral*1.2?GRN:totalFat>=peGeral?YLW:RED}`,borderRadius:10,padding:'14px 18px',marginTop:8}}>
            {totalFat>=peGeral*1.2?<p style={{margin:0,fontSize:14,fontWeight:700,color:GRN}}>✅ Empresa saudável! {fP((totalFat/peGeral-1)*100)} acima do PE.</p>
            :totalFat>=peGeral?<p style={{margin:0,fontSize:14,fontWeight:700,color:YLW}}>⚠️ Acima do PE, mas abaixo da meta. Faltam {fR(peGeral*1.2-totalFat)}/mês.</p>
            :<p style={{margin:0,fontSize:14,fontWeight:700,color:RED}}>🔴 Abaixo do PE! Faltam {fR(peGeral-totalFat)}/mês.</p>}
          </div>
        </div>
      )}
      {problemas.length>0&&<div style={{background:'#fff',borderRadius:12,padding:20}}>
        <h4 style={{margin:'0 0 14px',color:RED,fontSize:14}}>⚠️ Atenção necessária</h4>
        {problemas.map(p=>{const r=calc(p,p._cfu,fixedTotal),sc=SEM[r.sem];return(
          <div key={p.id} onClick={()=>onOpenProd(p)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:sc.bg,marginBottom:8,cursor:'pointer',border:`1.5px solid ${sc.c}33`}}>
            <div><p style={{margin:0,fontSize:14,fontWeight:700,color:'#333'}}>{sc.e} {p.name}</p><p style={{margin:'2px 0 0',fontSize:12,color:'#777'}}>Cobra {fR(p.current_price)} · Ideal: {fR(r.pIdeal)}</p></div>
            <span style={{fontSize:12,fontWeight:700,color:sc.c}}>{sc.l} →</span>
          </div>
        );})}
      </div>}
      {products.length===0&&<div style={{background:'#fff',borderRadius:12,padding:40,textAlign:'center'}}><p style={{fontSize:40,margin:'0 0 12px'}}>📦</p><h3 style={{margin:'0 0 8px',color:NAVY}}>Comece adicionando um produto</h3><p style={{margin:0,color:'#aaa',fontSize:14}}>Vá em "Produtos" e clique em "+ Novo".</p></div>}
    </div>
  );
}

function ProfileScreen({tok,uid,plan,onCodeActivated,toast,onLogout}){
  const[showCode,setShowCode]=useState(false);
  const[code,setCode]=useState('');
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState('');
  const pl=PLAN_LIMITS[plan?.plan||'free'];
  const activate=async()=>{
    if(!code.trim()){setErr('Digite o código');return;}
    setLoading(true);setErr('');
    const r=await activateCode(tok,uid,code);
    setLoading(false);
    if(!r.ok){setErr(r.msg);return;}
    toast('🎉 Acesso ativado! Bem-vindo ao plano Palestra!');
    onCodeActivated(r.plan);setShowCode(false);setCode('');
  };
  return(
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <h2 style={{margin:0,color:NAVY}}>👤 Perfil & Plano</h2>
      <div style={{background:NAVY,borderRadius:14,padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
          <div>
            <p style={{margin:0,fontSize:12,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:1}}>Plano atual</p>
            <p style={{margin:'4px 0 0',fontSize:28,fontWeight:900,color:pl.color}}>{pl.label}</p>
            <p style={{margin:'4px 0 0',fontSize:13,color:'rgba(255,255,255,.5)'}}>
              {plan?.plan==='free'?'Até 5 produtos':'Produtos ilimitados'}
              {plan?.activated_via&&` · Código: ${plan.activated_via}`}
            </p>
          </div>
          {plan?.plan==='free'&&<div style={{background:'rgba(201,168,76,.15)',border:'1px solid rgba(201,168,76,.3)',borderRadius:10,padding:'12px 16px',textAlign:'center'}}>
            <p style={{margin:0,fontSize:12,color:GOLD,fontWeight:700}}>Tem um código?</p>
            <p style={{margin:'4px 0 0',fontSize:11,color:'rgba(255,255,255,.4)'}}>Ative abaixo 👇</p>
          </div>}
        </div>
      </div>
      {plan?.plan==='free'&&(
        <div style={{background:'#fff',borderRadius:12,padding:24}}>
          <h4 style={{margin:'0 0 8px',color:NAVY,fontSize:14}}>🎟️ Ativar Código da Palestra</h4>
          <p style={{margin:'0 0 16px',fontSize:13,color:'#666'}}>Se você adquiriu o acesso ao app na palestra presencial, insira o código abaixo para desbloquear recursos ilimitados.</p>
          {!showCode
            ?<Btn ch="🔓 Inserir código de acesso" onClick={()=>setShowCode(true)} v="gold"/>
            :<div>
              <Inp label="Código de acesso" val={code} set={v=>setCode(v.toUpperCase())} type="text" ph="Ex: PI-ABC12345"/>
              {err&&<p style={{color:RED,fontSize:13,background:'#fff0ee',padding:'10px 14px',borderRadius:8,margin:'0 0 14px'}}>{err}</p>}
              <div style={{display:'flex',gap:10}}>
                <Btn ch={loading?'Verificando...':'✅ Ativar'} onClick={activate} v="gold" disabled={loading||!code.trim()}/>
                <Btn ch="Cancelar" onClick={()=>{setShowCode(false);setErr('');setCode('');}} v="sec"/>
              </div>
            </div>
          }
        </div>
      )}
      {plan?.plan!=='free'&&(
        <div style={{background:'#eafaee',border:`2px solid ${GRN}`,borderRadius:12,padding:20}}>
          <p style={{margin:0,fontSize:15,fontWeight:700,color:GRN}}>✅ Acesso completo ativado!</p>
          <p style={{margin:'6px 0 0',fontSize:13,color:'#555'}}>Você tem acesso ilimitado a todos os recursos do app.</p>
          {plan?.activated_at&&<p style={{margin:'4px 0 0',fontSize:12,color:'#aaa'}}>Ativado em: {new Date(plan.activated_at).toLocaleDateString('pt-BR')}</p>}
        </div>
      )}
      <div style={{background:'#fff',borderRadius:12,padding:20}}>
        <h4 style={{margin:'0 0 14px',color:NAVY,fontSize:14}}>Comparativo de Planos</h4>
        {[['Produtos cadastrados',plan?.plan==='free'?'Até 5':'Ilimitados'],['Ficha técnica de insumos',plan?.plan==='free'?'❌':'✅'],['Gráficos e dashboard',plan?.plan==='free'?'❌':'✅'],['Relatório PDF','✅'],['Simuladores de desconto/parcela','✅'],['Ponto de equilíbrio','✅']].map(([k,v])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #f0f0f0'}}>
            <span style={{fontSize:13,color:'#555'}}>{k}</span>
            <span style={{fontSize:13,fontWeight:700,color:v==='✅'?GRN:v==='❌'?RED:NAVY}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{background:'#fff0ee',borderRadius:12,padding:20}}>
        <Btn ch="🚪 Sair da conta" onClick={onLogout} v="red" full/>
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
  const[plan,setPlan]=useState({plan:'free'});
  const[showActivate,setShowActivate]=useState(false);
  const{toasts,show:toast}=useToast();
  const tok=session?.token,uid=session?.user?.id;
  const isAdmin=session?.user?.email===ADMIN_EMAIL;
  const fixedTotal=costs.reduce((s,c)=>s+(+c.amount||0),0);

  useEffect(()=>{
    if(!session?.refresh_token)return;
    const interval=setInterval(async()=>{
      const r=await refreshToken(session.refresh_token);
      if(r.ok)setSession(s=>({...s,token:r.data.access_token,refresh_token:r.data.refresh_token}));
    },50*60*1000);
    return()=>clearInterval(interval);
  },[session?.refresh_token]);

  const load=useCallback(async()=>{
    if(!tok)return;setLoading(true);
    const[pr,cr,pl]=await Promise.all([getAll('products',tok),getAll('fixed_costs',tok),loadPlan(tok,uid)]);
    if(Array.isArray(pr.data))setProducts(pr.data);
    if(Array.isArray(cr.data))setCosts(cr.data);
    if(pl)setPlan(pl);
    setLoading(false);
  },[tok]);

  useEffect(()=>{load();},[load]);

  // PWA — service worker
  useEffect(()=>{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    }
  },[]);

  const handleAuth=async(s)=>{
    setSession(s);
    setScreen('dash');
    // Verifica se é novo usuário — mostra tela de ativação de código
    const pl=await loadPlan(s.token,s.user.id);
    setPlan(pl||{plan:'free'});
    if(!pl||pl.plan==='free'){
      // Mostra tela de ativação após 1s
      setTimeout(()=>setShowActivate(true),1000);
    }
  };

  if(!session)return<AuthScreen onAuth={handleAuth}/>;

  if(showActivate)return<ActivateCodeScreen tok={tok} uid={uid}
    onActivated={async(p)=>{setShowActivate(false);await load();toast('🎉 Acesso da palestra ativado!');}}
    onSkip={()=>setShowActivate(false)}/>;

  const goto=s=>{setScreen(s);setSelected(null);setEditing(null);setAdding(false);};
  const NAV=[['dash','📊','Início'],['products','📦','Produtos'],['costs','💰','Custos'],['company','🏢','Empresa'],['profile','👤','Perfil'],...(isAdmin?[['admin','👑','Admin']]:[])];;

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
        {/* Badge plano */}
        <div style={{background:PLAN_LIMITS[plan?.plan||'free'].color+'33',border:`1px solid ${PLAN_LIMITS[plan?.plan||'free'].color}`,borderRadius:8,padding:'4px 10px',cursor:'pointer'}} onClick={()=>goto('profile')}>
          <span style={{fontSize:11,fontWeight:700,color:PLAN_LIMITS[plan?.plan||'free'].color}}>{PLAN_LIMITS[plan?.plan||'free'].label}</span>
        </div>
      </div>
      <div style={{maxWidth:900,margin:'0 auto',padding:'24px 16px'}}>
        {loading&&<p style={{color:'#aaa',textAlign:'center'}}>Carregando...</p>}
        {screen==='dash'&&!loading&&<Dashboard products={products} costs={costs} fixedTotal={fixedTotal} onOpenProd={p=>{setSelected(p);setScreen('products');}} tok={tok} uid={uid}/>}
        {screen==='products'&&!loading&&<>
          {editing
            ?<ProdForm prod={editing} tok={tok} uid={uid} products={products} fixedTotal={fixedTotal} toast={toast} plan={plan} onSave={saved=>{load();setEditing(null);setSelected(saved);}} onCancel={()=>setEditing(null)} onDelete={()=>{load();setEditing(null);setSelected(null);}}/>
            :adding
            ?<ProdForm tok={tok} uid={uid} products={products} fixedTotal={fixedTotal} toast={toast} plan={plan} onSave={saved=>{load();setAdding(false);setSelected(saved);}} onCancel={()=>setAdding(false)} onDelete={()=>{}}/>
            :selected
            ?<ProdDetail prod={selected} tok={tok} fixedTotal={fixedTotal} products={products} onEdit={()=>setEditing(selected)} onBack={()=>setSelected(null)}/>
            :<div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h2 style={{margin:0,color:NAVY}}>📦 Produtos / Serviços</h2>
                <Btn ch="+ Novo" onClick={()=>setAdding(true)} v="gold"/>
              </div>
              {plan?.plan==='free'&&<div style={{background:CREME,border:`1.5px solid ${GOLD}55`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <span style={{fontSize:13,color:NAVY}}> 🎟️ Plano gratuito: {products.length}/5 produtos</span>
                <Btn ch="Ativar código" onClick={()=>goto('profile')} v="gold" sm/>
              </div>}
              {products.length===0
                ?<div style={{background:'#fff',borderRadius:12,padding:40,textAlign:'center'}}><p style={{fontSize:40,margin:'0 0 12px'}}>📦</p><h3 style={{margin:'0 0 8px',color:NAVY}}>Nenhum item ainda</h3><Btn ch="+ Criar Primeiro" onClick={()=>setAdding(true)} v="gold"/></div>
                :products.map(p=>{
                  const pCfu=calcFixed(products,fixedTotal).find(x=>x.id===p.id)||p;
                  const r=calc(pCfu,pCfu._cfu,fixedTotal),sc=SEM[r.sem]||SEM.none,tl=PROD_TYPES.find(t=>t.k===p.type);
                  return(
                    <div key={p.id} onClick={()=>setSelected(p)} style={{background:'#fff',borderRadius:12,padding:'16px 20px',cursor:'pointer',boxShadow:'0 2px 6px #0001',display:'flex',justifyContent:'space-between',alignItems:'center',borderLeft:`5px solid ${sc.c}`}}>
                      <div><p style={{margin:0,fontSize:15,fontWeight:700,color:NAVY}}>{sc.e} {p.name} <span style={{fontSize:11,color:'#aaa',fontWeight:400}}>{tl?.l}</span></p><p style={{margin:'3px 0 0',fontSize:12,color:'#aaa'}}>Ideal: {fR(r.pIdeal)} · MC%: {fP(r.mcP)} · PE: {r.peUnits} un.</p></div>
                      <div style={{textAlign:'right'}}><p style={{margin:0,fontSize:13,fontWeight:700,color:sc.c}}>{sc.l}</p><p style={{margin:'2px 0 0',fontSize:12,color:'#aaa'}}>→</p></div>
                    </div>
                  );
                })
              }
            </div>
          }
        </>}
        {screen==='costs'&&!loading&&<CostsScreen costs={costs} tok={tok} uid={uid} onUpdate={load} toast={toast}/>}
        {screen==='company'&&!loading&&<CompanyScreen tok={tok} uid={uid} toast={toast}/>}
        {screen==='profile'&&<ProfileScreen tok={tok} uid={uid} plan={plan} toast={toast} onCodeActivated={async()=>{await load();}} onLogout={()=>setSession(null)}/>}
        {screen==='admin'&&isAdmin&&<AdminPanel tok={tok} toast={toast}/>}
        {screen==='info'&&<InfoScreen/>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
