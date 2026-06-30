# Fuentes self-hosted

Para producción coloca aquí los archivos .woff2:

## Inter (UI sans-serif)
Descarga desde: https://rsms.me/inter/download/ o usa `fontsource`:
```
npm install @fontsource-variable/inter
```
Archivos necesarios: Inter-Regular.woff2, Inter-Medium.woff2, Inter-SemiBold.woff2, Inter-Bold.woff2

## JetBrains Mono (placas y montos)
Descarga desde: https://www.jetbrains.com/lp/mono/#download
Archivos necesarios: JetBrainsMono-Regular.woff2, JetBrainsMono-Medium.woff2

Las declaraciones @font-face ya están en tokens.scss apuntando a estos archivos.
En desarrollo se usa Google Fonts como fallback vía el <link> en index.html.
