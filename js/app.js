// ============================================================
// APP v4 - Cobros Pro  |  Soft Modern
// ============================================================
let D = { prestamos:[], pagos:[], gestiones:[], carteras:[] };
let USER = null, estadoSel = '', clienteAct = null;
let siguienteLista = [], siguienteIdx = 0;
let timerInterval = null, timerInicio = null;
let dashData = null;

const hoy    = new Date();
const hoyStr = hoy.toISOString().split('T')[0];

// ── Utilidades ───────────────────────────────────────────────
const fL  = n => 'L ' + Number(n||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2});
const diaSem = () => ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][hoy.getDay()];
const diaMes  = () => hoy.getDate();
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function getCiclo() {
  const y=hoy.getFullYear(), m=hoy.getMonth(), d=hoy.getDate(), dc=CONFIG.DIA_CIERRE;
  const ini = d<=dc ? new Date(y,m-1,dc+1) : new Date(y,m,dc+1);
  const fin = d<=dc ? new Date(y,m,dc)     : new Date(y,m+1,dc);
  return { ini, fin, dias:Math.max(0,Math.ceil((fin-hoy)/864e5)), totalDias:Math.ceil((fin-ini)/864e5) };
}
const getEst  = v => CONFIG.ESTADOS.find(e=>e.value===v) || CONFIG.ESTADOS[6];
const stCls   = v => 's-'+(v||'pendiente');
const ultGest = c => D.gestiones.filter(g=>g.cliente===c).sort((a,b)=>(b.fecha+b.hora).localeCompare(a.fecha+a.hora))[0];

function agrupar(ps) {
  const m = {};
  ps.forEach(p => {
    if (!m[p.cliente]) m[p.cliente]={cliente:p.cliente,cartera:p.cartera,diaPago:p.diaPago,prestamos:[],totalBal:0,totalCuo:0};
    m[p.cliente].prestamos.push(p);
    m[p.cliente].totalBal+=p.balance;
    m[p.cliente].totalCuo+=p.balanceCuotas;
  });
  return Object.values(m);
}

function toast(msg, type='') {
  const t=document.getElementById('toast');
  const iconId = type==='success' ? 'check' : type==='error' ? 'x-circle' : 'info';
  t.innerHTML = ic(iconId,14) + `<span>${esc(msg)}</span>`;
  t.className = 'toast ' + (type==='success' ? 'ok' : type==='error' ? 'err' : '');
  t.style.display='block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.style.display='none', 3500);
}

function diasDesdeUltimoPago(cliente) {
  const pagos = D.pagos.filter(p=>p.cliente===cliente).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  if (!pagos.length) return null;
  const diff = Math.floor((hoy - new Date(pagos[0].fecha)) / 864e5);
  return diff;
}

function calcRiesgo(cliente) {
  const dias = diasDesdeUltimoPago(cliente) ?? 999;
  const promesasInc = D.gestiones.filter(g =>
    g.cliente===cliente && g.estado==='promesa' && g.fechaPromesa < hoyStr &&
    !D.gestiones.some(g2=>g2.cliente===cliente && g2.estado==='pagado' && g2.fecha>=g.fechaPromesa)
  ).length;
  let score = 0;
  if      (dias > 90) score += 50;
  else if (dias > 60) score += 35;
  else if (dias > 30) score += 20;
  else if (dias > 15) score += 10;
  score += Math.min(promesasInc * 15, 45);
  score  = Math.min(score, 100);
  const nivel = score >= 70 ? {label:'Alto',  color:'#B1452C'}
              : score >= 40 ? {label:'Medio', color:'#C08A2E'}
              :               {label:'Bajo',  color:'#5C7A56'};
  return {score, nivel, dias, promesasInc};
}

function prioridadCliente(c) {
  const r = calcRiesgo(c.cliente);
  const u = ultGest(c.cliente);
  let pts = 0;
  if (!u) pts += 40;
  if (r.score > 60) pts += 30;
  if (u && u.estado==='promesa') pts += 20;
  pts += Math.min(c.totalCuo / 100, 20);
  return pts;
}

// ── GAMIFICACIÓN ─────────────────────────────────────────────
const GAME = {
  calcLogros(gestiones, usuario) {
    const gH = gestiones.filter(g => g.fecha===hoyStr && g.gestor===usuario.nombre);
    const pagosH = gH.filter(g=>g.estado==='pagado');
    const cliHoy = [...new Set(D.prestamos.filter(p=>{
      const dp=p.diaPago.toLowerCase();
      return dp.includes(diaSem()) || dp==='día '+diaMes();
    }).map(p=>p.cliente))];
    const cliGest = [...new Set(gH.map(g=>g.cliente))];

    const desbloqueados = [];
    if (gH.length >= 1)          desbloqueados.push('primera_gestion');
    if (pagosH.length >= 1)      desbloqueados.push('cobro_exitoso');
    if (gH.length >= 5)          desbloqueados.push('cinco_gestiones');
    if (gH.length >= 10)         desbloqueados.push('diez_gestiones');
    if (pagosH.length >= 3)      desbloqueados.push('tres_cobros');
    if (cliHoy.length > 0 && cliHoy.every(c=>cliGest.includes(c))) desbloqueados.push('todos_contactados');
    if (cliHoy.length > 0 && !cliHoy.some(c=>!cliGest.includes(c))) desbloqueados.push('sin_pendientes');
    const meta = CONFIG.META_CICLO / (getCiclo().totalDias||1);
    const cobHoy = pagosH.reduce((s,g)=>s+(g.montoPagado||0),0);
    if (meta > 0 && cobHoy >= meta) desbloqueados.push('meta_diaria');
    const racha = this.calcRacha(gestiones, usuario);
    if (racha >= 3) desbloqueados.push('racha_3');
    if (racha >= 5) desbloqueados.push('racha_5');

    const pts = desbloqueados.reduce((s,id) => {
      const l = CONFIG.LOGROS.find(x=>x.id===id);
      return s + (l ? l.pts : 0);
    }, 0);
    return { desbloqueados, puntos:pts };
  },

  calcRacha(gestiones, usuario) {
    let racha = 0;
    for (let i = 0; i < 30; i++) {
      const dt  = new Date(hoy); dt.setDate(dt.getDate()-i);
      const dts = dt.toISOString().split('T')[0];
      const tienePago = gestiones.some(g=>g.fecha===dts && g.gestor===usuario.nombre && g.estado==='pagado');
      if (tienePago) racha++;
      else if (i > 0) break;
    }
    return racha;
  },

  getNivel(pts) {
    return CONFIG.NIVELES.slice().reverse().find(n=>pts>=n.minPts) || CONFIG.NIVELES[0];
  }
};

// ── CELEBRACIÓN ──────────────────────────────────────────────
function celebrar(monto) {
  const overlay = document.getElementById('celebracion');
  document.getElementById('cel-monto').textContent = fL(monto);
  document.getElementById('cel-icon-el').innerHTML = ic('check',34);
  overlay.style.display = 'flex';
  const cont = document.getElementById('confetti');
  cont.innerHTML = '';
  const colors = ['#1877F2','#FFD400','#5C7A56','#C08A2E','#4A6FA5','#0B5AD6'];
  for (let i=0; i<60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-p';
    p.style.cssText = `left:${Math.random()*100}%;background:${colors[i%colors.length]};
      animation-delay:${Math.random()*0.5}s;animation-duration:${0.8+Math.random()*0.7}s;
      width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;border-radius:${Math.random()>0.5?'50%':'2px'}`;
    cont.appendChild(p);
  }
  setTimeout(() => { overlay.style.display='none'; cont.innerHTML=''; }, 3000);
}

// ── RESUMEN INICIAL ───────────────────────────────────────────
function mostrarResumenInicial() {
  if (!D.prestamos.length && !D.pagos.length) return;
  const esGestor2 = USER && USER.rol === 'gestor' && USER.cartera;
  let actP = D.prestamos.filter(p=>(p.balance+p.balanceCuotas)>=CONFIG.MIN_BALANCE);
  if (esGestor2) actP = actP.filter(p=>p.cartera===USER.cartera);
  let pagosR = D.pagos;
  if (esGestor2) pagosR = pagosR.filter(p=>p.cartera===USER.cartera);
  let gHR = D.gestiones.filter(g=>g.fecha===hoyStr);
  if (esGestor2) gHR = gHR.filter(g=>g.gestor===USER.nombre);

  const c    = getCiclo();
  const meta = CONFIG.META_CICLO || actP.reduce((s,p)=>s+p.balanceCuotas,0);
  const rec  = pagosR.reduce((s,p)=>s+p.valor,0);
  const pct  = meta > 0 ? (rec/meta*100).toFixed(1) : '0.0';
  const cont = [...new Set(gHR.map(g=>g.cliente))];
  const pvCount = D.gestiones.filter(g =>
    g.estado==='promesa' && g.fechaPromesa && g.fechaPromesa<=hoyStr &&
    (esGestor2 ? g.gestor===USER.nombre : true) &&
    !D.gestiones.some(g2=>g2.cliente===g.cliente&&g2.estado==='pagado'&&g2.fecha>=g.fechaPromesa)
  ).length;

  // Set the icon for the resumen header
  document.querySelector('#resumen-inicial .ri-icon-wrap').innerHTML = ic('sunrise',21);

  document.getElementById('ri-meta').textContent  = fL(meta);
  document.getElementById('ri-rec').textContent   = fL(rec) + ' (' + pct + '%)';
  document.getElementById('ri-dias').textContent  = c.dias + ' días';
  document.getElementById('ri-gest').textContent  = gHR.length + ' gestiones · ' + cont.length + ' contactados';
  document.getElementById('ri-prom').textContent  = pvCount;
  document.getElementById('resumen-inicial').style.display = 'flex';
}

// ══════════════════════════════════════
// LOGIN / SESIÓN
// ══════════════════════════════════════
async function initLogin() {
  try {
    const res = await API.getUsuarios();
    if (res.success && res.data.length) {
      CONFIG.USUARIOS = res.data;
    } else {
      CONFIG.USUARIOS = [{id:'admin',nombre:'Administrador',pass:'1234',rol:'gerente',avatar:'A',cartera:''}];
    }
  } catch(e) {
    CONFIG.USUARIOS = [{id:'admin',nombre:'Administrador',pass:'1234',rol:'gerente',avatar:'A',cartera:''}];
  }

  const sel = document.getElementById('login-usuario');
  sel.innerHTML = '<option value="">Seleccionar usuario...</option>';
  CONFIG.USUARIOS.forEach(u => {
    sel.innerHTML += `<option value="${esc(u.id)}">${esc(u.nombre)} (${esc(CONFIG.ROLES[u.rol]?.label||u.rol)})</option>`;
  });

  const saved = sessionStorage.getItem('cobros_user');
  if (saved) { USER = JSON.parse(saved); mostrarApp(); }
}

function iniciarSesion() {
  const uid  = document.getElementById('login-usuario').value;
  const pass = document.getElementById('login-pass').value;
  const err  = document.getElementById('login-error');
  if (!uid)  { err.textContent='Seleccioná un usuario'; return; }
  const u = CONFIG.USUARIOS.find(x=>x.id===uid);
  if (!u)    { err.textContent='Usuario no encontrado';  return; }
  if (u.pass !== pass) { err.textContent='Contraseña incorrecta'; return; }
  USER = u; err.textContent='';
  sessionStorage.setItem('cobros_user', JSON.stringify(u));
  mostrarApp();
}

function cerrarSesion() {
  USER=null; sessionStorage.removeItem('cobros_user');
  document.getElementById('app-container').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('login-pass').value='';
}

function mostrarApp() {
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-container').style.display='flex';
  document.getElementById('user-avatar').textContent     = (USER.avatar||USER.nombre[0]).toUpperCase();
  document.getElementById('user-name-label').textContent = USER.nombre;
  document.getElementById('user-role-label').textContent = CONFIG.ROLES[USER.rol]?.label||USER.rol;
  document.getElementById('sidebar-brand-role').textContent = CONFIG.ROLES[USER.rol]?.label||USER.rol;
  buildMenu();
  populateFilters();
  cargarTodosDatos();
}

function buildMenu() {
  const perms = CONFIG.ROLES[USER.rol];
  const menu  = document.getElementById('sidebar-menu');
  menu.innerHTML = '';

  // Guardia: si el rol del usuario no existe en CONFIG.ROLES, avisar y no romper la app
  if (!perms) {
    const rolesValidos = Object.keys(CONFIG.ROLES).join(', ');
    menu.innerHTML = `<div style="padding:14px;font-size:12px;color:var(--red);line-height:1.5;background:var(--red-a);border:1px solid var(--red-a2);border-radius:var(--r2);margin:4px">
      <strong>Rol no reconocido:</strong> "${esc(USER.rol||'(vacío)')}"<br><br>
      Roles válidos: <strong>${rolesValidos}</strong>.<br><br>
      Corregí el rol en la hoja <strong>Usuarios</strong> de la Sheet y volvé a ingresar.
    </div>`;
    toast('Rol inválido: "'+(USER.rol||'')+'". Corregilo en la hoja Usuarios.','error');
    return;
  }

  CONFIG.TABS.filter(t => perms.tabs.includes(t.id)).forEach(t => {
    menu.innerHTML += `<button class="menu-item${t.id==='dashboard'?' active':''}" data-tab="${t.id}" onclick="switchTab('${t.id}')" title="${esc(t.label)}"><span class="icon icon-md">${icon(t.iconId,16)}</span><span class="menu-label">${esc(t.label)}</span></button>`;
  });
  menu.innerHTML += `<button class="menu-item" onclick="cargarTodosDatos()" style="margin-top:8px"><span class="icon icon-md">${icon('refresh-cw',16)}</span><span class="menu-label">Actualizar</span></button>`;
}

function populateFilters() {
  const dm = document.getElementById('f-dm');
  if (dm && dm.options.length <= 1)
    for (let i=1;i<=31;i++) dm.innerHTML+=`<option value="${i}">Día ${i}</option>`;
  ['f-est','fh-est'].forEach(id => {
    const s=document.getElementById(id);
    if(!s||s.options.length>1) return;
    CONFIG.ESTADOS.forEach(e => {
      s.innerHTML += `<option value="${e.value}">${esc(e.label)}</option>`;
    });
  });
}

// ══════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}
function switchTab(id) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(m=>m.classList.remove('active'));
  const tab=document.getElementById('tab-'+id);
  if(tab) tab.classList.add('active');
  const mi=document.querySelector(`.menu-item[data-tab="${id}"]`);
  if(mi) mi.classList.add('active');
  if(window.innerWidth<=768){
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
  }
  switch(id) {
    case 'dashboard': renderDash();      break;
    case 'cartera':   filtrarCartera();  break;
    case 'hoy':       renderHoy();       break;
    case 'historial': renderHist();      break;
    case 'pagos':     filtrarPagos();    break;
    case 'ranking':   renderRanking();   break;
    case 'logros':    renderLogros();    break;
    case 'usuarios':  renderUsers();     break;
    case 'zonas':     renderZonas();     break;
  }
}

// ══════════════════════════════════════
// CARGA DE DATOS
// ══════════════════════════════════════
async function cargarTodosDatos() {
  document.getElementById('loading').style.display='flex';
  try {
    const [pr, pa, ge, meta, ca] = await Promise.all([
      API.getPrestamos(), API.getPagos(), API.getGestiones(), API.getMeta(), API.getCarteras()
    ]);
    D.prestamos  = pr.data||[];
    D.pagos      = pa.data||[];
    D.gestiones  = ge.data||[];
    D.carteras   = ca.data||[];
    CONFIG.META_CICLO = meta.meta||0;
    try { const db=await API.getDashboard(); if(db.success) dashData=db.data; } catch(e){}
    toast('Datos sincronizados','success');
    mostrarResumenInicial();
  } catch(e) {
    if (e.message==='URL_NO_CONFIGURADA') {
      cargarEjemplo(); toast('Modo demo — Configurá la URL en config.js','error');
    } else {
      cargarEjemplo(); toast('Sin conexión — Datos de ejemplo','error');
    }
  }
  document.getElementById('loading').style.display='none';
  const at=document.querySelector('.menu-item.active');
  switchTab(at?at.dataset.tab:'dashboard');
}

function cargarEjemplo() {
  CONFIG.META_CICLO = 80000;
  D.prestamos = [
    {id:5, cliente:'Carmen Dalila Vasquez Ferrera',     tipo:'PREST. MENSUAL',    capital:15264, balance:13662.69, balanceCuotas:728.70,  diaPago:'Día 17',       cartera:'Zona 3'},
    {id:9, cliente:'Gladys Carolina Castillo Ramirez',  tipo:'PREST. QUINCENAL',  capital:6000,  balance:6000,    balanceCuotas:600,     diaPago:'Día 15',       cartera:'Zona 3'},
    {id:13,cliente:'Angelica Patricia Pineda Carbajal', tipo:'PREST. QUINCENAL',  capital:12000, balance:12000,   balanceCuotas:2840,    diaPago:'Día 15',       cartera:'Zona 3'},
    {id:15,cliente:'Daisy Rivera Valladares',           tipo:'PREST. SEMANAL',    capital:13400, balance:8500,    balanceCuotas:1200,    diaPago:'Día lunes',    cartera:'Zona 3'},
    {id:19,cliente:'Keylin Roxana Mejia Garcia',        tipo:'PREST. QUINCENAL',  capital:12598, balance:12598,   balanceCuotas:5292.43, diaPago:'Día 15',       cartera:'Zona 1'},
    {id:24,cliente:'Mauricio Zamora Perdomo',           tipo:'PREST. SEMANAL',    capital:7958,  balance:4200,    balanceCuotas:850,     diaPago:`Día ${diaSem()}`, cartera:'Zona 1'},
    {id:25,cliente:'Mirian Maritza Flores Aguilar',     tipo:'PREST. SEMANAL',    capital:3500,  balance:1800,    balanceCuotas:400,     diaPago:`Día ${diaSem()}`, cartera:'Zona 2'},
    {id:26,cliente:'Olvin Enrique Castro Ortega',       tipo:'PREST. SEMANAL',    capital:5822,  balance:4443.16, balanceCuotas:476.10,  diaPago:`Día ${diaSem()}`, cartera:'Zona 2'},
    {id:28,cliente:'Suyapa Yadira Cardona Marquez',     tipo:'PREST. QUINCENAL',  capital:10000, balance:7500,    balanceCuotas:1500,    diaPago:'Día 15',       cartera:'Zona 2'},
    {id:29,cliente:'Mario Emmanuel Lopez Ortez',        tipo:'PREST. SEMANAL',    capital:4500,  balance:3200,    balanceCuotas:520,     diaPago:`Día ${diaSem()}`, cartera:'Zona 1'},
    {id:30,cliente:'Delmy Cristina Gutierrez Caceres',  tipo:'PREST. SEMANAL',    capital:8000,  balance:5600,    balanceCuotas:1100,    diaPago:`Día ${diaSem()}`, cartera:'Zona 2'},
  ];
  D.pagos = [
    {cliente:'Carmen Dalila Vasquez Ferrera',    tipo:'PREST. MENSUAL',   valor:728.70,  fecha:'2026-02-10', capital:600,   intereses:128.70, caja:'Bac',     medioPago:'transferencia'},
    {cliente:'Gladys Carolina Castillo Ramirez', tipo:'PREST. QUINCENAL', valor:600,     fecha:'2026-02-11', capital:500,   intereses:100,    caja:'Bac',     medioPago:'efectivo'},
    {cliente:'Angelica Patricia Pineda Carbajal',tipo:'PREST. QUINCENAL', valor:2840,    fecha:'2026-02-12', capital:2200,  intereses:640,    caja:'Ficohsa', medioPago:'transferencia'},
    {cliente:'Keylin Roxana Mejia Garcia',       tipo:'PREST. QUINCENAL', valor:5292.43, fecha:'2026-02-12', capital:4000,  intereses:1292.43,caja:'Banpais', medioPago:'efectivo'},
    {cliente:'Daisy Rivera Valladares',          tipo:'PREST. SEMANAL',   valor:1200,    fecha:'2026-02-24', capital:900,   intereses:300,    caja:'Bac',     medioPago:'efectivo'},
    {cliente:'Olvin Enrique Castro Ortega',      tipo:'PREST. SEMANAL',   valor:476.10,  fecha:'2026-02-24', capital:380,   intereses:96.10,  caja:'Ficohsa', medioPago:'transferencia'},
    {cliente:'Mauricio Zamora Perdomo',          tipo:'PREST. SEMANAL',   valor:850,     fecha:hoyStr,       capital:700,   intereses:150,    caja:'Bac',     medioPago:'efectivo'},
    {cliente:'Mirian Maritza Flores Aguilar',    tipo:'PREST. SEMANAL',   valor:400,     fecha:hoyStr,       capital:330,   intereses:70,     caja:'Ficohsa', medioPago:'efectivo'},
  ];
  D.gestiones = [
    {cliente:'Carmen Dalila Vasquez Ferrera',    estado:'promesa',         comentario:'Paga el viernes',       fechaPromesa:'2026-02-28', montoPagado:0,    montoPromesa:728.70, fecha:'2026-02-25', hora:'10:30', gestor:'Gestor 1'},
    {cliente:'Gladys Carolina Castillo Ramirez', estado:'mensaje_enviado', comentario:'WhatsApp enviado',      fechaPromesa:'',           montoPagado:0,    montoPromesa:0,      fecha:hoyStr,       hora:'08:15', gestor:USER?USER.nombre:'Gestor 1'},
    {cliente:'Angelica Patricia Pineda Carbajal',estado:'pagado',          comentario:'Pagó en Ficohsa',       fechaPromesa:'',           montoPagado:2840, montoPromesa:0,      fecha:hoyStr,       hora:'09:45', gestor:USER?USER.nombre:'Gestor 1'},
    {cliente:'Mauricio Zamora Perdomo',          estado:'pagado',          comentario:'Pagó cuota completa',   fechaPromesa:'',           montoPagado:850,  montoPromesa:0,      fecha:hoyStr,       hora:'11:20', gestor:USER?USER.nombre:'Gestor 1'},
  ];
  dashData = {
    ciclo:{inicio:'2026-02-09',fin:'2026-03-08',diasRestantes:5},
    cartera:{totalBalance:D.prestamos.reduce((s,p)=>s+p.balance,0), totalCuotas:D.prestamos.reduce((s,p)=>s+p.balanceCuotas,0), clientesActivos:D.prestamos.length},
    recuperacion:{totalRecuperado:D.pagos.reduce((s,p)=>s+p.valor,0), cantidadPagos:D.pagos.length, porcentaje:'15.8'},
    gestionHoy:{total:4, contactados:3, porEstado:{pagado:2,mensaje_enviado:1}},
    promesasVencidas:1, promesasDetalle:[],
    meta:CONFIG.META_CICLO
  };
}

// ══════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════
function renderDash() {
  const esGestor = USER && USER.rol === 'gestor' && USER.cartera;
  let act = D.prestamos.filter(p=>(p.balance+p.balanceCuotas)>=CONFIG.MIN_BALANCE);
  if (esGestor) act = act.filter(p => p.cartera === USER.cartera);
  let pagosAct = D.pagos;
  if (esGestor) pagosAct = pagosAct.filter(p => p.cartera === USER.cartera);

  const c      = getCiclo();
  const totCar = act.reduce((s,p)=>s+p.balance,0);
  const totCuo = act.reduce((s,p)=>s+p.balanceCuotas,0);
  const totRec = pagosAct.reduce((s,p)=>s+p.valor,0);
  // Meta: si es gestor con cartera asignada, usa la meta de esa cartera.
  //       Para gerente/supervisor, es la suma de todas las carteras.
  //       Fallback: CONFIG.META_CICLO (legacy) o suma de cuotas activas.
  let meta;
  if (esGestor) {
    const zona = D.carteras.find(z => z.nombre === USER.cartera);
    meta = zona ? zona.meta : (CONFIG.META_CICLO || totCuo);
  } else {
    meta = D.carteras.length ? D.carteras.reduce((s,z)=>s+z.meta,0) : (CONFIG.META_CICLO || totCuo);
  }
  const cliU   = [...new Set(act.map(p=>p.cliente))];
  let gH = D.gestiones.filter(g=>g.fecha===hoyStr);
  if (esGestor) gH = gH.filter(g=>g.gestor===USER.nombre);
  const cont   = [...new Set(gH.map(g=>g.cliente))];
  const pagH   = gH.filter(g=>g.estado==='pagado');
  const pagosHoy = pagosAct.filter(p=>p.fecha===hoyStr);
  const cobHoy = pagosHoy.reduce((s,p)=>s+p.valor,0) + pagH.reduce((s,g)=>s+(g.montoPagado||0),0);
  const diasT = c.totalDias||1, diasP = Math.max(1, diasT-c.dias);

  // ── Ciclo info ─────────────────────────────────────────────
  document.getElementById('ciclo-info').textContent = `Ciclo: ${c.ini.toLocaleDateString('es-HN')} – ${c.fin.toLocaleDateString('es-HN')}`;
  const dc=document.getElementById('dias-cierre');
  dc.innerHTML = ic('clock',11) + ' ' + c.dias + ' días para cierre';
  dc.className = 'cycle-badge ' + (c.dias<=3?'danger':c.dias<=7?'warning':'ok');

  // ── Meta configurable ────────────────────────────────────
  document.getElementById('meta-valor').textContent = fL(meta);
  const metaLbl = document.getElementById('meta-label');
  if (metaLbl) metaLbl.innerHTML = (esGestor
    ? `Meta de <strong>${esc(USER.cartera||'—')}</strong>: `
    : 'Meta del ciclo: ') + `<strong id="meta-valor">${fL(meta)}</strong>`;
  const metaBtn = document.getElementById('meta-edit-btn');
  if (metaBtn) metaBtn.style.display = CONFIG.ROLES[USER.rol]?.canEditZonas ? 'inline-flex' : 'none';

  // ── Cálculos ──────────────────────────────────────────────
  const metaDiaria   = meta / (c.totalDias || 1);
  const deltaDiario  = cobHoy - metaDiaria;
  const pctDiario    = metaDiaria > 0 ? (cobHoy / metaDiaria * 100) : 0;
  const promDiario   = diasP > 0 ? totRec / diasP : 0;
  const proyTotal    = totRec + (promDiario * c.dias);
  const pctProy      = meta > 0 ? (proyTotal / meta * 100) : 0;
  const faltaCiclo   = meta - totRec;
  const pctCiclo     = meta > 0 ? (totRec / meta * 100) : 0;

  // ── PROYECCIÓN ────────────────────────────────────────────
  const proyCard  = document.getElementById('proy-card');
  const proyPctEl = document.getElementById('proy-pct-big');
  const proyFill  = document.getElementById('proy-fill-bar');

  proyPctEl.textContent = pctProy.toFixed(1) + '%';
  const proyColor = pctProy >= 100 ? 'var(--green)' : pctProy >= 80 ? 'var(--amber)' : 'var(--red)';
  const proyColorRaw = pctProy >= 100 ? '#5C7A56' : pctProy >= 80 ? '#C08A2E' : '#B1452C';
  proyCard.style.setProperty('--proy-color', proyColorRaw);
  proyPctEl.style.color = proyColor;

  proyFill.style.width = Math.min(pctProy, 100) + '%';
  proyFill.style.background = proyColor;

  document.getElementById('proy-ciclo-label').textContent =
    `${c.totalDias} días · Día ${diasP} de ${c.totalDias}`;

  // Mensaje proyección con icono
  let proyIconId, proyMsg;
  if (pctProy >= 110) {
    proyIconId='rocket';
    proyMsg = `Vas <span class="accent-txt">${(pctProy-100).toFixed(1)}%</span> sobre la meta`;
  } else if (pctProy >= 100) {
    proyIconId='check-circle';
    proyMsg = `En camino a cumplir la meta`;
  } else if (pctProy >= 80) {
    proyIconId='alert-triangle';
    proyMsg = `Riesgo de cierre bajo — acelerá el ritmo`;
  } else {
    proyIconId='trending-down';
    const necesita = metaDiaria * (1 + (100-pctProy)/100);
    proyMsg = `Ritmo insuficiente — necesitás <span class="accent-txt">${fL(necesita)}</span> diarios`;
  }
  document.getElementById('proy-sub-txt').innerHTML =
    `<span style="display:inline-flex;vertical-align:-3px;margin-right:6px;color:${proyColor}">${ic(proyIconId,15)}</span>${proyMsg}`;

  document.getElementById('proy-rec-label').innerHTML =
    `Promedio diario: <strong style="color:var(--blue)">${fL(promDiario)}</strong>`;
  document.getElementById('proy-falta-label').innerHTML = faltaCiclo > 0
    ? `Falta para 100%: <strong style="color:var(--red)">${fL(faltaCiclo)}</strong>`
    : `Sobrante: <strong style="color:var(--green)">${fL(-faltaCiclo)}</strong>`;

  // ── META DIARIA ───────────────────────────────────────────
  document.getElementById('md-fecha').textContent =
    hoy.toLocaleDateString('es-HN',{weekday:'short',day:'numeric',month:'short'});
  document.getElementById('md-meta').textContent    = fL(metaDiaria);
  document.getElementById('md-cobrado').textContent = fL(cobHoy);

  const resBox  = document.getElementById('md-resultado');
  const resIconWrap = document.getElementById('md-result-icon-wrap');
  const resTxt  = document.getElementById('md-resultado-txt');
  const resMonto= document.getElementById('md-resultado-monto');

  if (cobHoy === 0 && diasP <= 1 && metaDiaria === 0) {
    resIconWrap.innerHTML = ic('calendar',15);
    resTxt.textContent = 'Ciclo recién iniciado';
    resMonto.textContent = '';
    resBox.className = 'md-result md-neutral';
  } else if (deltaDiario >= 0) {
    resIconWrap.innerHTML = ic('arrow-up',15);
    resTxt.textContent = 'Sobrante del día';
    resMonto.textContent = '+' + fL(deltaDiario);
    resBox.className = 'md-result md-ok';
  } else {
    resIconWrap.innerHTML = ic('arrow-down',15);
    resTxt.textContent = 'Falta para hoy';
    resMonto.textContent = fL(-deltaDiario);
    resBox.className = 'md-result md-warn';
  }

  const pctDiarioClamp = Math.min(pctDiario, 100);
  document.getElementById('md-prog-fill').style.width      = pctDiarioClamp + '%';
  document.getElementById('md-prog-fill').style.background = deltaDiario >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('md-pct-lbl').textContent        = pctDiario.toFixed(1) + '%';
  document.getElementById('md-pct-lbl').style.color        = deltaDiario >= 0 ? 'var(--green)' : 'var(--red)';

  // ── ACUMULADO CICLO ──────────────────────────────────────
  document.getElementById('s-recup').textContent       = fL(totRec);
  document.getElementById('s-recup-count').textContent = pagosAct.length + ' pagos';
  document.getElementById('s-pct').textContent         = pctCiclo.toFixed(1) + '%';
  document.getElementById('s-pct').style.color         = pctCiclo >= 100 ? 'var(--green)' : pctCiclo >= 70 ? 'var(--amber)' : 'var(--t1)';
  document.getElementById('s-pct-det').textContent     = fL(totRec) + ' de ' + fL(meta);
  document.getElementById('ciclo-avance-pct').textContent = pctCiclo.toFixed(1) + '%';
  const ciclofill = document.getElementById('ciclo-prog-fill');
  ciclofill.style.width      = Math.min(pctCiclo, 100) + '%';
  ciclofill.style.background = 'linear-gradient(90deg, var(--accent), var(--green))';

  // ── STATS SECUNDARIOS ────────────────────────────────────
  document.getElementById('s-cobrado-hoy').textContent = fL(cobHoy);
  document.getElementById('s-cobros-count').textContent= (pagosHoy.length + pagH.length) + ' cobros hoy';
  document.getElementById('s-cartera').textContent     = fL(totCar);
  document.getElementById('s-clientes').textContent    = cliU.length + ' clientes';
  document.getElementById('s-cuotas').textContent      = fL(totCuo);
  document.getElementById('s-gest').textContent        = gH.length;
  document.getElementById('s-contact').textContent     = cont.length + '/' + cliU.length + ' contactados';

  // ── PROGRESS BARS ────────────────────────────────────────
  const pb=document.getElementById('progress-bars'); pb.innerHTML='';
  [{l:'Recuperado vs Meta',  v:totRec,        mx:meta,                       cl:'var(--green)'},
   {l:'Proyección de cierre',v:proyTotal,     mx:meta,                       cl:'var(--accent)'},
   {l:'Contactados hoy',     v:cont.length,   mx:cliU.length,                cl:'var(--blue)'},
   {l:'Efectividad hoy',     v:pagH.length,   mx:Math.max(gH.length,1),      cl:'var(--amber)'}
  ].forEach(b => {
    const p=b.mx>0?Math.min(b.v/b.mx*100,100):0;
    pb.innerHTML+=`<div class="prog">
      <div class="prog-head"><span class="prog-lbl">${b.l}</span><span class="prog-pct">${p.toFixed(1)}%</span></div>
      <div class="prog-track"><div class="prog-fill" style="width:${p}%;background:${b.cl}"></div></div>
    </div>`;
  });

  // ── ESTADOS HOY ──────────────────────────────────────────
  const eh=document.getElementById('estados-hoy'); eh.innerHTML='';
  CONFIG.ESTADOS.forEach(e => {
    const n=gH.filter(g=>g.estado===e.value).length;
    const mnt=gH.filter(g=>g.estado===e.value&&g.montoPagado>0).reduce((s,g)=>s+(g.montoPagado||0),0);
    eh.innerHTML+=`<div class="erow">
      <div class="erow-left">${ic(e.iconId,13)}<span>${esc(e.label)}</span></div>
      <div class="erow-right">${mnt>0?`<span class="erow-amt" style="color:var(--green)">${fL(mnt)}</span>`:''}<span class="erow-count" style="background:${e.bg};color:${e.color}">${n}</span></div>
    </div>`;
  });

  // ── GRÁFICO COBRO ─────────────────────────────────────────
  renderGraficoCobro(pagosAct);

  // ── DESGLOSE CAPITAL/INTERESES ───────────────────────────
  const gestPagF = D.gestiones.filter(g=>g.estado==='pagado' && (esGestor?g.gestor===USER.nombre:true));
  const totCap = gestPagF.reduce((s,g)=>s+(g.capital||0),0);
  const totInt = gestPagF.reduce((s,g)=>s+(g.intereses||0),0);
  document.getElementById('desglose-capital').textContent   = totCap>0?fL(totCap):'Ingresar al cobrar';
  document.getElementById('desglose-intereses').textContent = totInt>0?fL(totInt):'Ingresar al cobrar';

  // ── MÉTODOS DE PAGO ───────────────────────────────────────
  const mpMap={};
  pagosAct.forEach(p=>{const mp=p.medioPago||'efectivo';mpMap[mp]=(mpMap[mp]||0)+p.valor;});
  const mpEl=document.getElementById('metodos-pago'); mpEl.innerHTML='';
  const mpTotal=Object.values(mpMap).reduce((s,v)=>s+v,0)||1;
  const mpColors={'efectivo':'var(--green)','transferencia':'var(--blue)','cheque':'var(--amber)'};
  Object.entries(mpMap).forEach(([mp,v])=>{
    const pct2=(v/mpTotal*100).toFixed(1);
    mpEl.innerHTML+=`<div class="mp-row">
      <span class="mp-label">${mp.charAt(0).toUpperCase()+mp.slice(1)}</span>
      <div class="prog-track" style="flex:1"><div class="prog-fill" style="width:${pct2}%;background:${mpColors[mp]||'var(--t3)'}"></div></div>
      <span class="mp-pct">${pct2}%</span>
      <span class="mp-val">${fL(v)}</span>
    </div>`;
  });

  // ── MORA ANTIGÜEDAD ───────────────────────────────────────
  renderMoraAntigüedad(act);

  // ── PROMESAS VENCIDAS ────────────────────────────────────
  const pv=D.gestiones.filter(g=>g.estado==='promesa'&&g.fechaPromesa&&g.fechaPromesa<=hoyStr&&
    !D.gestiones.some(g2=>g2.cliente===g.cliente&&g2.estado==='pagado'&&g2.fecha>=g.fechaPromesa));
  const pvBox=document.getElementById('promesas-box');
  if(pv.length>0){
    pvBox.style.display='block';
    document.getElementById('prom-count').textContent=pv.length;
    document.getElementById('prom-list').innerHTML=pv.slice(0,8).map(g=>
      `<div class="prom-item">
        <div>
          <div class="prom-name">${esc(g.cliente)}</div>
          <div class="prom-date">${ic('clock',11)}${g.fechaPromesa}${g.montoPromesa?' — '+fL(g.montoPromesa):''}</div>
        </div>
        <button class="btn-action btn-sm" onclick="abrirModalPorNombre('${esc(g.cliente)}')">${ic('phone',11)}Gestionar</button>
      </div>`
    ).join('');
  } else pvBox.style.display='none';

  // ── MINI RANKING ──────────────────────────────────────────
  // Mini ranking solo para gerente/supervisor
  const miniRankCard = document.getElementById('mini-ranking-card');
  if (miniRankCard) miniRankCard.style.display = esGestor ? 'none' : '';
  if (!esGestor) renderMiniRanking(gH);
}

function renderGraficoCobro(pagosFiltrados) {
  const pagosRef = pagosFiltrados || D.pagos;
  const dias=[];
  for(let i=13;i>=0;i--){
    const dt=new Date(hoy); dt.setDate(dt.getDate()-i);
    const ds=dt.toISOString().split('T')[0];
    const monto=pagosRef.filter(p=>p.fecha===ds).reduce((s,p)=>s+p.valor,0);
    dias.push({ds:ds.slice(5),monto});
  }
  const maxMonto=Math.max(...dias.map(d=>d.monto),1);
  const W=320,H=90,pad=4;
  const bw=Math.floor((W-pad*(dias.length+1))/dias.length);
  let bars='';
  dias.forEach((d,i)=>{
    const h2=Math.max(4,Math.floor((d.monto/maxMonto)*(H-20)));
    const x=pad+(bw+pad)*i;
    const y=H-h2-6;
    const isToday = d.ds===hoyStr.slice(5);
    const color = isToday ? '#1877F2' : '#5C7A56';
    bars+=`<rect x="${x}" y="${y}" width="${bw}" height="${h2}" rx="3" fill="${color}" opacity="${isToday?0.95:0.75}"/>`;
    if(i%3===0)bars+=`<text x="${x+bw/2}" y="${H+2}" text-anchor="middle" fill="#5B6B82" font-size="8" font-family="JetBrains Mono">${d.ds}</text>`;
    if(d.monto>0)bars+=`<text x="${x+bw/2}" y="${y-3}" text-anchor="middle" fill="${color}" font-size="7" font-family="JetBrains Mono" font-weight="600">${(d.monto/1000).toFixed(0)}k</text>`;
  });
  document.getElementById('grafico-cobro').innerHTML=`<svg viewBox="0 0 ${W} ${H+8}" style="width:100%;height:100px">${bars}</svg>`;
}

function renderMoraAntigüedad(actPrestamos) {
  const lista = actPrestamos || D.prestamos.filter(p=>(p.balance+p.balanceCuotas)>=CONFIG.MIN_BALANCE);
  const buckets=[
    {label:'Sin mora (último pago < 30 días)',     color:'var(--green)',  count:0},
    {label:'1 mes de mora (30-60 días)',           color:'var(--amber)',  count:0},
    {label:'2 meses de mora (60-90 días)',         color:'#D97A3F',       count:0},
    {label:'3-6 meses de mora (90-180 días)',      color:'var(--red)',    count:0},
    {label:'Mora crítica (más de 180 días o sin pago)', color:'var(--purple)', count:0},
  ];
  const clientesUnicos = [...new Set(lista.map(p=>p.cliente))];
  clientesUnicos.forEach(cliente=>{
    const dias = diasDesdeUltimoPago(cliente);
    const d = dias !== null ? dias : 9999;
    if(d<30)       buckets[0].count++;
    else if(d<60)  buckets[1].count++;
    else if(d<90)  buckets[2].count++;
    else if(d<180) buckets[3].count++;
    else           buckets[4].count++;
  });
  const total=clientesUnicos.length||1;
  const el=document.getElementById('mora-antiguedad'); el.innerHTML='';
  buckets.forEach(b=>{
    const pct=(b.count/total*100).toFixed(1);
    el.innerHTML+=`<div class="prog" style="margin-bottom:10px">
      <div class="prog-head"><span class="prog-lbl" style="color:${b.color}">${b.label}</span><span class="prog-pct">${b.count} clientes (${pct}%)</span></div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${b.color}"></div></div>
    </div>`;
  });
}

function renderMiniRanking(gH) {
  const rank={};
  gH.forEach(g=>{
    if(!g.gestor)return;
    if(!rank[g.gestor])rank[g.gestor]={nombre:g.gestor,cobrado:0,gestiones:0};
    rank[g.gestor].gestiones++;
    if(g.estado==='pagado')rank[g.gestor].cobrado+=g.montoPagado||0;
  });
  const top=Object.values(rank).sort((a,b)=>b.cobrado-a.cobrado).slice(0,3);
  const el=document.getElementById('mini-ranking'); if(!el)return;
  const medalIds = ['trophy','award','star'];
  el.innerHTML = top.length
    ? top.map((r,i)=>`<div class="erow">
        <div class="erow-left">${ic(medalIds[i]||'user',14)}<span>${esc(r.nombre)}</span></div>
        <span class="erow-amt" style="color:var(--green)">${fL(r.cobrado)}</span>
      </div>`).join('')
    : `<div class="empty" style="padding:24px">${ic('activity',32)}<span class="empty-label">Sin gestiones hoy</span></div>`;
}

// ── META CONFIGURABLE (legacy) ────────────────────────────────
function editarMeta() {
  // La meta ahora se administra por zona. Redirigimos.
  switchTab('zonas');
}

// ══════════════════════════════════════
// ZONAS (Carteras + Metas)
// ══════════════════════════════════════
function renderZonas() {
  if (!USER || !CONFIG.ROLES[USER.rol]?.canEditZonas) {
    document.getElementById('zonas-list').innerHTML =
      `<div class="empty">${ic('lock',38)}<span class="empty-label">Sin permisos para administrar zonas</span></div>`;
    document.getElementById('zonas-meta-total').textContent = 'L 0.00';
    return;
  }

  // Meta global = suma
  const total = D.carteras.reduce((s,z)=>s+z.meta,0);
  document.getElementById('zonas-meta-total').textContent = fL(total);
  document.getElementById('zonas-meta-detalle').textContent =
    D.carteras.length + ' zona' + (D.carteras.length===1?'':'s') + ' · Meta se suma automáticamente';

  const el = document.getElementById('zonas-list');
  if (!D.carteras.length) {
    el.innerHTML = `<div class="empty">${ic('map-pin',38)}<span class="empty-label">Aún no hay zonas configuradas</span><button class="btn-pri" style="margin-top:10px" onclick="nuevaCartera()">${ic('plus-circle',14)}Crear primera zona</button></div>`;
    return;
  }

  // Enriquecer con stats reales por cartera
  const stats = D.carteras.map(z => {
    const prestamos = D.prestamos.filter(p => p.cartera === z.nombre);
    const pagos     = D.pagos.filter(p => p.cartera === z.nombre);
    const clientes  = new Set(prestamos.map(p=>p.cliente));
    const recuperado= pagos.reduce((s,p)=>s+p.valor,0);
    const pct       = z.meta > 0 ? (recuperado / z.meta * 100) : 0;
    return { ...z, clientes:clientes.size, recuperado, pct };
  });

  el.innerHTML = stats.map(z => {
    const pctCol = z.pct >= 100 ? 'var(--green)' : z.pct >= 70 ? 'var(--amber)' : 'var(--red)';
    return `<div class="li" style="flex-direction:column;align-items:stretch;gap:12px">
      <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div class="li-name" style="font-size:15px;display:flex;align-items:center;gap:8px">
            ${ic('map-pin',13)}${esc(z.nombre)}
          </div>
          ${z.descripcion?`<div class="li-det" style="margin-top:4px">${esc(z.descripcion)}</div>`:''}
          <div class="li-det" style="margin-top:6px">
            ${ic('users',11)}<span>${z.clientes} cliente${z.clientes===1?'':'s'}</span>
            <span style="color:var(--t4)">·</span>
            ${ic('dollar-sign',11)}<span>Recuperado: <strong style="font-family:var(--font-mono);color:var(--green)">${fL(z.recuperado)}</strong></span>
          </div>
        </div>
        <div style="text-align:right">
          <div class="cli-balance" style="font-size:18px">${fL(z.meta)}</div>
          <div class="cli-cuota" style="font-size:11px">Meta del ciclo</div>
        </div>
        <div style="display:flex;gap:6px;align-self:center">
          <button class="btn-sec btn-sm" onclick='editarCartera(${JSON.stringify(z)})'>${ic('edit',12)}Editar</button>
          <button class="btn-icon" onclick='borrarCartera(${JSON.stringify(z.nombre)})' title="Eliminar">${ic('trash-2',13)}</button>
        </div>
      </div>
      <div class="prog">
        <div class="prog-head">
          <span class="prog-lbl">Avance de recuperación</span>
          <span class="prog-pct" style="color:${pctCol}">${z.pct.toFixed(1)}%</span>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${Math.min(z.pct,100)}%;background:${pctCol}"></div></div>
      </div>
    </div>`;
  }).join('');
}

function nuevaCartera() {
  const nombre = prompt('Nombre de la zona (ej: Zona 1, Choloma Norte):');
  if (!nombre || !nombre.trim()) return;
  const nombreLimpio = nombre.trim();
  if (D.carteras.some(z => z.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
    toast('Ya existe una zona con ese nombre','error'); return;
  }
  const metaStr = prompt(`Meta del ciclo para ${nombreLimpio} (solo número):`, '0');
  if (metaStr === null) return;
  const meta = parseFloat(metaStr)||0;
  if (meta < 0) { toast('La meta debe ser positiva','error'); return; }
  const desc = prompt('Descripción (opcional):', '') || '';

  const c = { nombre: nombreLimpio, meta, descripcion: desc.trim() };
  D.carteras.push(c);
  renderZonas();
  API.guardarCartera(c).then(()=>{
    toast('Zona creada: ' + nombreLimpio, 'success');
    refrescarPostZonas();
  }).catch(()=>toast('Guardada localmente','error'));
}

function editarCartera(z) {
  const nombreNuevo = prompt('Nombre de la zona:', z.nombre);
  if (!nombreNuevo || !nombreNuevo.trim()) return;
  const metaStr = prompt(`Meta del ciclo para ${nombreNuevo.trim()}:`, z.meta);
  if (metaStr === null) return;
  const meta = parseFloat(metaStr)||0;
  if (meta < 0) { toast('La meta debe ser positiva','error'); return; }
  const desc = prompt('Descripción (opcional):', z.descripcion || '');

  const c = { nombre: nombreNuevo.trim(), meta, descripcion: (desc||'').trim(), nombreAnterior: z.nombre };
  const idx = D.carteras.findIndex(x => x.nombre === z.nombre);
  if (idx >= 0) D.carteras[idx] = { nombre:c.nombre, meta:c.meta, descripcion:c.descripcion };
  renderZonas();
  API.guardarCartera(c).then(()=>{
    toast('Zona actualizada','success');
    refrescarPostZonas();
  }).catch(()=>toast('Guardada localmente','error'));
}

function borrarCartera(nombre) {
  if (!confirm(`¿Eliminar la zona "${nombre}"?\n\nLos clientes con esta cartera seguirán existiendo, pero perderás la meta configurada.`)) return;
  D.carteras = D.carteras.filter(z => z.nombre !== nombre);
  renderZonas();
  API.eliminarCartera(nombre).then(()=>{
    toast('Zona eliminada','success');
    refrescarPostZonas();
  }).catch(()=>toast('Eliminada localmente','error'));
}

// Después de cambiar una zona, refresca dashboard y filtros para reflejar la meta nueva
function refrescarPostZonas() {
  // Reset del dropdown de carteras para que se repueble
  const fcEl = document.getElementById('f-cart');
  if (fcEl) {
    while (fcEl.options.length > 1) fcEl.remove(1);
  }
}

// ══════════════════════════════════════
// CARTERA
// ══════════════════════════════════════
function filtrarCartera() {
  const ft  = document.getElementById('f-texto')?.value.toLowerCase()||'';
  const fds = document.getElementById('f-ds')?.value||'';
  const fdm = document.getElementById('f-dm')?.value||'';
  const fe  = document.getElementById('f-est')?.value||'';
  const fc  = document.getElementById('f-cart')?.value||'';
  const fo  = document.getElementById('f-ord')?.value||'prioridad';

  let cls = agrupar(D.prestamos.filter(p=>(p.balance+p.balanceCuotas)>=CONFIG.MIN_BALANCE));
  if (ft)  cls = cls.filter(c=>c.cliente.toLowerCase().includes(ft));
  if (fds) cls = cls.filter(c=>c.diaPago.toLowerCase().includes(fds));
  if (fdm) cls = cls.filter(c=>{const m=c.diaPago.match(/Día (\d+)/);return m&&parseInt(m[1])===parseInt(fdm);});
  if (fe)  cls = cls.filter(c=>{const u=ultGest(c.cliente);if(fe==='pendiente')return !u;return u&&u.estado===fe;});
  if (fc)  cls = cls.filter(c=>c.cartera===fc);
  if (USER && USER.cartera && USER.rol==='gestor') cls=cls.filter(c=>c.cartera===USER.cartera);

  switch(fo) {
    case 'prioridad':     cls.sort((a,b)=>prioridadCliente(b)-prioridadCliente(a)); break;
    case 'balance_desc':  cls.sort((a,b)=>b.totalBal-a.totalBal); break;
    case 'balance_asc':   cls.sort((a,b)=>a.totalBal-b.totalBal); break;
    case 'cuotas_desc':   cls.sort((a,b)=>b.totalCuo-a.totalCuo); break;
    case 'nombre':        cls.sort((a,b)=>a.cliente.localeCompare(b.cliente)); break;
    case 'riesgo':        cls.sort((a,b)=>calcRiesgo(b.cliente).score-calcRiesgo(a.cliente).score); break;
    case 'mora':          cls.sort((a,b)=>(diasDesdeUltimoPago(b.cliente)||0)-(diasDesdeUltimoPago(a.cliente)||0)); break;
  }

  // Prioriza la lista canónica de Zonas; si aún no hay, deduce de los préstamos
  const carteras = D.carteras.length
    ? D.carteras.map(z=>z.nombre)
    : [...new Set(D.prestamos.map(p=>p.cartera).filter(Boolean))];
  const fcEl=document.getElementById('f-cart');
  if(fcEl&&fcEl.options.length<=1) carteras.forEach(ca=>fcEl.innerHTML+=`<option value="${esc(ca)}">${esc(ca)}</option>`);

  siguienteLista=cls; siguienteIdx=0;
  document.getElementById('c-count').textContent = cls.length + ' clientes activos';

  const cliHTML = cls.map((c,idx)=>{
    const u = ultGest(c.cliente);
    const e = u ? getEst(u.estado) : getEst('pendiente');
    const r = calcRiesgo(c.cliente);
    const dias = diasDesdeUltimoPago(c.cliente);
    const rCls = r.nivel.label==='Alto'?'risk-high':r.nivel.label==='Medio'?'risk-mid':'risk-low';
    const stStyle = `background:${e.bg};color:${e.color};border-color:${e.color}33`;
    return `<div class="cli-item ${stCls(u?.estado)}">
      <div class="cli-name">${esc(c.cliente)}</div>
      <div class="cli-amounts">
        <div class="cli-balance">${fL(c.totalBal)}</div>
        <div class="cli-cuota">Cuota ${fL(c.totalCuo)}</div>
      </div>
      <div class="cli-bottom">
        <div class="cli-meta">
          <span class="cli-pill">${ic('calendar',10)}${esc(c.diaPago)}</span>
          <span class="cli-pill">${ic('map-pin',10)}${esc(c.cartera)}</span>
          ${dias!==null?`<span class="cli-pill">${ic('clock',10)}${dias}d sin pago</span>`:''}
          <span class="cli-pill ${rCls}">${ic('activity',10)}Riesgo ${r.nivel.label}</span>
          <span class="cli-status-pill" style="${stStyle}">${ic(e.iconId,10)}${esc(e.label)}</span>
        </div>
        <div class="cli-actions">
          <button class="btn-action" onclick='abrirModal(${JSON.stringify(c)},${idx})'>${ic('phone',12)}Gestionar</button>
          <button class="btn-icon" onclick="abrirWA('${esc(c.cliente)}')" title="Mensaje">${ic('message-circle',14)}</button>
        </div>
      </div>
    </div>`;
  });
  document.getElementById('c-list').innerHTML = cliHTML.length
    ? cliHTML.join('')
    : `<div class="empty">${ic('layers',38)}<span class="empty-label">Sin clientes con los filtros actuales</span></div>`;
}

// ══════════════════════════════════════
// GESTIÓN HOY
// ══════════════════════════════════════
function renderHoy() {
  const ds=diaSem(), dm=diaMes();
  document.getElementById('hoy-info').textContent=hoy.toLocaleDateString('es-HN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const act=D.prestamos.filter(p=>(p.balance+p.balanceCuotas)>=CONFIG.MIN_BALANCE);
  const ch={};

  const promesasHoy = new Set(
    D.gestiones
      .filter(g=>g.estado==='promesa' && g.fechaPromesa===hoyStr &&
        !D.gestiones.some(g2=>g2.cliente===g.cliente&&g2.estado==='pagado'&&g2.fecha>=g.fechaPromesa))
      .map(g=>g.cliente)
  );

  act.forEach(p=>{
    const dp=p.diaPago.toLowerCase();
    const pagaNormalHoy = dp.includes(ds) || dp==='día '+dm;
    const tienePromesaHoy = promesasHoy.has(p.cliente);
    if(pagaNormalHoy || tienePromesaHoy){
      if(!ch[p.cliente])ch[p.cliente]={
        cliente:p.cliente, cartera:p.cartera, diaPago:p.diaPago,
        prestamos:[], totalBal:0, totalCuo:0,
        esPromesa: !pagaNormalHoy && tienePromesaHoy
      };
      ch[p.cliente].prestamos.push(p);
      ch[p.cliente].totalBal+=p.balance;
      ch[p.cliente].totalCuo+=p.balanceCuotas;
    }
  });
  if(USER&&USER.cartera&&USER.rol==='gestor') Object.keys(ch).forEach(k=>{if(ch[k].cartera!==USER.cartera)delete ch[k];});
  const lista=Object.values(ch).sort((a,b)=>prioridadCliente(b)-prioridadCliente(a));
  const gDH=D.gestiones.filter(g=>g.fecha===hoyStr);
  const yaG=new Set(gDH.map(g=>g.cliente));
  const pend=lista.filter(c=>!yaG.has(c.cliente));
  const comp=lista.filter(c=>yaG.has(c.cliente));

  siguienteLista=pend; siguienteIdx=0;

  document.getElementById('hoy-empty').style.display=lista.length===0?'block':'none';
  const cobH=gDH.filter(g=>g.estado==='pagado').reduce((s,g)=>s+(g.montoPagado||0),0);

  document.getElementById('hoy-stats').innerHTML=`
    <div class="hoy-stat">
      <span class="hoy-stat-lbl">${ic('dollar-sign',11)}Cobrado hoy</span>
      <strong class="hoy-stat-val pos">${fL(cobH)}</strong>
    </div>
    <div class="hoy-stat">
      <span class="hoy-stat-lbl">${ic('check-circle',11)}Gestionados</span>
      <strong class="hoy-stat-val">${comp.length}<span style="color:var(--t3);font-size:14px;font-weight:500">/${lista.length}</span></strong>
    </div>
    <div class="hoy-stat">
      <span class="hoy-stat-lbl">${ic('hourglass',11)}Pendientes</span>
      <strong class="hoy-stat-val" style="color:var(--amber)">${pend.length}</strong>
    </div>
  `;

  document.getElementById('hoy-pend').innerHTML = pend.length
    ? `<div class="sh-row">
         <h3 class="sh sh-r">${ic('hourglass',12)}Pendientes (${pend.length})</h3>
         ${pend.length>0?`<button class="btn-sec btn-sm" onclick="siguienteCliente()">${ic('chevron-right',13)}Siguiente</button>`:''}
       </div>` +
      pend.map((c,idx)=>`<div class="li li-pend s-pendiente" style="margin-bottom:8px">
        <div class="li-info">
          <div class="li-name">${esc(c.cliente)}</div>
          <div class="li-det">${ic('calendar',11)}${esc(c.diaPago)} · Cuota: ${fL(c.totalCuo)}</div>
        </div>
        <div class="li-bal">${fL(c.totalBal)}</div>
        <button class="btn-gest" onclick='abrirModal(${JSON.stringify(c)},${idx})'>Gestionar</button>
      </div>`).join('')
    : '';

  document.getElementById('hoy-done').innerHTML = comp.length
    ? `<h3 class="sh sh-g">${ic('check-circle',12)}Gestionados (${comp.length})</h3>` +
      comp.map(c=>{
        const u=gDH.filter(g=>g.cliente===c.cliente).sort((a,b)=>(b.hora||'').localeCompare(a.hora||''))[0];
        const e=u?getEst(u.estado):getEst('pendiente');
        const mTxt=u&&u.montoPagado>0?' — '+fL(u.montoPagado):'';
        const stStyle = `background:${e.bg};color:${e.color};border-color:${e.color}33`;
        return `<div class="cli-item ${stCls(u?.estado)}">
          <div class="cli-name">${esc(c.cliente)}</div>
          <div class="cli-amounts">
            <div class="cli-balance">${fL(c.totalBal)}</div>
            <div class="cli-cuota">Cuota ${fL(c.totalCuo)}</div>
          </div>
          <div class="cli-bottom">
            <div class="cli-meta">
              <span class="cli-status-pill" style="${stStyle}">${ic(e.iconId,10)}${esc(e.label)}</span>
              ${u?.comentario?`<span class="cli-pill">${esc(u.comentario)}${mTxt}</span>`:''}
            </div>
          </div>
        </div>`;
      }).join('')
    : '';
}

function siguienteCliente() {
  if(!siguienteLista.length) return;
  const c=siguienteLista[siguienteIdx % siguienteLista.length];
  siguienteIdx++;
  abrirModal(c, siguienteIdx-1);
}

// ══════════════════════════════════════
// HISTORIAL
// ══════════════════════════════════════
function renderHist(){document.getElementById('fh-date').value=hoyStr;filtrarHistorial();}
function filtrarHistorial() {
  const ff=document.getElementById('fh-date').value, fe=document.getElementById('fh-est').value;
  let g=[...D.gestiones].sort((a,b)=>(b.fecha+b.hora).localeCompare(a.fecha+a.hora));
  if(USER&&USER.rol==='gestor'&&!CONFIG.ROLES[USER.rol].canSeeAllGestiones) g=g.filter(x=>x.gestor===USER.nombre);
  if(ff) g=g.filter(x=>x.fecha===ff);
  if(fe) g=g.filter(x=>x.estado===fe);
  document.getElementById('h-count').textContent=g.length+' gestiones';
  if(!g.length){
    document.getElementById('h-list').innerHTML=`<div class="empty">${ic('inbox',38)}<span class="empty-label">Sin resultados</span></div>`;
    return;
  }
  document.getElementById('h-list').innerHTML=g.map(x=>{
    const e=getEst(x.estado);
    const mTxt=x.montoPagado>0?' — '+fL(x.montoPagado):'';
    const stStyle = `background:${e.bg};color:${e.color};border-color:${e.color}33`;
    return `<div class="li ${stCls(x.estado)}">
      <div class="li-body">
        <div class="li-name">${esc(x.cliente)}</div>
        <div class="li-det">${ic('user',11)}<span>${esc(x.gestor||'—')}</span>${x.comentario?` · ${esc(x.comentario)}${mTxt}`:''}</div>
        ${x.fechaPromesa?`<div class="li-det" style="color:var(--amber)">${ic('clock',11)}${x.fechaPromesa}${x.horaPromesa?' '+x.horaPromesa:''}${x.montoPromesa?' — '+fL(x.montoPromesa):''}</div>`:''}
      </div>
      <div class="li-side">
        <span class="status-badge" style="${stStyle}">${ic(e.iconId,10)}${esc(e.label)}</span>
        <span class="li-date">${x.fecha} ${x.hora||''}</span>
      </div>
    </div>`;
  }).join('');
}
function limpiarFiltrosHist(){document.getElementById('fh-date').value='';document.getElementById('fh-est').value='';filtrarHistorial();}

// ══════════════════════════════════════
// PAGOS
// ══════════════════════════════════════
function filtrarPagos() {
  const ft=document.getElementById('fp-txt')?.value.toLowerCase()||'';
  const fm=document.getElementById('fp-medio')?.value||'';
  let p=[...D.pagos].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  // Un gestor solo ve pagos de su cartera
  if (USER && USER.rol==='gestor' && USER.cartera) p = p.filter(x=>x.cartera===USER.cartera);
  if(ft) p=p.filter(x=>x.cliente.toLowerCase().includes(ft));
  if(fm) p=p.filter(x=>(x.medioPago||'efectivo')===fm);
  const totV=p.reduce((s,x)=>s+x.valor,0);
  const totC=p.reduce((s,x)=>s+(x.capital||0),0);
  const totI=p.reduce((s,x)=>s+(x.intereses||0),0);
  document.getElementById('p-total').innerHTML=`<b>${fL(totV)}</b> · Cap: ${fL(totC)} · Int: ${fL(totI)}`;
  if(!p.length){
    document.getElementById('p-list').innerHTML=`<div class="empty">${ic('credit-card',38)}<span class="empty-label">Sin pagos</span></div>`;
    return;
  }
  document.getElementById('p-list').innerHTML=p.map(x=>`
    <div class="li s-pagado">
      <div class="li-body">
        <div class="li-name">${esc(x.cliente)}</div>
        <div class="li-det">${ic('briefcase',11)}${esc(x.tipo)}${x.caja?' · '+esc(x.caja):''} <span style="color:var(--blue)">· ${esc((x.medioPago||'efectivo').charAt(0).toUpperCase()+(x.medioPago||'efectivo').slice(1))}</span></div>
        ${(x.capital||x.intereses)?`<div class="li-det">${ic('dollar-sign',11)}Cap: ${fL(x.capital||0)} · Int: ${fL(x.intereses||0)}</div>`:''}
      </div>
      <div class="li-side">
        <span class="li-val">${fL(x.valor)}</span>
        <span class="li-date">${x.fecha}</span>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════
// RANKING
// ══════════════════════════════════════
function renderRanking() {
  const c=getCiclo();
  const fi=c.ini.toISOString().split('T')[0];
  const fn=c.fin.toISOString().split('T')[0];
  const rank={};
  D.gestiones.filter(g=>g.fecha>=fi&&g.fecha<=fn).forEach(x=>{
    if(!x.gestor)return;
    if(!rank[x.gestor])rank[x.gestor]={nombre:x.gestor,gestiones:0,pagos:0,cobrado:0,promesas:0};
    rank[x.gestor].gestiones++;
    if(x.estado==='pagado'){rank[x.gestor].pagos++;rank[x.gestor].cobrado+=x.montoPagado||0;}
    if(x.estado==='promesa')rank[x.gestor].promesas++;
  });
  const r=Object.values(rank).sort((a,b)=>b.cobrado-a.cobrado);
  r.forEach((x,i)=>{x.posicion=i+1;x.efectividad=x.gestiones>0?((x.pagos/x.gestiones)*100).toFixed(1):'0.0';});

  const el=document.getElementById('ranking-list'); if(!el)return;
  el.innerHTML = r.length
    ? r.map((x,i)=>`
        <div class="rank-item">
          <div class="rank-pos ${i===0?'p1':i===1?'p2':i===2?'p3':''}">${i+1}</div>
          <div class="rank-body">
            <div class="rank-name">${esc(x.nombre)}</div>
            <div class="rank-det">${x.gestiones} gestiones · ${x.pagos} cobros · ${x.efectividad}% efectividad${x.promesas?' · '+x.promesas+' promesas':''}</div>
          </div>
          <span class="rank-amt">${fL(x.cobrado)}</span>
        </div>`).join('')
    : `<div class="empty">${ic('award',38)}<span class="empty-label">Sin gestiones en este ciclo</span></div>`;

  // Análisis horario óptimo
  const hMap={};
  D.gestiones.filter(g=>g.fecha===hoyStr&&g.estado==='pagado').forEach(g=>{
    const hr=(g.hora||'00:00').split(':')[0]+'h'; hMap[hr]=(hMap[hr]||0)+1;
  });
  const mejorH=Object.entries(hMap).sort((a,b)=>b[1]-a[1])[0];
  const horEl=document.getElementById('mejor-hora');
  if(horEl) horEl.innerHTML = mejorH
    ? `${ic('clock',14)}<span><strong>Mejor hora de cobro hoy:</strong> ${mejorH[0]} (${mejorH[1]} cobros)</span>`
    : `${ic('clock',14)}<span>Sin datos de horario hoy</span>`;
}

// ══════════════════════════════════════
// LOGROS / GAMIFICACIÓN
// ══════════════════════════════════════
function renderLogros() {
  if(!USER)return;
  const {desbloqueados,puntos} = GAME.calcLogros(D.gestiones, USER);
  const nivel = GAME.getNivel(puntos);
  const racha = GAME.calcRacha(D.gestiones, USER);

  document.getElementById('g-nivel-icon').innerHTML  = ic(nivel.iconId,26);
  document.getElementById('g-nivel-name').textContent = nivel.nombre;
  document.getElementById('g-puntos').textContent     = puntos+' pts';
  document.getElementById('g-racha').textContent      = racha;

  const nextNivel = CONFIG.NIVELES.find(n=>n.nivel===nivel.nivel+1);
  const pctNivel  = nextNivel ? Math.min((puntos-nivel.minPts)/(nextNivel.minPts-nivel.minPts)*100,100) : 100;
  document.getElementById('g-nivel-bar').style.width = pctNivel+'%';
  document.getElementById('g-nivel-prox').innerHTML = nextNivel
    ? `${ic('chevron-right',12)}${esc(nextNivel.nombre)} en ${nextNivel.minPts-puntos} pts`
    : `${ic('crown',12)}Nivel máximo`;

  const el=document.getElementById('logros-grid'); el.innerHTML='';
  CONFIG.LOGROS.forEach(l=>{
    const ok=desbloqueados.includes(l.id);
    el.innerHTML+=`<div class="logro-card ${ok?'unlocked':'locked'}">
      <div class="logro-icon-wrap">${ic(ok?l.iconId:'lock',20)}</div>
      <div class="logro-nombre">${esc(l.nombre)}</div>
      <div class="logro-desc">${esc(l.desc)}</div>
      <div class="logro-pts">+${l.pts} pts</div>
    </div>`;
  });

  const gH=D.gestiones.filter(g=>g.fecha===hoyStr&&g.gestor===USER.nombre);
  const pagH=gH.filter(g=>g.estado==='pagado');
  const cobH=pagH.reduce((s,g)=>s+(g.montoPagado||0),0);
  document.getElementById('g-gest-hoy').textContent  = gH.length;
  document.getElementById('g-cobros-hoy').textContent= pagH.length;
  document.getElementById('g-cobrado-hoy').textContent=fL(cobH);
}

// ══════════════════════════════════════
// USUARIOS (solo gerente)
// ══════════════════════════════════════
function renderUsers() {
  if(!USER||USER.rol!=='gerente'){
    document.getElementById('users-list').innerHTML=`<div class="empty">${ic('lock',38)}<span class="empty-label">Sin permisos</span></div>`;
    return;
  }
  document.getElementById('users-list').innerHTML = CONFIG.USUARIOS.map(u=>{
    const r=CONFIG.ROLES[u.rol]||{label:u.rol};
    return `<div class="user-item">
      <div class="user-item-avatar">${(u.avatar||u.nombre[0]).toUpperCase()}</div>
      <div class="user-item-body">
        <div class="user-item-name">${esc(u.nombre)}</div>
        <div class="user-item-det">${esc(u.id)}${u.cartera?' · '+esc(u.cartera):''}</div>
      </div>
      <span class="role-chip">${esc(r.label)}</span>
      <button class="btn-sec btn-sm" onclick='editarUsuario(${JSON.stringify(u)})'>${ic('edit',12)}Editar</button>
    </div>`;
  }).join('') +
  `<button class="btn-pri btn-full" style="margin-top:12px" onclick="nuevoUsuario()">${ic('user-plus',14)}Nuevo Usuario</button>`;
}

function nuevoUsuario() {
  const id=prompt('ID (sin espacios):'); if(!id)return;
  const nombre=prompt('Nombre completo:'); if(!nombre)return;
  const pass=prompt('Contraseña:'); if(!pass)return;
  const rol=prompt('Rol (gerente/supervisor/gestor):','gestor'); if(!rol)return;
  const cartera=prompt('Cartera asignada (opcional):','')||'';
  const u={id,nombre,pass,rol,avatar:nombre[0].toUpperCase(),cartera};
  API.guardarUsuario(u).then(()=>{
    CONFIG.USUARIOS.push(u); renderUsers();
    toast('Usuario creado: '+nombre,'success');
  }).catch(()=>{CONFIG.USUARIOS.push(u);renderUsers();toast('Guardado localmente','');});
}

function editarUsuario(u) {
  const pass=prompt(`Editar contraseña de ${u.nombre}:`,u.pass); if(!pass)return;
  const cartera=prompt('Cartera asignada:',u.cartera||'');
  const u2={...u,pass,cartera:cartera||''};
  const idx=CONFIG.USUARIOS.findIndex(x=>x.id===u.id);
  if(idx>=0) CONFIG.USUARIOS[idx]=u2;
  API.guardarUsuario(u2).then(()=>{renderUsers();toast('Usuario actualizado','success');})
    .catch(()=>{renderUsers();toast('Guardado localmente','');});
}

// ══════════════════════════════════════
// MODAL GESTIONAR
// ══════════════════════════════════════
function abrirModalPorNombre(nombre) {
  const cls=agrupar(D.prestamos);
  const c=cls.find(x=>x.cliente===nombre);
  if(c) abrirModal(c,0);
}

function abrirModal(c, idx=0) {
  clienteAct=c; estadoSel=''; siguienteIdx=idx+1;
  document.getElementById('modal').style.display='flex';
  document.getElementById('m-nombre').textContent=c.cliente;

  const dias=diasDesdeUltimoPago(c.cliente);
  const r=calcRiesgo(c.cliente);
  document.getElementById('m-info').innerHTML =
    `${esc(c.diaPago)} · Balance: <strong style="color:var(--t1)">${fL(c.totalBal)}</strong> · Cuota: <strong style="color:var(--t1)">${fL(c.totalCuo)}</strong>`+
    `<br><span style="color:${r.nivel.color};display:inline-flex;align-items:center;gap:5px;margin-top:3px">${ic('activity',11)}Riesgo ${r.nivel.label} (score ${r.score})</span>`+
    (dias!==null?` <span style="color:var(--t3)">· Último pago hace ${dias} días</span>`:'');

  // Préstamos
  const ps=document.getElementById('m-prest-sec'),pl=document.getElementById('m-prest');
  if(c.prestamos&&c.prestamos.length){
    ps.style.display='block';
    pl.innerHTML=c.prestamos.map(p=>`<div class="prow">
      <span class="p-tipo">${esc(p.tipo)}</span>
      <div style="text-align:right">
        <span class="p-monto">${fL(p.balance)}</span>
        <span class="p-cuo">Cuota: ${fL(p.balanceCuotas)}</span>
      </div>
    </div>`).join('');
  } else ps.style.display='none';

  // Estados
  document.getElementById('m-estados').innerHTML=CONFIG.ESTADOS.filter(e=>e.value!=='pendiente').map(e=>
    `<button class="estado-btn" data-e="${e.value}" onclick="selEstado('${e.value}')" style="border-color:${e.color}33;color:${e.color}">${ic(e.iconId,17)}<span>${esc(e.label)}</span></button>`
  ).join('');

  // Reset campos
  ['m-comment','m-monto','m-prom-date','m-prom-monto','m-capital','m-intereses','m-prom-hora'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('m-prom-date').min=hoyStr;
  document.getElementById('m-medio-pago').value='efectivo';
  ['m-monto-box','m-prom-date-box','m-prom-monto-box','m-medio-box','m-capital-box','m-intereses-box','m-prom-hora-box'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('m-save').disabled=true;

  // Historial
  const h=D.gestiones.filter(g=>g.cliente===c.cliente).sort((a,b)=>(b.fecha+b.hora).localeCompare(a.fecha+a.hora));
  const hs=document.getElementById('m-hist-sec'),hl=document.getElementById('m-hist');
  if(h.length){
    hs.style.display='block';
    hl.innerHTML=h.slice(0,15).map(g=>{
      const e=getEst(g.estado);
      const mt=g.montoPagado>0?' — '+fL(g.montoPagado):g.montoPromesa>0?' — '+fL(g.montoPromesa):'';
      const stStyle = `background:${e.bg};color:${e.color};border-color:${e.color}33`;
      return `<div class="hist-entry">
        <div class="hist-body">
          <span class="status-badge" style="${stStyle}">${ic(e.iconId,10)}${esc(e.label)}${mt}</span>
          ${g.comentario?`<div class="hist-comment">${esc(g.comentario)}</div>`:''}
          ${g.fechaPromesa?`<div class="hist-comment" style="color:var(--amber);display:flex;align-items:center;gap:5px">${ic('clock',11)}${g.fechaPromesa}${g.horaPromesa?' '+g.horaPromesa:''}</div>`:''}
          ${g.gestor?`<div class="hist-comment" style="font-style:italic">${esc(g.gestor)}</div>`:''}
        </div>
        <div class="hist-date">${g.fecha}<br>${g.hora||''}</div>
      </div>`;
    }).join('');
  } else { hs.style.display='none'; }

  renderPlantillasWA(c, r);
  iniciarTimer();
}

function iniciarTimer() {
  if(timerInterval) clearInterval(timerInterval);
  timerInicio=new Date();
  const el=document.getElementById('m-timer');
  timerInterval=setInterval(()=>{
    const secs=Math.floor((new Date()-timerInicio)/1000);
    const m=String(Math.floor(secs/60)).padStart(2,'0');
    const s=String(secs%60).padStart(2,'0');
    if(el) el.innerHTML = ic('clock',11) + `${m}:${s}`;
  },1000);
}

function renderPlantillasWA(c, riesgo) {
  const nivel=riesgo.score>=70?3:riesgo.score>=40?2:riesgo.score>=20?1:0;
  const dias=diasDesdeUltimoPago(c.cliente)??0;
  const el=document.getElementById('m-plantillas'); if(!el)return;
  el.innerHTML = `<div class="sec-label">${ic('message-circle',12)}Plantillas WhatsApp</div>` +
    '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
    CONFIG.PLANTILLAS_WA.map((p,i)=>{
      const txt=p.template
        .replace('{nombre}',c.cliente.split(' ')[0])
        .replace('{monto}',c.totalCuo.toFixed(2))
        .replace('{dias}',dias)
        .replace('{fecha}',hoyStr);
      return `<button class="wa-tpl-btn ${i===nivel?'active':''}" onclick='copiarWA(${JSON.stringify(txt)},${JSON.stringify(c.cliente)})'>${esc(p.label)}</button>`;
    }).join('') +
    '</div>';
}

function copiarWA(txt, cliente) {
  const tel=D.prestamos.find(p=>p.cliente===cliente)?.telefono||'';
  if(navigator.clipboard) navigator.clipboard.writeText(txt).then(()=>toast('Mensaje copiado','success'));
  if(tel) window.open(`https://wa.me/504${tel.replace(/-/g,'')}?text=${encodeURIComponent(txt)}`,'_blank');
  else toast('Mensaje copiado. Agrega el teléfono al cliente.','');
}

function abrirWA(nombreCliente) {
  const c=agrupar(D.prestamos).find(x=>x.cliente===nombreCliente);
  if(!c)return;
  const r=calcRiesgo(nombreCliente);
  const dias=diasDesdeUltimoPago(nombreCliente)??0;
  const nivel=r.score>=70?3:r.score>=40?2:r.score>=20?1:0;
  const p=CONFIG.PLANTILLAS_WA[nivel];
  const txt=p.template.replace('{nombre}',nombreCliente.split(' ')[0]).replace('{monto}',c.totalCuo.toFixed(2)).replace('{dias}',dias).replace('{fecha}',hoyStr);
  if(navigator.clipboard) navigator.clipboard.writeText(txt).then(()=>toast('Plantilla copiada','success'));
  else toast('Plantilla copiada al portapapeles','success');
}

function selEstado(v) {
  estadoSel=v;
  document.querySelectorAll('.estado-btn').forEach(b=>{
    const sel=b.dataset.e===v, e2=getEst(b.dataset.e);
    b.classList.toggle('sel',sel);
    b.style.background = sel ? e2.bg : 'var(--surface-2)';
    b.style.color      = e2.color;
    b.style.borderColor= sel ? e2.color : 'var(--border)';
    b.style.opacity    = sel ? '1' : '0.6';
  });
  const esPag2=v==='pagado', esProm2=v==='promesa';
  ['m-monto-box','m-medio-box','m-capital-box','m-intereses-box'].forEach(id=>document.getElementById(id).style.display=esPag2?'block':'none');
  ['m-prom-date-box','m-prom-hora-box','m-prom-monto-box'].forEach(id=>document.getElementById(id).style.display=esProm2?'block':'none');
  if(esPag2&&clienteAct){
    document.getElementById('m-monto').value=clienteAct.totalCuo.toFixed(2);
    document.getElementById('m-capital').value='';
    document.getElementById('m-intereses').value='';
  }
  if(esProm2&&clienteAct){
    document.getElementById('m-prom-monto').value=clienteAct.totalCuo.toFixed(2);
    const ahora=new Date(); ahora.setHours(ahora.getHours()+1);
    document.getElementById('m-prom-hora').value=ahora.toTimeString().slice(0,5);
  }
  document.getElementById('m-save').disabled=false;
}

async function guardarGestion() {
  if(!estadoSel||!clienteAct) return;
  const esPagG  = estadoSel==='pagado';
  const esPromG = estadoSel==='promesa';
  const mp   = esPagG  ? parseFloat(document.getElementById('m-monto').value)||0      : 0;
  const mpr  = esPromG ? parseFloat(document.getElementById('m-prom-monto').value)||0  : 0;
  const cap  = esPagG  ? parseFloat(document.getElementById('m-capital').value)||0     : 0;
  const inte = esPagG  ? parseFloat(document.getElementById('m-intereses').value)||0   : 0;
  const medio       = document.getElementById('m-medio-pago').value||'efectivo';
  const horaPromesa = esPromG ? document.getElementById('m-prom-hora').value||'' : '';
  if(esPagG && mp>0 && (cap+inte)>0 && (cap+inte)>(mp+0.01)){
    toast('Capital + Intereses no puede superar el Monto Pagado','error'); return;
  }
  const g={
    cliente:clienteAct.cliente, estado:estadoSel,
    comentario:document.getElementById('m-comment').value,
    fechaPromesa:esPromG?document.getElementById('m-prom-date').value:'',
    horaPromesa, montoPagado:mp, montoPromesa:mpr, medioPago:medio,
    capital:cap, intereses:inte,
    fecha:hoyStr, hora:new Date().toLocaleTimeString('es-HN'),
    gestor:USER?USER.nombre:'Gestor 1',
  };
  D.gestiones.push(g);

  const esCobro = estadoSel==='pagado' && mp>0;
  try { await API.guardarGestion(g); toast('Gestión guardada'+(mp>0?' — '+fL(mp):''),'success'); }
  catch(e){ toast('Guardado local',''); }

  if(esCobro) {
    cerrarModal();
    setTimeout(()=>celebrar(mp), 200);
    const antes=GAME.calcLogros(D.gestiones.slice(0,-1),USER).desbloqueados;
    const despues=GAME.calcLogros(D.gestiones,USER).desbloqueados;
    const nuevo=despues.find(l=>!antes.includes(l));
    if(nuevo){
      const l=CONFIG.LOGROS.find(x=>x.id===nuevo);
      if(l) setTimeout(()=>toast(`Logro desbloqueado: ${l.nombre} (+${l.pts}pts)`,'success'),3100);
    }
  } else {
    cerrarModal();
  }

  const at=document.querySelector('.menu-item.active'); switchTab(at?at.dataset.tab:'hoy');
}

function cerrarModal(e) {
  if(e&&e.target!==e.currentTarget) return;
  document.getElementById('modal').style.display='none';
  clienteAct=null; estadoSel='';
  if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
  const el=document.getElementById('m-timer');
  if(el) el.innerHTML = ic('clock',11) + '00:00';
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => initLogin());
document.addEventListener('keydown', e => { if(e.key==='Escape'){cerrarModal();document.getElementById('resumen-inicial').style.display='none';} });
document.getElementById('login-pass').addEventListener('keydown', e => { if(e.key==='Enter') iniciarSesion(); });
