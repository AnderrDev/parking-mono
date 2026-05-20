// Environment DEV — apunta al proyecto Supabase REMOTO (hhwctcjwrlbqgsrfriqn).
//
// ⚠️ A partir de 2026-05-16, dev ya NO usa la BD local (`supabase start`).
// Toda llamada desde `ng serve` impacta el proyecto productivo de Supabase.
// Si necesitas trabajar contra la BD local, sobreescribe localmente esta key
// con `http://127.0.0.1:54321` (no commitear el cambio).
//
// Switch entre ambientes vía angular.json fileReplacements:
//   - production: usa environment.prod.ts (mismos valores que aquí)
//   - staging:    usa environment.staging.ts (sin proyecto aún)
//   - development: usa este archivo (default)

export const environment = {
  production: false,
  staging: false,
  supabaseUrl: 'https://hhwctcjwrlbqgsrfriqn.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhod2N0Y2p3cmxicWdzcmZyaXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODYzNzAsImV4cCI6MjA5NDQ2MjM3MH0.OsUx5CZS6gLvOg934PqDIeNpOhlmOQLtFOKVkhBVNqU',
};
