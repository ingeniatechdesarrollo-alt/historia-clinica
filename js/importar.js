/* =============================================================
   AHP Web · Importador desde ARCOCOV / ArbokCorp Health Professional (.mdb)
   Lee el archivo .mdb en el navegador (no se sube a ningún lado
   salvo los datos, directamente a su base de Supabase).
   ============================================================= */
"use strict";

const IMP = { db: null, tablas: null };

VISTAS.importar = async () => {
  $("#principal").innerHTML = `
    <div class="cabecera"><div><h1>Importar datos del sistema anterior</h1><div class="sub">ARCOCOV / ArbokCorp Health Professional · archivo <span class="mono">AHP Datos.mdb</span></div></div></div>
    <div class="rejilla" style="gap:16px">
      <div class="tarjeta"><div class="t-cab"><h3>1 · Base de datos (.mdb)</h3></div><div class="t-cuerpo">
        <p style="margin-top:0">Seleccione el archivo <b>AHP Datos.mdb</b>. Se lee en este equipo y se cargan pacientes, historias clínicas, evoluciones, órdenes, citas, plantillas y la lista de adjuntos.
        Puede repetir la importación con un archivo más reciente: <b>sólo se agregan los registros nuevos</b>; nada se duplica ni se borra.</p>
        <label class="btn pri">${ICO.subir} Seleccionar archivo .mdb<input type="file" id="imp-mdb" accept=".mdb,.accdb" hidden></label>
        <div id="imp-resumen" style="margin-top:14px"></div>
      </div></div>
      <div class="tarjeta"><div class="t-cab"><h3>2 · Archivos adjuntos (exámenes PDF / JPG)</h3></div><div class="t-cuerpo">
        <p style="margin-top:0">Los adjuntos no están dentro del .mdb: están en la carpeta de datos del programa anterior (por ejemplo <span class="mono">\\\\OFICINA1\\ArbokCorp Health Professional\\AHP Datos\\</span>, subcarpeta de adjuntos).
        Seleccione esa carpeta: la app busca cada archivo por su nombre y lo sube a su historia. Si se interrumpe, vuelva a ejecutarlo y continúa con los que falten.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label class="btn pri">${ICO.subir} Seleccionar carpeta de adjuntos<input type="file" id="imp-carpeta" webkitdirectory directory multiple hidden></label>
          <label class="btn">Seleccionar archivos sueltos<input type="file" id="imp-sueltos" multiple hidden></label>
        </div>
        <div id="imp-adj" style="margin-top:14px"></div>
      </div></div>
    </div>`;
  $("#imp-mdb").onchange = (e) => e.target.files[0] && leerMdb(e.target.files[0]);
  $("#imp-carpeta").onchange = (e) => subirAdjuntos(Array.from(e.target.files || []));
  $("#imp-sueltos").onchange = (e) => subirAdjuntos(Array.from(e.target.files || []));
};

function cargarScript(src) {
  return new Promise((res, rej) => {
    if (window.MDBReader) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  });
}

async function leerMdb(file) {
  const r = $("#imp-resumen");
  r.innerHTML = `<div class="cargando"><span class="spinner"></span> Leyendo ${h(file.name)} (${(file.size / 1048576).toFixed(1)} MB)…</div>`;
  try {
    await cargarScript("vendor/mdb-reader.js");
    const buf = await file.arrayBuffer();
    const lector = new window.MDBReader(window.Buffer.from(buf));
    const nombres = lector.getTableNames();
    const leer = (n) => (nombres.includes(n) ? lector.getTable(n).getData() : []);
    const T = {};
    for (const n of ["Pacientes", "Documentos", "DocumentosC", "DocumentoHistoriaClinica", "DocumentoEvolucion", "DocumentosP", "DocumentosAdjuntos",
      "CitasAsignadas", "CitasCanceladas", "Agendas", "AgendasHorario", "Apuntes", "Entidades", "Ocupaciones", "PrescripcionesMedicas", "OpcionesAHP", "Usuarios"]) T[n] = leer(n);
    if (!T.Pacientes.length) throw new Error("El archivo no parece ser una base de ARCOCOV / AHP (no tiene tabla Pacientes).");
    IMP.tablas = T;
    const fila = (t, n) => `<tr><td>${t}</td><td style="text-align:right" class="mono">${n.toLocaleString("es-CO")}</td></tr>`;
    r.innerHTML = `<div class="rejilla r2" style="align-items:start">
      <table class="tabla" style="border:1px solid var(--borde);border-radius:8px"><tbody>
        ${fila("Pacientes", T.Pacientes.length)}
        ${fila("Historias clínicas", T.DocumentoHistoriaClinica.length)}
        ${fila("Evoluciones", T.DocumentoEvolucion.length)}
        ${fila("Órdenes / prescripciones", T.DocumentosP.length)}
        ${fila("Adjuntos (lista)", T.DocumentosAdjuntos.length)}
        ${fila("Citas", T.CitasAsignadas.length)}
        ${fila("Citas canceladas", T.CitasCanceladas.length)}
        ${fila("Plantillas", T.PrescripcionesMedicas.length)}
        ${fila("Agendas", T.Agendas.length)}
      </tbody></table>
      <div>
        <div class="alerta info" style="margin-bottom:12px">Archivo leído correctamente. La importación puede tardar algunos minutos; no cierre esta pestaña.</div>
        <button class="btn pri" id="imp-go" style="height:42px">Importar todo a la base de datos</button>
        <div style="margin-top:14px" class="progreso"><div id="imp-barra"></div></div>
        <div id="imp-paso" class="muted" style="margin-top:6px;font-size:12.5px"></div>
      </div></div>
      <pre class="log oculto" id="imp-log" style="margin-top:14px"></pre>`;
    $("#imp-go").onclick = () => importarTodo();
  } catch (e) {
    console.error(e);
    r.innerHTML = `<div class="alerta error">No se pudo leer el archivo: ${h(e.message || e)}</div>`;
  }
}

/* ---- conversión de valores de Access ---- */
const iF = (d) => (d instanceof Date && !isNaN(d) ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : null);
const iH = (d) => (d instanceof Date && !isNaN(d) ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : null);
const iFH = (f, hr) => (iF(f) ? `${iF(f)} ${iH(hr) || iH(f) || "00:00:00"}` : null);
const tx = (v) => { if (v === null || v === undefined) return null; const s = String(v).replace(/\r\n/g, "\n").trim(); return s === "" ? null : s; };
function horaTexto(s) { // "09:30 am" -> "09:30"
  const m = /(\d{1,2}):(\d{2})\s*([ap])/i.exec(s || "");
  if (!m) return null;
  let H = Number(m[1]) % 12; if (/p/i.test(m[3])) H += 12;
  return `${pad(H)}:${m[2]}`;
}
function claveNombre(s) { return norm(s); }
function clavePaciente(p) { return p.NoHistoria ? "H:" + String(p.NoHistoria).trim() : "N:" + (tx(p.NoIdentificacion) || "") + "|" + claveNombre(p.Nombre); }
function categoriaPlantilla(n) { const c = String(n || "").trim()[0]; return c === "E" ? "Laboratorio" : c === "R" ? "Imágenes" : c === "M" ? "Medicamento" : "Otro"; }
function mimeDe(nombre) { const e = String(nombre).split(".").pop().toLowerCase(); return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[e] || "application/octet-stream"; }

async function importarTodo() {
  const T = IMP.tablas;
  const btn = $("#imp-go"); btn.disabled = true;
  const log = $("#imp-log"); log.classList.remove("oculto"); log.textContent = "";
  const escribir = (s) => { log.textContent += s + "\n"; log.scrollTop = log.scrollHeight; };
  const PASOS = 10; let paso = 0;
  const avanzar = (t) => { paso++; $("#imp-paso").textContent = t; $("#imp-barra").style.width = Math.round((paso / PASOS) * 100) + "%"; };
  const lotes = async (tabla, filas, conflicto, tam = 400, etiqueta = tabla) => {
    let n = 0;
    for (let i = 0; i < filas.length; i += tam) {
      const parte = filas.slice(i, i + tam);
      const { data, error } = await sb.rpc("importar_lote", { tabla, filas: parte, conflicto });
      if (error) throw new Error(`${etiqueta}: ${traducirError(error)}`);
      n += data || 0;
      $("#imp-paso").textContent = `${etiqueta}: ${Math.min(i + tam, filas.length).toLocaleString("es-CO")} / ${filas.length.toLocaleString("es-CO")}`;
    }
    escribir(`✓ ${etiqueta}: ${n.toLocaleString("es-CO")} nuevos de ${filas.length.toLocaleString("es-CO")}`);
    return n;
  };
  try {
    const t0 = Date.now();
    /* 1. Encabezado de impresión */
    avanzar("Configuración");
    const op = T.OpcionesAHP[0] || {};
    const enc = S.config.encabezado || {};
    if (!enc.linea1 && (op.InformesLinea1 || op.InformesLinea2)) {
      const v = { linea1: tx(op.InformesLinea1) || "", linea2: tx(op.InformesLinea2) || "", linea3: tx(op.InformesLinea3) || "", telefono: "" };
      await db(sb.from("configuracion").upsert({ clave: "encabezado", valor: v }));
      S.config.encabezado = v;
      escribir("✓ Encabezado de impresión: " + v.linea1);
    }
    const firmante = T.Usuarios.find((u) => u.HCpreferenciaDCFirmaL1);
    if (S.perfil.rol === "medico" && !S.perfil.firma_linea1 && firmante) {
      await db(sb.from("perfiles").update({ firma_linea1: tx(firmante.HCpreferenciaDCFirmaL1), firma_linea2: tx(firmante.HCpreferenciaDCFirmaL2) }).eq("id", S.perfil.id));
      S.perfil.firma_linea1 = tx(firmante.HCpreferenciaDCFirmaL1); S.perfil.firma_linea2 = tx(firmante.HCpreferenciaDCFirmaL2);
      escribir("✓ Firma del médico: " + S.perfil.firma_linea1);
    }

    /* 2. Catálogos */
    avanzar("Catálogos");
    await lotes("entidades", [...new Set(T.Entidades.map((e) => tx(e.Nombre)).filter(Boolean))].map((nombre) => ({ nombre, nit: null })), "nombre", 500, "Entidades");
    await lotes("ocupaciones", [...new Set(T.Ocupaciones.map((e) => tx(e.Nombre)).filter(Boolean))].map((nombre) => ({ nombre })), "nombre", 1000, "Ocupaciones");
    await lotes("plantillas", T.PrescripcionesMedicas.filter((x) => tx(x.Nombre)).map((x) => ({
      legacy_id: "PM:" + x.PrescripcionMedicaNo, nombre: tx(x.Nombre), categoria: categoriaPlantilla(x.Nombre), contenido: tx(x.Prescripcion) || ""
    })), "legacy_id", 500, "Plantillas");
    _catalogos = null;

    /* 3. Agendas */
    avanzar("Agendas");
    const DIA = { lunes: 1, martes: 2, "miercoles": 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
    for (const a of T.Agendas) {
      const nombre = tx(a.Nombre); if (!nombre) continue;
      let ag = (await db(sb.from("agendas").select("*").eq("nombre", nombre)))[0];
      if (!ag) {
        ag = await db(sb.from("agendas").insert({ nombre, identificacion: tx(a.Identificacion), intervalo_min: Number(a.IntervaloCitas) || 15, activo: a.Activo !== false }).select().single());
        const hs = T.AgendasHorario.filter((x) => x.Agenda === a.Nombre).map((x) => ({
          agenda_id: ag.id, dia: DIA[norm(x.Dia)] || null,
          manana_inicio: iH(x.MañanaHoraInicio), manana_fin: iH(x.MañanaHoraFinal), tarde_inicio: iH(x.TardeHoraInicio), tarde_fin: iH(x.TardeHoraFinal)
        })).filter((x) => x.dia);
        if (hs.length) await db(sb.from("agenda_horarios").upsert(hs));
        escribir(`✓ Agenda creada: ${nombre} (${hs.length} días con horario)`);
      }
    }
    await cargarBase();
    const agendaPorNombre = Object.fromEntries(S.agendas.map((a) => [a.nombre, a.id]));
    if (S.perfil.rol === "medico" && !S.perfil.agenda_id && S.agendas.length === 1) {
      await db(sb.from("perfiles").update({ agenda_id: S.agendas[0].id }).eq("id", S.perfil.id));
      S.perfil.agenda_id = S.agendas[0].id;
    }

    /* 4. Pacientes */
    avanzar("Pacientes");
    const vistos = new Set();
    const pacientes = [];
    for (const p of T.Pacientes) {
      const k = clavePaciente(p);
      if (vistos.has(k)) continue;
      vistos.add(k);
      let fn = iF(p.FechaNacimiento); if (fn && (fn < "1890" || fn > hoyISO())) fn = null;
      const nombre = tx(p.Nombre) || [p.PrimerNombre, p.SegundoNombre, p.PrimerApellido, p.SegundoApellido].map(tx).filter(Boolean).join(" ") || "(sin nombre)";
      pacientes.push({
        legacy_id: k, no_historia: tx(p.NoHistoria), tipo_documento: tx(p.Identificacion), numero_documento: tx(p.NoIdentificacion),
        primer_nombre: tx(p.PrimerNombre), segundo_nombre: tx(p.SegundoNombre), primer_apellido: tx(p.PrimerApellido), segundo_apellido: tx(p.SegundoApellido),
        nombre_completo: nombre, fecha_nacimiento: fn, lugar_nacimiento: tx(p.LugarNacimiento), genero: tx(p.Genero), estado_civil: tx(p.EstadoCivil),
        ocupacion: tx(p.Ocupacion), telefono: tx(p.Telefono), telefono_oficina: tx(p.TelefonoOficina), telefono_movil: tx(p.TelefonoMovil), telefono_otro: tx(p.TelefonoOtro),
        correo: tx(p.CorreoE), direccion: tx(p.Direccion), lugar_residencia: tx(p.LugarResidencia), codigo_residencia: tx(p.CodigoResidencia), zona: tx(p.Zona),
        responsable: tx(p.Responsable), responsable_parentesco: tx(p.ResponsableParentesco), responsable_telefono: tx(p.ResponsableTelefono),
        acompanante: tx(p.Acompañante), acompanante_telefono: tx(p.AcompañanteTelefono), nombre_madre: tx(p.NombreMadre), nombre_padre: tx(p.NombrePadre),
        entidad: tx(p.Entidad), vinculacion: tx(p.Vinculacion), no_afiliacion: tx(p.NoAfiliacion), eps: tx(p.EPS), eps_vinculacion: tx(p.EPSVinculacion),
        remitido: tx(p.Remitido), notas: tx(p.Notas), notas_privadas: tx(p.NotasPrivadas), registro_seguimiento: tx(p.RegistroSeguimiento)
      });
    }
    await lotes("pacientes", pacientes, "legacy_id", 500, "Pacientes");
    $("#imp-paso").textContent = "Relacionando pacientes…";
    const mapaPac = {};
    (await todo(() => sb.from("pacientes").select("id,legacy_id,nombre_completo").not("legacy_id", "is", null))).forEach((x) => (mapaPac[x.legacy_id] = x.id));
    // nombre -> id (sólo nombres únicos) para enlazar citas, que en el sistema anterior se guardaban por nombre
    const conteoNombre = {};
    pacientes.forEach((p) => { const k = claveNombre(p.nombre_completo); conteoNombre[k] = (conteoNombre[k] || 0) + 1; });
    const pacPorNombre = {};
    pacientes.forEach((p) => { const k = claveNombre(p.nombre_completo); if (conteoNombre[k] === 1) pacPorNombre[k] = mapaPac[p.legacy_id]; });
    // si hay nombres repetidos, preferir el que tiene historia clínica
    pacientes.forEach((p) => { const k = claveNombre(p.nombre_completo); if (conteoNombre[k] > 1 && p.no_historia && !pacPorNombre[k]) pacPorNombre[k] = mapaPac[p.legacy_id]; });

    /* 5. Documentos clínicos */
    avanzar("Historias clínicas y evoluciones");
    const kd = (a, b) => `${String(a).trim()}:${String(b).trim()}`;
    const tipoDoc = {}; T.DocumentosC.forEach((x) => (tipoDoc[kd(x.NoHistoria, x.NoDocumento)] = x.Documento));
    const hc = {}; T.DocumentoHistoriaClinica.forEach((x) => (hc[kd(x.NoHistoria, x.NoDocumento)] = x));
    const ev = {}; T.DocumentoEvolucion.forEach((x) => (ev[kd(x.NoHistoria, x.NoDocumento)] = x));
    const consultas = []; let sinPac = 0;
    const fechaDoc = {}, autorDoc = {};
    for (const d of T.Documentos) {
      const k = kd(d.NoHistoria, d.NoDocumento);
      const pid = mapaPac["H:" + String(d.NoHistoria).trim()];
      fechaDoc[k] = iFH(d.Fecha, d.Hora); autorDoc[k] = tx(d.RegistroUsuario);
      if (!pid) { sinPac++; continue; }
      const t = tipoDoc[k] || (hc[k] ? "DocumentoHistoriaClinica" : "DocumentoEvolucion");
      const base = { legacy_id: "D:" + k, paciente_id: pid, no_documento: Number(d.NoDocumento) || null, fecha: fechaDoc[k] || "2000-01-01 00:00:00", clasificacion: tx(d.Clasificacion), profesional: tx(d.RegistroUsuario), firmada: true,
        motivo_consulta: null, enfermedad_actual: null, antecedentes_personales: null, revision_sistemas: null, antecedentes_familiares: null, examen_fisico: null, diagnostico: null, conducta: null, evolucion: null };
      if (t === "DocumentoHistoriaClinica") {
        const x = hc[k] || {};
        Object.assign(base, { tipo: "historia_clinica", motivo_consulta: tx(x.MotivoConsulta), enfermedad_actual: tx(x.EnfermedadActual), antecedentes_personales: tx(x.AntecedentePersonal),
          revision_sistemas: tx(x.RevisionSistemas), antecedentes_familiares: tx(x.AntecedenteFam), examen_fisico: tx(x.ExamenFisico), diagnostico: tx(x.Diagnostico), conducta: tx(x.Conducta) });
      } else {
        Object.assign(base, { tipo: "evolucion", evolucion: tx((ev[k] || {}).Evolucion) });
      }
      consultas.push(base);
    }
    await lotes("consultas", consultas, "legacy_id", 300, "Documentos clínicos");
    if (sinPac) escribir(`  (${sinPac} documento(s) sin paciente correspondiente, omitidos)`);
    $("#imp-paso").textContent = "Relacionando documentos…";
    const mapaCons = {};
    (await todo(() => sb.from("consultas").select("id,legacy_id").not("legacy_id", "is", null))).forEach((x) => (mapaCons[x.legacy_id] = x.id));
    // notas aclaratorias del sistema anterior
    const conNotas = T.Documentos.filter((d) => tx(d.NotasAclaratorias) && mapaCons["D:" + kd(d.NoHistoria, d.NoDocumento)]);
    if (conNotas.length) {
      const ids = conNotas.map((d) => mapaCons["D:" + kd(d.NoHistoria, d.NoDocumento)]);
      const existentes = new Set((await db(sb.from("notas_aclaratorias").select("consulta_id").in("consulta_id", ids.slice(0, 1000)))).map((x) => x.consulta_id));
      const nuevas = conNotas.map((d) => ({ consulta_id: mapaCons["D:" + kd(d.NoHistoria, d.NoDocumento)], texto: tx(d.NotasAclaratorias), autor: tx(d.RegistroUsuario) + " (sistema anterior)" })).filter((n) => !existentes.has(n.consulta_id));
      if (nuevas.length) await db(sb.from("notas_aclaratorias").insert(nuevas));
      escribir(`✓ Notas aclaratorias: ${nuevas.length}`);
    }

    /* 6. Órdenes */
    avanzar("Órdenes y prescripciones");
    const cuentaOrd = {};
    const ordenes = T.DocumentosP.map((o) => {
      const k = kd(o.NoHistoria, o.NoDocumento);
      const pid = mapaPac["H:" + String(o.NoHistoria).trim()];
      if (!pid) return null;
      const base = "P:" + k + ":" + norm(o.Nombre);
      cuentaOrd[base] = (cuentaOrd[base] || 0) + 1;
      return { legacy_id: base + ":" + cuentaOrd[base], paciente_id: pid, consulta_id: mapaCons["D:" + k] || null, fecha: fechaDoc[k] || "2000-01-01 00:00:00",
        categoria: categoriaPlantilla(o.Nombre), nombre: (tx(o.Nombre) || "Orden").replace(/^[ERM] /, ""), contenido: tx(o.Prescripcion) || "", profesional: autorDoc[k] || null };
    }).filter(Boolean);
    await lotes("ordenes", ordenes, "legacy_id", 500, "Órdenes");

    /* 7. Adjuntos (sólo la lista; los archivos se suben en el paso 2) */
    avanzar("Lista de adjuntos");
    const adjVistos = new Set(); let adjRepetidos = 0;
    const adjuntos = T.DocumentosAdjuntos.map((a) => {
      const pid = mapaPac["H:" + String(a.NoHistoria).trim()];
      if (!pid || !tx(a.Archivo)) return null;
      const llave = pid + "|" + tx(a.Archivo).toLowerCase();
      if (adjVistos.has(llave)) { adjRepetidos++; return null; } // el sistema anterior tenía filas duplicadas
      adjVistos.add(llave);
      return { legacy_id: "A:" + a.DocumentoAdjuntoNo, paciente_id: pid, nombre: tx(a.Nombre) || tx(a.Archivo), archivo: tx(a.Archivo), mime: mimeDe(a.Archivo),
        fecha: iFH(a.RegistroFecha, a.RegistroFecha) || "2000-01-01 00:00:00", registrado_por: tx(a.RegistroUsuario) };
    }).filter(Boolean);
    await lotes("adjuntos", adjuntos, "legacy_id", 500, "Adjuntos (lista)");
    if (adjRepetidos) escribir(`  (${adjRepetidos.toLocaleString("es-CO")} filas de adjuntos repetidas en el sistema anterior, omitidas)`);

    /* 8. Citas */
    avanzar("Citas");
    const atendidoEseDia = new Set(consultas.map((c) => c.paciente_id + "|" + c.fecha.slice(0, 10)));
    const hoy = hoyISO();
    const cuentaCita = {};
    let enlazadas = 0;
    const citas = T.CitasAsignadas.map((c) => {
      const fecha = iF(c.Fecha), hora = iH(c.Hora);
      if (!fecha || !hora) return null;
      const personal = c.TipoCita === "Cita Personal";
      const pid = personal ? null : pacPorNombre[claveNombre(c.Paciente)] || null;
      if (pid) enlazadas++;
      const base = `C:${c.Agenda}|${fecha}|${hora}|${claveNombre(c.Paciente)}`;
      cuentaCita[base] = (cuentaCita[base] || 0) + 1;
      let estado = "asignada";
      if (c.Asistencia === "Si") estado = "atendida";
      else if (c.Asistencia === "No") estado = "no_asistio";
      else if (pid && atendidoEseDia.has(pid + "|" + fecha)) estado = "atendida";
      else if (c.ConfirmacionFecha && fecha >= hoy) estado = "confirmada";
      const fin = horaTexto(c.HoraFinal);
      return { legacy_id: base + "|" + cuentaCita[base], agenda_id: agendaPorNombre[c.Agenda] || null, fecha, hora_inicio: hora, hora_fin: fin ? fin + ":00" : null,
        tipo: personal ? "Cita Personal" : "Cita Médica", clasificacion: tx(c.Clasificacion), paciente_id: pid, paciente_nombre: tx(c.Paciente),
        descripcion: tx(c.Descripcion), observacion: tx(c.Observacion), estado, confirmacion_contacto: tx(c.ConfirmacionContacto),
        confirmada_en: c.ConfirmacionFecha instanceof Date ? c.ConfirmacionFecha.toISOString() : null, registro_usuario: tx(c.RegistroUsuario),
        motivo_cancelacion: null, cancelada_en: null, cancelada_por: null };
    }).filter(Boolean);
    const canceladas = T.CitasCanceladas.map((c) => {
      const fecha = iF(c.CitaAsignadaFecha), hora = iH(c.CitaAsignadaHora);
      if (!fecha || !hora) return null;
      const pid = pacPorNombre[claveNombre(c.CitaAsignadaPaciente)] || null;
      return { legacy_id: "X:" + c.CitaCanceladaNo, agenda_id: agendaPorNombre[c.CitaAsignadaAgenda] || null, fecha, hora_inicio: hora, hora_fin: null,
        tipo: "Cita Médica", clasificacion: null, paciente_id: pid, paciente_nombre: tx(c.CitaAsignadaPaciente), descripcion: null, observacion: null,
        estado: "cancelada", confirmacion_contacto: null, confirmada_en: null, registro_usuario: tx(c.RegistroUsuario),
        motivo_cancelacion: tx(c.Motivo), cancelada_en: c.RegistroFecha instanceof Date ? c.RegistroFecha.toISOString() : null, cancelada_por: tx(c.PersonaNombre) };
    }).filter(Boolean);
    await lotes("citas", citas.concat(canceladas), "legacy_id", 500, "Citas");
    const medicas = citas.filter((c) => c.tipo === "Cita Médica").length;
    escribir(`  Citas médicas enlazadas a su paciente: ${enlazadas.toLocaleString("es-CO")} de ${medicas.toLocaleString("es-CO")}`);

    /* 9. Notas de agenda */
    avanzar("Notas de agenda");
    const cuentaNota = {};
    const notas = T.Apuntes.map((a) => {
      const f = iF(a.Fecha); if (!f || !tx(a.Apunte) || !agendaPorNombre[a.Agenda]) return null;
      const b = "N:" + a.Agenda + "|" + f; cuentaNota[b] = (cuentaNota[b] || 0) + 1;
      return { legacy_id: b + "|" + cuentaNota[b], agenda_id: agendaPorNombre[a.Agenda], fecha: f, nota: tx(a.Apunte) };
    }).filter(Boolean);
    await lotes("agenda_notas", notas, "legacy_id", 500, "Notas de agenda");

    avanzar("Listo");
    escribir(`\nImportación terminada en ${Math.round((Date.now() - t0) / 1000)} s.`);
    $("#imp-paso").innerHTML = `<b style="color:var(--ok)">Importación terminada.</b> Ahora puede subir los archivos adjuntos (paso 2).`;
    toast("Importación terminada", "ok");
  } catch (e) {
    console.error(e);
    escribir("✗ ERROR: " + (e.message || e));
    $("#imp-paso").innerHTML = `<span style="color:var(--peligro)">Se detuvo por un error. Puede volver a intentarlo: continúa donde quedó.</span>`;
    toast("Error en la importación", "error");
  } finally { btn.disabled = false; }
}

/* ---- Subida de archivos adjuntos ---- */
async function subirAdjuntos(files) {
  const cont = $("#imp-adj");
  if (!files.length) return;
  cont.innerHTML = `<div class="cargando"><span class="spinner"></span> Buscando adjuntos pendientes…</div>`;
  const pendientes = await todo(() => sb.from("adjuntos").select("id,paciente_id,archivo").is("storage_path", null).not("archivo", "is", null));
  const porNombre = {};
  pendientes.forEach((a) => { (porNombre[a.archivo.toLowerCase()] = porNombre[a.archivo.toLowerCase()] || []).push(a); });
  const trabajo = [];
  for (const f of files) { const l = porNombre[f.name.toLowerCase()]; if (l) l.forEach((a) => trabajo.push({ a, f })); }
  const totalBytes = trabajo.reduce((s, t) => s + t.f.size, 0);
  cont.innerHTML = `<div class="alerta info">Archivos seleccionados: <b>${files.length.toLocaleString("es-CO")}</b> · adjuntos pendientes en la base: <b>${pendientes.length.toLocaleString("es-CO")}</b> · coincidencias por subir: <b>${trabajo.length.toLocaleString("es-CO")}</b> (${(totalBytes / 1048576).toFixed(0)} MB)</div>
    ${totalBytes > 900 * 1048576 ? `<div class="alerta aviso" style="margin-top:8px">Atención: son más de 900 MB. El plan gratuito de Supabase incluye 1 GB de almacenamiento de archivos; puede necesitar el plan Pro.</div>` : ""}
    ${trabajo.length ? `<div style="margin-top:12px"><button class="btn pri" id="adj-go">Subir ${trabajo.length.toLocaleString("es-CO")} archivo(s)</button> <button class="btn oculto" id="adj-stop">Detener</button></div>
    <div class="progreso" style="margin-top:12px"><div id="adj-barra"></div></div><div class="muted" id="adj-paso" style="font-size:12.5px;margin-top:6px"></div>` : ""}
    <pre class="log oculto" id="adj-log" style="margin-top:12px"></pre>`;
  if (!trabajo.length) return;
  let detener = false;
  $("#adj-stop").onclick = () => (detener = true);
  $("#adj-go").onclick = async () => {
    $("#adj-go").disabled = true; $("#adj-stop").classList.remove("oculto");
    const log = $("#adj-log"); log.classList.remove("oculto");
    let hechos = 0, errores = 0, bytes = 0, i = 0;
    const t0 = Date.now();
    const uno = async () => {
      while (i < trabajo.length && !detener) {
        const { a, f } = trabajo[i++];
        const ruta = `${a.paciente_id}/${a.id}_${f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_")}`;
        try {
          const { error } = await sb.storage.from("adjuntos").upload(ruta, f, { upsert: true, contentType: mimeDe(f.name) });
          if (error) throw error;
          const { error: e2 } = await sb.from("adjuntos").update({ storage_path: ruta, tamano: f.size, mime: mimeDe(f.name) }).eq("id", a.id);
          if (e2) throw e2;
          hechos++; bytes += f.size;
        } catch (e) {
          errores++; log.textContent += `✗ ${f.name}: ${traducirError(e)}\n`;
        }
        const seg = (Date.now() - t0) / 1000;
        $("#adj-barra").style.width = Math.round(((hechos + errores) / trabajo.length) * 100) + "%";
        $("#adj-paso").textContent = `${hechos + errores} / ${trabajo.length} · ${(bytes / 1048576).toFixed(1)} MB · ${(bytes / 1048576 / Math.max(seg, 1)).toFixed(2)} MB/s${errores ? ` · ${errores} con error` : ""}`;
      }
    };
    await Promise.all([uno(), uno(), uno(), uno()]);
    $("#adj-stop").classList.add("oculto");
    toast(detener ? "Subida detenida" : `Adjuntos subidos: ${hechos}`, errores ? "error" : "ok");
    $("#adj-paso").innerHTML += detener ? " · detenido (puede continuar seleccionando la carpeta otra vez)" : " · <b>terminado</b>";
  };
}
