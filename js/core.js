/* =============================================================
   AHP Web · núcleo: conexión, sesión, utilidades, enrutador
   ============================================================= */
"use strict";

const CFG = window.AHP_CONFIG || {};
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});



/* ---------------- utilidades ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

function hoyISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function ahoraLocal() { const d = new Date(); return `${hoyISO()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function isoDe(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fechaDe(iso) { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); }
function sumarDias(iso, n) { const d = fechaDe(iso); d.setDate(d.getDate() + n); return isoDe(d); }
function diaSemana(iso) { const g = fechaDe(iso).getDay(); return g === 0 ? 7 : g; } // 1=lunes…7=domingo
function lunesDe(iso) { return sumarDias(iso, 1 - diaSemana(iso)); }

const FMT_LARGA = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const FMT_CORTA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const FMT_DIA = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short" });
function fLarga(iso) { return iso ? FMT_LARGA.format(fechaDe(iso)) : ""; }
function fCorta(iso) { return iso ? FMT_CORTA.format(fechaDe(iso)).replace(/\./g, "") : ""; }
function fDia(iso) { return FMT_DIA.format(fechaDe(iso)).replace(/\./g, ""); }
function fFechaHora(ts) {
  if (!ts) return "";
  const s = String(ts).replace("T", " ");
  return `${fCorta(s.slice(0, 10))} · ${hora12(s.slice(11, 16))}`;
}
function hora12(hhmm) {
  if (!hhmm) return "";
  let [H, M] = String(hhmm).split(":").map(Number);
  const ap = H >= 12 ? "p. m." : "a. m.";
  H = H % 12 || 12;
  return `${H}:${pad(M)} ${ap}`;
}
function horaCorta(hhmm) { let [H, M] = String(hhmm).split(":").map(Number); const ap = H >= 12 ? "pm" : "am"; H = H % 12 || 12; return `${H}:${pad(M)} ${ap}`; }
function mayus(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function minutos(hhmm) { const [H, M] = String(hhmm).split(":").map(Number); return H * 60 + M; }
function hhmm(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
function edad(fn) {
  if (!fn) return "";
  const n = fechaDe(fn), hoy = new Date();
  let a = hoy.getFullYear() - n.getFullYear();
  if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) a--;
  if (a < 1) {
    const m = (hoy.getFullYear() - n.getFullYear()) * 12 + hoy.getMonth() - n.getMonth();
    return `${Math.max(m, 0)} meses`;
  }
  return `${a} años`;
}
function iniciales(nombre) {
  const p = String(nombre || "").trim().split(/\s+/);
  return ((p[0] || "")[0] || "") + ((p.length > 2 ? p[2] : p[1] || "")[0] || "");
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function resaltar(texto, q) {
  const t = h(texto);
  if (!q) return t;
  const palabras = norm(q).split(" ").filter((w) => w.length > 1);
  if (!palabras.length) return t;
  // resalta respetando tildes: construye regex tolerante a acentos
  const mapa = { a: "[aáàä]", e: "[eéèë]", i: "[iíìï]", o: "[oóòö]", u: "[uúùü]", n: "[nñ]" };
  const re = new RegExp("(" + palabras.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[aeioun]/g, (c) => mapa[c])).join("|") + ")", "gi");
  return t.replace(re, "<mark>$1</mark>");
}

const S = {            // estado global
  user: null,
  perfil: null,
  agendas: [],
  config: {},
  fecha: hoyISO(),
  vista: "dia",
  agendaId: null,
  canal: null
};

/* ---------------- avisos y modales ---------------- */
function toast(msg, tipo = "") {
  const el = document.createElement("div");
  el.className = "toast " + tipo;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), tipo === "error" ? 6500 : 3200);
}

function modal({ titulo, cuerpo, pie = "", ancho = "", alCerrar } = {}) {
  const fondo = document.createElement("div");
  fondo.className = "fondo-modal";
  fondo.innerHTML = `
    <div class="modal ${ancho}" role="dialog" aria-modal="true">
      <div class="modal-cab"><h2>${titulo}</h2><button class="btn fantasma chico cerrar" aria-label="Cerrar">✕</button></div>
      <div class="modal-cuerpo">${cuerpo}</div>
      ${pie ? `<div class="modal-pie">${pie}</div>` : ""}
    </div>`;
  document.body.appendChild(fondo);
  const cerrar = () => { fondo.remove(); document.removeEventListener("keydown", esc); alCerrar && alCerrar(); };
  const esc = (e) => { if (e.key === "Escape") cerrar(); };
  document.addEventListener("keydown", esc);
  $(".cerrar", fondo).onclick = cerrar;
  fondo.addEventListener("mousedown", (e) => { if (e.target === fondo) fondo.dataset.down = "1"; });
  fondo.addEventListener("mouseup", (e) => { if (e.target === fondo && fondo.dataset.down) cerrar(); fondo.dataset.down = ""; });
  const primero = $("input:not([type=hidden]),select,textarea", fondo);
  if (primero) setTimeout(() => primero.focus(), 30);
  return { el: fondo, cerrar };
}

function confirmar(mensaje, { titulo = "Confirmar", boton = "Aceptar", peligro = false } = {}) {
  return new Promise((res) => {
    const m = modal({
      titulo,
      cuerpo: `<p style="margin:0">${mensaje}</p>`,
      pie: `<button class="btn" data-a="no">Cancelar</button><button class="btn ${peligro ? "peligro" : "pri"}" data-a="si">${boton}</button>`,
      alCerrar: () => res(false)
    });
    $('[data-a="no"]', m.el).onclick = () => m.cerrar();
    $('[data-a="si"]', m.el).onclick = () => { res(true); m.el.remove(); };
  });
}

/* Ejecuta una consulta de Supabase y lanza error legible */
async function db(promesa, mensaje) {
  const { data, error, count } = await promesa;
  if (error) {
    console.error(error);
    const txt = traducirError(error);
    toast((mensaje ? mensaje + ": " : "") + txt, "error");
    throw error;
  }
  return count !== undefined && count !== null && data === null ? count : data;
}
function traducirError(e) {
  const m = e.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos";
  if (/Email not confirmed/i.test(m)) return "El correo aún no está confirmado (desactive 'Confirm email' en Supabase)";
  if (/JWT expired/i.test(m)) return "La sesión expiró, ingrese de nuevo";
  if (/row-level security/i.test(m)) return "Sin permiso (¿usuario inactivo?)";
  if (/duplicate key/i.test(m)) return "Ya existe un registro con ese dato";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión con el servidor";
  return m;
}

/* Lee todas las filas de una consulta paginando de a 1000 */
async function todo(constructor, tam = 1000) {
  let desde = 0, salida = [];
  for (;;) {
    const lote = await db(constructor().range(desde, desde + tam - 1));
    salida = salida.concat(lote);
    if (lote.length < tam) break;
    desde += tam;
  }
  return salida;
}

/* Almacenamiento local seguro (puede fallar en modo privado) */
const local = {
  get(k, def = null) { try { const v = localStorage.getItem("ahp:" + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem("ahp:" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("ahp:" + k); } catch {} }
};

/* ---------------- íconos ---------------- */
const ICO = {
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  imprimir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  izq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m15 18-6-6 6-6"/></svg>',
  der: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 18 6-6-6-6"/></svg>',
  editar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  archivo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  subir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  candado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  volver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'
};

/* ---------------- sesión ---------------- */
async function iniciar() {
  if (!CFG.SUPABASE_URL || /PEGUE_AQUI/.test(CFG.SUPABASE_URL)) {
    mostrarLogin();
    $("#login-cuerpo").innerHTML = `<div class="alerta aviso">Falta configurar la conexión. Edite el archivo <b>config.js</b> con la URL y la anon key de su proyecto de Supabase.</div>`;
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await entrar(data.session.user);
  else mostrarLogin();
  sb.auth.onAuthStateChange((ev, sesion) => {
    if (ev === "SIGNED_OUT") { S.user = null; S.perfil = null; history.replaceState(null, "", location.pathname); mostrarLogin(); }
  });
}

async function mostrarLogin() {
  $("#app").classList.add("oculto");
  $("#login").classList.remove("oculto");
  let hay = true;
  try { const r = await sb.rpc("hay_usuarios"); hay = r.error ? true : !!r.data; } catch { hay = true; }
  const primer = !hay;
  $("#login-sub").textContent = primer ? "Cree el usuario administrador inicial" : "Ingrese con su usuario";
  $("#login-cuerpo").innerHTML = `
    <form id="f-login" class="rejilla">
      ${primer ? `<div class="alerta info">Aún no hay usuarios. El primero que se cree queda como administrador.</div>
      <div class="campo"><label>Nombre completo</label><input name="nombre" required autocomplete="name"></div>
      <div class="campo"><label>Rol</label><select name="rol"><option value="medico">Médico</option><option value="recepcion">Recepción</option><option value="ingeniero">Ingeniero (soporte)</option></select></div>` : ""}
      <div class="campo"><label>Correo</label><input name="email" type="email" required autocomplete="username"></div>
      <div class="campo"><label>Contraseña</label><input name="clave" type="password" required minlength="6" autocomplete="${primer ? "new-password" : "current-password"}"></div>
      <button class="btn pri" style="height:42px">${primer ? "Crear administrador" : "Ingresar"}</button>
      <div id="login-err"></div>
    </form>`;
  $("#f-login").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = $("button", e.target); btn.disabled = true;
    $("#login-err").innerHTML = "";
    try {
      let r;
      if (primer) {
        r = await sb.auth.signUp({ email: f.email, password: f.clave, options: { data: { nombre: f.nombre, rol: f.rol } } });
        if (!r.error && !r.data.session) r = await sb.auth.signInWithPassword({ email: f.email, password: f.clave });
      } else {
        r = await sb.auth.signInWithPassword({ email: f.email, password: f.clave });
      }
      if (r.error) throw r.error;
      await entrar(r.data.user || r.data.session.user);
    } catch (err) {
      $("#login-err").innerHTML = `<div class="alerta error">${h(traducirError(err))}</div>`;
    } finally { btn.disabled = false; }
  };
}

async function entrar(user) {
  S.user = user;
  const { data: perfil } = await sb.from("perfiles").select("*").eq("id", user.id).maybeSingle();
  if (!perfil || !perfil.activo) {
    $("#login-cuerpo").innerHTML = `<div class="alerta aviso">Su usuario existe pero <b>aún no está activo</b>. Pida a un administrador que lo active en <b>Usuarios</b>.</div>
      <button class="btn" style="margin-top:12px" onclick="sb.auth.signOut()">Volver</button>`;
    $("#login").classList.remove("oculto"); $("#app").classList.add("oculto");
    return;
  }
  S.perfil = perfil;
  $("#login").classList.add("oculto");
  $("#app").classList.remove("oculto");
  $("#u-nombre").textContent = perfil.nombre || perfil.email;
  $("#u-rol").textContent = (ROLES[perfil.rol] || perfil.rol) + " · Administrador";
  await cargarBase();
  suscribirCitas();
  vigilarInactividad();
  if (!location.hash || location.hash === "#/") location.hash = "#/agenda";
  else enrutar();
}

async function cargarBase() {
  const [agendas, horarios, conf] = await Promise.all([
    db(sb.from("agendas").select("*").order("id")),
    db(sb.from("agenda_horarios").select("*")),
    db(sb.from("configuracion").select("*"))
  ]);
  S.agendas = agendas.map((a) => ({ ...a, horarios: horarios.filter((x) => x.agenda_id === a.id) }));
  S.config = Object.fromEntries(conf.map((c) => [c.clave, c.valor]));
  const guardada = local.get("agenda");
  S.agendaId = S.perfil.agenda_id || (S.agendas.find((a) => a.id === guardada) || S.agendas.find((a) => a.activo) || S.agendas[0] || {}).id || null;
  const enc = S.config.encabezado || {};
  $("#marca-sub").textContent = enc.linea1 || "AHP Web";
}

function vigilarInactividad() {
  const lim = (CFG.INACTIVIDAD_MIN || 60) * 60000;
  let ultimo = Date.now();
  ["mousemove", "keydown", "click", "touchstart"].forEach((ev) => document.addEventListener(ev, () => (ultimo = Date.now()), { passive: true }));
  setInterval(() => { if (S.user && Date.now() - ultimo > lim) { toast("Sesión cerrada por inactividad"); sb.auth.signOut(); } }, 30000);
}

$("#btn-salir").onclick = () => sb.auth.signOut();
$("#btn-menu").onclick = () => $("#lateral").classList.toggle("abierto");

/* ---------------- tiempo real (citas) ---------------- */
const refrescarAgendaPronto = debounce(() => { if (rutaActual().r === "agenda") renderAgenda(true); }, 400);
function suscribirCitas() {
  try {
    if (S.canal) sb.removeChannel(S.canal);
    S.canal = sb.channel("citas-cambios")
      .on("postgres_changes", { event: "*", schema: "public", table: "citas" }, refrescarAgendaPronto)
      .subscribe();
  } catch (e) { console.warn("Tiempo real no disponible", e); }
  // respaldo: refresca la agenda cada 30 s
  setInterval(() => { if (document.visibilityState === "visible") refrescarAgendaPronto(); }, 30000);
}

/* ---------------- enrutador ---------------- */
function rutaActual() {
  const [ruta, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const partes = ruta.split("/");
  return { r: partes[0] || "agenda", p: partes.slice(1), q: Object.fromEntries(new URLSearchParams(qs || "")) };
}
const VISTAS = {};
async function enrutar() {
  if (!S.perfil) return;
  const { r, p, q } = rutaActual();
  $$("#menu a").forEach((a) => a.classList.toggle("activo", a.dataset.r === r || (r === "paciente" && a.dataset.r === "pacientes")));
  $("#lateral").classList.remove("abierto");
  if (r !== "paciente" && window.FICHA) FICHA.id = null; // al volver a una ficha, recargar datos frescos
  const vista = VISTAS[r] || VISTAS.agenda;
  $("#principal").innerHTML = `<div class="cargando"><span class="spinner"></span></div>`;
  try { await vista(p, q); } catch (e) { console.error(e); $("#principal").innerHTML = `<div class="alerta error">Error: ${h(traducirError(e))}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", enrutar);

/* ---------------- impresión ---------------- */
function encabezadoImpresion() {
  const e = S.config.encabezado || {};
  return `<div class="imp-cab">
    <div><div class="l1">${h(e.linea1 || "")}</div><div class="l2">${h(e.linea2 || "")}</div><div class="l3">${h(e.linea3 || "")}${e.telefono ? " · Tel. " + h(e.telefono) : ""}</div></div>
    <div class="l3" style="text-align:right">Impreso: ${h(fFechaHora(ahoraLocal()))}<br>${h(S.perfil?.nombre || "")}</div>
  </div>`;
}
function bloquePacienteImpresion(p) {
  return `<div class="imp-pac">
    <div><b>Paciente:</b> ${h(p.nombre_completo)}</div>
    <div><b>${h(abrevDoc(p.tipo_documento))}:</b> ${h(p.numero_documento || "—")}</div>
    <div><b>Historia:</b> ${h(p.no_historia || "—")}</div>
    <div><b>Edad:</b> ${h(edad(p.fecha_nacimiento) || "—")}</div>
    <div><b>Sexo:</b> ${h(p.genero || "—")}</div>
    <div><b>Entidad:</b> ${h(p.entidad || "—")}</div>
  </div>`;
}
function firmaImpresion(nombre, registro) {
  const f1 = nombre || S.perfil?.firma_linea1 || S.perfil?.nombre || "";
  const f2 = registro ?? (S.perfil?.firma_linea2 || "");
  return `<div class="imp-firma"><b>${h(f1)}</b>${f2 ? "<br>" + h(f2) : ""}</div>`;
}
function imprimir(html) {
  $("#impresion").innerHTML = html;
  setTimeout(() => window.print(), 60);
}
function abrevDoc(t) {
  const m = { "Cédula de ciudadanía": "C.C.", "Cédula de extranjería": "C.E.", "Tarjeta de identidad": "T.I.", "Pasaporte": "Pasaporte", "Registro civil": "R.C." };
  return m[t] || "Documento";
}

/* ---------------- constantes de dominio ---------------- */
const CLASIF = [
  { v: "Nueva", c: "var(--c-nueva)" },
  { v: "Control", c: "var(--c-control)" },
  { v: "Revisión", c: "var(--c-revision)" },
  { v: "Procedimiento", c: "var(--c-proc)" },
  { v: "Cirugía", c: "var(--c-cirugia)" },
  { v: "Consulta de nuevo", c: "var(--c-denuevo)" }
];
const CLASIF_PERSONAL = ["Actividad personal", "Actividad laboral", "Actividad académica", "No disponible", "Vacaciones"];
function colorClasif(c, tipo) {
  if (tipo === "Cita Personal") return "var(--c-personal)";
  return (CLASIF.find((x) => x.v === c) || { c: "var(--c-personal)" }).c;
}
const ESTADOS = {
  asignada: { t: "Asignada", cls: "" },
  confirmada: { t: "Confirmada", cls: "pri" },
  en_espera: { t: "En sala de espera", cls: "aviso" },
  en_atencion: { t: "En consulta", cls: "pri" },
  atendida: { t: "Atendida", cls: "ok" },
  no_asistio: { t: "No asistió", cls: "peligro" },
  cancelada: { t: "Cancelada", cls: "peligro" }
};
const TIPOS_DOC = ["Cédula de ciudadanía", "Tarjeta de identidad", "Cédula de extranjería", "Pasaporte", "Registro civil", "Número único de identificación", "Menor sin identificación"];
const CAMPOS_HC = [
  ["motivo_consulta", "Motivo de consulta"],
  ["enfermedad_actual", "Enfermedad actual"],
  ["antecedentes_personales", "Antecedentes personales"],
  ["revision_sistemas", "Revisión por sistemas"],
  ["antecedentes_familiares", "Antecedentes familiares"],
  ["examen_fisico", "Examen físico"],
  ["diagnostico", "Diagnóstico"],
  ["conducta", "Conducta"]
];
const PLANTILLA_EXAMEN_FISICO = "\nPresión arterial:\nPulso:\nTemperatura:\nPeso:   Kg\n";
const ROLES = { medico: "Médico", recepcion: "Recepción", ingeniero: "Ingeniero (soporte)" };
const CATEGORIAS_ORDEN = ["Laboratorio", "Imágenes", "Medicamento", "Otro"];
