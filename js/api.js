// ============================================================
// API v4 - Cobros Pro
// ============================================================
const API = {
  async get(action, params = {}) {
    if (!CONFIG.API_URL || CONFIG.API_URL.includes('TU_ID_AQUI')) throw new Error('URL_NO_CONFIGURADA');
    const url = new URL(CONFIG.API_URL);
    url.searchParams.append('action', action);
    Object.entries(params).forEach(([k,v]) => { if (v != null && v !== '') url.searchParams.append(k,v); });
    const r   = await fetch(url.toString(), { method:'GET', redirect:'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    try { return JSON.parse(txt); } catch(e) { throw new Error('Respuesta inválida'); }
  },

  async post(action, body = {}) {
    if (!CONFIG.API_URL || CONFIG.API_URL.includes('TU_ID_AQUI')) throw new Error('URL_NO_CONFIGURADA');
    const r   = await fetch(CONFIG.API_URL, {
      method:'POST', redirect:'follow',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action, ...body}),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    try { return JSON.parse(txt); } catch(e) { throw new Error('Respuesta inválida'); }
  },

  getPrestamos()               { return this.get('getPrestamos'); },
  getPagos(fi,ff)              { return this.get('getPagos',    { fechaInicio:fi, fechaFin:ff }); },
  getGestiones(fi,ff)          { return this.get('getGestiones',{ fechaInicio:fi, fechaFin:ff }); },
  getDashboard()               { return this.get('getDashboard'); },
  getUsuarios()                { return this.get('getUsuarios'); },
  getMeta()                    { return this.get('getMeta'); },
  getRanking(fi,ff)            { return this.get('getRanking',  { fechaInicio:fi, fechaFin:ff }); },
  guardarGestion(g)            { return this.post('guardarGestion',  { gestion:g }); },
  guardarMeta(meta)            { return this.post('guardarMeta',     { meta }); },
  guardarUsuario(u)            { return this.post('guardarUsuario',  { usuario:u }); },
  eliminarUsuario(id)          { return this.post('eliminarUsuario', { id }); },
  getCarteras()                { return this.get('getCarteras'); },
  guardarCartera(c)            { return this.post('guardarCartera',  { cartera:c }); },
  eliminarCartera(nombre)      { return this.post('eliminarCartera', { nombre }); },
};
