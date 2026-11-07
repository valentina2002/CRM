# CRM SEO — Kit para Claude Code

Carpeta lista para que Claude Code construya el CRM real a partir del prototipo.

```
crm-seo/
├─ CLAUDE.md                 ← instrucciones que Claude Code lee en cada sesión
├─ README.md                 ← esta guía
├─ .env.example              ← variables de entorno (copiar a .env.local)
├─ docs/
│  ├─ 01-requerimientos.md
│  ├─ 02-arquitectura.md
│  ├─ 03-whatsapp-coexistencia.md
│  ├─ 04-api.md
│  ├─ openapi.yaml
│  └─ 05-plan-de-fases.md    ← fases + el mensaje para pegar en cada una
├─ prisma/schema.prisma      ← modelo de datos inicial
└─ prototipo/crm-seo-prototipo.html   ← ábrelo con doble clic: es la referencia visual
```

## 1. Instala lo necesario (Windows)
1. **Node.js LTS**: https://nodejs.org (siguiente, siguiente…). Verifica en PowerShell: `node -v`
2. **Git for Windows**: https://git-scm.com/downloads/win (recomendado para Claude Code en Windows).
3. **Claude Code**, una de estas opciones:
   - **App de escritorio de Claude** (la que ya usas): pestaña **Code** → abrir esta carpeta. No necesitas instalar nada más.
   - **Terminal (PowerShell)**: `irm https://claude.ai/install.ps1 | iex` → cierra y abre PowerShell → `claude --version`
   - **VS Code**: extensión "Claude Code" desde el panel de extensiones.

## 2. Abre el proyecto
- App de escritorio: Code → selecciona la carpeta `crm-seo`.
- Terminal:
  ```powershell
  cd "$HOME\Documents\crm-seo"
  git init
  claude
  ```
  La primera vez te pide iniciar sesión con tu cuenta de Claude.

## 3. Primer mensaje para Claude Code
Copia y pega:

> Lee CLAUDE.md, todos los archivos de docs/ y abre prototipo/crm-seo-prototipo.html para entender el producto.
> Luego haz la **Fase 0** de docs/05-plan-de-fases.md. Antes de escribir código, muéstrame tu plan y pregúntame lo que no esté claro.

Después sigue fase por fase con los mensajes que están en `docs/05-plan-de-fases.md`.

## 4. Lo que tendrás que hacer tú (fuera del código)
- [ ] Crear una base de datos Postgres gratis (Neon: https://neon.tech o Supabase: https://supabase.com) y pegar la URL en `.env.local`.
- [ ] Meta: cuenta de Meta Business, app en developers.facebook.com con WhatsApp y Embedded Signup (Claude Code te guía en la Fase 4).
- [ ] Tener tu número en la app **WhatsApp Business** actualizada (requisito de coexistencia).
- [ ] Cuenta en Vercel para publicarlo (Fase 6).

## Consejos
- Una fase por conversación; si se alarga, empieza una nueva y dile "continúa la Fase X".
- Pídele que haga commit al terminar cada fase, así puedes volver atrás.
- Si algo del prototipo quieres distinto, cámbialo primero en `docs/01-requerimientos.md`.
