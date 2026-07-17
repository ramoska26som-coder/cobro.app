// ============================================================
// CONFIGURACIÓN - COBROS PRO v4
// ============================================================
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzr_aXXhJe4MA0dSpGp5j_s25E0kfL9dP5iFR7-nvpkEU7j5KhKMcJFHM2fWFJYw_QsbA/exec',
  DIA_CIERRE: 8,
  MIN_BALANCE: 5,
  USUARIOS: [],
  META_CICLO: 0,

  ROLES: {
    gerente:    { label:'Gerente',    tabs:['dashboard','cartera','hoy','historial','pagos','ranking','logros','usuarios','zonas'], canEditUsers:true,  canSeeAllGestiones:true,  canDelete:true,  canEditZonas:true  },
    supervisor: { label:'Supervisor', tabs:['dashboard','cartera','hoy','historial','pagos','ranking','logros','zonas'],            canEditUsers:false, canSeeAllGestiones:true,  canDelete:false, canEditZonas:true  },
    gestor:     { label:'Gestor',     tabs:['dashboard','cartera','hoy','historial','pagos','logros'],                              canEditUsers:false, canSeeAllGestiones:false, canDelete:false, canEditZonas:false },
  },

  // Colores alineados con el design system Soft Modern (paleta cálida)
  ESTADOS: [
    { value:'pagado',          label:'Pagado',          color:'#5C7A56', bg:'rgba(92,122,86,.12)',   iconId:'check-circle'   },
    { value:'promesa',         label:'Promesa de pago', color:'#C08A2E', bg:'rgba(192,138,46,.12)',  iconId:'clock'          },
    { value:'no_contesta',     label:'No contesta',     color:'#7A7266', bg:'rgba(122,114,102,.12)', iconId:'phone-off'      },
    { value:'mensaje_enviado', label:'Mensaje enviado', color:'#4A6FA5', bg:'rgba(74,111,165,.12)',  iconId:'message-square' },
    { value:'rechaza_pago',    label:'Rechaza pago',    color:'#B1452C', bg:'rgba(177,69,44,.12)',   iconId:'x-circle'       },
    { value:'ilocalizable',    label:'Ilocalizable',    color:'#7A5F8C', bg:'rgba(122,95,140,.12)',  iconId:'help-circle'    },
    { value:'pendiente',       label:'Pendiente',       color:'#7A7266', bg:'rgba(122,114,102,.10)', iconId:'circle'         },
  ],

  TABS: [
    { id:'dashboard', label:'Dashboard',   iconId:'bar-chart-2'  },
    { id:'cartera',   label:'Cartera',     iconId:'layers'        },
    { id:'hoy',       label:'Hoy',         iconId:'phone'         },
    { id:'historial', label:'Historial',   iconId:'list'          },
    { id:'pagos',     label:'Pagos',       iconId:'credit-card'   },
    { id:'ranking',   label:'Ranking',     iconId:'award'         },
    { id:'logros',    label:'Logros',      iconId:'star'          },
    { id:'zonas',     label:'Zonas',       iconId:'map-pin'       },
    { id:'usuarios',  label:'Usuarios',    iconId:'users'         },
  ],

  LOGROS: [
    { id:'primera_gestion',   iconId:'sunrise',      nombre:'Primer paso',      desc:'Primera gestión del día',         pts:10  },
    { id:'cobro_exitoso',     iconId:'dollar-sign',  nombre:'Cobro exitoso',    desc:'Registraste un pago',             pts:25  },
    { id:'cinco_gestiones',   iconId:'zap',          nombre:'En racha',         desc:'5 gestiones en el día',           pts:30  },
    { id:'diez_gestiones',    iconId:'trending-up',  nombre:'Imparable',        desc:'10 gestiones completadas',        pts:75  },
    { id:'todos_contactados', iconId:'check-square', nombre:'100% contactados', desc:'Gestionaste todos los de hoy',    pts:100 },
    { id:'meta_diaria',       iconId:'target',       nombre:'Meta cumplida',    desc:'Superaste la meta del día',       pts:200 },
    { id:'tres_cobros',       iconId:'package',      nombre:'Cosechador',       desc:'3 cobros en el día',              pts:80  },
    { id:'sin_pendientes',    iconId:'inbox',        nombre:'Carpeta limpia',   desc:'Sin pendientes al final del día', pts:150 },
    { id:'racha_3',           iconId:'calendar',     nombre:'3 días seguidos',  desc:'Racha de 3 días con cobros',      pts:120 },
    { id:'racha_5',           iconId:'shield',       nombre:'Semana perfecta',  desc:'5 días consecutivos con cobros',  pts:300 },
  ],

  NIVELES: [
    { nivel:1, nombre:'Novato',     iconId:'circle',   minPts:0,    maxPts:99       },
    { nivel:2, nombre:'Intermedio', iconId:'shield',   minPts:100,  maxPts:299      },
    { nivel:3, nombre:'Avanzado',   iconId:'award',    minPts:300,  maxPts:599      },
    { nivel:4, nombre:'Experto',    iconId:'star',     minPts:600,  maxPts:999      },
    { nivel:5, nombre:'Leyenda',    iconId:'zap',      minPts:1000, maxPts:Infinity },
  ],

  PLANTILLAS_WA: [
    { nivel:0, label:'Recordatorio amable', template:'Hola {nombre}, le recordamos su cuota de L {monto}. Gracias por su pago puntual.' },
    { nivel:1, label:'Primer aviso',        template:'Hola {nombre}, su cuota de L {monto} está pendiente. Por favor contáctenos.' },
    { nivel:2, label:'Aviso urgente',       template:'Estimado/a {nombre}, su cuenta presenta {dias} días en mora por L {monto}. Regularice HOY.' },
    { nivel:3, label:'Último aviso',        template:'{nombre}: Mora de {dias} días. Balance: L {monto}. Contáctenos HOY para evitar acciones de cobro.' },
  ],
};
