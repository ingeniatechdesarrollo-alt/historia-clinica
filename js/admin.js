/* =============================================================
   AHP Web · Usuarios, configuración y auditoría
   ============================================================= */
"use strict";

/* ---------------- Usuarios ---------------- */
VISTAS.usuarios = async () => {
  const perfiles = await db(sb.from("perfiles").select("*").order("created_at"));
  $("#principal").innerHTML = `
    <div class="cabecera"><div><h1>Usuarios</h1><div class="sub">Todos los usuarios activos son administradores: pueden agendar, consultar historias y crear usuarios.</div></div>
      <div class="der"><button class="btn pri" id="btn-nuevo-u">${ICO.mas} Nuevo usuario</button></div></div>
    <div class="tarjeta scroll-x"><table class="tabla"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Firma en documentos</th><th>Agenda</th><th>Estado</th><th></th></tr></thead><tbody>
      ${perfiles.map((u) => `<tr>
        <td><b>${h(u.nombre)}</b>${u.id === S.perfil.id ? ' <span class="chip pri">Usted</span>' : ""}</td>
        <td>${h(u.email || "")}</td>
        <td>${h(ROLES[u.rol] || u.rol)}</td>
        <td>${h([u.firma_linea1, u.firma_linea2].filter(Boolean).join(" · ") || "—")}</td>
        <td>${h(S.agendas.find((a) => a.id === u.agenda_id)?.nombre || "—")}</td>
        <td>${u.activo ? '<span class="chip ok">Activo</span>' : '<span class="chip aviso">Inactivo</span>'}</td>
        <td style="text-align:right"><button class="btn chico" data-ed="${u.id}">${ICO.editar} Editar</button></td></tr>`).join("")}
    </tbody></table></div>
    <div class="alerta info" style="margin-top:14px">Para que los usuarios nuevos puedan entrar de inmediato, en Supabase → Authentication → Providers → Email debe estar desactivado <b>"Confirm email"</b>.</div>`;
  $("#btn-nuevo-u").onclick = () => formUsuario(null);
  $$("[data-ed]").forEach((b) => (b.onclick = () => formUsuario(perfiles.find((u) => u.id === b.dataset.ed))));
};

function formUsuario(u) {
  const nuevo = !u;
  u = u || { rol: "recepcion", activo: true };
  const m = modal({
    titulo: nuevo ? "Nuevo usuario" : "Editar usuario",
    cuerpo: `<form id="f-u" class="rejilla r2">
      <div class="campo span2"><label>Nombre completo</label><input name="nombre" value="${h(u.nombre || "")}" required></div>
      ${nuevo ? `<div class="campo"><label>Correo (usuario)</label><input type="email" name="email" required></div>
        <div class="campo"><label>Contraseña inicial</label><input name="clave" type="text" minlength="6" required value="${Math.random().toString(36).slice(2, 10)}"></div>` : ""}
      <div class="campo"><label>Rol</label><select name="rol">${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${u.rol === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="campo"><label>Agenda principal</label><select name="agenda_id"><option value="">—</option>${S.agendas.map((a) => `<option value="${a.id}" ${a.id === u.agenda_id ? "selected" : ""}>${h(a.nombre)}</option>`).join("")}</select></div>
      <div class="campo"><label>Firma · línea 1</label><input name="firma_linea1" value="${h(u.firma_linea1 || "")}" placeholder="Ej: Dr. Nombre Apellido"></div>
      <div class="campo"><label>Firma · línea 2</label><input name="firma_linea2" value="${h(u.firma_linea2 || "")}" placeholder="Ej: Reg. médico 1234-56"></div>
      ${!nuevo && u.id !== S.perfil.id ? `<label class="span2" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="activo" ${u.activo ? "checked" : ""}> Usuario activo (puede ingresar)</label>` : ""}
    </form>
    ${!nuevo ? `<p class="muted" style="font-size:12.5px;margin-bottom:0">Para cambiar la contraseña, el usuario puede usar "Cambiar mi contraseña" o un administrador puede hacerlo desde Supabase → Authentication.</p>` : ""}`,
    pie: `${!nuevo && u.id === S.perfil.id ? `<button class="btn" data-pw style="margin-right:auto">Cambiar mi contraseña</button>` : ""}<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>${nuevo ? "Crear usuario" : "Guardar"}</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  if ($("[data-pw]", m.el)) $("[data-pw]", m.el).onclick = async () => {
    const pw = prompt("Nueva contraseña (mínimo 6 caracteres)");
    if (!pw) return;
    const { error } = await sb.auth.updateUser({ password: pw });
    toast(error ? traducirError(error) : "Contraseña actualizada", error ? "error" : "ok");
  };
  $("[data-ok]", m.el).onclick = async () => {
    const form = $("#f-u", m.el);
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    const campos = { nombre: d.nombre.trim(), rol: d.rol, agenda_id: d.agenda_id ? Number(d.agenda_id) : null, firma_linea1: d.firma_linea1 || null, firma_linea2: d.firma_linea2 || null };
    if (nuevo) {
      // Cliente temporal: crea el usuario sin cerrar la sesión actual
      const temp = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "ahp-temp-" + Date.now() } });
      const { data, error } = await temp.auth.signUp({ email: d.email.trim(), password: d.clave, options: { data: { nombre: campos.nombre, rol: campos.rol } } });
      if (error) return toast(traducirError(error), "error");
      const id = data.user?.id;
      if (!id || (data.user.identities && data.user.identities.length === 0)) return toast("Ese correo ya está registrado", "error");
      await db(sb.from("perfiles").update({ ...campos, activo: true }).eq("id", id), "Usuario creado pero no se pudo activar");
      m.cerrar();
      modal({ titulo: "Usuario creado", cuerpo: `<p>Entregue estos datos a <b>${h(campos.nombre)}</b>:</p><div class="alerta info mono">Correo: ${h(d.email)}<br>Contraseña: ${h(d.clave)}</div><p class="muted" style="font-size:12.5px">Puede cambiar la contraseña después de ingresar (Usuarios → Editar → Cambiar mi contraseña).</p>` });
    } else {
      if (u.id !== S.perfil.id) campos.activo = !!d.activo;
      await db(sb.from("perfiles").update(campos).eq("id", u.id), "No se pudo guardar");
      if (u.id === S.perfil.id) Object.assign(S.perfil, campos);
      m.cerrar(); toast("Usuario actualizado", "ok");
    }
    enrutar();
  };
}

/* ---------------- Configuración ---------------- */
VISTAS.config = async () => {
  const enc = S.config.encabezado || {};
  const plantillas = await db(sb.from("plantillas").select("*").order("categoria").order("nombre"));
  const entidades = await db(sb.from("entidades").select("*").order("nombre"));
  const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const t5 = (x) => (x || "").slice(0, 5);
  $("#principal").innerHTML = `
    <div class="cabecera"><div><h1>Configuración</h1></div></div>
    <div class="rejilla" style="gap:16px">
      <div class="tarjeta"><div class="t-cab"><h3>Encabezado de documentos impresos</h3></div><div class="t-cuerpo">
        <form id="f-enc" class="rejilla r2">
          <div class="campo"><label>Línea 1 (nombre)</label><input name="linea1" value="${h(enc.linea1 || "")}"></div>
          <div class="campo"><label>Línea 2 (especialidad)</label><input name="linea2" value="${h(enc.linea2 || "")}"></div>
          <div class="campo"><label>Línea 3 (dirección)</label><input name="linea3" value="${h(enc.linea3 || "")}"></div>
          <div class="campo"><label>Teléfono</label><input name="telefono" value="${h(enc.telefono || "")}"></div>
        </form>
        <div style="text-align:right;margin-top:12px"><button class="btn pri" id="g-enc">Guardar encabezado</button></div></div></div>

      <div class="tarjeta"><div class="t-cab"><h3>Agendas y horario de atención</h3><button class="btn chico" style="margin-left:auto" id="n-ag">${ICO.mas} Nueva agenda</button></div>
        <div class="t-cuerpo">${S.agendas.length ? S.agendas.map((a) => `
          <form class="f-ag rejilla" data-id="${a.id}" style="border:1px solid var(--borde);border-radius:10px;padding:14px;margin-bottom:12px">
            <div class="rejilla r3">
              <div class="campo"><label>Nombre de la agenda</label><input name="nombre" value="${h(a.nombre)}"></div>
              <div class="campo"><label>Intervalo entre citas (min)</label><input type="number" name="intervalo_min" min="5" step="5" value="${a.intervalo_min}"></div>
              <label style="display:flex;gap:8px;align-items:center;margin-top:18px"><input type="checkbox" name="activo" ${a.activo ? "checked" : ""}> Activa</label>
            </div>
            <div class="scroll-x"><table class="tabla"><thead><tr><th>Día</th><th>Mañana desde</th><th>hasta</th><th>Tarde desde</th><th>hasta</th></tr></thead><tbody>
              ${[1, 2, 3, 4, 5, 6, 7].map((d) => { const hr = a.horarios.find((x) => x.dia === d) || {}; return `<tr><td>${DIAS[d]}</td>
                <td><input class="inp" type="time" name="mi${d}" value="${t5(hr.manana_inicio)}"></td><td><input class="inp" type="time" name="mf${d}" value="${t5(hr.manana_fin)}"></td>
                <td><input class="inp" type="time" name="ti${d}" value="${t5(hr.tarde_inicio)}"></td><td><input class="inp" type="time" name="tf${d}" value="${t5(hr.tarde_fin)}"></td></tr>`; }).join("")}
            </tbody></table></div>
            <div style="text-align:right"><button class="btn pri" type="submit">Guardar agenda</button></div>
          </form>`).join("") : `<div class="vacio">No hay agendas. Cree una o importe los datos del sistema anterior.</div>`}</div></div>

      <div class="tarjeta"><div class="t-cab"><h3>Plantillas de órdenes y fórmulas</h3><span class="chip">${plantillas.length}</span><button class="btn chico" style="margin-left:auto" id="n-pl">${ICO.mas} Nueva plantilla</button></div>
        <div class="t-cuerpo" style="padding:10px 16px"><input class="inp" id="pl-filtro" placeholder="Filtrar plantillas…"></div>
        <div style="max-height:420px;overflow:auto" id="pl-tabla"></div></div>

      <div class="tarjeta"><div class="t-cab"><h3>Entidades / aseguradoras</h3><span class="chip">${entidades.length}</span><button class="btn chico" style="margin-left:auto" id="n-ent">${ICO.mas} Agregar</button></div>
        <div class="t-cuerpo" style="display:flex;flex-wrap:wrap;gap:6px">${entidades.map((e) => `<span class="chip">${h(e.nombre)}</span>`).join("") || '<span class="muted">Sin entidades</span>'}</div></div>
    </div>`;

  $("#g-enc").onclick = async () => {
    const v = Object.fromEntries(new FormData($("#f-enc")));
    await db(sb.from("configuracion").upsert({ clave: "encabezado", valor: v }));
    S.config.encabezado = v; $("#marca-sub").textContent = v.linea1 || "AHP Web";
    toast("Encabezado guardado", "ok");
  };
  $$(".f-ag").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const id = Number(f.dataset.id);
    const d = Object.fromEntries(new FormData(f));
    await db(sb.from("agendas").update({ nombre: d.nombre, intervalo_min: Number(d.intervalo_min) || 15, activo: !!d.activo }).eq("id", id));
    const filas = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ agenda_id: id, dia: n, manana_inicio: d["mi" + n] || null, manana_fin: d["mf" + n] || null, tarde_inicio: d["ti" + n] || null, tarde_fin: d["tf" + n] || null }));
    await db(sb.from("agenda_horarios").delete().eq("agenda_id", id));
    const conHorario = filas.filter((x) => (x.manana_inicio && x.manana_fin) || (x.tarde_inicio && x.tarde_fin));
    if (conHorario.length) await db(sb.from("agenda_horarios").insert(conHorario));
    await cargarBase(); toast("Agenda guardada", "ok");
  }));
  $("#n-ag").onclick = async () => {
    const nombre = prompt("Nombre de la agenda (ej: nombre del médico)");
    if (!nombre) return;
    const a = await db(sb.from("agendas").insert({ nombre, intervalo_min: 15 }).select().single());
    await db(sb.from("agenda_horarios").insert([1, 2, 3, 4, 5].map((d) => ({ agenda_id: a.id, dia: d, manana_inicio: "07:00", manana_fin: "12:00", tarde_inicio: "14:00", tarde_fin: "17:00" }))));
    await cargarBase(); enrutar();
  };
  const pintarPl = () => {
    const nq = norm($("#pl-filtro").value);
    const l = plantillas.filter((x) => !nq || norm(x.nombre + " " + x.categoria + " " + x.contenido).includes(nq));
    $("#pl-tabla").innerHTML = `<table class="tabla"><thead><tr><th>Categoría</th><th>Nombre</th><th>Contenido</th><th></th></tr></thead><tbody>${l.map((x) => `<tr><td>${h(x.categoria)}</td><td><b>${h(x.nombre)}</b></td><td class="muted" style="white-space:pre-wrap;font-size:12.5px">${h(x.contenido.slice(0, 160))}</td><td style="white-space:nowrap"><button class="btn chico" data-epl="${x.id}">${ICO.editar}</button> <button class="btn chico peligro" data-bpl="${x.id}">✕</button></td></tr>`).join("")}</tbody></table>`;
    $$("[data-epl]").forEach((b) => (b.onclick = () => formPlantilla(plantillas.find((x) => String(x.id) === b.dataset.epl))));
    $$("[data-bpl]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmar("¿Eliminar esta plantilla?", { peligro: true, boton: "Eliminar" }))) return;
      await db(sb.from("plantillas").delete().eq("id", b.dataset.bpl)); enrutar();
    }));
  };
  $("#pl-filtro").oninput = pintarPl; pintarPl();
  $("#n-pl").onclick = () => formPlantilla(null);
  $("#n-ent").onclick = async () => {
    const n = prompt("Nombre de la entidad / aseguradora");
    if (!n) return;
    await db(sb.from("entidades").insert({ nombre: n.trim() })); _catalogos = null; enrutar();
  };
};

function formPlantilla(pl) {
  const m = modal({
    titulo: pl ? "Editar plantilla" : "Nueva plantilla",
    cuerpo: `<form id="f-pl" class="rejilla"><div class="rejilla r2">
      <div class="campo"><label>Categoría</label><select name="categoria">${CATEGORIAS_ORDEN.map((c) => `<option ${pl?.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="campo"><label>Nombre</label><input name="nombre" value="${h(pl?.nombre || "")}" required></div></div>
      <div class="campo"><label>Contenido</label><textarea name="contenido" rows="8">${h(pl?.contenido || "")}</textarea></div></form>`,
    pie: `<button class="btn" data-x>Cancelar</button><button class="btn pri" data-ok>Guardar</button>`
  });
  $("[data-x]", m.el).onclick = m.cerrar;
  $("[data-ok]", m.el).onclick = async () => {
    const f = $("#f-pl", m.el); if (!f.reportValidity()) return;
    const d = Object.fromEntries(new FormData(f));
    if (pl) await db(sb.from("plantillas").update(d).eq("id", pl.id)); else await db(sb.from("plantillas").insert(d));
    m.cerrar(); enrutar();
  };
}

/* ---------------- Auditoría ---------------- */
VISTAS.auditoria = async () => {
  $("#principal").innerHTML = `<div class="cabecera"><div><h1>Auditoría</h1><div class="sub">Registro de accesos y cambios (quién, qué y cuándo)</div></div>
    <div class="der"><select class="inp" id="au-acc" style="width:auto"><option value="">Todas las acciones</option><option value="CONSULTA_HISTORIA">Acceso a historias</option><option value="INSERT">Creaciones</option><option value="UPDATE">Modificaciones</option><option value="DELETE">Eliminaciones</option></select></div></div>
    <div class="tarjeta scroll-x" id="au-tabla"><div class="cargando"><span class="spinner"></span></div></div>`;
  const NOMBRES = { pacientes: "Paciente", consultas: "Documento clínico", notas_aclaratorias: "Nota aclaratoria", ordenes: "Orden", adjuntos: "Adjunto", citas: "Cita", perfiles: "Usuario" };
  const ACC = { INSERT: "Creó", UPDATE: "Modificó", DELETE: "Eliminó", CONSULTA_HISTORIA: "Abrió historia" };
  const pintar = async () => {
    let qy = sb.from("auditoria").select("*").order("fecha", { ascending: false }).limit(300);
    if ($("#au-acc").value) qy = qy.eq("accion", $("#au-acc").value);
    const filas = await db(qy);
    const idsPac = [...new Set(filas.map((f) => f.tabla === "pacientes" ? f.registro : f.detalle?.paciente_id || f.detalle?.despues?.paciente_id).filter(Boolean))];
    const pacs = idsPac.length ? await db(sb.from("pacientes").select("id,nombre_completo").in("id", idsPac.slice(0, 300))) : [];
    const nom = Object.fromEntries(pacs.map((p) => [p.id, p.nombre_completo]));
    $("#au-tabla").innerHTML = filas.length ? `<table class="tabla"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Registro</th><th>Paciente</th></tr></thead><tbody>
      ${filas.map((f) => { const pid = f.tabla === "pacientes" ? f.registro : f.detalle?.paciente_id || f.detalle?.despues?.paciente_id; return `<tr><td class="mono">${new Date(f.fecha).toLocaleString("es-CO")}</td><td>${h(f.usuario || "")}</td><td>${ACC[f.accion] || h(f.accion)}</td><td>${h(NOMBRES[f.tabla] || f.tabla)} <span class="muted mono">#${h(String(f.registro).slice(0, 8))}</span></td><td>${pid ? `<a href="#/paciente/${pid}/resumen">${h(nom[pid] || "ver")}</a>` : ""}</td></tr>`; }).join("")}</tbody></table>` : `<div class="vacio">Sin registros</div>`;
  };
  $("#au-acc").onchange = pintar;
  pintar();
};
