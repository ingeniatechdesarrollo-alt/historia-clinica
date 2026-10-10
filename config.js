// =============================================================
//  Configuración de conexión a Supabase
//  Supabase → Project Settings → API
//  (La "anon public key" es pública por diseño: los datos están
//   protegidos por las reglas de seguridad RLS de schema.sql.
//   NUNCA ponga aquí la service_role key.)
// =============================================================
window.AHP_CONFIG = {
  SUPABASE_URL: "PEGUE_AQUI_LA_PROJECT_URL",
  SUPABASE_ANON_KEY: "PEGUE_AQUI_LA_ANON_PUBLIC_KEY",
  // Cierra la sesión tras este tiempo sin actividad (minutos)
  INACTIVIDAD_MIN: 60
};
