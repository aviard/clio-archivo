import { useState, useEffect, useRef, useCallback } from 'react';
import { ISSUES } from './issues.js';
import { DOMAINS, PERIODS } from './taxonomy.js';
import { loadAllArticles, loadCatalogedKeys, appendIssueArticles } from './sheets.js';
import { catalogIssue } from './catalog.js';
import { algoliaSearch } from './algolia.js';

const INK    = '#1a1a1a';
const RULE   = '#c8c0b0';
const OFFWHT = '#f8f5f0';
const ACCENT = '#8b1c1c';
const MONO   = "'JetBrains Mono','Courier New',monospace";
const SERIF  = "'Libre Baskerville',Georgia,serif";
const BODY   = "'Source Serif 4',Georgia,serif";

function hl(text, q) {
  if (!q || !text) return text;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.split(new RegExp(`(${esc})`, 'gi')).map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} style={{background:'#f5e642',color:'#000',padding:'0 1px'}}>{p}</mark>
      : p
  );
}

export default function App() {
  const [view, setView]           = useState('search');
  const [articles, setArticles]   = useState([]);
  const [cataloged, setCataloged] = useState(new Set());
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState('');

  // Search filters
  const [q, setQ]           = useState('');
  const [fDomain, setFDomain] = useState('');
  const [fPeriod, setFPeriod] = useState('');
  const [fTag, setFTag]     = useState('');
  const [sortBy, setSort]   = useState('reciente');
  const [page, setPage]     = useState(1);
  const PER_PAGE = 50;

  // Algolia full-text search state
  const [algoliaResults, setAlgoliaResults] = useState(null); // null = not active
  const [algoliaLoading, setAlgoliaLoading] = useState(false);
  const [algoliaPages, setAlgoliaPages]     = useState(0);
  const [algoliaPage, setAlgoliaPage]       = useState(0);
  const algoliaTimer = useRef(null);

  // Admin
  const [running, setRunning]   = useState(false);
  const [statusMsg, setStatus]  = useState('');
  const [prog, setProg]         = useState({n:0,total:0});
  const stopRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const [arts, keys] = await Promise.all([loadAllArticles(), loadCatalogedKeys()]);
      setArticles(arts);
      setCataloged(keys);
    } catch(e) { setLoadErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [q, fDomain, fPeriod, fTag, sortBy]);

  // Algolia: trigger search when query is 2+ chars, debounced 300ms
  useEffect(() => {
    if (algoliaTimer.current) clearTimeout(algoliaTimer.current);
    if (!q || q.trim().length < 2) {
      setAlgoliaResults(null);
      setAlgoliaLoading(false);
      return;
    }
    setAlgoliaLoading(true);
    algoliaTimer.current = setTimeout(async () => {
      try {
        const res = await algoliaSearch(q, { domain: fDomain, period: fPeriod, page: algoliaPage });
        setAlgoliaResults(res.hits || []);
        setAlgoliaPages(res.nbPages || 0);
      } catch(e) {
        console.error('Algolia error:', e);
        setAlgoliaResults(null); // fall back to local filter
      } finally {
        setAlgoliaLoading(false);
      }
    }, 300);
  }, [q, fDomain, fPeriod, algoliaPage]);

  // Reset algolia page when query changes
  useEffect(() => { setAlgoliaPage(0); }, [q, fDomain, fPeriod]);

  // Collect all tags that appear in the catalog
  const allTags = [...new Set(articles.flatMap(a => a.tags))].sort((a,b) => a.localeCompare(b,'es'));
  const allNewTags = [...new Set(articles.flatMap(a => a.new_tags))].sort((a,b) => a.localeCompare(b,'es'));

  // Filter & sort
  const filtered = articles.filter(a => {
    const lq = q.toLowerCase();
    if (lq && !(a.title||'').toLowerCase().includes(lq) &&
              !(a.author||'').toLowerCase().includes(lq) &&
              !(a.domain||'').toLowerCase().includes(lq) &&
              !(a.period||'').toLowerCase().includes(lq) &&
              !a.tags.some(t => t.toLowerCase().includes(lq)) &&
              !a.new_tags.some(t => t.toLowerCase().includes(lq)) &&
              !(a.resumen||''  ).toLowerCase().includes(lq) &&
              !(a.indice ||''  ).toLowerCase().includes(lq)) return false;
    if (fDomain && a.domain !== fDomain) return false;
    if (fPeriod && a.period !== fPeriod) return false;
    if (fTag && !a.tags.includes(fTag) && !a.new_tags.includes(fTag)) return false;
    return true;
  }).sort((a,b) => {
    if (sortBy==='reciente') return (parseInt(b.year)||0)-(parseInt(a.year)||0);
    if (sortBy==='antiguo')  return (parseInt(a.year)||0)-(parseInt(b.year)||0);
    if (sortBy==='titulo')   return (a.title||'').localeCompare(b.title||'','es');
    if (sortBy==='autor')    return (a.author||'').localeCompare(b.author||'','es');
    return 0;
  });

  // When algolia results available, use those; otherwise use local filtered list
  const usingAlgolia = algoliaResults !== null && q.trim().length >= 2;
  const displayArts  = usingAlgolia
    ? algoliaResults.map(hit => ({
        year:    String(hit.año || hit.year || ''),
        no:      hit.numero  || '',
        title:   hit._highlightResult?.titulo?.value || hit.titulo || '',
        author:  hit._highlightResult?.autor?.value  || hit.autor  || '',
        pages:   hit.paginas || '',
        domain:  hit.dominio || '',
        period:  hit.periodo || '',
        tags:    Array.isArray(hit.etiquetas) ? hit.etiquetas
                   : typeof hit.etiquetas === 'string' ? hit.etiquetas.split(',').map(t=>t.trim()).filter(Boolean)
                   : [],
        new_tags:[],
        pdf_url: hit.pdf_url || '',
        resumen: hit._snippetResult?.resumen?.value || hit.resumen || '',
        _isAlgolia: true,
      }))\
    : filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const totalPages = usingAlgolia ? algoliaPages : Math.ceil(filtered.length / PER_PAGE);
  const currentPage = usingAlgolia ? algoliaPage + 1 : page;
  const pageArts   = displayArts;
  const decades    = [...new Set(ISSUES.map(i=>Math.floor(parseInt(i.year)/10)*10).filter(Boolean))].sort((a,b)=>b-a);

  // Admin: run cataloging
  const runCatalog = async (batchSize) => {
    setRunning(true); stopRef.current = false;
    const remaining = [...ISSUES].filter(i => !cataloged.has(`${i.year}-${i.no}`)).sort((a,b) => parseInt(a.no) - parseInt(b.no));
    const batch = remaining.slice(0, batchSize);
    setProg({n:0, total:batch.length});
    for (let i=0; i<batch.length; i++) {
      if (stopRef.current) { setStatus('Proceso detenido.'); break; }
      const issue = batch[i];
      setStatus(`Catalogando Núm. ${issue.no} (${issue.year})…`);
      try {
        const arts = await catalogIssue(issue);
        await appendIssueArticles(issue, arts);
        setStatus(`✓ Núm. ${issue.no} — ${arts.length} artículos`);
        setArticles(prev => [...prev, ...arts.map(a => ({
          year:issue.year, no:issue.no,
          title:a.title, author:a.author, pages:a.pages,
          domain:a.domain, period:a.period,
          tags:a.tags||[], new_tags:a.new_tags||[],
          pdf_url:issue.pdf,
        }))]);
        setCataloged(prev => new Set([...prev, `${issue.year}-${issue.no}`]));
      } catch(e) { setStatus(`✗ Núm. ${issue.no}: ${e.message}`); }
      setProg({n:i+1, total:batch.length});
      if (i < batch.length-1 && !stopRef.current) await new Promise(r=>setTimeout(r,1000));
    }
    setRunning(false);
  };

  if (loading) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',
                 justifyContent:'center',height:'100vh',background:OFFWHT,gap:16}}>
      <div style={{width:28,height:28,border:`2px solid ${RULE}`,borderTopColor:ACCENT,
                   borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
      <div style={{fontFamily:BODY,fontSize:16,color:'#666'}}>Cargando archivo…</div>
    </div>
  );

  if (loadErr) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',
                 justifyContent:'center',height:'100vh',background:OFFWHT,gap:12,padding:32}}>
      <div style={{fontFamily:SERIF,fontSize:20,color:ACCENT}}>Error al cargar</div>
      <div style={{fontFamily:BODY,fontSize:15,color:'#555',textAlign:'center',maxWidth:500}}>
        {loadErr}
      </div>
      <button onClick={reload} style={{fontFamily:MONO,fontSize:12,padding:'8px 18px',
        background:INK,color:'#fff',border:'none',cursor:'pointer'}}>
        Reintentar
      </button>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:OFFWHT,color:INK,fontFamily:BODY}}>

      {/* Header */}
      <header style={{background:'#fff',borderBottom:`3px solid ${INK}`}}>
        <div style={{maxWidth:1280,margin:'0 auto',padding:'28px 32px 0'}}>
          <div style={{display:'flex',justifyContent:'space-between',
                       alignItems:'flex-start',flexWrap:'wrap',gap:16,marginBottom:20}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:10,letterSpacing:3,
                           color:'#888',textTransform:'uppercase',marginBottom:6}}>
                Academia Dominicana de la Historia
              </div>
              <h1 style={{fontFamily:SERIF,fontSize:48,fontWeight:700,
                          color:INK,margin:'0 0 4px',letterSpacing:-1,lineHeight:1}}>
                <em>Clío</em>
              </h1>
              <div style={{fontFamily:MONO,fontSize:11,color:'#888',letterSpacing:1}}>
                Índice Analítico · Números 1–209 · 1933–2025
              </div>
            </div>
            <div style={{display:'flex',gap:28,flexWrap:'wrap'}}>
              <Stat n={articles.length.toLocaleString('es')} label="artículos indexados"/>
              <Stat n={`${cataloged.size}/${ISSUES.length}`} label="números catalogados"/>
              <Stat n={allTags.length.toLocaleString('es')} label="etiquetas temáticas"/>
            </div>
          </div>
          <div style={{borderTop:`1px solid ${RULE}`}}/>
          <nav style={{display:'flex'}}>
            {[['search','Búsqueda'],['browse','Por Número'],['tags','Índice de Etiquetas'],['admin','Administración']].map(([id,label])=>(
              <button key={id} onClick={()=>setView(id)} style={{
                fontFamily:MONO,fontSize:11,letterSpacing:2,textTransform:'uppercase',
                padding:'12px 20px',background:'transparent',border:'none',cursor:'pointer',
                borderBottom:view===id?`3px solid ${ACCENT}`:'3px solid transparent',
                color:view===id?INK:'#666',
              }}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <div style={{maxWidth:1280,margin:'0 auto',padding:'32px 32px 80px'}}>

        {/* ══ BÚSQUEDA ══════════════════════════════════════════════════════ */}
        {view==='search' && (
          <div style={{display:'flex',gap:36,alignItems:'flex-start'}}>

            {/* Sidebar — top tags */}
            <aside style={{width:200,flexShrink:0,position:'sticky',top:20}}>
              <SideSection label="ETIQUETAS FRECUENTES">
                {allTags
                  .map(tag=>({tag,count:articles.filter(a=>a.tags.includes(tag)).length}))
                  .sort((a,b)=>b.count-a.count)
                  .slice(0,30)
                  .map(({tag,count})=>(
                    <SideBtn key={tag} active={fTag===tag} onClick={()=>setFTag(fTag===tag?'':tag)}>
                      <span style={{flex:1}}>{tag}</span>
                      <span style={{fontFamily:MONO,fontSize:10,color:'#aaa',marginLeft:4}}>{count}</span>
                    </SideBtn>
                  ))
                }
              </SideSection>
            </aside>

            {/* Results */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{marginBottom:20}}>
                {/* Search input */}
                <div style={{position:'relative',marginBottom:8}}>
                  <input value={q} onChange={e=>setQ(e.target.value)}
                    placeholder="Buscar por título, autor, período, dominio o etiqueta…"
                    style={{width:'100%',fontFamily:BODY,fontSize:17,color:INK,
                            background:'#fff',border:`1px solid ${RULE}`,
                            borderBottom:`2px solid ${INK}`,padding:'11px 40px 11px 14px',
                            outline:'none',boxSizing:'border-box'}}/>
                  {q && (
                    <button onClick={()=>setQ('')} style={{
                      position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
                      fontFamily:MONO,fontSize:18,color:'#aaa',background:'none',
                      border:'none',cursor:'pointer',lineHeight:1,padding:0}}>×</button>
                  )}
                </div>
                {/* Filter + sort bar */}
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',
                             background:'#fff',border:`1px solid ${RULE}`,padding:'8px 12px'}}>
                  <span style={{fontFamily:MONO,fontSize:10,letterSpacing:1.5,
                                color:'#aaa',textTransform:'uppercase',marginRight:4}}>Filtrar:</span>
                  <select value={fDomain} onChange={e=>setFDomain(e.target.value)} style={{
                    fontFamily:BODY,fontSize:13,color:fDomain?INK:'#888',background:'#fff',
                    border:`1px solid ${fDomain?INK:RULE}`,padding:'4px 6px',outline:'none',
                    maxWidth:190}}>
                    <option value="">Todos los dominios</option>
                    {DOMAINS.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={fPeriod} onChange={e=>setFPeriod(e.target.value)} style={{
                    fontFamily:BODY,fontSize:13,color:fPeriod?INK:'#888',background:'#fff',
                    border:`1px solid ${fPeriod?INK:RULE}`,padding:'4px 6px',outline:'none'}}>
                    <option value="">Todos los períodos</option>
                    {PERIODS.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  <div style={{width:1,height:20,background:RULE,margin:'0 4px'}}/>
                  <span style={{fontFamily:MONO,fontSize:10,letterSpacing:1.5,
                                color:'#aaa',textTransform:'uppercase'}}>Ordenar:</span>
                  <select value={sortBy} onChange={e=>setSort(e.target.value)} style={{
                    fontFamily:BODY,fontSize:13,color:INK,background:'#fff',
                    border:`1px solid ${RULE}`,padding:'4px 6px',outline:'none'}}>
                    <option value="reciente">Más reciente primero</option>
                    <option value="antiguo">Más antiguo primero</option>
                    <option value="titulo">Título A–Z</option>
                    <option value="autor">Autor A–Z</option>
                  </select>
                  {(q||fDomain||fPeriod||fTag) && (
                    <button onClick={()=>{setQ('');setFDomain('');setFPeriod('');setFTag('');}} style={{
                      fontFamily:MONO,fontSize:10,color:ACCENT,background:'none',
                      border:`1px solid ${ACCENT}`,padding:'3px 8px',
                      cursor:'pointer',marginLeft:4,letterSpacing:0.5}}>✕ Limpiar</button>
                  )}
                  <span style={{fontFamily:MONO,fontSize:11,color:'#888',marginLeft:'auto'}}>
                    {algoliaLoading
                      ? 'Buscando…'
                      : usingAlgolia
                        ? `${algoliaResults.length} resultado${algoliaResults.length!==1?'s':''} (texto completo)`
                        : `${filtered.length.toLocaleString('es')} resultado${filtered.length!==1?'s':''}`
                    }
                  </span>
                </div>
                {/* Algolia mode indicator */}
                {usingAlgolia && !algoliaLoading && (
                  <div style={{marginTop:6,fontFamily:MONO,fontSize:10,color:'#aaa',letterSpacing:0.5}}>
                    ⚡ Búsqueda en texto completo · {algoliaResults.length} artículos encontrados
                  </div>
                )}
                {/* Active tag filter pill */}
                {fTag && (
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8}}>
                    <span style={{fontFamily:MONO,fontSize:11,color:'#888'}}>Etiqueta:</span>
                    <span style={{fontFamily:MONO,fontSize:12,color:INK,
                                  background:'#fff',border:`1px solid ${INK}`,
                                  padding:'2px 10px',display:'flex',alignItems:'center',gap:6}}>
                      {fTag}
                      <button onClick={()=>setFTag('')} style={{background:'none',border:'none',
                        cursor:'pointer',color:'#aaa',fontSize:14,lineHeight:1,padding:0}}>×</button>
                    </span>
                  </div>
                )}
              </div>

              {articles.length===0 && (
                <EmptyState>
                  <p style={{fontFamily:SERIF,fontSize:20,fontWeight:700,marginBottom:8}}>
                    El índice está siendo construido.
                  </p>
                  <p style={{fontSize:16,color:'#555',lineHeight:1.7,marginBottom:16,maxWidth:520}}>
                    Acceda a <strong>Administración</strong> para iniciar la catalogación automatizada.
                  </p>
                  <button onClick={()=>setView('admin')} style={{
                    fontFamily:MONO,fontSize:12,letterSpacing:1,textTransform:'uppercase',
                    background:INK,color:'#fff',border:'none',padding:'10px 20px',cursor:'pointer'}}>
                    Ir a Administración
                  </button>
                </EmptyState>
              )}

              {articles.length>0 && filtered.length===0 && (
                <EmptyState>
                  <p style={{fontSize:16,color:'#555',marginBottom:12}}>
                    No se encontraron artículos con estos criterios.
                  </p>
                  <button onClick={()=>{setQ('');setFDomain('');setFPeriod('');setFTag('');}}
                    style={{fontFamily:BODY,fontSize:15,color:ACCENT,background:'none',
                            border:'none',textDecoration:'underline',cursor:'pointer'}}>
                    Limpiar filtros
                  </button>
                </EmptyState>
              )}

              {pageArts.length>0 && (
                <>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:14,background:'#fff'}}>
                    <thead>
                      <tr>
                        {[['Año',52],['Núm.',52],['Título y etiquetas',null],['Autor',180],['Período',140],['',40]].map(([h,w],i)=>(
                          <th key={i} style={{fontFamily:MONO,fontSize:10,letterSpacing:1.5,
                            textTransform:'uppercase',color:'#888',padding:'8px 10px',
                            textAlign:'left',borderBottom:`2px solid ${INK}`,
                            fontWeight:500,width:w||undefined}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageArts.map((a,i)=>(
                        <tr key={i} className="result-row"
                          style={{borderBottom:'1px solid #ede8e0'}}>
                          <td style={{padding:'10px 10px',fontFamily:MONO,fontSize:12,color:'#444',verticalAlign:'top'}}>{a.year}</td>
                          <td style={{padding:'10px 10px',fontFamily:MONO,fontSize:12,verticalAlign:'top'}}>{a.no}</td>
                          <td style={{padding:'10px 10px',verticalAlign:'top',lineHeight:1.4}}>
                            <div style={{fontFamily:BODY,fontSize:15,color:INK,marginBottom:4}}>
                              {a.pdf_url
                                ? <a href={a.pdf_url} target="_blank" rel="noreferrer"
                                    style={{color:INK,textDecoration:'none',borderBottom:`1px solid ${RULE}`}}
                                    dangerouslySetInnerHTML={a._isAlgolia ? {__html: a.title} : undefined}>
                                    {a._isAlgolia ? undefined : hl(a.title,q)}
                                  </a>
                                : a._isAlgolia
                                  ? <span dangerouslySetInnerHTML={{__html: a.title}}/>
                                  : hl(a.title,q)
                              }
                            </div>
                            {a.resumen && (
                              <div style={{fontFamily:BODY,fontSize:12,color:'#666',
                                           lineHeight:1.5,marginBottom:5,fontStyle:'italic'}}>
                                {a._isAlgolia
                                  ? <span dangerouslySetInnerHTML={{__html: a.resumen}}/>
                                  : hl(a.resumen,q)
                                }
                              </div>
                            )}
                            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                              {a.tags.map(tag=>(
                                <button key={tag} onClick={()=>{setFTag(tag);setPage(1);}}
                                  style={{fontFamily:MONO,fontSize:10,color:'#555',
                                          background:fTag===tag?'#ede8e0':'#f5f2ee',
                                          border:`1px solid ${RULE}`,padding:'2px 7px',
                                          cursor:'pointer',borderRadius:2}}>
                                  {tag}
                                </button>
                              ))}
                              {a.new_tags.map(tag=>(
                                <span key={tag} style={{fontFamily:MONO,fontSize:10,
                                  color:ACCENT,background:'#fdf5f5',
                                  border:`1px solid #e8c0c0`,padding:'2px 7px',
                                  borderRadius:2,cursor:'default'}} title="Etiqueta nueva — pendiente de revisión">
                                  {tag} *
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{padding:'10px 10px',fontStyle:'italic',color:'#444',
                                      fontSize:13,verticalAlign:'top'}}>
                            <button onClick={()=>{setQ('');setFTag('');setFDomain('');setFPeriod('');setQ(a._isAlgolia ? a.author.replace(/<[^>]*>/g,'') : a.author);}}
                              style={{fontFamily:'inherit',fontStyle:'italic',fontSize:13,
                                      color:'#444',background:'none',border:'none',
                                      cursor:'pointer',padding:0,textAlign:'left',
                                      textDecoration:'underline dotted',textUnderlineOffset:3}}
                              dangerouslySetInnerHTML={a._isAlgolia ? {__html: a.author} : undefined}>
                              {a._isAlgolia ? undefined : hl(a.author,q)}
                            </button>
                          </td>
                          <td style={{padding:'10px 10px',fontFamily:MONO,fontSize:11,
                                      color:'#666',verticalAlign:'top',lineHeight:1.4}}>
                            <div>{a.period}</div>
                            {a.domain && <div style={{color:'#aaa',marginTop:2,fontSize:10}}>{a.domain}</div>}
                          </td>
                          <td style={{padding:"10px 10px",verticalAlign:"top"}}>
                            {a.pdf_url ? (
                              <a href={a.pdf_url} target="_blank" rel="noreferrer"
                                style={{fontFamily:MONO,fontSize:11,color:ACCENT,
                                        textDecoration:"none",border:`1px solid ${ACCENT}`,
                                        padding:"3px 7px",whiteSpace:"nowrap",display:"inline-block"}}>
                                PDF ↗
                              </a>
                            ) : (
                              <span style={{fontFamily:MONO,fontSize:11,color:"#ccc",
                                            border:"1px solid #ddd",padding:"3px 7px"}}>PDF</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {totalPages>1 && (
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
                                 gap:20,padding:'24px 0',borderTop:`1px solid ${RULE}`}}>
                      <PagerBtn disabled={currentPage<=1} onClick={()=>usingAlgolia?setAlgoliaPage(p=>p-1):setPage(p=>p-1)}>← Anterior</PagerBtn>
                      <span style={{fontFamily:MONO,fontSize:12,color:'#888'}}>
                        Página {currentPage} de {totalPages}
                      </span>
                      <PagerBtn disabled={currentPage>=totalPages} onClick={()=>usingAlgolia?setAlgoliaPage(p=>p+1):setPage(p=>p+1)}>Siguiente →</PagerBtn>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ══ POR NÚMERO ════════════════════════════════════════════════════ */}
        {view==='browse' && (
          <div style={{maxWidth:1060}}>
            <PageHeading>Números de <em>Clío</em></PageHeading>
            <p style={{fontFamily:BODY,fontSize:16,color:'#444',lineHeight:1.7,
                       margin:'0 0 28px',maxWidth:720}}>
              {ISSUES.length} números publicados entre 1933 y 2025.
              Los números en <span style={{color:'#1a5c1a',fontWeight:600}}>verde</span> están en el índice.
            </p>
            {decades.map(dec=>{
              const decIssues=ISSUES.filter(i=>{const y=parseInt(i.year);return y>=dec&&y<dec+10;}).sort((a,b)=>parseInt(b.year)-parseInt(a.year)||(parseInt(b.no)||0)-(parseInt(a.no)||0));
              if(!decIssues.length) return null;
              return (
                <div key={dec} style={{marginBottom:28}}>
                  <div style={{fontFamily:MONO,fontSize:11,letterSpacing:3,color:'#888',
                               textTransform:'uppercase',marginBottom:8,
                               borderBottom:`1px solid ${RULE}`,paddingBottom:4}}>
                    {dec}–{dec+9}
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {decIssues.map(iss=>{
                      const done=cataloged.has(`${iss.year}-${iss.no}`) || cataloged.has(iss.no);
                      const count=done?articles.filter(a=>a.year===iss.year&&a.no===iss.no).length:null;
                      return (
                        <a key={`${iss.year}-${iss.no}`} href={iss.pdf}
                          target="_blank" rel="noreferrer" className="issue-cell"
                          style={{padding:'8px 10px',
                            background:done?'#f0f7f0':'#fff',
                            border:`1px solid ${done?'#5a9a5a':RULE}`,
                            textDecoration:'none',display:'flex',
                            flexDirection:'column',alignItems:'center',minWidth:80}}>
                          <span style={{fontFamily:SERIF,fontSize:13,fontWeight:700,color:INK}}>
                            Núm. {iss.no}
                          </span>
                          <span style={{fontFamily:MONO,fontSize:10,color:'#888',marginTop:1}}>
                            {iss.year}
                          </span>
                          {count!==null&&(
                            <span style={{fontFamily:MONO,fontSize:10,color:'#2a7a2a',marginTop:2}}>
                              {count} arts.
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ ÍNDICE DE ETIQUETAS ═══════════════════════════════════════════ */}
        {view==='tags' && (
          <div style={{maxWidth:1060}}>
            <PageHeading>Índice de Etiquetas</PageHeading>
            <p style={{fontFamily:BODY,fontSize:16,color:'#444',lineHeight:1.7,
                       margin:'0 0 28px',maxWidth:720}}>
              {allTags.length} etiquetas temáticas en uso. Haga clic en cualquiera
              para ver todos los artículos que la llevan.
            </p>

            {/* Tag cloud by frequency */}
            {allTags.length>0 && (
              <>
                <div style={{marginBottom:40}}>
                  <SectionRule label="TODAS LAS ETIQUETAS"/>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:12}}>
                    {allTags.map(tag=>{
                      const count=articles.filter(a=>a.tags.includes(tag)).length;
                      return (
                        <button key={tag}
                          onClick={()=>{setFTag(tag);setView('search');}}
                          style={{fontFamily:MONO,fontSize:12,color:INK,
                                  background:'#fff',border:`1px solid ${RULE}`,
                                  padding:'5px 12px',cursor:'pointer',
                                  display:'flex',alignItems:'center',gap:6}}>
                          {tag}
                          <span style={{color:'#aaa',fontSize:10}}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* New tags pending review */}
                {allNewTags.length>0 && (
                  <div>
                    <SectionRule label={`ETIQUETAS NUEVAS — PENDIENTES DE REVISIÓN (${allNewTags.length})`}/>
                    <p style={{fontFamily:BODY,fontSize:14,color:'#666',
                               lineHeight:1.6,margin:'8px 0 16px',maxWidth:600}}>
                      Claude propuso estas etiquetas que no estaban en el vocabulario semilla.
                      Revíselas: las que sean válidas pueden incorporarse al vocabulario oficial.
                      Las marcadas con * en los resultados de búsqueda son etiquetas nuevas.
                    </p>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {allNewTags.map(tag=>{
                        const count=articles.filter(a=>a.new_tags.includes(tag)).length;
                        return (
                          <span key={tag} style={{fontFamily:MONO,fontSize:12,
                            color:ACCENT,background:'#fdf5f5',
                            border:`1px solid #e8c0c0`,padding:'5px 12px',
                            display:'flex',alignItems:'center',gap:6}}>
                            {tag} *
                            <span style={{color:'#c09090',fontSize:10}}>{count}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {allTags.length===0 && (
              <EmptyState>
                <p style={{fontSize:16,color:'#555'}}>
                  No hay etiquetas aún. Acceda a Administración para catalogar los números.
                </p>
              </EmptyState>
            )}
          </div>
        )}

        {/* ══ ADMINISTRACIÓN ════════════════════════════════════════════════ */}
        {view==='admin' && (
          <div style={{maxWidth:740}}>
            <PageHeading>Administración del Índice</PageHeading>
            <p style={{fontFamily:BODY,fontSize:16,color:'#444',lineHeight:1.7,
                       margin:'0 0 28px',maxWidth:620}}>
              El sistema lee cada PDF, extrae artículos y asigna dominio, período histórico
              y etiquetas temáticas. Los datos se guardan en Google Sheets.
            </p>

            <AdminCard label="PROGRESO">
              <div style={{height:6,background:'#ede8e0',marginBottom:8,overflow:'hidden'}}>
                <div style={{height:'100%',background:ACCENT,transition:'width .4s ease',
                             width:`${(cataloged.size/ISSUES.length)*100}%`}}/>
              </div>
              <div style={{fontFamily:MONO,fontSize:11,color:'#888'}}>
                {cataloged.size} de {ISSUES.length} números ·{' '}
                {articles.length.toLocaleString('es')} artículos ·{' '}
                {allTags.length} etiquetas
              </div>
            </AdminCard>

            {!running ? (
              <AdminCard label="INICIAR CATALOGACIÓN">
                <p style={{fontFamily:BODY,fontSize:15,color:'#555',lineHeight:1.7,
                           margin:'0 0 16px',maxWidth:560}}>
                  Seleccione cuántos números procesar en esta sesión.
                  El sistema omite los ya catalogados y puede detenerse y continuar en cualquier momento.
                </p>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>
                  {[1,5,10,25,50].map(n=>(
                    <button key={n} onClick={()=>runCatalog(n)}
                      disabled={cataloged.size>=ISSUES.length}
                      style={{fontFamily:MONO,fontSize:11,letterSpacing:1,
                              textTransform:'uppercase',background:'#fff',color:INK,
                              border:`1px solid ${INK}`,padding:'8px 16px',cursor:'pointer'}}>
                      {n===1?'1 número':`${n} números`}
                    </button>
                  ))}
                  <button onClick={()=>runCatalog(ISSUES.length)}
                    disabled={cataloged.size>=ISSUES.length}
                    style={{fontFamily:MONO,fontSize:11,letterSpacing:1,
                            textTransform:'uppercase',background:INK,color:'#fff',
                            border:`1px solid ${INK}`,padding:'8px 16px',cursor:'pointer'}}>
                    Todos
                  </button>
                </div>
                {statusMsg&&(
                  <div style={{fontFamily:MONO,fontSize:12,color:'#555',
                               paddingTop:12,borderTop:`1px solid ${RULE}`}}>
                    {statusMsg}
                  </div>
                )}
              </AdminCard>
            ) : (
              <AdminCard label="EN PROCESO">
                <div style={{display:'flex',gap:14,alignItems:'center'}}>
                  <div style={{width:18,height:18,border:`2px solid ${RULE}`,
                               borderTopColor:ACCENT,borderRadius:'50%',
                               animation:'spin .8s linear infinite',flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:BODY,fontSize:15,color:INK}}>{statusMsg}</div>
                    <div style={{fontFamily:MONO,fontSize:11,color:'#888',marginTop:3}}>
                      {prog.n} de {prog.total} en esta sesión
                    </div>
                  </div>
                  <button onClick={()=>{stopRef.current=true;}} style={{
                    fontFamily:MONO,fontSize:11,letterSpacing:1,textTransform:'uppercase',
                    background:'#fff',color:ACCENT,border:`1px solid ${ACCENT}`,
                    padding:'7px 14px',cursor:'pointer',flexShrink:0}}>
                    Detener
                  </button>
                </div>
              </AdminCard>
            )}

            <AdminCard label="ESTADO POR NÚMERO">
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(64px,1fr))',gap:4}}>
                {ISSUES.map(iss=>{
                  const done=cataloged.has(`${iss.year}-${iss.no}`) || cataloged.has(iss.no);
                  return (
                    <div key={`${iss.year}-${iss.no}`} style={{
                      padding:'5px 4px',textAlign:'center',border:'1px solid',
                      background:done?'#f0f7f0':'#faf8f5',
                      borderColor:done?'#7aaa7a':'#ddd8cf'}}>
                      <div style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:INK}}>{iss.no}</div>
                      <div style={{fontFamily:MONO,fontSize:9,color:'#999'}}>{iss.year}</div>
                    </div>
                  );
                })}
              </div>
            </AdminCard>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer style={{background:INK,color:'#aaa',padding:'16px 32px',marginTop:40}}>
        <div style={{maxWidth:1280,margin:'0 auto',fontFamily:MONO,fontSize:11,
                     letterSpacing:0.5,display:'flex',flexWrap:'wrap',alignItems:'center',gap:4}}>
          <span>Índice analítico de <em>Clío</em> — Academia Dominicana de la Historia</span>
          <span style={{margin:'0 12px',color:'#555'}}>·</span>
          <a href="https://www.academiadominicanahistoria.org.do" target="_blank"
            rel="noreferrer" style={{color:'#ccc',textDecoration:'none'}}>
            academiadominicanahistoria.org.do
          </a>
          <span style={{margin:'0 12px',color:'#555'}}>·</span>
          <span>Catalogación asistida por inteligencia artificial</span>
        </div>
      </footer>
    </div>
  );
}

// ── Reusable components ───────────────────────────────────────────────────────
function Stat({n,label}) {
  return (
    <div style={{textAlign:'right'}}>
      <div style={{fontFamily:SERIF,fontSize:26,fontWeight:700,color:INK,lineHeight:1}}>{n}</div>
      <div style={{fontFamily:MONO,fontSize:10,color:'#888',letterSpacing:1,
                   textTransform:'uppercase',marginTop:2}}>{label}</div>
    </div>
  );
}
function SideSection({label,children}) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontFamily:MONO,fontSize:10,letterSpacing:2,color:'#888',
                   textTransform:'uppercase',marginBottom:8,
                   borderBottom:`1px solid ${RULE}`,paddingBottom:6}}>{label}</div>
      <div style={{display:'flex',flexDirection:'column',gap:1}}>{children}</div>
    </div>
  );
}
function SideBtn({active,onClick,children}) {
  return (
    <button onClick={onClick} style={{
      fontFamily:BODY,fontSize:12,color:active?INK:'#555',
      background:active?'#fff':'transparent',border:'none',
      textAlign:'left',padding:'4px 6px',cursor:'pointer',
      borderRadius:2,lineHeight:1.4,fontWeight:active?600:400,
      boxShadow:active?`inset 2px 0 0 ${ACCENT}`:'none',
      display:'flex',alignItems:'center',width:'100%'}}>
      {children}
    </button>
  );
}
function ActiveFilter({label,onClear}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
      <span style={{fontFamily:MONO,fontSize:11,color:INK,flex:1,lineHeight:1.3}}>{label}</span>
      <button onClick={onClear} style={{fontFamily:MONO,fontSize:12,color:'#888',
        background:'none',border:'none',cursor:'pointer',padding:0,lineHeight:1}}>×</button>
    </div>
  );
}
function PageHeading({children}) {
  return (
    <h2 style={{fontFamily:SERIF,fontSize:28,fontWeight:700,color:INK,
                margin:'0 0 8px',borderBottom:`2px solid ${INK}`,paddingBottom:8}}>
      {children}
    </h2>
  );
}
function SectionRule({label}) {
  return (
    <div style={{fontFamily:MONO,fontSize:10,letterSpacing:2,color:'#888',
                 textTransform:'uppercase',borderBottom:`1px solid ${RULE}`,paddingBottom:6}}>
      {label}
    </div>
  );
}
function EmptyState({children}) {
  return <div style={{padding:'40px 0',borderTop:`1px solid ${RULE}`}}>{children}</div>;
}
function AdminCard({label,children}) {
  return (
    <div style={{background:'#fff',border:`1px solid ${RULE}`,padding:'20px 24px',marginBottom:20}}>
      <div style={{fontFamily:MONO,fontSize:10,letterSpacing:2,color:'#888',
                   textTransform:'uppercase',marginBottom:12,
                   borderBottom:`1px solid ${RULE}`,paddingBottom:8}}>{label}</div>
      {children}
    </div>
  );
}
function PagerBtn({disabled,onClick,children}) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      fontFamily:MONO,fontSize:12,color:INK,background:'transparent',
      border:`1px solid ${RULE}`,padding:'6px 14px',cursor:disabled?'default':'pointer',
      opacity:disabled?0.4:1}}>
      {children}
    </button>
  );
}
