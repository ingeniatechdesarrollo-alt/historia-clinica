// =============================================================
//  Configuración de conexión a Supabase
//  Supabase → Project Settings → API
//  (La llave publicable / anon es pública por diseño: los datos están
//   protegidos por las reglas de seguridad RLS de schema.sql.
//   NUNCA ponga aquí la service_role / secret key.)
// =============================================================
window.AHP_CONFIG = {
  SUPABASE_URL: "https://rrqqwkrvcnwxluuwquck.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_mWQw6I9g7JZb5dwodRaTNQ_e5VbbiGe",
  // Cierra la sesión tras este tiempo sin actividad (minutos)
  INACTIVIDAD_MIN: 60
};
