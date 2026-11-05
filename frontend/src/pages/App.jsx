import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Building2, Check,
  ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Compass, FileText,
  FolderKanban, HardHat, ImagePlus, Layers3, LayoutDashboard, LoaderCircle, LockKeyhole,
  LogOut, Mail, MapPin, Menu, MessageSquareText, Phone, Plus, Search, Send,
  Settings2, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import api, { getErrorMessage } from '../services/api'

const RequestChart = lazy(() => import('../components/admin/RequestChart'))
const ProjectViewer = lazy(() => import('../components/projects/ProjectViewer'))

const fallbackProjects = [
  { _id: 'p1', title: 'Casa Horizonte', category: 'Residencial', location: 'Maputo, Moçambique', year: '2025', coverImage: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85' },
  { _id: 'p2', title: 'Edifício Miradouro', category: 'Comercial', location: 'Matola, Moçambique', year: '2024', coverImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1000&q=85' },
  { _id: 'p3', title: 'Pátio das Acácias', category: 'Institucional', location: 'Beira, Moçambique', year: '2024', coverImage: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1000&q=85' },
]
const fallbackServices = ['Arquitectura', 'Engenharia Civil', 'Projectos Estruturais', 'Fiscalização de Obras', 'Gestão de Projectos', 'Reabilitação']

function Logo({ light = false }) {
  return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="Traço, página inicial"><span className="brand-mark">T<span>.</span></span><span className="brand-name">traço<small>ARQUITECTURA & ENGENHARIA</small></span></Link>
}

function Header() {
  const [open, setOpen] = useState(false)
  const links = [['Sobre', '/sobre'], ['Serviços', '/servicos'], ['Projectos', '/projectos'], ['Contactos', '/contactos']]
  return <header className="site-header"><div className="container header-inner"><Logo /><nav className={open ? 'nav-open' : ''}>{links.map(([label, to]) => <NavLink key={to} to={to} onClick={() => setOpen(false)}>{label}</NavLink>)}<Link to="/admin/login" className="nav-login">Área reservada <ArrowUpRight size={14} /></Link><Link to="/orcamento" className="button button-dark nav-quote">Solicitar orçamento <ArrowRight size={15} /></Link></nav><button className="icon-button mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? 'Fechar menu' : 'Abrir menu'}>{open ? <X /> : <Menu />}</button></div></header>
}

function Footer() {
  return <footer className="footer"><div className="container"><div className="footer-top"><div><Logo light /><p>Desenhamos espaços e soluções que fazem avançar pessoas, negócios e comunidades.</p></div><div><h4>Explore</h4><Link to="/sobre">Sobre nós</Link><Link to="/servicos">Serviços</Link><Link to="/projectos">Projectos</Link></div><div><h4>Contactos</h4><a href="mailto:geral@traco.co.mz">geral@traco.co.mz</a><a href="tel:+258840000000">+258 84 000 0000</a><span>Maputo, Moçambique</span></div><div className="footer-cta"><span className="eyebrow">TEM UM PROJECTO EM MENTE?</span><Link to="/orcamento">Vamos conversar <ArrowUpRight size={18} /></Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Traço Arquitectura & Engenharia. Todos os direitos reservados.</span><span>Construído com propósito.</span></div></div></footer>
}

function Home() {
  const [projects, setProjects] = useState(fallbackProjects)
  const [services, setServices] = useState(fallbackServices)
  useEffect(() => {
    api.get('/projects/public').then(({ data }) => { if (data.items?.length) setProjects(data.items.slice(0, 3)) }).catch(() => {})
    api.get('/services/public').then(({ data }) => { if (data.items?.length) setServices(data.items.map(item => item.name).slice(0, 6)) }).catch(() => {})
  }, [])
  return <>
    <section className="hero"><div className="hero-image" /><div className="hero-shade" /><div className="container hero-content"><span className="eyebrow eyebrow-light"><span /> ARQUITECTURA COM PROPÓSITO</span><h1>Espaços que<br />inspiram <em>o futuro.</em></h1><p>Unimos visão arquitectónica e excelência técnica para criar soluções que permanecem.</p><div className="hero-actions"><Link className="button button-gold" to="/orcamento">Fale-nos do seu projecto <ArrowRight size={16} /></Link><Link className="text-link text-link-light" to="/projectos">Explorar projectos <ArrowDown size={16} /></Link></div><div className="hero-note"><span className="hero-line" /><span>MAPUTO · MOÇAMBIQUE</span><span className="hero-index">01 — 04</span></div></div><div className="hero-stamp"><Compass size={18} /><span>IDEIAS QUE<br />GANHAM FORMA</span></div></section>
    <section className="intro-section"><div className="container intro-grid"><div><span className="eyebrow">01 / QUEM SOMOS</span><h2>O equilíbrio entre<br /><em>forma e função.</em></h2></div><div className="intro-copy"><p className="lead">Cada projecto é uma oportunidade de construir algo com significado.</p><p>Somos uma equipa multidisciplinar dedicada a transformar desafios em espaços funcionais, elegantes e sustentáveis. Acompanhamos cada etapa, da primeira ideia à entrega final.</p><Link className="text-link" to="/sobre">Conheça a nossa abordagem <ArrowRight size={16} /></Link></div><div className="intro-stats"><div><strong>12<span>+</span></strong><small>ANOS DE EXPERIÊNCIA</small></div><div><strong>86</strong><small>PROJECTOS REALIZADOS</small></div><div><strong>24</strong><small>ESPECIALISTAS</small></div></div></div></section>
    <section className="services-section"><div className="container"><div className="section-heading"><div><span className="eyebrow">02 / O QUE FAZEMOS</span><h2>Soluções pensadas<br />para <em>ir mais longe.</em></h2></div><Link className="text-link" to="/servicos">Todos os serviços <ArrowRight size={16} /></Link></div><div className="service-grid">{services.map((service, i) => <Link className="service-card" to="/servicos" key={service}><span className="service-number">0{i + 1}</span><span className="service-icon">{[<Building2 />, <Layers3 />, <HardHat />, <ClipboardList />, <FolderKanban />, <Sparkles />][i % 6]}</span><h3>{service}</h3><span className="service-arrow"><ArrowUpRight size={17} /></span></Link>)}</div></div></section>
    <section className="projects-section"><div className="container"><div className="section-heading"><div><span className="eyebrow">03 / PORTFÓLIO</span><h2>Ideias que se<br /><em>tornaram realidade.</em></h2></div><Link className="text-link" to="/projectos">Ver portfólio completo <ArrowRight size={16} /></Link></div><div className="project-grid">{projects.map((project, i) => <Link to={`/projectos/${project._id}`} className={`project-card project-${i + 1}`} key={project._id}><div className="project-image" style={{ backgroundImage: `url("${project.coverImage || fallbackProjects[i % 3].coverImage}")` }} /><div className="project-meta"><div><span>{project.category} <b>·</b> {project.year}</span><h3>{project.title || project.name}</h3><small><MapPin size={13} /> {project.location || project.city}</small></div><span className="round-arrow"><ArrowUpRight size={18} /></span></div></Link>)}</div></div></section>
    <section className="values-section"><div className="container values-grid"><div><span className="eyebrow eyebrow-light">04 / A NOSSA DIFERENÇA</span><h2>Rigor técnico.<br /><em>Visão humana.</em></h2><p>Excelência não é um detalhe. É o princípio que orienta cada decisão, cada traço e cada entrega.</p><Link className="button button-outline" to="/sobre">Descubra o que nos move <ArrowRight size={16} /></Link></div><div className="value-list"><div><span>01</span><div><h3>Escuta activa</h3><p>Compreendemos as suas necessidades antes de desenhar soluções.</p></div><ArrowUpRight size={18} /></div><div><span>02</span><div><h3>Precisão em cada detalhe</h3><p>Coordenação rigorosa entre arquitectura, engenharia e execução.</p></div><ArrowUpRight size={18} /></div><div><span>03</span><div><h3>Compromisso sustentável</h3><p>Projectamos com responsabilidade para as próximas gerações.</p></div><ArrowUpRight size={18} /></div></div></div></section>
    <section className="quote-band"><div className="container quote-band-inner"><span className="eyebrow">O PRÓXIMO PROJECTO PODE SER SEU</span><h2>Vamos construir<br /><em>algo extraordinário?</em></h2><Link className="button button-dark" to="/orcamento">Solicitar orçamento <ArrowRight size={16} /></Link><span className="quote-decoration">T.</span></div></section>
  </>
}

function ContentPage({ eyebrow, title, text, children }) {
  return <><section className="page-hero"><div className="container"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{text && <p>{text}</p>}</div></section>{children}</>
}

function About() {
  return <ContentPage eyebrow="A NOSSA ESSÊNCIA" title={<>Projectamos com<br /><em>intenção e rigor.</em></>} text="Uma equipa, muitas perspectivas e um compromisso comum: criar espaços melhores para viver, trabalhar e crescer."><section className="page-content"><div className="container about-grid"><div className="about-photo" /><div><span className="eyebrow">A NOSSA HISTÓRIA</span><h2>Uma ideia clara:<br /><em>fazer melhor.</em></h2><p className="lead">A Traço nasceu da vontade de aproximar arquitectura e engenharia, criatividade e precisão.</p><p>Desde o primeiro esboço até à conclusão da obra, trabalhamos lado a lado com os nossos clientes. A nossa equipa reúne competências diversas para responder a projectos de diferentes escalas com a mesma atenção ao detalhe.</p><div className="mission-grid"><div><ShieldCheck /><h3>Missão</h3><p>Criar soluções arquitectónicas e de engenharia que elevam a qualidade de vida.</p></div><div><Compass /><h3>Visão</h3><p>Ser uma referência de confiança, inovação e excelência técnica em Moçambique.</p></div></div></div></div></section></ContentPage>
}

function Services() {
  return <ContentPage eyebrow="COMPETÊNCIA INTEGRADA" title={<>Do conceito à obra,<br /><em>com confiança.</em></>} text="Um único parceiro para coordenar cada especialidade e transformar complexidade em clareza."><section className="page-content"><div className="container detail-service-grid">{fallbackServices.map((name, i) => <article key={name}><span className="eyebrow">0{i + 1} / SERVIÇO</span><div className="service-icon">{[<Building2 />, <Layers3 />, <HardHat />, <ClipboardList />, <FolderKanban />, <Sparkles />][i]}</div><h2>{name}</h2><p>{['Concebemos edifícios que conciliam identidade, conforto e funcionalidade.', 'Coordenamos soluções técnicas seguras e eficientes para cada desafio.', 'Desenvolvemos estruturas optimizadas com rigor e atenção à execução.', 'Acompanhamos a obra para garantir qualidade, prazo e conformidade.', 'Planeamos recursos, prazos e equipas com visão integrada.', 'Damos nova vida aos espaços com soluções contemporâneas e duradouras.'][i]}</p><Link className="text-link" to="/orcamento">Solicitar orçamento <ArrowRight size={15} /></Link></article>)}</div></section></ContentPage>
}

function Portfolio() {
  const [projects, setProjects] = useState(fallbackProjects)
  const [category, setCategory] = useState('Todos')
  const [error, setError] = useState('')
  useEffect(() => { api.get('/projects/public').then(({ data }) => { if (data.items?.length) setProjects(data.items) }).catch(() => setError('A mostrar projectos de demonstração.')) }, [])
  const categories = ['Todos', ...new Set(projects.map(p => p.category).filter(Boolean))]
  const filtered = category === 'Todos' ? projects : projects.filter(p => p.category === category)
  return <ContentPage eyebrow="PORTFÓLIO" title={<>Espaços com<br /><em>uma história.</em></>} text="Uma selecção de projectos onde visão, técnica e propósito se encontram."><section className="page-content"><div className="container"><div className="filter-row">{categories.map(item => <button key={item} className={category === item ? 'filter-chip active' : 'filter-chip'} onClick={() => setCategory(item)}>{item}</button>)}</div>{error && <p className="notice">{error}</p>}<div className="portfolio-grid">{filtered.map((project, i) => <Link to={`/projectos/${project._id}`} className="portfolio-card" key={project._id}><div className="portfolio-image" style={{ backgroundImage: `url("${project.coverImage || fallbackProjects[i % 3].coverImage}")` }}><span>{project.category}</span></div><div className="portfolio-details"><span className="eyebrow">{project.year || 'PROJECTO'} · {project.location || 'MOÇAMBIQUE'}</span><h3>{project.title || project.name}</h3><p>{project.description || 'Um projecto desenvolvido com atenção à identidade, à funcionalidade e ao contexto.'}</p><span className="portfolio-view-link">Explorar em 3D <ArrowUpRight size={14} /></span></div></Link>)}</div></div></section></ContentPage>
}

function ProjectDetails() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.get(`/projects/public/${id}`)
      .then(({ data }) => { if (active) setProject(data.item) })
      .catch(() => {
        const demoProject = fallbackProjects.find(item => item._id === id)
        if (active) {
          setProject(demoProject || null)
          if (!demoProject) setError('Não foi possível carregar este projecto. Verifique se continua publicado.')
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  if (loading) return <div className="project-loading"><LoaderCircle className="spin" /> A carregar projecto...</div>
  if (!project) return <ContentPage eyebrow="PROJECTO NÃO ENCONTRADO" title={<>Este projecto<br /><em>não está disponível.</em></>} text={error}><section className="page-content"><div className="container"><Link className="text-link" to="/projectos"><ArrowLeft size={15} /> Voltar ao portfólio</Link></div></section></ContentPage>
  const galleryImages = project.gallery?.length
    ? project.gallery
    : project.coverImage
      ? [{ url: project.coverImage, name: project.title || project.name }]
      : []

  return <>
    <section className="project-detail-hero" style={{ backgroundImage: `linear-gradient(90deg, rgb(13 31 50 / 82%), rgb(13 31 50 / 22%)), url("${project.coverImage || fallbackProjects.find(item => item._id === id)?.coverImage || fallbackProjects[0].coverImage}")` }}>
      <div className="container project-detail-hero-content"><Link className="project-back-link" to="/projectos"><ArrowLeft size={15} /> Voltar ao portfólio</Link><span className="eyebrow eyebrow-light">{project.category || 'ARQUITECTURA'} · {project.year || 'PROJECTO'}</span><h1>{project.title || project.name}</h1><p><MapPin size={15} /> {project.location || 'Moçambique'}</p></div>
    </section>
    <section className="project-detail-content">
      <div className="container">
        <div className="project-description-grid"><div><span className="eyebrow">CONCEITO DO PROJECTO</span><h2>Desenhado para<br /><em>ser vivido.</em></h2></div><p>{project.description || 'Explore este projecto arquitectónico em 3D. Alterne entre as vistas da planta, exterior e interior e navegue pela cena arrastando o rato ou deslizando no ecrã.'}</p></div>
        <Suspense fallback={<div className="project-loading"><LoaderCircle className="spin" /> A preparar visualização 3D...</div>}><ProjectViewer modelUrl={project.model3d?.url} floorPlanUrl={project.floorPlan?.url} title={project.title || project.name} /></Suspense>
        <section className="property-gallery" aria-labelledby="property-gallery-title">
          <div className="property-gallery-heading"><div><span className="eyebrow">GALERIA DO IMÓVEL</span><h2 id="property-gallery-title">Imagens do projecto</h2></div><span>{galleryImages.length} {galleryImages.length === 1 ? 'imagem' : 'imagens'}</span></div>
          {galleryImages.length > 0
            ? <div className="property-gallery-grid">{galleryImages.map((image, index) => <a key={`${image.publicId || image.url}-${index}`} href={image.url} target="_blank" rel="noreferrer" aria-label={`Abrir imagem ${index + 1} do projecto em tamanho completo`}><img src={image.url} alt={image.name || `${project.title || project.name} — imagem ${index + 1}`} loading="lazy" /></a>)}</div>
            : <p className="property-gallery-empty">As imagens deste imóvel estarão disponíveis em breve.</p>}
        </section>
        <div className="project-detail-cta"><div><span className="eyebrow">GOSTARIA DE CRIAR ALGO SEMELHANTE?</span><h2>Vamos desenhar o seu próximo projecto.</h2></div><Link to="/orcamento" className="button button-dark">Solicitar orçamento <ArrowRight size={15} /></Link></div>
      </div>
    </section>
  </>
}

function Contact() {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true); setNotice('')
    const form = Object.fromEntries(new FormData(formElement).entries())
    try { await api.post('/contact', form); setNotice('A sua mensagem foi enviada. Entraremos em contacto em breve.'); formElement.reset() }
    catch (error) { setNotice(getErrorMessage(error)) }
    finally { setBusy(false) }
  }
  return <ContentPage eyebrow="ESTAMOS POR PERTO" title={<>Boas ideias começam<br /><em>com uma conversa.</em></>} text="Conte-nos o que está a planear. A nossa equipa está pronta para ouvir."><section className="page-content"><div className="container contact-grid"><div className="contact-details"><div><span className="eyebrow">VISITE-NOS</span><p><MapPin /> Av. Julius Nyerere, Maputo<br />Moçambique</p></div><div><span className="eyebrow">FALE CONNOSCO</span><a href="tel:+258840000000"><Phone /> +258 84 000 0000</a><a href="mailto:geral@traco.co.mz"><Mail /> geral@traco.co.mz</a></div><div className="map-placeholder"><MapPin size={30} /><span>MAPUTO, MOÇAMBIQUE</span><small>Integração de mapa configurável</small></div></div><form className="form-card" onSubmit={submit}><h2>Envie uma mensagem</h2><p>Responderemos assim que possível.</p>{notice && <p className="notice">{notice}</p>}<label>Nome completo<input name="name" required placeholder="O seu nome" /></label><label>Email<input type="email" name="email" required placeholder="nome@email.com" /></label><label>Assunto<input name="subject" required placeholder="Como podemos ajudar?" /></label><label>Mensagem<textarea name="message" rows="4" required placeholder="Conte-nos um pouco sobre o que precisa..." /></label><button className="button button-dark" disabled={busy}>{busy ? 'A enviar...' : 'Enviar mensagem'} <Send size={15} /></button></form></div></section></ContentPage>
}

const quoteSteps = ['Os seus dados', 'O projecto', 'Documentos', 'Confirmar']
function QuoteRequest() {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [reference, setReference] = useState('')
  const [values, setValues] = useState({ name: '', email: '', phone: '', location: '', service: '', constructionType: '', area: '', description: '', budget: '', privacy: false })
  const [files, setFiles] = useState([])
  function update(event) { const { name, value, type, checked } = event.target; setValues(current => ({ ...current, [name]: type === 'checkbox' ? checked : value })) }
  function continueForm(event) {
    event.preventDefault()
    if (step === 3 && !values.privacy) { setNotice('Aceite a política de privacidade para continuar.'); return }
    setNotice('')
    setStep(value => Math.min(value + 1, 3))
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setNotice('')
    const body = new FormData()
    Object.entries(values).forEach(([key, value]) => body.append(key, typeof value === 'boolean' ? String(value) : value))
    body.append('privacy', String(values.privacy))
    Array.from(files).forEach(file => body.append('files', file))
    try {
      const { data } = await api.post('/quote-requests', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      setReference(data.reference); setStep(4)
    } catch (error) { setNotice(getErrorMessage(error)) }
    finally { setBusy(false) }
  }
  if (step === 4) return <ContentPage eyebrow="PEDIDO RECEBIDO" title={<>Obrigado pela<br /><em>confiança.</em></>} text="A nossa equipa irá analisar o seu pedido e entrará em contacto consigo."><section className="page-content"><div className="container success-card"><span className="success-icon"><Check /></span><h2>O seu pedido foi registado.</h2><p>Guarde o número de referência para acompanhar o seu pedido.</p><strong>{reference}</strong><Link to="/" className="button button-dark">Voltar ao início <ArrowRight size={16} /></Link></div></section></ContentPage>
  return <ContentPage eyebrow="PEDIDO DE ORÇAMENTO" title={<>Vamos dar forma<br /><em>à sua ideia.</em></>} text="Partilhe alguns detalhes connosco. A nossa equipa analisará o seu pedido sem compromisso."><section className="page-content"><div className="container quote-layout"><aside className="quote-steps">{quoteSteps.map((label, index) => <div key={label} className={step === index ? 'quote-step current' : step > index ? 'quote-step completed' : 'quote-step'}><span>{step > index ? <Check size={15} /> : `0${index + 1}`}</span><div><strong>{label}</strong><small>{['Como podemos contactá-lo', 'Ajude-nos a compreender', 'Partilhe os ficheiros úteis', 'Reveja antes de enviar'][index]}</small></div></div>)}</aside><form className="form-card quote-form" onSubmit={step < 3 ? continueForm : submit}><div className="quote-form-heading"><span className="eyebrow">ETAPA 0{step + 1} / 04</span><h2>{quoteSteps[step]}</h2></div>{notice && <p className="notice error-notice">{notice}</p>}
    {step === 0 && <div className="form-fields"><label>Nome completo<input name="name" value={values.name} onChange={update} required placeholder="O seu nome" /></label><label>Empresa <span>(opcional)</span><input name="company" value={values.company || ''} onChange={update} placeholder="Nome da empresa" /></label><label>Email<input type="email" name="email" value={values.email} onChange={update} required placeholder="nome@email.com" /></label><label>Telefone<input type="tel" name="phone" value={values.phone} onChange={update} required placeholder="+258 84 000 0000" /></label><label className="full-field">Localização<input name="location" value={values.location} onChange={update} required placeholder="Cidade, país" /></label></div>}
    {step === 1 && <div className="form-fields"><label>Serviço pretendido<select name="service" value={values.service} onChange={update} required><option value="">Seleccione um serviço</option>{fallbackServices.map(item => <option key={item}>{item}</option>)}</select></label><label>Tipo de construção<select name="constructionType" value={values.constructionType} onChange={update} required><option value="">Seleccione</option>{['Residencial', 'Comercial', 'Industrial', 'Institucional', 'Infraestrutura', 'Reabilitação'].map(item => <option key={item}>{item}</option>)}</select></label><label>Área estimada (m²)<input name="area" type="number" min="1" value={values.area} onChange={update} placeholder="Ex.: 250" /></label><label>Localização da obra<input name="location" value={values.location} onChange={update} required placeholder="Cidade, bairro" /></label><label className="full-field">Orçamento previsto <span>(opcional)</span><input name="budget" value={values.budget} onChange={update} placeholder="Ex.: 1 500 000 MZN" /></label><label className="full-field">Descreva as suas necessidades<textarea name="description" rows="4" value={values.description} onChange={update} required placeholder="Partilhe os principais objectivos e requisitos do projecto..." /></label></div>}
    {step === 2 && <div className="upload-area"><label className="upload-box"><span className="upload-icon"><Plus /></span><strong>Seleccione documentos para anexar</strong><small>Plantas, fotografias ou documentos complementares · até 5 ficheiros, 10 MB cada</small><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={event => { const selected = Array.from(event.target.files || []); if (selected.length > 5 || selected.some(file => file.size > 10 * 1024 * 1024)) { setNotice('Seleccione no máximo 5 ficheiros, com até 10 MB cada.'); setFiles([]); event.target.value = ''; return } setNotice(''); setFiles(selected) }} /></label>{files.length > 0 && <div className="file-list">{Array.from(files).map(file => <span key={file.name}><FileText size={15} /> {file.name}</span>)}</div>}<p className="muted-copy">Pode continuar sem anexar ficheiros. Formatos aceites: PDF, JPG, PNG e Word.</p></div>}
    {step === 3 && <div className="review-box"><span className="eyebrow">DADOS DO CLIENTE</span><div className="review-grid"><span>Nome</span><strong>{values.name}</strong><span>Email</span><strong>{values.email}</strong><span>Telefone</span><strong>{values.phone}</strong><span>Localização</span><strong>{values.location}</strong></div><span className="eyebrow">PROJECTO</span><div className="review-grid"><span>Serviço</span><strong>{values.service}</strong><span>Tipo</span><strong>{values.constructionType}</strong><span>Área</span><strong>{values.area ? `${values.area} m²` : 'Não indicada'}</strong></div><label className="checkbox-label"><input type="checkbox" name="privacy" checked={values.privacy} onChange={update} /> Li e aceito a política de privacidade e autorizo o tratamento dos meus dados para análise deste pedido.</label></div>}
    <div className="form-actions">{step > 0 && <button className="button button-quiet" type="button" onClick={() => { setNotice(''); setStep(value => value - 1) }}><ArrowLeft size={15} /> Voltar</button>}{step < 3 ? <button className="button button-dark" type="submit">Continuar <ArrowRight size={15} /></button> : <button className="button button-dark" disabled={busy}>{busy ? 'A enviar...' : 'Enviar pedido'} <Send size={15} /></button>}</div></form></div></section></ContentPage>
}

const menuItems = [
  { label: 'Visão geral', path: '/admin', icon: LayoutDashboard },
  { label: 'Clientes', path: '/admin/clientes', icon: Users, resource: 'clients' },
  { label: 'Pedidos', path: '/admin/pedidos', icon: MessageSquareText, resource: 'quote-requests' },
  { label: 'Propostas', path: '/admin/propostas', icon: FileText, resource: 'quotations' },
  { label: 'Projectos', path: '/admin/projectos', icon: FolderKanban, resource: 'projects' },
  { label: 'Serviços', path: '/admin/servicos', icon: Layers3, resource: 'services' },
]
function AdminLayout({ user, logout, children }) {
  const [mobile, setMobile] = useState(false)
  return <div className="admin-shell"><aside className={mobile ? 'admin-sidebar sidebar-open' : 'admin-sidebar'}><div className="admin-brand"><Logo light /><button onClick={() => setMobile(false)} className="icon-button sidebar-close"><X /></button></div><span className="sidebar-label">MENU PRINCIPAL</span><nav>{menuItems.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} end={path === '/admin'} onClick={() => setMobile(false)}><Icon size={17} />{label}</NavLink>)}</nav><div className="sidebar-bottom"><Link to="/" className="site-back"><ArrowLeft size={15} /> Voltar ao website</Link><div className="admin-user"><span>{user.name?.slice(0, 1).toUpperCase() || 'A'}</span><div><strong>{user.name}</strong><small>{user.role}</small></div><button className="icon-button" onClick={logout} title="Terminar sessão"><LogOut size={16} /></button></div></div></aside><main className="admin-main"><header className="admin-topbar"><button className="icon-button admin-menu-toggle" onClick={() => setMobile(true)}><Menu /></button><div className="breadcrumb">TRAÇO <ChevronRight size={14} /> PAINEL</div><div className="admin-top-actions"><span className="admin-date">{new Intl.DateTimeFormat('pt-PT', { dateStyle: 'long' }).format(new Date())}</span><span className="admin-avatar">{user.name?.slice(0, 1).toUpperCase()}</span></div></header><div className="admin-content">{children}</div></main></div>
}

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const { data } = await api.post('/auth/login', { email, password }); onLogin(data.user); navigate('/admin') }
    catch (reason) { setError(getErrorMessage(reason)) }
    finally { setBusy(false) }
  }
  return <div className="login-page"><div className="login-side"><Logo light /><div><span className="eyebrow eyebrow-light">ACESSO RESTRITO</span><h1>Gerir cada detalhe,<br /><em>com clareza.</em></h1><p>Entre no painel da Traço para acompanhar clientes, pedidos e projectos.</p></div><span className="login-side-foot">TRAÇO · ARQUITECTURA & ENGENHARIA</span></div><div className="login-main"><Link to="/" className="login-back"><ArrowLeft size={15} /> Voltar ao website</Link><form className="login-form" onSubmit={submit}><span className="login-lock"><LockKeyhole /></span><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Iniciar sessão</h2><p>Introduza as suas credenciais de acesso.</p>{error && <p className="notice error-notice">{error}</p>}<label>Email profissional<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@empresa.com" autoComplete="username" /></label><label>Palavra-passe<input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="A sua palavra-passe" autoComplete="current-password" /></label><button className="button button-dark login-submit" disabled={busy}>{busy ? 'A autenticar...' : 'Entrar no painel'} <ArrowRight size={16} /></button><small className="login-security"><ShieldCheck size={14} /> Ligação segura e protegida</small></form></div></div>
}

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [requestError, setRequestError] = useState('')
  async function loadStats() {
    try {
      const { data } = await api.get('/dashboard/stats')
      setStats(data)
      setError('')
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadStats() }, [])
  async function updateRequestStatus(status) {
    setRequestError('')
    try {
      await api.patch(`/quote-requests/${selectedRequest._id}/status`, { status })
      setSelectedRequest(current => ({ ...current, status }))
      await loadStats()
    } catch (reason) {
      setRequestError(getErrorMessage(reason))
    }
  }
  const metrics = stats?.metrics || {}
  const cards = [['Clientes', metrics.clients ?? '—', Users], ['Pedidos recebidos', metrics.quoteRequests ?? '—', MessageSquareText], ['Propostas emitidas', metrics.quotations ?? '—', FileText], ['Projectos activos', metrics.activeProjects ?? '—', FolderKanban]]
  return <>
    <div className="admin-page-heading"><div><span className="eyebrow">PAINEL DE CONTROLO</span><h1>Bom dia, bem-vindo.</h1><p>Aqui está o resumo da actividade da sua empresa.</p></div><Link to="/admin/pedidos" className="button button-dark"><Plus size={16} /> Novo pedido</Link></div>
    {error && <p className="notice error-notice">{error}</p>}
    <div className="metric-grid">{cards.map(([label, value, Icon]) => <article className="metric-card" key={label}><div className="metric-top"><span>{label}</span><i><Icon size={17} /></i></div><strong>{value}</strong><small>{loading ? 'A carregar dados...' : 'Dados actualizados em tempo real'}</small></article>)}</div>
    <div className="dashboard-grid">
      <section className="admin-panel chart-panel"><div className="panel-heading"><div><h2>Pedidos recebidos</h2><p>Volume mensal de pedidos de orçamento</p></div><span className="chart-period">Últimos 6 meses <ChevronDown size={14} /></span></div>{loading ? <div className="loading-state"><LoaderCircle className="spin" /> A carregar dados...</div> : stats?.monthly?.length ? <Suspense fallback={<div className="loading-state"><LoaderCircle className="spin" /> A carregar gráfico...</div>}><RequestChart data={stats.monthly} /></Suspense> : <div className="empty-chart"><BarChart3 /><span>Ainda não existem dados suficientes para apresentar o gráfico.</span></div>}</section>
      <section className="admin-panel recent-panel"><div className="panel-heading"><div><h2>Pedidos recentes</h2><p>Seleccione um pedido para consultar os detalhes</p></div><Link to="/admin/pedidos">Ver todos <ArrowRight size={14} /></Link></div>{loading ? <div className="loading-state"><LoaderCircle className="spin" /> A carregar pedidos...</div> : stats?.recentRequests?.length ? <div className="recent-list">{stats.recentRequests.map(item => <button className="recent-item recent-item-button" key={item._id} onClick={() => { setRequestError(''); setSelectedRequest(item) }}><span className="recent-icon"><MessageSquareText size={16} /></span><span className="recent-item-copy"><strong>{item.name}</strong><small>{item.service || 'Pedido de orçamento'}</small></span><span className="status-pill">{item.status}</span><ArrowRight className="recent-item-arrow" size={15} /></button>)}</div> : <div className="empty-list"><ClipboardList /><strong>Sem pedidos recentes</strong><span>Os novos pedidos aparecerão aqui.</span></div>}</section>
    </div>
    {selectedRequest && <div className="request-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedRequest(null) }}>
      <section className="request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <div className="request-detail-heading"><div><span className="eyebrow">PEDIDO {selectedRequest.reference}</span><h2 id="request-detail-title">{selectedRequest.name}</h2><p>Recebido em {new Date(selectedRequest.createdAt).toLocaleString('pt-PT')}</p></div><button className="icon-button" onClick={() => setSelectedRequest(null)} aria-label="Fechar detalhes"><X /></button></div>
        {requestError && <p className="notice error-notice">{requestError}</p>}
        <div className="request-detail-grid">
          <div><span>Email</span><a href={`mailto:${selectedRequest.email}`}>{selectedRequest.email}</a></div>
          <div><span>Telefone</span><a href={`tel:${selectedRequest.phone}`}>{selectedRequest.phone}</a></div>
          {selectedRequest.company && <div><span>Empresa</span><strong>{selectedRequest.company}</strong></div>}
          <div><span>Serviço pretendido</span><strong>{selectedRequest.service}</strong></div>
          <div><span>Tipo de construção</span><strong>{selectedRequest.constructionType || 'Não indicado'}</strong></div>
          <div><span>Área estimada</span><strong>{selectedRequest.area ? `${selectedRequest.area.toLocaleString('pt-PT')} m²` : 'Não indicada'}</strong></div>
          <div className="request-detail-full"><span>Localização</span><strong>{selectedRequest.location}</strong></div>
          <div className="request-detail-full"><span>Descrição das necessidades</span><p>{selectedRequest.description}</p></div>
          <div><span>Orçamento previsto</span><strong>{selectedRequest.budget || 'Não indicado'}</strong></div>
          <div><span>Estado do pedido</span><select className="status-select" value={selectedRequest.status} onChange={event => updateRequestStatus(event.target.value)}>{['Novo', 'Em análise', 'Em contacto', 'Em elaboração de proposta', 'Proposta enviada', 'Aprovado', 'Rejeitado', 'Cancelado'].map(status => <option key={status}>{status}</option>)}</select></div>
          {selectedRequest.files?.length > 0 && <div className="request-detail-full"><span>Documentos anexados</span><div className="request-file-list">{selectedRequest.files.map((file, index) => <a key={`${file.publicId || file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer"><FileText size={15} />{file.name || `Documento ${index + 1}`}<ArrowUpRight size={13} /></a>)}</div></div>}
        </div>
      </section>
    </div>}
  </>
}

function ResourcePage({ resource, title, description, user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [projectAssets, setProjectAssets] = useState({ model: null, floorPlan: null, images: [] })
  const [uploadingProject, setUploadingProject] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', title: '', category: '', description: '', location: '', service: '' })
  async function load() {
    setLoading(true); setError('')
    try { const { data } = await api.get(`/${resource}`, { params: { search: query, status: status || undefined } }); setItems(data.items || []) }
    catch (reason) { setError(getErrorMessage(reason)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [resource, query, status])
  const fields = useMemo(() => ({
    clients: [['name', 'Nome completo', 'text', true], ['email', 'Email', 'email', true], ['phone', 'Telefone', 'tel'], ['company', 'Empresa', 'text']],
    'quote-requests': [['name', 'Nome do cliente', 'text', true], ['email', 'Email', 'email', true], ['service', 'Serviço pretendido', 'text', true], ['location', 'Localização', 'text']],
    quotations: [['title', 'Título da proposta', 'text', true], ['clientName', 'Cliente', 'text', true], ['amount', 'Valor (MZN)', 'number', true]],
    projects: [['title', 'Nome do projecto', 'text', true], ['category', 'Categoria', 'text', true], ['location', 'Localização', 'text']],
    services: [['name', 'Nome do serviço', 'text', true], ['category', 'Categoria', 'text'], ['description', 'Descrição', 'text']],
  }[resource] || []), [resource])
  async function create(event) {
    event.preventDefault(); setSaving(true); setNotice('')
    const payload = { ...form }
    if (resource === 'projects') payload.isPublished = Boolean(form.isPublished)
    if (resource === 'quotations') payload.items = [{ description: form.title, quantity: 1, unitPrice: Number(form.amount), subtotal: Number(form.amount) }]
    try {
      const { data } = await api.post(`/${resource}`, payload)
      let successMessage = 'Registo criado com sucesso.'
      if (resource === 'projects') {
        const uploadErrors = []
        if (projectAssets.model || projectAssets.floorPlan) {
          const assets = new FormData()
          if (projectAssets.model) assets.append('model', projectAssets.model)
          if (projectAssets.floorPlan) assets.append('floorPlan', projectAssets.floorPlan)
          try {
            await api.post(`/projects/${data.item._id}/3d-assets`, assets, { headers: { 'Content-Type': 'multipart/form-data' } })
          } catch (reason) {
            uploadErrors.push(getErrorMessage(reason))
          }
        }
        if (projectAssets.images.length) {
          const gallery = new FormData()
          projectAssets.images.forEach(image => gallery.append('images', image))
          try {
            await api.post(`/projects/${data.item._id}/gallery`, gallery, { headers: { 'Content-Type': 'multipart/form-data' } })
          } catch (reason) {
            uploadErrors.push(getErrorMessage(reason))
          }
        }
        if (uploadErrors.length) {
          successMessage = `Projecto criado, mas não foi possível carregar todos os ficheiros. ${uploadErrors.join(' ')}`
        }
      }
      setShowForm(false)
      setForm({ name: '', email: '', phone: '', company: '', title: '', category: '', description: '', location: '', service: '' })
      setProjectAssets({ model: null, floorPlan: null, images: [] })
      setNotice(successMessage)
      load()
    }
    catch (reason) { setNotice(getErrorMessage(reason)) }
    finally { setSaving(false) }
  }
  async function setItemStatus(item, nextStatus) {
    setNotice('')
    try { await api.patch(`/${resource}/${item._id}/status`, { status: nextStatus }); setNotice('Estado actualizado.'); load() }
    catch (reason) { setNotice(getErrorMessage(reason)) }
  }
  async function remove(item) {
    if (!window.confirm('Tem a certeza de que pretende arquivar este registo?')) return
    try { await api.delete(`/${resource}/${item._id}`); setNotice('Registo arquivado.'); load() }
    catch (reason) { setNotice(getErrorMessage(reason)) }
  }
  async function uploadProjectImages(item, images) {
    if (!images.length) return
    if (images.length > 10) {
      setNotice('Seleccione no máximo 10 imagens de cada vez.')
      return
    }
    const files = new FormData()
    images.forEach(image => files.append('images', image))
    setUploadingProject(item._id)
    setNotice('')
    try {
      await api.post(`/projects/${item._id}/gallery`, files, { headers: { 'Content-Type': 'multipart/form-data' } })
      setNotice('Imagens adicionadas à galeria do projecto.')
      load()
    } catch (reason) {
      setNotice(getErrorMessage(reason))
    } finally {
      setUploadingProject('')
    }
  }
  const statuses = ['Novo', 'Em análise', 'Em contacto', 'Enviada', 'Em negociação', 'Aceite', 'Rejeitada', 'Planeamento', 'Em execução', 'Suspenso', 'Concluído']
  return <><div className="admin-page-heading"><div><span className="eyebrow">GESTÃO COMERCIAL</span><h1>{title}</h1><p>{description}</p></div>{resource !== 'quote-requests' && <button className="button button-dark" onClick={() => setShowForm(!showForm)}>{showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? 'Fechar' : `Adicionar ${title.toLowerCase().replace(/s$/, '')}`}</button>}</div>{notice && <p className="notice">{notice}</p>}{showForm && <form className="form-card admin-create-form" onSubmit={create}><h2>Novo registo</h2><div className="form-fields">{fields.map(([name, label, type, required]) => <label key={name}>{label}<input type={type} required={required} min={type === 'number' ? '0' : undefined} value={form[name] || ''} onChange={e => setForm(current => ({ ...current, [name]: e.target.value }))} /></label>)}</div>{resource === 'projects' && <div className="project-assets-form"><label>Modelo 3D GLB <span>(opcional, máx. 50 MB)</span><input type="file" accept=".glb,model/gltf-binary,application/octet-stream" onChange={event => setProjectAssets(current => ({ ...current, model: event.target.files?.[0] || null }))} /></label><label>Planta técnica <span>(opcional, JPG, PNG ou WebP)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setProjectAssets(current => ({ ...current, floorPlan: event.target.files?.[0] || null }))} /></label><label>Imagens do imóvel <span>(até 10 por vez, JPG, PNG ou WebP; máx. 10 MB cada)</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { const images = Array.from(event.target.files || []); if (images.length > 10) { setNotice('Seleccione no máximo 10 imagens de cada vez.'); event.target.value = ''; return }; setNotice(''); setProjectAssets(current => ({ ...current, images })) }} /></label><label className="project-publish-toggle"><input type="checkbox" checked={Boolean(form.isPublished)} onChange={event => setForm(current => ({ ...current, isPublished: event.target.checked }))} /> Publicar no portfólio</label></div>}<button className="button button-dark" disabled={saving}>{saving ? 'A guardar...' : 'Guardar registo'} <Check size={15} /></button></form>}<section className="admin-panel resource-panel"><div className="resource-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar registos..." /></label>{resource !== 'clients' && <select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os estados</option>{statuses.map(item => <option key={item}>{item}</option>)}</select>}</div>{error && <p className="notice error-notice">{error}</p>}{loading ? <div className="loading-state"><LoaderCircle className="spin" /> A carregar registos...</div> : items.length ? <div className="table-scroll"><table><thead><tr><th>Nome / Título</th><th>Contacto / Detalhe</th><th>Data</th><th>Estado</th><th></th></tr></thead><tbody>{items.map(item => <tr key={item._id}><td><strong>{item.name || item.title || item.clientName || '—'}</strong><small>{item.company || item.category || item.constructionType || item.service || ''}</small></td><td>{item.email || item.location || item.amount && `${item.amount.toLocaleString('pt-PT')} MZN` || '—'}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-PT') : '—'}</td><td>{resource === 'clients' || resource === 'services' ? <span className="status-pill">{item.status || (item.isPublished ? 'Publicado' : 'Activo')}</span> : <select className="status-select" aria-label="Alterar estado" value={item.status || ''} onChange={e => setItemStatus(item, e.target.value)}><option value="" disabled>Definir estado</option>{statuses.map(value => <option key={value}>{value}</option>)}</select>}</td><td>{resource === 'projects' && <label className={`icon-button project-image-upload${uploadingProject === item._id ? ' uploading' : ''}`} title="Adicionar imagens do imóvel"><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploadingProject === item._id} onChange={event => { uploadProjectImages(item, Array.from(event.target.files || [])); event.target.value = '' }} /><ImagePlus size={16} /><span className="sr-only">{uploadingProject === item._id ? 'A carregar imagens' : 'Adicionar imagens do imóvel'}</span></label>}<button className="icon-button delete-button" onClick={() => remove(item)} title="Arquivar registo"><X size={15} /></button></td></tr>)}</tbody></table></div> : <div className="empty-list"><ClipboardList /><strong>Sem registos para apresentar</strong><span>Quando existirem registos, poderá geri-los nesta área.</span></div>}</section></>
}

function AdminApp() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const navigate = useNavigate()
  useEffect(() => { api.get('/auth/me').then(({ data }) => setUser(data.user)).catch(() => setUser(null)).finally(() => setChecking(false)) }, [])
  async function logout() { try { await api.post('/auth/logout') } finally { setUser(null); navigate('/admin/login') } }
  if (checking) return <div className="app-loading"><LoaderCircle className="spin" /> A verificar sessão...</div>
  if (!user) return <Routes><Route path="login" element={<AdminLogin onLogin={setUser} />} /><Route path="*" element={<NavigateToLogin />} /></Routes>
  return <AdminLayout user={user} logout={logout}><Routes><Route index element={<Dashboard />} /><Route path="clientes" element={<ResourcePage resource="clients" title="Clientes" description="Consulte e acompanhe a sua carteira de clientes." user={user} />} /><Route path="pedidos" element={<ResourcePage resource="quote-requests" title="Pedidos" description="Acompanhe pedidos de orçamento e actualize o seu estado." user={user} />} /><Route path="propostas" element={<ResourcePage resource="quotations" title="Propostas" description="Crie e acompanhe propostas comerciais." user={user} />} /><Route path="projectos" element={<ResourcePage resource="projects" title="Projectos" description="Acompanhe a execução dos projectos da empresa." user={user} />} /><Route path="servicos" element={<ResourcePage resource="services" title="Serviços" description="Mantenha os serviços apresentados no website." user={user} />} /><Route path="*" element={<Dashboard />} /></Routes></AdminLayout>
}

function NavigateToLogin() {
  const navigate = useNavigate()
  useEffect(() => navigate('/admin/login', { replace: true }), [navigate])
  return null
}

export default function App() {
  return <Routes><Route path="/admin/*" element={<AdminApp />} /><Route path="*" element={<><Header /><main><Routes><Route path="/" element={<Home />} /><Route path="/sobre" element={<About />} /><Route path="/servicos" element={<Services />} /><Route path="/projectos" element={<Portfolio />} /><Route path="/projectos/:id" element={<ProjectDetails />} /><Route path="/contactos" element={<Contact />} /><Route path="/orcamento" element={<QuoteRequest />} /><Route path="*" element={<Home />} /></Routes></main><Footer /></>} /></Routes>
}
