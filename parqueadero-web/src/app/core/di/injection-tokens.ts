// Registry de DI tokens — los features añaden sus tokens aquí en fases posteriores.
// Convención: SCREAMING_SNAKE_CASE + sufijo _TOKEN
// Importar InjectionToken de @angular/core al añadir el primer token real.
//
// Ejemplo:
// import { InjectionToken } from '@angular/core';
// export const PARKING_REPOSITORY_TOKEN =
//   new InjectionToken<ParkingRepository>('ParkingRepository');

// Placeholder para que el archivo sea importable desde el inicio
export const _CORE_DI_REGISTRY = 'core-di-registry' as const;
