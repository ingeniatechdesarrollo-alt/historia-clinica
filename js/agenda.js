/* =============================================================
   AHP Web · Agenda (día / semana), citas, sala de espera
   ============================================================= */
"use strict";

VISTAS.agenda = async (p, q) => {
  if (q.fecha) S.fecha = q.fecha;
  if (q.vista) S.vista = q.vista;
  await renderAgenda(false);
};

function agendaActual() { return S.agendas.find((a) => a.id === S.agendaId) || null; }

function slotsDelDia(ag, fecha) {
  if (!ag) return { slots: [], almuerzo: null };
  const hor = (ag.horarios || []).find((x) => x.dia === diaSemana(fecha));
  if (!hor) return { slots: [], almuerzo: null };
  const paso = ag.intervalo_min || 15, slots = [];
  const rango = (a, b) => { if (!a || !b) return; for (let m = minutos(a); m < minutos(b); m += paso) slots.push(hhmm(m)); };
  rango(hor.manana_inicio, hor.manana_fin);
  rango(hor.tarde_inicio, hor.tarde_fin);
  const almuerzo = hor.manana_fin && hor.tarde_inicio ? { desde: hor.manana_fin.slice(0, 5), hasta: hor.tarde_inicio.slice(0, 5) } : null;
  return { slots, almuerzo };
}

async function cargarCitas(desde, hasta) {
  let qy = sb.from("citas")
    .select("*, paciente:pacientes(id,nombre_completo,numero_documento,tipo_documento,telefono,telefono_movil,entidad,fecha_nacimiento)")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha").order("hora_inicio");
  if (S.agendaId) qy = qy.eq("agenda_id", S.agendaId);
  return db(qy);
}

async function renderAgenda(soloDatos) {
  const ag = agendaActual();
  const cont = $("#principal");
  if (!soloDatos || !$("#agenda-cuerpo")) {
    cont.innerHTML = `
      <div class="cabecera">
        <div><h1>Agenda</h1><div class="sub">${ag ? h(ag.nombre) : "Sin agenda configurada"}</div></div>
        <div class="der">
          ${S.agendas.length > 1 ? `<select class="inp" id="sel-agenda" style="width:auto">${S.agendas.map((a) => `<option value="${a.id}" ${a.id === S.agendaId ? "selected" : ""}>${h(a.nombre)}</option>`).join("")}</select>` : ""}
          <button class="btn" id="btn-vista">${S.vista === "dia" ? "Ver semana" : "Ver día"}</button>
          <button class="btn pri" id="btn-nueva-cita">${ICO.mas} Agendar cita</button>
        </div>
      </div>
      ${!ag ? `<div class="alerta aviso" style="margin-bottom:14px">No hay agendas creadas. Créela en <a href="#/config">Configuración</a> o importe los datos del sistema anterior en <a href="#/importar">Importar datos</a>.</div>` : ""}
      <div class="agenda-wrap">
        <div class="tarjeta">
          <div class="t-cab" style="flex-wrap:wrap">
            <div class="agenda-nav">
              <button class="btn chico" id="ag-prev" aria-label="Anterior">${ICO.izq}</button>
              <button class="btn chico" id="ag-hoy">Hoy</button>
              <button class="btn chico" id="ag-next" aria-label="Siguiente">${ICO.der}</button>
              <input type="date" class="inp" id="ag-fecha" style="width:auto;padding:5px 8px" value="${S.fecha}">
            </div>
            <div class="agenda-fecha" id="ag-titulo"></div>
          </div>
          <div id="agenda-cuerpo"><div class="cargando"><span class="spinner"></span></div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="tarjeta"><div class="t-cab"><h3>Sala de espera</h3><span class="chip aviso" id="espera-cnt">0</span></div><div id="sala-espera"></div></div>
          <div class="tarjeta"><div class="t-cab"><h3>Resumen del día</h3></div><div class="t-cuerpo" id="resumen-dia"></div></div>
          <div class="tarjeta"><div class="t-cab"><h3>Notas del día</h3><button class="btn chico fantasma" id="btn-nota" style="margin-left:auto">${ICO.mas}</button></div><div id="notas-dia"></div></div>
          <div class="tarjeta"><div class="t-cuerpo"><div class="leyenda">${CLASIF.map((c) => `<span style="--c:${c.c}">${c.v}</span>`).join("")}<span style="--c:var(--c-personal)">Personal</span></div>
            <p class="muted" style="margin:10px 0 0;font-size:12px">Doble clic en una cita abre la historia clínica del paciente.</p></div></div>
        </div>
      </div>`;
    const moverDias = (n) => { S.fecha = sumarDias(S.fecha, n); renderAgenda(true); };
    $("#ag-prev").onclick = () => moverDias(S.vista === "dia" ? -1 : -7);
    $("#ag-next").onclick = () => moverDias(S.vista === "dia" ? 1 : 7);
    $("#ag-hoy").onclick = () => { S.fecha = hoyISO(); renderAgenda(true); };
    $("#ag-fecha").onchange = (e) => { if (e.target.value) { S.fecha = e.target.value; renderAgenda(true); } };
    $("#btn-vista").onclick = () => { S.vista = S.vista === "dia" ? "semana" : "dia"; renderAgenda(false); };
    $("#btn-nueva-cita").onclick = () => formCita({ fecha: S.fecha });
    $("#btn-nota").onclick = () => nuevaNotaDia();
    const sel = $("#sel-agenda");
    if (sel) sel.onchange = () => { S.agendaId = Number(sel.value); local.set("agenda", S.agendaId); renderAgenda(false); };
  }
  if (!$("#ag-fecha")) return;
  $("#ag-fecha").value = S.fecha;
  if (S.vista === "dia") await pintarDia(ag);
  else await pintarSemana(ag);
}

async function pintarDia(ag) {
  $("#ag-titulo").textContent = mayus(fLarga(S.fecha)) + (S.fecha === hoyISO() ? " · hoy" : "");
  const [citas, notas] = await Promise.all([
    cargarCitas(S.fecha, S.fecha),
    S.agendaId ? db(sb.from("agenda_notas").select("*").eq("agenda_id", S.agendaId).eq("fecha", S.fecha).order("created_at")) : []
  ]);
  if (!$("#agenda-cuerpo")) return; // el usuario ya cambió de pantalla
  const activas = citas.filter((c) => c.estado !== "cancelada");
  const canceladas = citas.filter((c) => c.estado === "cancelada");
  const { slots, almuerzo } = slotsDelDia(ag, S.fecha);
  const porHora = {};
  activas.forEach((c) => { const k = c.hora_inicio.slice(0, 5); (porHora[k] = porHora[k] || []).push(c); });
  const horas = Array.from(new Set([...slots, ...Object.keys(porHora)])).sort();
  const ahora = new Date();
  const esPasado = (hh) => S.fecha < hoyISO() || (S.fecha === hoyISO() && minutos(hh) + (ag?.intervalo_min || 15) <= ahora.getHours() * 60 + ahora.getMinutes());
  let html = "";
  let almuerzoPuesto = false;
  if (!horas.length) {
    html = `<div class="vacio">No hay horario de atención para este día.<br><button class="btn chico" style="margin-top:10px" onclick="formCita({fecha:S.fecha})">${ICO.mas} Agendar de todas formas</button></div>`;
  }
  for (const hh of horas) {
    if (almuerzo && !almuerzoPuesto && hh >= almuerzo.hasta) {
      html += `<div class="slot almuerzo"><div class="hora">${horaCorta(almuerzo.desde)}</div><div class="contenido muted" style="font-size:12px">Receso</div></div>`;
      almuerzoPuesto = true;
    }
    const lista = porHora[hh] || [];
    const fuera = !slots.includes(hh);
    if (!lista.length) {
      html += `<div class="slot libre" data-hora="${hh}"><div class="hora">${horaCorta(hh)}</div><div class="contenido"><span class="mas">+ Agendar a las ${hora12(hh)}</span></div></div>`;
    } else {
      html += `<div class="slot ${fuera ? "fuera" : ""}"><div class="hora">${horaCorta(hh)}</div><div class="contenido">${lista.map((c) => tarjetaCita(c, esPasado(hh))).join("")}</div></div>`;
    }
  }
  if (canceladas.length) {
    html += `<details style="padding:10px 14px;border-top:1px solid var(--borde)"><summary class="muted" style="cursor:pointer">${canceladas.length} cita(s) cancelada(s)</summary><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${canceladas.map((c) => tarjetaCita(c, true)).join("")}</div></details>`;
  }
  $("#agenda-cuerpo").innerHTML = `<div class="slots">${html}</div>`;
  $$("#agenda-cuerpo .slot.libre").forEach((el) => (el.onclick = () => formCita({ fecha: S.fecha, hora: el.dataset.hora })));
  enlazarCitas($("#agenda-cuerpo"), citas);
  pintarLateral(activas, notas);
}

function tarjetaCita(c, pasada) {
  const nombre = c.paciente?.nombre_completo || c.paciente_nombre || "(sin paciente)";
  const est = ESTADOS[c.estado] || ESTADOS.asignada;
  const tel = c.paciente ? (c.paciente.telefono_movil || c.paciente.telefono || "") : "";
  const det = [c.paciente ? `${abrevDoc(c.paciente.tipo_documento)} ${c.paciente.numero_documento || ""}` : "", c.paciente?.entidad, tel, c.observacion].filter(Boolean).join(" · ");
  return `<div class="cita estado-${c.estado} ${pasada && c.estado === "asignada" ? "pasada" : ""}" data-id="${c.id}" style="--c:${colorClasif(c.clasificacion, c.tipo)}" title="Doble clic: abrir historia clínica">
    <div class="info"><div class="clas">${h(c.clasificacion || c.tipo)}${c.hora_fin ? ` · ${hora12(c.hora_inicio.slice(0, 5))} – ${hora12(c.hora_fin.slice(0, 5))}` : ""}</div>
      <div class="nom">${h(nombre)}</div>${det ? `<div class="det">${h(det)}</div>` : ""}</div>
    ${c.estado !== "asignada" ? `<span class="chip ${est.cls}">${est.t}</span>` : ""}
  </div>`;
}

function enlazarCitas(raiz, citas) {
  const mapa = Object.fromEntries(citas.map((c) => [c.id, c]));
  $$(".cita", raiz).forEach((el) => {
    const c = mapa[el.dataset.id];
    let t = null;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      clearTimeout(t);
      t = setTimeout(() => menuCita(c, ev.clientX, ev.clientY), 230);
    });
    el.addEventListener("dblclick", (ev) => {
      ev.stopPropagation();
      clearTimeout(t);
      abrirHistoriaDesdeCita(c);
    });
  });
}

function abrirHistoriaDesdeCita(c) {
  if (!c.paciente_id) { toast("Esta cita no tiene un paciente registrado asociado", "error"); return; }
  location.hash = `#/paciente/${c.paciente_id}/resumen?cita=${c.id}`;
}

function cerrarMenus() { $$(".menu-flot").forEach((m) => m.remove()); }
document.addEventListener("click", (e) => { if (!e.target.closest(".menu-flot")) cerrarMenus(); });

function menuCita(c, x, y) {
  cerrarMenus();
  const m = document.createElement("div");
  m.className = "menu-flot";
  const nombre = c.paciente?.nombre_completo || c.paciente_nombre || "(sin paciente)";
  const est = c.estado;
  const btn = (accion, texto, cls = "") => `<button data-a="${accion}" class="${cls}">${texto}</button>`;
  m.innerHTML = `
    <div class="mf-tit"><b>${h(nombre)}</b><span class="muted" style="font-size:12px">${fDia(c.fecha)} · ${hora12(c.hora_inicio.slice(0, 5))} · ${h(c.clasificacion || c.tipo)}</span><br><span class="chip ${ESTADOS[est].cls}" style="margin-top:5px">${ESTADOS[est].t}</span></div>
    ${c.paciente_id ? btn("historia", "Abrir historia clínica") : ""}
    ${c.paciente_id && est !== "cancelada" ? btn("atender", "Atender ahora (nueva consulta)") : ""}
    <hr>
    ${est !== "cancelada" && est !== "confirmada" && est !== "atendida" ? btn("confirmar", "Confirmar asistencia") : ""}
    ${est !== "cancelada" && est !== "en_espera" && est !== "atendida" ? btn("llegada", "Llegó · pasar a sala de espera") : ""}
    ${est !== "cancelada" && est !== "atendida" ? btn("atendida", "Marcar como atendida") : ""}
    ${est !== "cancelada" && est !== "no_asistio" ? btn("no_asistio", "No asistió") : ""}
    ${est !== "asignada" && est !== "cancelada" ? btn("asignada", "Volver a 'asignada'") : ""}
    <hr>
    ${btn("editar", "Editar / reprogramar")}
    ${est === "cancelada" ? btn("restaurar", "Restaurar cita") : btn("cancelar", "Cancelar cita", "rojo")}`;
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px";
  m.onclick = async (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a) return;
    cerrarMenus();
    const cambiar = async (campos, msg) => {
      await db(sb.from("citas").update(campos).eq("id", c.id), "No se pudo actualizar");
      toast(msg, "ok");
      renderAgenda(true);
    };
    if (a === "historia") abrirHistoriaDesdeCita(c);
    else if (a === "atender") {
      await db(sb.from("citas").update({ estado: "en_atencion" }).eq("id", c.id));
      location.hash = `#/paciente/${c.paciente_id}/nueva?cita=${c.id}`;
    }
    else if (a === "confirmar") confirmarCita(c);
    else if (a === "llegada") cambiar({ estado: "en_espera", llegada_en: new Date().toISOString() }, "Paciente en sala de espera");
    else if (a === "atendida") cambiar({ estado: "atendida" }, "Cita marcada como atendida");
    else if (a === "no_asistio") cambiar({ estado: "no_asistio" }, "Marcada como no asistió");
    else if (a === "asignada") cambiar({ estado: "asignada" }, "Estado restablecido");
    else if (a === "editar") formCita(c);
    else if (a === "cancelar") cancelarCita(c);
    else if (a === "restaurar") cambiar({ estado: "asignada", motivo_cancelacion: null, cancelada_en: null, cancelada_por: null }, "Cita restaurada");
  };
}

function confirmarCita(c) {
  const m = modal({
    titulo: "Confirmar asistencia",
    cuerpo: `<div class="campo"><label>¿Con quién se confirmó? (opcional)</label><input id="conf-contacto" placeholder="Ej: el paciente, la hija, por WhatsApp…"></div>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>Confirmar</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  $("[data-ok]", m.el).onclick = async () => {
    await db(sb.from("citas").update({ estado: "confirmada", confirmada_en: new Date().toISOString(), confirmacion_contacto: $("#conf-contacto", m.el).value || null }).eq("id", c.id));
    m.cerrar(); toast("Cita confirmada", "ok"); renderAgenda(true);
  };
}

function cancelarCita(c) {
  const motivos = ["Solicitud del paciente", "Imprevisto por actividad personal o familiar", "Enfermedad del paciente", "Reprogramada", "Cancelada por el médico", "Otro"];
  const m = modal({
    titulo: "Cancelar cita",
    cuerpo: `<div class="rejilla"><div class="campo"><label>Motivo</label><select id="can-motivo">${motivos.map((x) => `<option>${x}</option>`).join("")}</select></div>
      <div class="campo"><label>¿Quién cancela?</label><input id="can-quien" value="${h(c.paciente?.nombre_completo || "")}"></div>
      <div class="campo"><label>Detalle (opcional)</label><input id="can-det"></div></div>`,
    pie: `<button class="btn" data-x>Volver</button><button class="btn peligro" data-ok>Cancelar cita</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  $("[data-ok]", m.el).onclick = async () => {
    const det = $("#can-det", m.el).value.trim();
    await db(sb.from("citas").update({
      estado: "cancelada", cancelada_en: new Date().toISOString(),
      motivo_cancelacion: $("#can-motivo", m.el).value + (det ? " · " + det : ""),
      cancelada_por: $("#can-quien", m.el).value || null
    }).eq("id", c.id));
    m.cerrar(); toast("Cita cancelada"); renderAgenda(true);
  };
}

function pintarLateral(activas, notas) {
  if (!$("#sala-espera")) return;
  const hoyEs = S.fecha === hoyISO();
  const espera = activas.filter((c) => c.estado === "en_espera" || c.estado === "en_atencion");
  $("#espera-cnt").textContent = espera.length;
  $("#sala-espera").innerHTML = espera.length
    ? espera.map((c) => `<div class="espera-item" data-id="${c.id}"><div style="flex:1;min-width:0"><b>${h(c.paciente?.nombre_completo || c.paciente_nombre)}</b><div class="muted" style="font-size:12px">${hora12(c.hora_inicio.slice(0, 5))} · ${c.llegada_en ? "llegó " + new Date(c.llegada_en).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : ""}</div></div><span class="chip ${ESTADOS[c.estado].cls}">${c.estado === "en_atencion" ? "En consulta" : "Esperando"}</span></div>`).join("")
    : `<div class="vacio" style="padding:18px">${hoyEs ? "Nadie en espera" : "—"}</div>`;
  $$("#sala-espera .espera-item").forEach((el) => {
    const c = espera.find((x) => String(x.id) === el.dataset.id);
    el.onclick = () => abrirHistoriaDesdeCita(c);
  });
  const medicas = activas.filter((c) => c.tipo !== "Cita Personal");
  const cuenta = (e) => medicas.filter((c) => c.estado === e).length;
  $("#resumen-dia").innerHTML = `<div class="kv" style="grid-template-columns:1fr auto">
    <dt>Citas médicas</dt><dd><b>${medicas.length}</b></dd>
    <dt>Confirmadas</dt><dd>${cuenta("confirmada")}</dd>
    <dt>Atendidas</dt><dd>${cuenta("atendida")}</dd>
    <dt>No asistieron</dt><dd>${cuenta("no_asistio")}</dd>
    ${CLASIF.map((x) => { const n = medicas.filter((c) => c.clasificacion === x.v).length; return n ? `<dt><span class="leyenda"><span style="--c:${x.c}">${x.v}</span></span></dt><dd>${n}</dd>` : ""; }).join("")}
  </div>`;
  $("#notas-dia").innerHTML = notas.length
    ? notas.map((n) => `<div class="espera-item" style="cursor:default"><div style="flex:1;white-space:pre-wrap;font-size:13px">${h(n.nota)}</div><button class="btn chico fantasma" data-borrar="${n.id}" title="Borrar">✕</button></div>`).join("")
    : `<div class="vacio" style="padding:16px">Sin notas</div>`;
  $$("#notas-dia [data-borrar]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("¿Borrar esta nota?", { peligro: true, boton: "Borrar" }))) return;
    await db(sb.from("agenda_notas").delete().eq("id", b.dataset.borrar)); renderAgenda(true);
  }));
}

function nuevaNotaDia() {
  if (!S.agendaId) return toast("Primero cree una agenda", "error");
  const m = modal({
    titulo: `Nota para ${fLarga(S.fecha)}`,
    cuerpo: `<div class="campo"><label>Nota</label><textarea id="nota-txt" rows="4"></textarea></div>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>Guardar</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  $("[data-ok]", m.el).onclick = async () => {
    const t = $("#nota-txt", m.el).value.trim();
    if (!t) return;
    await db(sb.from("agenda_notas").insert({ agenda_id: S.agendaId, fecha: S.fecha, nota: t }));
    m.cerrar(); renderAgenda(true);
  };
}

async function pintarSemana(ag) {
  const lunes = lunesDe(S.fecha);
  const sabado = sumarDias(lunes, 5);
  $("#ag-titulo").textContent = `Semana del ${fCorta(lunes)} al ${fCorta(sabado)}`;
  const citas = await cargarCitas(lunes, sabado);
  if (!$("#agenda-cuerpo")) return;
  const activas = citas.filter((c) => c.estado !== "cancelada");
  let html = `<div class="semana" style="padding:12px">`;
  for (let i = 0; i < 6; i++) {
    const d = sumarDias(lunes, i);
    const del = activas.filter((c) => c.fecha === d);
    html += `<div class="dia-col ${d === hoyISO() ? "hoy" : ""}"><div class="dc-cab" data-dia="${d}"><span>${fDia(d)}</span><span class="muted">${del.length}</span></div>
      <div class="dc-cuerpo">${del.map((c) => tarjetaCita(c, d < hoyISO())).join("") || `<div class="muted" style="font-size:12px;padding:6px">—</div>`}</div></div>`;
  }
  $("#agenda-cuerpo").innerHTML = html + "</div>";
  $$("#agenda-cuerpo .dc-cab").forEach((el) => (el.onclick = () => { S.fecha = el.dataset.dia; S.vista = "dia"; renderAgenda(false); }));
  enlazarCitas($("#agenda-cuerpo"), citas);
  const hoyCitas = S.fecha >= lunes && S.fecha <= sabado ? activas.filter((c) => c.fecha === hoyISO()) : [];
  pintarLateral(hoyCitas, []);
}

/* ---------------- Formulario de cita ---------------- */
async function formCita(c = {}) {
  const ag = agendaActual();
  if (!ag) return toast("Primero cree una agenda en Configuración", "error");
  const editar = !!c.id;
  let paciente = c.paciente || null;
  const m = modal({
    titulo: editar ? "Editar cita" : "Agendar cita",
    ancho: "ancho",
    cuerpo: `
      <div class="rejilla">
        <div class="campo"><label>Tipo de cita</label>
          <div style="display:flex;gap:16px;padding:4px 0">
            <label style="text-transform:none;font-size:14px;font-weight:500;letter-spacing:0;display:flex;gap:6px;align-items:center"><input type="radio" name="tipo" value="Cita Médica" ${c.tipo !== "Cita Personal" ? "checked" : ""}> Cita médica (paciente)</label>
            <label style="text-transform:none;font-size:14px;font-weight:500;letter-spacing:0;display:flex;gap:6px;align-items:center"><input type="radio" name="tipo" value="Cita Personal" ${c.tipo === "Cita Personal" ? "checked" : ""}> Actividad personal / bloqueo</label>
          </div>
        </div>
        <div id="bloque-paciente"></div>
        <div class="rejilla r4">
          <div class="campo"><label>Fecha</label><input type="date" id="c-fecha" value="${h(c.fecha || S.fecha)}" required></div>
          <div class="campo"><label>Hora</label><input type="time" id="c-hora" step="300" value="${h((c.hora_inicio || c.hora || "").slice(0, 5))}" required></div>
          <div class="campo"><label>Duración (min)</label><input type="number" id="c-dur" min="5" step="5" value="${c.hora_fin && c.hora_inicio ? minutos(c.hora_fin) - minutos(c.hora_inicio) : ag.intervalo_min || 15}"></div>
          <div class="campo"><label>Clasificación</label><select id="c-clas"></select></div>
        </div>
        <div id="horas-libres"></div>
        <div class="campo"><label>Observación</label><input id="c-obs" value="${h(c.observacion || "")}" placeholder="Ej: trae exámenes, primera vez, autorización #…"></div>
      </div>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>${editar ? "Guardar cambios" : "Agendar"}</button>`
  });
  const el = m.el;
  const tipo = () => $('input[name="tipo"]:checked', el).value;
  const pintarClasif = () => {
    const ops = tipo() === "Cita Personal" ? CLASIF_PERSONAL : CLASIF.map((x) => x.v);
    $("#c-clas", el).innerHTML = ops.map((o) => `<option ${o === c.clasificacion ? "selected" : ""}>${o}</option>`).join("");
  };
  const pintarPaciente = () => {
    const b = $("#bloque-paciente", el);
    if (tipo() === "Cita Personal") {
      b.innerHTML = `<div class="campo"><label>Descripción</label><input id="c-desc" value="${h(c.paciente_nombre || c.descripcion || "")}" placeholder="Ej: Congreso, cirugía en clínica, almuerzo…"></div>`;
      return;
    }
    if (paciente) {
      b.innerHTML = `<div class="campo"><label>Paciente</label>
        <div class="alerta info" style="display:flex;gap:12px;align-items:center">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;border-radius:10px">${h(iniciales(paciente.nombre_completo))}</div>
          <div style="flex:1;min-width:0"><b>${h(paciente.nombre_completo)}</b><div style="font-size:12.5px">${h(abrevDoc(paciente.tipo_documento))} ${h(paciente.numero_documento || "—")} · ${h(paciente.entidad || "")} ${paciente.telefono_movil || paciente.telefono ? "· Tel. " + h(paciente.telefono_movil || paciente.telefono) : ""}</div></div>
          <button class="btn chico" id="cambiar-pac">Cambiar</button></div></div>`;
      $("#cambiar-pac", el).onclick = () => { paciente = null; pintarPaciente(); };
      return;
    }
    b.innerHTML = `<div class="campo"><label>Paciente (debe estar registrado)</label>
      <div class="busqueda">${ICO.buscar}<input id="c-buscar" placeholder="Buscar por cédula, nombre o número de historia…" autocomplete="off"></div>
      <div id="c-resultados" style="margin-top:6px"></div>
      <div style="margin-top:6px"><button class="btn chico" id="c-nuevo-pac">${ICO.mas} Registrar paciente nuevo</button></div></div>`;
    const inp = $("#c-buscar", el), res = $("#c-resultados", el);
    const buscar = debounce(async () => {
      const q = inp.value.trim();
      if (q.length < 2) { res.innerHTML = ""; return; }
      res.innerHTML = `<span class="spinner"></span>`;
      const filas = await db(sb.rpc("buscar_pacientes", { q, limite: 8 }));
      if (inp.value.trim() !== q) return;
      res.innerHTML = filas.length
        ? `<div class="lista-check">${filas.map((f, i) => `<label data-i="${i}"><div style="flex:1"><b>${resaltar(f.nombre_completo, q)}</b><div class="muted" style="font-size:12px">${h(abrevDoc(f.tipo_documento))} ${resaltar(f.numero_documento || "—", q)} · ${h(f.entidad || "")}${f.ultima_consulta ? " · última consulta " + fCorta(f.ultima_consulta) : ""}</div></div></label>`).join("")}</div>`
        : `<div class="alerta aviso">No se encontró. Regístrelo como paciente nuevo.</div>`;
      $$("label[data-i]", res).forEach((l) => (l.onclick = () => { paciente = filas[l.dataset.i]; pintarPaciente(); }));
    }, 280);
    inp.oninput = buscar;
    inp.focus();
    $("#c-nuevo-pac", el).onclick = () => formPaciente(null, (nuevo) => { paciente = nuevo; pintarPaciente(); }, inp.value.trim());
  };
  const pintarLibres = async () => {
    const f = $("#c-fecha", el).value;
    if (!f) return;
    const { slots } = slotsDelDia(ag, f);
    const ocupadas = await db(sb.from("citas").select("id,hora_inicio").eq("agenda_id", ag.id).eq("fecha", f).neq("estado", "cancelada"));
    const oc = new Set(ocupadas.filter((x) => x.id !== c.id).map((x) => x.hora_inicio.slice(0, 5)));
    const libres = slots.filter((s) => !oc.has(s) && (f > hoyISO() || f === hoyISO()));
    $("#horas-libres", el).innerHTML = slots.length
      ? `<div class="campo"><label>Horas disponibles · ${h(fLarga(f))}</label><div style="display:flex;flex-wrap:wrap;gap:5px">${libres.map((s) => `<button type="button" class="btn chico" data-h="${s}">${hora12(s)}</button>`).join("") || '<span class="muted">No quedan horas libres este día</span>'}</div></div>`
      : `<div class="muted" style="font-size:12.5px">No hay horario configurado para ese día.</div>`;
    $$("[data-h]", el).forEach((b) => (b.onclick = () => { $("#c-hora", el).value = b.dataset.h; $$("[data-h]", el).forEach((x) => x.classList.toggle("pri", x === b)); }));
  };
  $$('input[name="tipo"]', el).forEach((r) => (r.onchange = () => { pintarClasif(); pintarPaciente(); }));
  $("#c-fecha", el).onchange = pintarLibres;
  pintarClasif(); pintarPaciente(); pintarLibres();
  $("[data-x]", el).onclick = m.cerrar;
  $("[data-ok]", el).onclick = async () => {
    const t = tipo();
    const fecha = $("#c-fecha", el).value, hora = $("#c-hora", el).value;
    if (!fecha || !hora) return toast("Indique fecha y hora", "error");
    if (t === "Cita Médica" && !paciente) return toast("Seleccione o registre el paciente", "error");
    const dur = Number($("#c-dur", el).value) || ag.intervalo_min || 15;
    const fila = {
      agenda_id: ag.id, fecha, hora_inicio: hora, hora_fin: hhmm(minutos(hora) + dur), tipo: t,
      clasificacion: $("#c-clas", el).value, observacion: $("#c-obs", el).value.trim() || null,
      paciente_id: t === "Cita Médica" ? paciente.id : null,
      paciente_nombre: t === "Cita Médica" ? paciente.nombre_completo : ($("#c-desc", el)?.value.trim() || "Actividad personal")
    };
    // ¿choca con otra cita?
    const choque = await db(sb.from("citas").select("id,paciente_nombre").eq("agenda_id", ag.id).eq("fecha", fecha).eq("hora_inicio", hora).neq("estado", "cancelada"));
    const otros = choque.filter((x) => x.id !== c.id);
    if (otros.length && !(await confirmar(`Ya hay ${otros.length} cita(s) a esa hora (${h(otros.map((x) => x.paciente_nombre).join(", "))}). ¿Agendar de todas formas?`, { boton: "Sí, agendar" }))) return;
    if (editar) {
      await db(sb.from("citas").update(fila).eq("id", c.id), "No se pudo guardar");
      toast("Cita actualizada", "ok");
    } else {
      fila.registro_usuario = S.perfil.nombre;
      await db(sb.from("citas").insert(fila), "No se pudo agendar");
      toast(`Cita agendada: ${fDia(fecha)} ${hora12(hora)}`, "ok");
    }
    m.cerrar();
    if (rutaActual().r === "agenda") { S.fecha = fecha; renderAgenda(true); }
    else enrutar();
  };
}
