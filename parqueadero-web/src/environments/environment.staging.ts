// Environment de STAGING — proyecto Supabase paralelo a prod, mismas
// migraciones pero datos de prueba.
//
// Estado 2026-05-15: NO existe proyecto staging separado todavía. Cuando se
// cree, sustituir estos valores por la URL/anon key del nuevo proyecto. NO
// reutilizar las credenciales del proyecto de producción
// (hhwctcjwrlbqgsrfriqn) — staging debe tener su propia BD aislada.

export const environment = {
  production: false,
  staging: true,
  qzSigningEnabled: false,
  supabaseUrl: '',     // pendiente: crear proyecto staging en Supabase
  supabaseAnonKey: '', // pendiente: anon key del proyecto staging
};
