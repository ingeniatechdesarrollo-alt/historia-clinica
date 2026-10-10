/* =============================================================
   AHP Web · Pacientes: búsqueda, registro y ficha clínica
   ============================================================= */
"use strict";

/* ---------------- Lista / búsqueda ---------------- */
VISTAS.pacientes = async (p, q) => {
  const ultima = q.q ?? local.get("busqueda", "");
  $("#principal").innerHTML = `
    <div class="cabecera">
      <div><h1>Pacientes</h1><div class="sub" id="pac-stats">&nbsp;</div></div>
      <div class="der"><button class="btn pri" id="btn-nuevo-pac">${ICO.mas} Nuevo paciente</button></div>
    </div>
    <div class="tarjeta">
      <div class="t-cuerpo"><div class="busqueda">${ICO.buscar}<input id="pac-q" placeholder="Buscar por cédula, nombre o número de historia…" value="${h(ultima)}" autocomplete="off"></div></div>
      <div id="pac-res"></div>
    </div>`;
  $("#btn-nuevo-pac").onclick = () => formPaciente(null, (n) => (location.hash = `#/paciente/${n.id}/datos`));
  sb.rpc("estadisticas").then(({ data }) => {
    if (data && $("#pac-stats")) $("#pac-stats").textContent = `${data.pacientes.toLocaleString("es-CO")} pacientes · ${data.consultas.toLocaleString("es-CO")} documentos clínicos · ${data.adjuntos.toLocaleString("es-CO")} adjuntos`;
  });
  const inp = $("#pac-q");
  const buscar = debounce(async () => {
    const qq = inp.value.trim();
    local.set("busqueda", qq);
    const res = $("#pac-res");
    if (qq.length < 2) {
      res.innerHTML = `<div class="vacio">Escriba al menos 2 letras o números para buscar.<br><span style="font-size:12.5px">Puede buscar por nombre parcial: <i>“maria gomez”</i>, por cédula o por número de historia.</span></div>`;
      return;
    }
    res.innerHTML = `<div class="cargando"><span class="spinner"></span></div>`;
    const filas = await db(sb.rpc("buscar_pacientes", { q: qq, limite: 60 }));
    if (inp.value.trim() !== qq) return;
    if (!filas.length) { res.innerHTML = `<div class="vacio">No se encontraron pacientes con “${h(qq)}”.</div>`; return; }
    res.innerHTML = `<div class="scroll-x"><table class="tabla"><thead><tr><th>Paciente</th><th>Documento</th><th>Historia</th><th>Edad</th><th>Entidad</th><th>Teléfono</th><th>Última consulta</th></tr></thead><tbody>
      ${filas.map((f) => `<tr class="clic" data-id="${f.id}">
        <td><b>${resaltar(f.nombre_completo, qq)}</b></td>
        <td class="mono">${h(abrevDoc(f.tipo_documento))} ${resaltar(f.numero_documento || "—", qq)}</td>
        <td class="mono">${resaltar(f.no_historia || "—", qq)}</td>
        <td>${h(edad(f.fecha_nacimiento))}</td>
        <td>${h(f.entidad || "")}</td>
        <td>${h(f.telefono_movil || f.telefono || "")}</td>
        <td>${f.ultima_consulta ? `${fCorta(f.ultima_consulta)} <span class="muted">(${f.total_consultas})</span>` : '<span class="muted">—</span>'}</td>
      </tr>`).join("")}</tbody></table></div>
      ${filas.length >= 60 ? `<div class="muted" style="padding:10px 14px;font-size:12.5px">Se muestran los primeros 60 resultados. Afine la búsqueda.</div>` : ""}`;
    $$("#pac-res tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = `#/paciente/${tr.dataset.id}/resumen`)));
  }, 250);
  inp.oninput = buscar;
  inp.focus(); inp.select();
  buscar();
};

/* ---------------- Formulario de paciente ---------------- */
let _catalogos = null;
async function catalogos() {
  if (_catalogos) return _catalogos;
  const [ent, ocu] = await Promise.all([
    db(sb.from("entidades").select("nombre").eq("activo", true).order("nombre")),
    todo(() => sb.from("ocupaciones").select("nombre").order("nombre"))
  ]);
  _catalogos = { entidades: ent.map((x) => x.nombre), ocupaciones: ocu.map((x) => x.nombre) };
  return _catalogos;
}

async function formPaciente(p, alGuardar, sugerencia = "") {
  const cat = await catalogos();
  const nuevo = !p;
  p = p || {};
  if (nuevo && sugerencia) {
    if (/^\d+$/.test(sugerencia)) p.numero_documento = sugerencia;
    else { const w = sugerencia.split(/\s+/); p.primer_nombre = w[0]; p.primer_apellido = w.slice(1).join(" "); }
  }
  const v = (k) => h(p[k] ?? "");
  const sel = (k, ops) => `<select name="${k}"><option value=""></option>${ops.map((o) => `<option ${o === p[k] ? "selected" : ""}>${h(o)}</option>`).join("")}${p[k] && !ops.includes(p[k]) ? `<option selected>${h(p[k])}</option>` : ""}</select>`;
  const m = modal({
    titulo: nuevo ? "Registrar paciente" : "Editar datos del paciente",
    ancho: "xancho",
    cuerpo: `<form id="f-pac" class="rejilla" autocomplete="off">
      <h4 style="color:var(--pri)">Identificación</h4>
      <div class="rejilla r4">
        <div class="campo"><label>Tipo de documento *</label>${sel("tipo_documento", TIPOS_DOC)}</div>
        <div class="campo"><label>Número de documento *</label><input name="numero_documento" value="${v("numero_documento")}" required></div>
        <div class="campo"><label>No. historia</label><input name="no_historia" value="${v("no_historia")}" placeholder="Igual al documento"></div>
        <div class="campo"><label>Fecha de nacimiento</label><input type="date" name="fecha_nacimiento" value="${v("fecha_nacimiento")}"></div>
        <div class="campo"><label>Primer nombre *</label><input name="primer_nombre" value="${v("primer_nombre")}" required></div>
        <div class="campo"><label>Segundo nombre</label><input name="segundo_nombre" value="${v("segundo_nombre")}"></div>
        <div class="campo"><label>Primer apellido *</label><input name="primer_apellido" value="${v("primer_apellido")}" required></div>
        <div class="campo"><label>Segundo apellido</label><input name="segundo_apellido" value="${v("segundo_apellido")}"></div>
        <div class="campo"><label>Sexo</label>${sel("genero", ["Femenino", "Masculino", "Indeterminado"])}</div>
        <div class="campo"><label>Estado civil</label>${sel("estado_civil", ["Soltero(a)", "Casado(a)", "Unión libre", "Separado(a)", "Divorciado(a)", "Viudo(a)"])}</div>
        <div class="campo span2"><label>Ocupación</label><input name="ocupacion" list="dl-ocup" value="${v("ocupacion")}"></div>
        <div class="campo span2"><label>Lugar de nacimiento</label><input name="lugar_nacimiento" value="${v("lugar_nacimiento")}"></div>
      </div>
      <h4 style="color:var(--pri);margin-top:6px">Contacto</h4>
      <div class="rejilla r4">
        <div class="campo"><label>Celular</label><input name="telefono_movil" value="${v("telefono_movil")}" inputmode="tel"></div>
        <div class="campo"><label>Teléfono fijo</label><input name="telefono" value="${v("telefono")}" inputmode="tel"></div>
        <div class="campo"><label>Teléfono oficina</label><input name="telefono_oficina" value="${v("telefono_oficina")}"></div>
        <div class="campo"><label>Correo</label><input type="email" name="correo" value="${v("correo")}"></div>
        <div class="campo span2"><label>Dirección</label><input name="direccion" value="${v("direccion")}"></div>
        <div class="campo"><label>Municipio de residencia</label><input name="lugar_residencia" value="${v("lugar_residencia")}"></div>
        <div class="campo"><label>Zona</label>${sel("zona", ["Urbana", "Rural"])}</div>
      </div>
      <h4 style="color:var(--pri);margin-top:6px">Afiliación</h4>
      <div class="rejilla r4">
        <div class="campo span2"><label>Entidad / aseguradora</label><input name="entidad" list="dl-ent" value="${v("entidad")}"></div>
        <div class="campo"><label>Vinculación</label>${sel("vinculacion", ["Contributivo", "Subsidiado", "Vinculado", "Particular", "Otro"])}</div>
        <div class="campo"><label>No. afiliación</label><input name="no_afiliacion" value="${v("no_afiliacion")}"></div>
        <div class="campo span2"><label>EPS</label><input name="eps" value="${v("eps")}"></div>
        <div class="campo span2"><label>Remitido por</label><input name="remitido" value="${v("remitido")}"></div>
      </div>
      <h4 style="color:var(--pri);margin-top:6px">Responsable y acompañante</h4>
      <div class="rejilla r4">
        <div class="campo"><label>Responsable</label><input name="responsable" value="${v("responsable")}"></div>
        <div class="campo"><label>Parentesco</label><input name="responsable_parentesco" value="${v("responsable_parentesco")}"></div>
        <div class="campo"><label>Tel. responsable</label><input name="responsable_telefono" value="${v("responsable_telefono")}"></div>
        <div class="campo"><label>Acompañante</label><input name="acompanante" value="${v("acompanante")}"></div>
      </div>
      <div class="rejilla r2">
        <div class="campo"><label>Notas (visibles en la ficha)</label><textarea name="notas" rows="2">${v("notas")}</textarea></div>
        <div class="campo"><label>Notas privadas</label><textarea name="notas_privadas" rows="2">${v("notas_privadas")}</textarea></div>
      </div>
      <datalist id="dl-ent">${cat.entidades.map((e) => `<option value="${h(e)}">`).join("")}</datalist>
      <datalist id="dl-ocup">${cat.ocupaciones.map((e) => `<option value="${h(e)}">`).join("")}</datalist>
    </form>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>${nuevo ? "Registrar paciente" : "Guardar cambios"}</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  $("[data-ok]", m.el).onclick = async () => {
    const form = $("#f-pac", m.el);
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    if (!d.tipo_documento) return toast("Seleccione el tipo de documento", "error");
    for (const k in d) { d[k] = String(d[k]).trim(); if (d[k] === "") d[k] = null; }
    d.nombre_completo = [d.primer_nombre, d.segundo_nombre, d.primer_apellido, d.segundo_apellido].filter(Boolean).join(" ");
    if (!d.no_historia) d.no_historia = d.numero_documento;
    // ¿documento repetido?
    const rep = await db(sb.from("pacientes").select("id,nombre_completo").eq("numero_documento", d.numero_documento).limit(3));
    const otros = rep.filter((x) => x.id !== p.id);
    if (otros.length && !(await confirmar(`Ya existe un paciente con el documento <b>${h(d.numero_documento)}</b>: ${h(otros[0].nombre_completo)}. ¿Guardar de todas formas?`, { boton: "Guardar" }))) return;
    let guardado;
    if (nuevo) guardado = await db(sb.from("pacientes").insert(d).select().single(), "No se pudo registrar");
    else guardado = await db(sb.from("pacientes").update(d).eq("id", p.id).select().single(), "No se pudo guardar");
    toast(nuevo ? "Paciente registrado" : "Datos actualizados", "ok");
    m.cerrar();
    alGuardar && alGuardar(guardado);
  };
}

/* ---------------- Ficha del paciente ---------------- */
var FICHA = { id: null, p: null, consultas: null, ordenes: null, adjuntos: null, citas: null };

VISTAS.paciente = async (partes, q) => {
  const [id, tab = "resumen"] = partes;
  if (FICHA.id !== id) {
    Object.assign(FICHA, { id, p: null, consultas: null, ordenes: null, adjuntos: null, citas: null });
    sb.rpc("registrar_acceso", { p_paciente: id }).then(() => {});
  }
  if (!FICHA.p) FICHA.p = await db(sb.from("pacientes").select("*").eq("id", id).single(), "No se encontró el paciente");
  const p = FICHA.p;
  if (!FICHA.consultas) {
    const [cons, ords, adjs, citas] = await Promise.all([
      todo(() => sb.from("consultas").select("*, notas:notas_aclaratorias(*)").eq("paciente_id", id).order("fecha", { ascending: false })),
      db(sb.from("ordenes").select("*").eq("paciente_id", id).order("fecha", { ascending: false })),
      db(sb.from("adjuntos").select("*").eq("paciente_id", id).order("fecha", { ascending: false })),
      db(sb.from("citas").select("*").eq("paciente_id", id).order("fecha", { ascending: false }).order("hora_inicio", { ascending: false }).limit(300))
    ]);
    Object.assign(FICHA, { consultas: cons, ordenes: ords, adjuntos: adjs, citas });
  }
  const cita = q.cita ? FICHA.citas.find((c) => String(c.id) === q.cita) : null;
  const proxima = FICHA.citas.filter((c) => c.fecha >= hoyISO() && c.estado !== "cancelada").sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))[0];
  const borradores = FICHA.consultas.filter((c) => !c.firmada);
  const qs = q.cita ? `?cita=${q.cita}` : "";
  const tabs = [
    ["resumen", "Resumen"],
    ["historia", "Historia clínica", FICHA.consultas.length],
    ["nueva", "Nueva consulta"],
    ["examenes", "Exámenes y órdenes", FICHA.ordenes.length + FICHA.adjuntos.length],
    ["citas", "Citas", FICHA.citas.length],
    ["datos", "Datos personales"]
  ];
  $("#principal").innerHTML = `
    <div style="margin-bottom:10px"><a href="${cita ? "#/agenda" : "#/pacientes"}" class="btn chico fantasma">${ICO.volver} ${cita ? "Volver a la agenda" : "Pacientes"}</a></div>
    <div class="tarjeta" style="margin-bottom:16px">
      <div class="ficha-cab">
        <div class="avatar">${h(iniciales(p.nombre_completo))}</div>
        <div style="flex:1;min-width:240px">
          <h1>${h(p.nombre_completo)}</h1>
          <div class="datos-linea">
            <span>${h(abrevDoc(p.tipo_documento))} <b class="mono">${h(p.numero_documento || "—")}</b></span>
            <span>Historia <b class="mono">${h(p.no_historia || "—")}</b></span>
            ${p.fecha_nacimiento ? `<span><b>${h(edad(p.fecha_nacimiento))}</b> (${fCorta(p.fecha_nacimiento)})</span>` : ""}
            ${p.genero ? `<span>${h(p.genero)}</span>` : ""}
            ${p.entidad ? `<span>${h(p.entidad)}${p.vinculacion ? " · " + h(p.vinculacion) : ""}</span>` : ""}
            ${p.telefono_movil || p.telefono ? `<span>Tel. <b>${h([p.telefono_movil, p.telefono].filter(Boolean).join(" / "))}</b></span>` : ""}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="f-agendar">${ICO.mas} Agendar cita</button>
          <a class="btn pri" href="#/paciente/${p.id}/nueva${qs}">${ICO.mas} Nueva consulta</a>
        </div>
      </div>
      ${cita ? `<div class="alerta info" style="margin:0 18px 14px">Cita de hoy: <b>${hora12(cita.hora_inicio.slice(0, 5))}</b> · ${h(cita.clasificacion || "")} · estado <b>${ESTADOS[cita.estado].t}</b>${cita.observacion ? " · " + h(cita.observacion) : ""}</div>` : ""}
      ${p.notas ? `<div class="alerta aviso" style="margin:0 18px 14px;white-space:pre-wrap">${h(p.notas)}</div>` : ""}
      ${borradores.length ? `<div class="alerta aviso" style="margin:0 18px 14px">Hay ${borradores.length} documento(s) en borrador sin firmar. <a href="#/paciente/${p.id}/nueva${qs}">Continuar</a></div>` : ""}
      <nav class="pestanas">${tabs.map(([k, t, n]) => `<a href="#/paciente/${p.id}/${k}${qs}" class="${k === tab ? "activa" : ""}">${t}${n !== undefined ? `<span class="cnt">${n}</span>` : ""}</a>`).join("")}</nav>
    </div>
    <div id="ficha-cuerpo"></div>`;
  $("#f-agendar").onclick = () => formCita({ fecha: hoyISO(), paciente: p });
  const cuerpo = $("#ficha-cuerpo");
  ({ resumen: tabResumen, historia: tabHistoria, nueva: tabNueva, examenes: tabExamenes, citas: tabCitas, datos: tabDatos }[tab] || tabResumen)(cuerpo, p, q, { proxima, cita });
};

function recargarFicha(tab) {
  FICHA.consultas = null;
  const { p, q } = rutaActual();
  const qs = q.cita ? `?cita=${q.cita}` : "";
  const nuevo = `#/paciente/${FICHA.id}/${tab || p[1] || "resumen"}${qs}`;
  if (location.hash === nuevo) enrutar(); else location.hash = nuevo;
}

/* ---- render de un documento clínico ---- */
function htmlConsulta(c, q = "", abierto = false) {
  const esHC = c.tipo === "historia_clinica";
  const secciones = esHC ? CAMPOS_HC.filter(([k]) => (c[k] || "").trim()) : [["evolucion", "Evolución"]];
  const resumenTxt = (esHC ? c.diagnostico || c.motivo_consulta : c.evolucion) || "";
  return `<div class="doc ${abierto ? "" : "cerrado"}" data-id="${c.id}">
    <div class="doc-cab">
      <span class="fecha">${fFechaHora(c.fecha)}</span>
      <span class="chip ${esHC ? "pri" : ""}">${esHC ? "Historia clínica" : "Evolución"}</span>
      ${c.firmada ? `<span class="chip ok" title="Firmado: no se puede modificar">${ICO.candado} Firmado</span>` : `<span class="chip aviso">Borrador</span>`}
      <span class="resumen">${resaltar(resumenTxt.replace(/\s+/g, " ").slice(0, 160), q)}</span>
      <span class="muted" style="font-size:12px">${h(c.profesional || "")}</span>
    </div>
    <div class="doc-cuerpo">
      ${secciones.map(([k, t]) => `<div class="seccion-hc"><h5>${t}</h5><div>${resaltar(c[k] || "", q)}</div></div>`).join("") || '<div class="muted" style="margin-top:10px">Sin contenido</div>'}
      ${(c.notas || []).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((n) => `<div class="nota-acl"><b>Nota aclaratoria</b> · ${h(n.autor || "")} · ${fFechaHora(n.created_at.replace("T", " ").slice(0, 19))}<div style="white-space:pre-wrap;margin-top:3px">${h(n.texto)}</div></div>`).join("")}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn chico" data-imp="${c.id}">${ICO.imprimir} Imprimir</button>
        ${c.firmada ? `<button class="btn chico" data-nota="${c.id}">${ICO.editar} Nota aclaratoria</button>` : `<a class="btn chico" href="#/paciente/${c.paciente_id}/nueva?borrador=${c.id}">${ICO.editar} Continuar borrador</a>`}
      </div>
    </div>
  </div>`;
}

function enlazarConsultas(raiz, p) {
  $$(".doc-cab", raiz).forEach((cab) => (cab.onclick = () => cab.parentElement.classList.toggle("cerrado")));
  $$("[data-imp]", raiz).forEach((b) => (b.onclick = () => imprimirConsultas(p, FICHA.consultas.filter((c) => String(c.id) === b.dataset.imp))));
  $$("[data-nota]", raiz).forEach((b) => (b.onclick = () => notaAclaratoria(FICHA.consultas.find((c) => String(c.id) === b.dataset.nota))));
}

function notaAclaratoria(c) {
  const m = modal({
    titulo: "Nota aclaratoria",
    cuerpo: `<p class="muted" style="margin-top:0">El documento del ${fFechaHora(c.fecha)} está firmado y no se modifica. La nota queda anexa con su nombre, fecha y hora.</p>
      <div class="campo"><label>Texto de la nota</label><textarea id="na-txt" rows="5"></textarea></div>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>Guardar nota</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  $("[data-ok]", m.el).onclick = async () => {
    const t = $("#na-txt", m.el).value.trim();
    if (!t) return;
    await db(sb.from("notas_aclaratorias").insert({ consulta_id: c.id, texto: t, autor: S.perfil.nombre }), "No se pudo guardar");
    m.cerrar(); toast("Nota aclaratoria guardada", "ok"); recargarFicha("historia");
  };
}

/* ---- Pestaña: Resumen ---- */
function tabResumen(el, p, q, { proxima }) {
  const ult = FICHA.consultas.find((c) => c.firmada) || FICHA.consultas[0];
  const ultHC = FICHA.consultas.find((c) => c.tipo === "historia_clinica");
  const antecedentes = ultHC ? [["Antecedentes personales", ultHC.antecedentes_personales], ["Antecedentes familiares", ultHC.antecedentes_familiares], ["Diagnóstico (última HC)", ultHC.diagnostico]].filter(([, v]) => (v || "").trim()) : [];
  el.innerHTML = `<div class="resumen-grid">
    <div>
      <h3 style="margin-bottom:10px;font-size:15px">Última consulta</h3>
      ${ult ? htmlConsulta(ult, "", true) : `<div class="tarjeta"><div class="vacio">Este paciente aún no tiene documentos clínicos.<br><a class="btn pri chico" style="margin-top:10px" href="#/paciente/${p.id}/nueva">Iniciar historia clínica</a></div></div>`}
      ${FICHA.consultas.length > 1 ? `<a href="#/paciente/${p.id}/historia" class="btn chico">Ver toda la historia (${FICHA.consultas.length} documentos) →</a>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="tarjeta"><div class="t-cab"><h3>Datos clave</h3></div><div class="t-cuerpo"><dl class="kv">
        <dt>Primera consulta</dt><dd>${FICHA.consultas.length ? fCorta(FICHA.consultas[FICHA.consultas.length - 1].fecha) : "—"}</dd>
        <dt>Total documentos</dt><dd>${FICHA.consultas.length} (${FICHA.consultas.filter((c) => c.tipo === "historia_clinica").length} HC · ${FICHA.consultas.filter((c) => c.tipo === "evolucion").length} evoluciones)</dd>
        <dt>Próxima cita</dt><dd>${proxima ? `${fDia(proxima.fecha)} · ${hora12(proxima.hora_inicio.slice(0, 5))}` : "—"}</dd>
        <dt>Exámenes adjuntos</dt><dd>${FICHA.adjuntos.length}</dd>
        <dt>Órdenes</dt><dd>${FICHA.ordenes.length}</dd>
        <dt>Ocupación</dt><dd>${h(p.ocupacion || "—")}</dd>
        <dt>Residencia</dt><dd>${h([p.direccion, p.lugar_residencia].filter(Boolean).join(", ") || "—")}</dd>
        <dt>Responsable</dt><dd>${h([p.responsable, p.responsable_parentesco, p.responsable_telefono].filter(Boolean).join(" · ") || "—")}</dd>
      </dl></div></div>
      ${antecedentes.length ? `<div class="tarjeta"><div class="t-cab"><h3>Antecedentes</h3><span class="muted" style="font-size:12px">${fCorta(ultHC.fecha)}</span></div><div class="t-cuerpo">${antecedentes.map(([t, v]) => `<div class="seccion-hc" style="margin-top:0;margin-bottom:10px"><h5>${t}</h5><div>${h(v)}</div></div>`).join("")}</div></div>` : ""}
      ${FICHA.adjuntos.length ? `<div class="tarjeta"><div class="t-cab"><h3>Últimos exámenes</h3><a href="#/paciente/${p.id}/examenes" style="margin-left:auto;font-size:12.5px">Ver todos</a></div>${FICHA.adjuntos.slice(0, 5).map((a) => `<div class="espera-item" data-adj="${a.id}">${ICO.archivo.replace("<svg", '<svg width="18" height="18"')}<div style="flex:1;min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(a.nombre)}</div><div class="muted" style="font-size:12px">${fCorta(a.fecha)}</div></div></div>`).join("")}</div>` : ""}
      ${p.notas_privadas ? `<div class="tarjeta"><div class="t-cab"><h3>Notas privadas</h3></div><div class="t-cuerpo" style="white-space:pre-wrap">${h(p.notas_privadas)}</div></div>` : ""}
    </div></div>`;
  enlazarConsultas(el, p);
  $$("[data-adj]", el).forEach((d) => (d.onclick = () => verAdjunto(FICHA.adjuntos.find((a) => String(a.id) === d.dataset.adj))));
}

/* ---- Pestaña: Historia clínica completa ---- */
function tabHistoria(el, p) {
  el.innerHTML = `
    <div class="tarjeta" style="margin-bottom:14px"><div class="t-cuerpo" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="busqueda" style="flex:1;min-width:220px">${ICO.buscar}<input id="h-q" placeholder="Buscar dentro de la historia (diagnóstico, medicamento, examen…)" style="height:38px;font-size:14px"></div>
      <select class="inp" id="h-tipo" style="width:auto"><option value="">Todos los documentos</option><option value="historia_clinica">Historias clínicas</option><option value="evolucion">Evoluciones</option></select>
      <button class="btn" id="h-exp">Expandir todo</button>
      <button class="btn" id="h-imp">${ICO.imprimir} Imprimir historia</button>
    </div></div>
    <div id="h-lista" class="linea-tiempo"></div>`;
  let expandido = false;
  const pintar = () => {
    const q = $("#h-q").value.trim(), t = $("#h-tipo").value, nq = norm(q);
    const lista = FICHA.consultas.filter((c) => (!t || c.tipo === t) && (!nq || norm([...CAMPOS_HC.map(([k]) => c[k]), c.evolucion, ...(c.notas || []).map((n) => n.texto)].join(" ")).includes(nq)));
    $("#h-lista").innerHTML = lista.length ? lista.map((c) => htmlConsulta(c, q, expandido || !!nq)).join("") : `<div class="tarjeta"><div class="vacio">Sin resultados</div></div>`;
    enlazarConsultas($("#h-lista"), p);
    return lista;
  };
  $("#h-q").oninput = debounce(pintar, 200);
  $("#h-tipo").onchange = pintar;
  $("#h-exp").onclick = () => { expandido = !expandido; $("#h-exp").textContent = expandido ? "Contraer todo" : "Expandir todo"; pintar(); };
  $("#h-imp").onclick = () => imprimirHistoriaDialogo(p, pintar());
  pintar();
}

function imprimirHistoriaDialogo(p, filtradas) {
  const m = modal({
    titulo: "Imprimir historia clínica",
    cuerpo: `<div class="rejilla">
      <label style="display:flex;gap:8px"><input type="radio" name="imp" value="todo" checked> Toda la historia (${FICHA.consultas.length} documentos)</label>
      <label style="display:flex;gap:8px"><input type="radio" name="imp" value="filtro"> Sólo los documentos filtrados en pantalla (${filtradas.length})</label>
      <label style="display:flex;gap:8px;align-items:center"><input type="radio" name="imp" value="rango"> Por fechas: desde <input type="date" class="inp" id="imp-d" style="width:auto"> hasta <input type="date" class="inp" id="imp-h" style="width:auto"></label>
      <label style="display:flex;gap:8px"><input type="checkbox" id="imp-asc" checked> Orden cronológico (más antiguo primero)</label></div>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>${ICO.imprimir} Imprimir</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  $("[data-ok]", m.el).onclick = () => {
    const modo = $('input[name="imp"]:checked', m.el).value;
    let docs = modo === "filtro" ? filtradas : FICHA.consultas;
    if (modo === "rango") {
      const d = $("#imp-d", m.el).value || "0000", hh = $("#imp-h", m.el).value || "9999";
      docs = docs.filter((c) => c.fecha.slice(0, 10) >= d && c.fecha.slice(0, 10) <= hh);
    }
    if ($("#imp-asc", m.el).checked) docs = [...docs].reverse();
    m.cerrar();
    imprimirConsultas(p, docs);
  };
}

function imprimirConsultas(p, docs) {
  if (!docs.length) return toast("No hay documentos para imprimir", "error");
  const prof = docs[0].profesional;
  imprimir(`${encabezadoImpresion()}
    <h2 style="font-size:13pt;margin:0 0 8px">HISTORIA CLÍNICA</h2>
    ${bloquePacienteImpresion(p)}
    ${docs.map((c) => {
      const esHC = c.tipo === "historia_clinica";
      const secs = esHC ? CAMPOS_HC.filter(([k]) => (c[k] || "").trim()) : [["evolucion", "Evolución"]];
      return `<div class="imp-doc"><h3>${esHC ? "Historia clínica" : "Evolución"} · ${h(fFechaHora(c.fecha))} · ${h(c.profesional || "")}${c.firmada ? "" : " · BORRADOR"}</h3>
        ${secs.map(([k, t]) => `<h5>${t}</h5><div class="txt">${h(c[k] || "")}</div>`).join("")}
        ${(c.notas || []).map((n) => `<h5>Nota aclaratoria · ${h(n.autor || "")} · ${h(fFechaHora(n.created_at.replace("T", " ").slice(0, 19)))}</h5><div class="txt">${h(n.texto)}</div>`).join("")}
      </div>`;
    }).join("")}
    ${firmaImpresion(prof)}
    <div class="imp-pie">Documento confidencial — Historia clínica (Res. 1995 de 1999). ${docs.length} documento(s).</div>`);
}

/* ---- Pestaña: Nueva consulta (HC o evolución) ---- */
function tabNueva(el, p, q) {
  const borrador = q.borrador ? FICHA.consultas.find((c) => String(c.id) === q.borrador) : FICHA.consultas.find((c) => !c.firmada);
  const tieneHC = FICHA.consultas.some((c) => c.tipo === "historia_clinica" && c.firmada);
  let tipo = borrador?.tipo || (tieneHC ? "evolucion" : "historia_clinica");
  const claveLocal = `borrador:${p.id}`;
  const recuperado = !borrador ? local.get(claveLocal) : null;
  const val = (k) => borrador?.[k] ?? recuperado?.[k] ?? (k === "examen_fisico" ? PLANTILLA_EXAMEN_FISICO : "");
  const ultHC = FICHA.consultas.find((c) => c.tipo === "historia_clinica");
  const pintar = () => {
    el.innerHTML = `<div class="tarjeta">
      <div class="t-cab" style="flex-wrap:wrap">
        <h3>${borrador ? "Continuar borrador" : "Nuevo documento clínico"}</h3>
        <div style="display:flex;gap:6px;margin-left:auto">
          <button class="btn chico ${tipo === "historia_clinica" ? "pri" : ""}" data-t="historia_clinica" ${borrador ? "disabled" : ""}>Historia clínica</button>
          <button class="btn chico ${tipo === "evolucion" ? "pri" : ""}" data-t="evolucion" ${borrador ? "disabled" : ""}>Evolución / control</button>
        </div>
      </div>
      <div class="t-cuerpo">
        ${recuperado ? `<div class="alerta info" style="margin-bottom:12px">Se recuperó un texto sin guardar de este equipo.</div>` : ""}
        <form id="f-cons" class="rejilla">
          <div class="rejilla r3">
            <div class="campo"><label>Fecha y hora</label><input type="datetime-local" name="fecha" value="${h((borrador?.fecha || ahoraLocal()).replace(" ", "T").slice(0, 16))}"></div>
            <div class="campo"><label>Profesional</label><input name="profesional" value="${h(borrador?.profesional || S.perfil.firma_linea1 || S.perfil.nombre)}"></div>
            <div class="campo"><label>Clasificación</label><select name="clasificacion"><option value=""></option>${CLASIF.map((c) => `<option ${borrador?.clasificacion === c.v ? "selected" : ""}>${c.v}</option>`).join("")}</select></div>
          </div>
          ${tipo === "historia_clinica"
            ? CAMPOS_HC.map(([k, t]) => `<div class="campo"><label>${t}</label><textarea name="${k}" rows="${k === "examen_fisico" || k === "enfermedad_actual" ? 5 : 3}">${h(val(k))}</textarea></div>`).join("")
            : `${ultHC ? `<details class="alerta info"><summary style="cursor:pointer">Ver resumen de la última historia clínica (${fCorta(ultHC.fecha)})</summary>${CAMPOS_HC.filter(([k]) => (ultHC[k] || "").trim()).map(([k, t]) => `<div class="seccion-hc"><h5>${t}</h5><div>${h(ultHC[k])}</div></div>`).join("")}</details>` : ""}
               <div class="campo"><label>Evolución</label><textarea name="evolucion" rows="12">${h(val("evolucion"))}</textarea></div>`}
        </form>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
          <span class="muted" id="auto-msg" style="margin-right:auto;align-self:center;font-size:12px"></span>
          <button class="btn" id="btn-orden">${ICO.mas} Orden / fórmula</button>
          ${borrador ? `<button class="btn peligro" id="btn-desc">Descartar borrador</button>` : ""}
          <button class="btn" id="btn-borr">Guardar borrador</button>
          <button class="btn pri" id="btn-firmar">${ICO.candado} Firmar y guardar</button>
        </div>
        <p class="muted" style="font-size:12px;margin:10px 0 0;text-align:right">Al firmar, el documento queda cerrado y no se puede modificar (sólo agregar notas aclaratorias).</p>
      </div></div>`;
    $$("[data-t]", el).forEach((b) => (b.onclick = () => { guardarLocal(); tipo = b.dataset.t; pintar(); }));
    const form = $("#f-cons", el);
    form.oninput = debounce(() => { if (!document.body.contains(form)) return; guardarLocal(); const am = $("#auto-msg"); if (am) am.textContent = "Texto guardado en este equipo " + new Date().toLocaleTimeString("es-CO"); }, 800);
    $("#btn-borr").onclick = () => guardar(false);
    $("#btn-firmar").onclick = () => guardar(true);
    $("#btn-orden").onclick = () => formOrden(p, borrador?.id || null);
    if ($("#btn-desc")) $("#btn-desc").onclick = async () => {
      if (!(await confirmar("¿Descartar este borrador? Se eliminará.", { peligro: true, boton: "Descartar" }))) return;
      await db(sb.from("consultas").delete().eq("id", borrador.id));
      local.del(claveLocal); toast("Borrador descartado"); recargarFicha("historia");
    };
  };
  const datos = () => {
    const d = Object.fromEntries(new FormData($("#f-cons", el)));
    d.fecha = (d.fecha || ahoraLocal()).replace("T", " ");
    if (d.fecha.length === 16) d.fecha += ":00";
    d.clasificacion = d.clasificacion || null;
    return d;
  };
  const guardarLocal = () => { try { local.set(claveLocal, { ...datos(), tipo }); } catch {} };
  const guardar = async (firmar) => {
    const d = datos();
    const contenido = tipo === "historia_clinica" ? CAMPOS_HC.map(([k]) => d[k]).join("").replace(PLANTILLA_EXAMEN_FISICO.trim(), "").trim() : (d.evolucion || "").trim();
    if (!contenido) return toast("El documento está vacío", "error");
    if (firmar && !(await confirmar(`¿Firmar ${tipo === "historia_clinica" ? "la historia clínica" : "la evolución"}? Después no podrá modificarse.`, { boton: "Firmar" }))) return;
    const fila = { ...d, tipo, paciente_id: p.id, firmada: firmar };
    if (rutaActual().q.cita) fila.cita_id = Number(rutaActual().q.cita);
    if (borrador) await db(sb.from("consultas").update(fila).eq("id", borrador.id), "No se pudo guardar");
    else await db(sb.from("consultas").insert(fila), "No se pudo guardar");
    local.del(claveLocal);
    if (firmar && fila.cita_id) await sb.from("citas").update({ estado: "atendida" }).eq("id", fila.cita_id);
    toast(firmar ? "Documento firmado y guardado" : "Borrador guardado", "ok");
    recargarFicha(firmar ? "historia" : "nueva");
  };
  pintar();
}

/* ---- Pestaña: Exámenes y órdenes ---- */
function tabExamenes(el, p) {
  el.innerHTML = `<div class="rejilla" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start" id="ex-grid">
    <div class="tarjeta">
      <div class="t-cab"><h3>Resultados y documentos adjuntos</h3><span class="chip">${FICHA.adjuntos.length}</span>
        <label class="btn chico pri" style="margin-left:auto">${ICO.subir} Subir archivo<input type="file" id="adj-file" multiple accept=".pdf,image/*" hidden></label></div>
      <div class="t-cuerpo" style="padding:10px 16px"><input class="inp" id="adj-q" placeholder="Filtrar por nombre o fecha…"></div>
      <div id="adj-lista"></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab"><h3>Órdenes y fórmulas</h3><span class="chip">${FICHA.ordenes.length}</span><button class="btn chico pri" style="margin-left:auto" id="btn-nueva-orden">${ICO.mas} Nueva orden</button></div>
      <div id="ord-lista"></div>
    </div></div>`;
  if (innerWidth < 1000) $("#ex-grid").style.gridTemplateColumns = "1fr";
  const pintarAdj = () => {
    const nq = norm($("#adj-q").value);
    const lista = FICHA.adjuntos.filter((a) => !nq || norm(a.nombre + " " + a.archivo + " " + fCorta(a.fecha)).includes(nq));
    $("#adj-lista").innerHTML = lista.length ? `<table class="tabla"><tbody>${lista.map((a) => `<tr class="clic" data-adj="${a.id}">
      <td style="width:28px">${ICO.archivo.replace("<svg", '<svg width="18" height="18"')}</td>
      <td><b>${h(a.nombre)}</b><div class="muted" style="font-size:12px">${fCorta(a.fecha)} · ${h((a.archivo || "").split(".").pop().toUpperCase())}${a.registrado_por ? " · " + h(a.registrado_por) : ""}</div></td>
      <td style="text-align:right;white-space:nowrap">${a.storage_path ? `<button class="btn chico" data-ver="${a.id}">Ver / imprimir</button>` : `<span class="chip aviso" title="El archivo aún no se ha subido desde el sistema anterior">Pendiente</span>`}</td></tr>`).join("")}</tbody></table>` : `<div class="vacio">Sin adjuntos</div>`;
    $$("#adj-lista [data-adj]").forEach((tr) => (tr.onclick = () => verAdjunto(FICHA.adjuntos.find((a) => String(a.id) === tr.dataset.adj))));
  };
  $("#adj-q").oninput = pintarAdj;
  pintarAdj();
  $("#adj-file").onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const nombre = prompt("Nombre del documento", f.name.replace(/\.[^.]+$/, "")) || f.name;
      const ruta = `${p.id}/${Date.now()}_${f.name.normalize("NFD").replace(/[^\w.-]+/g, "_")}`;
      toast("Subiendo " + f.name + "…");
      const { error } = await sb.storage.from("adjuntos").upload(ruta, f, { contentType: f.type || undefined });
      if (error) { toast("Error subiendo: " + traducirError(error), "error"); continue; }
      await db(sb.from("adjuntos").insert({ paciente_id: p.id, nombre, archivo: f.name, storage_path: ruta, mime: f.type, tamano: f.size, fecha: ahoraLocal(), registrado_por: S.perfil.nombre }));
    }
    if (files.length) { toast("Archivo(s) adjuntados", "ok"); recargarFicha("examenes"); }
  };
  const ords = FICHA.ordenes;
  $("#ord-lista").innerHTML = ords.length ? ords.map((o) => `<div class="doc cerrado" style="margin:10px 12px">
      <div class="doc-cab"><span class="fecha">${fCorta(o.fecha)}</span><span class="chip">${h(o.categoria)}</span><span class="resumen">${h(o.nombre)} — ${h(o.contenido.replace(/\s+/g, " ").slice(0, 80))}</span></div>
      <div class="doc-cuerpo"><div style="white-space:pre-wrap;margin-top:10px">${h(o.contenido)}</div>
        <div class="muted" style="font-size:12px;margin-top:8px">${h(o.profesional || "")}</div>
        <div style="margin-top:10px;display:flex;gap:8px"><button class="btn chico" data-imp-ord="${o.id}">${ICO.imprimir} Imprimir</button><button class="btn chico" data-rep-ord="${o.id}">Repetir orden</button></div></div></div>`).join("")
    : `<div class="vacio">Sin órdenes registradas</div>`;
  $$("#ord-lista .doc-cab").forEach((c) => (c.onclick = () => c.parentElement.classList.toggle("cerrado")));
  $$("[data-imp-ord]").forEach((b) => (b.onclick = () => imprimirOrden(p, ords.find((o) => String(o.id) === b.dataset.impOrd))));
  $$("[data-rep-ord]").forEach((b) => (b.onclick = () => { const o = ords.find((x) => String(x.id) === b.dataset.repOrd); formOrden(p, null, o); }));
  $("#btn-nueva-orden").onclick = () => formOrden(p, null);
}

async function verAdjunto(a) {
  if (!a) return;
  if (!a.storage_path) {
    modal({ titulo: h(a.nombre), cuerpo: `<div class="alerta aviso">Este archivo (<span class="mono">${h(a.archivo)}</span>) viene del sistema anterior y todavía no se ha subido. Súbalo desde <a href="#/importar">Importar datos → Archivos adjuntos</a>.</div>` });
    return;
  }
  const { data, error } = await sb.storage.from("adjuntos").createSignedUrl(a.storage_path, 600);
  if (error) return toast("No se pudo abrir el archivo: " + traducirError(error), "error");
  const url = data.signedUrl;
  const esImg = /^image\//.test(a.mime || "") || /\.(jpe?g|png|gif|webp)$/i.test(a.archivo || "");
  modal({
    titulo: h(a.nombre), ancho: "xancho",
    cuerpo: esImg ? `<img src="${h(url)}" style="max-width:100%;border-radius:8px;display:block;margin:auto">` : `<iframe class="adj-prev" src="${h(url)}"></iframe>`,
    pie: `<span class="muted" style="margin-right:auto;font-size:12.5px">${fCorta(a.fecha)} · ${h(a.archivo || "")}</span><a class="btn" href="${h(url)}" target="_blank" rel="noopener">Abrir en pestaña nueva (imprimir)</a><a class="btn pri" href="${h(url)}&download=${encodeURIComponent(a.archivo || a.nombre)}">Descargar</a>`
  });
}

/* ---- Órdenes / fórmulas ---- */
async function formOrden(p, consultaId, base = null) {
  const plantillas = await db(sb.from("plantillas").select("*").order("nombre"));
  let cat = base?.categoria || "Laboratorio";
  const titulos = { Laboratorio: "Orden de exámenes de laboratorio", "Imágenes": "Orden de imágenes diagnósticas", Medicamento: "Fórmula médica", Otro: "Orden médica" };
  const m = modal({
    titulo: base ? "Repetir orden" : "Nueva orden / fórmula", ancho: "xancho",
    cuerpo: `<div class="rejilla" style="grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)">
      <div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">${CATEGORIAS_ORDEN.map((c) => `<button type="button" class="btn chico ${c === cat ? "pri" : ""}" data-cat="${c}">${c}</button>`).join("")}</div>
        <input class="inp" id="pl-q" placeholder="Buscar plantilla…" style="margin-bottom:8px">
        <div class="lista-check" id="pl-lista" style="max-height:380px"></div>
      </div>
      <div class="rejilla" style="align-content:start">
        <div class="campo"><label>Título</label><input id="o-nombre" value="${h(base?.nombre || titulos[cat])}"></div>
        <div class="campo"><label>Contenido (editable)</label><textarea id="o-cont" rows="14">${h(base?.contenido || "")}</textarea></div>
      </div></div>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn" data-g>Guardar</button><button class="btn pri" data-gi>${ICO.imprimir} Guardar e imprimir</button>`
  });
  const el = m.el;
  const pintarLista = () => {
    const nq = norm($("#pl-q", el).value);
    const l = plantillas.filter((x) => x.categoria === cat && (!nq || norm(x.nombre + " " + x.contenido).includes(nq)));
    $("#pl-lista", el).innerHTML = l.length ? l.map((x) => `<label><input type="checkbox" data-pl="${x.id}"> <span style="flex:1">${h(x.nombre.replace(/^[ERM] /, ""))}</span></label>`).join("") : `<div class="vacio" style="padding:16px">Sin plantillas en esta categoría</div>`;
    $$("[data-pl]", el).forEach((cb) => (cb.onchange = () => {
      const pl = plantillas.find((x) => String(x.id) === cb.dataset.pl);
      const ta = $("#o-cont", el);
      const txt = pl.contenido.trim() || pl.nombre.replace(/^[ERM] /, "");
      if (cb.checked) ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + txt;
      else ta.value = ta.value.split("\n").filter((ln) => ln.trim() !== txt).join("\n");
    }));
  };
  $$("[data-cat]", el).forEach((b) => (b.onclick = () => {
    cat = b.dataset.cat;
    $$("[data-cat]", el).forEach((x) => x.classList.toggle("pri", x === b));
    if (Object.values(titulos).includes($("#o-nombre", el).value)) $("#o-nombre", el).value = titulos[cat];
    pintarLista();
  }));
  $("#pl-q", el).oninput = pintarLista;
  pintarLista();
  $("[data-x]", el).onclick = m.cerrar;
  const guardar = async (imp) => {
    const contenido = $("#o-cont", el).value.trim();
    if (!contenido) return toast("La orden está vacía", "error");
    const fila = { paciente_id: p.id, consulta_id: consultaId, categoria: cat, nombre: $("#o-nombre", el).value.trim() || titulos[cat], contenido, profesional: S.perfil.firma_linea1 || S.perfil.nombre, fecha: ahoraLocal() };
    const o = await db(sb.from("ordenes").insert(fila).select().single(), "No se pudo guardar la orden");
    m.cerrar(); toast("Orden guardada", "ok");
    FICHA.ordenes.unshift(o);
    if (imp) imprimirOrden(p, o);
    if (rutaActual().p[1] === "examenes") recargarFicha("examenes");
  };
  $("[data-g]", el).onclick = () => guardar(false);
  $("[data-gi]", el).onclick = () => guardar(true);
}

function imprimirOrden(p, o) {
  imprimir(`${encabezadoImpresion()}
    <h2 style="font-size:13pt;margin:0 0 8px;text-transform:uppercase">${h(o.nombre)}</h2>
    <div style="margin-bottom:8px"><b>Fecha:</b> ${h(fFechaHora(o.fecha))}</div>
    ${bloquePacienteImpresion(p)}
    <div class="imp-orden">${h(o.contenido)}</div>
    ${firmaImpresion(o.profesional)}`);
}

/* ---- Pestaña: Citas ---- */
function tabCitas(el, p) {
  el.innerHTML = `<div class="tarjeta"><div class="t-cab"><h3>Historial de citas</h3><button class="btn chico pri" style="margin-left:auto" id="c-agendar">${ICO.mas} Agendar</button></div>
    ${FICHA.citas.length ? `<div class="scroll-x"><table class="tabla"><thead><tr><th>Fecha</th><th>Hora</th><th>Clasificación</th><th>Estado</th><th>Observación</th></tr></thead><tbody>
    ${FICHA.citas.map((c) => `<tr><td>${fDia(c.fecha)} ${c.fecha.slice(0, 4)}</td><td>${hora12(c.hora_inicio.slice(0, 5))}</td><td><span class="leyenda"><span style="--c:${colorClasif(c.clasificacion, c.tipo)}">${h(c.clasificacion || c.tipo)}</span></span></td>
      <td><span class="chip ${ESTADOS[c.estado].cls}">${ESTADOS[c.estado].t}</span></td><td>${h([c.observacion, c.motivo_cancelacion].filter(Boolean).join(" · "))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="vacio">Sin citas</div>`}</div>`;
  $("#c-agendar").onclick = () => formCita({ fecha: hoyISO(), paciente: p });
}

/* ---- Pestaña: Datos personales ---- */
function tabDatos(el, p) {
  const fila = (t, v) => `<dt>${t}</dt><dd>${h(v || "—")}</dd>`;
  el.innerHTML = `<div class="tarjeta"><div class="t-cab"><h3>Datos personales</h3><button class="btn chico pri" style="margin-left:auto" id="d-editar">${ICO.editar} Editar</button></div>
    <div class="t-cuerpo rejilla r2">
      <dl class="kv">${fila("Tipo documento", p.tipo_documento)}${fila("Número", p.numero_documento)}${fila("No. historia", p.no_historia)}${fila("Nacimiento", p.fecha_nacimiento ? fCorta(p.fecha_nacimiento) + " (" + edad(p.fecha_nacimiento) + ")" : "")}${fila("Lugar de nacimiento", p.lugar_nacimiento)}${fila("Sexo", p.genero)}${fila("Estado civil", p.estado_civil)}${fila("Ocupación", p.ocupacion)}${fila("Nombre madre", p.nombre_madre)}${fila("Nombre padre", p.nombre_padre)}</dl>
      <dl class="kv">${fila("Celular", p.telefono_movil)}${fila("Teléfono", p.telefono)}${fila("Tel. oficina", p.telefono_oficina)}${fila("Otro teléfono", p.telefono_otro)}${fila("Correo", p.correo)}${fila("Dirección", p.direccion)}${fila("Residencia", [p.lugar_residencia, p.zona].filter(Boolean).join(" · "))}${fila("Entidad", [p.entidad, p.vinculacion].filter(Boolean).join(" · "))}${fila("EPS", p.eps)}${fila("No. afiliación", p.no_afiliacion)}${fila("Responsable", [p.responsable, p.responsable_parentesco, p.responsable_telefono].filter(Boolean).join(" · "))}${fila("Acompañante", [p.acompanante, p.acompanante_telefono].filter(Boolean).join(" · "))}${fila("Remitido", p.remitido)}</dl>
    </div>
    ${p.registro_seguimiento ? `<details style="padding:0 16px 16px"><summary class="muted" style="cursor:pointer">Registro de seguimiento del sistema anterior</summary><pre class="log" style="margin-top:8px">${h(p.registro_seguimiento)}</pre></details>` : ""}
  </div>`;
  $("#d-editar").onclick = () => formPaciente(p, (n) => { FICHA.p = n; enrutar(); });
}
