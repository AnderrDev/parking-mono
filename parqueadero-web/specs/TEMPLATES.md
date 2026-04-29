# Templates de Spec — parqueadero-web

Referenciado desde `parqueadero-web/CLAUDE.md §1`. Usar al crear specs nuevas.

---

## Template UseCase

```markdown
# Spec: [Nombre]

## Identificador
`feature/usecase-name`

## Descripción
[Una oración clara]

## Actor
[Quién lo invoca: operario, admin, sistema, cliente]

## Pre-condiciones
- [Qué debe ser verdad antes]

## Input (Params)
| Campo | Tipo | Obligatorio | Validaciones |

## Output (Result)
| Caso | Tipo | Descripción |

## Reglas de Negocio
1. [Regla importante]

## Flujo Principal
1. [Paso 1]

## Edge Cases
- [Caso especial A]

## Dependencias
- `RepositoryX.method()`

## Mapping a UI
- **Invocación**: Page → Component → Button
- **Formulario**: ParkingForms.createXxxForm()
- **Feedback**: Toast éxito, Dialog error
```

---

## Template Componente

```markdown
# Spec: [Componente]

## Tipo
Dumb / Smart

## Selector
`app-[nombre]`

## Propósito
[Una oración]

## Inputs
| Input | Tipo | Default | Descripción |

## Outputs
| Output | Tipo | Cuándo emite |

## Estados Visuales
- Loading: [qué muestra]
- Empty: [qué muestra]

## Comportamiento
1. [Paso usuario]
2. [Reacción sistema]

## NO hace
- NO invoca UseCases directamente
- NO accede a BD
- NO importa data/
```

---

## Template Infraestructura

```markdown
# Spec: [Componente de Infra]

## Propósito
[Qué problema técnico resuelve]

## Interfaz Pública
[Métodos expuestos, contratos]

## Dependencias Externas
[APIs, librerías]

## Configuración
[Variables de .env]

## Manejo de Errores
[Estrategia]

## Consideraciones de Seguridad
[Tokens, datos sensibles]
```
