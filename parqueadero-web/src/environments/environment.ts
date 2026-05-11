// Environment LOCAL/DEV — apunta al stack de Supabase local (supabase start).
// La anon key es la default del demo project — NO es secreta y solo funciona
// contra la BD local; no exporta a producción.
//
// Switch entre ambientes vía angular.json fileReplacements:
//   - production: usa environment.prod.ts
//   - staging:    usa environment.staging.ts
//   - development: usa este archivo (default)

export const environment = {
  production: false,
  staging: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
};
