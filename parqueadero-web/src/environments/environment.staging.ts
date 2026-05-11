// Environment de STAGING — proyecto Supabase paralelo a prod, mismas
// migraciones pero datos de prueba. Las URLs/keys reales se inyectan en
// CI sustituyendo este archivo o reemplazando los placeholders al build.

export const environment = {
  production: false,
  staging: true,
  supabaseUrl: '',     // ej: https://<project-ref>.supabase.co — inyectar en CI
  supabaseAnonKey: '', // anon key del proyecto staging — inyectar en CI
};
