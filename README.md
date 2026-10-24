

```markdown
# 🚀 Guía de Inicialización y Ejecución Local

Esta plataforma es un entorno colaborativo en tiempo real para el diseño de diagramas de clases UML, generación de código y asistencia inteligente mediante IA (Anthropic Claude).

---

## 📋 Requisitos Previos

Asegúrate de tener instaladas las siguientes herramientas en tu sistema:
- **Node.js**: v18 o superior (recomendado v20+).
- **PostgreSQL**: Servicio en ejecución (por defecto en el puerto `5432`).
- **MongoDB** *(Opcional)*: Para persistencia NoSQL de historiales de chat y estados del lienzo en el puerto `27017` (si no está activo, el sistema usará almacenamiento en memoria automáticamente).
- **Git**

---

## 🛠️ Paso 1: Configurar el Backend (`backend-plataforma`)

1. **Navega a la carpeta del backend:**
   ```bash
   cd backend-plataforma
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno:**
   Crea o edita el archivo `.env` en la raíz de `backend-plataforma/` con los siguientes valores:
   ```env
   # Base de datos relacional (PostgreSQL)
   DATABASE_URL="postgresql://postgres:TU_CONTRASEÑA@localhost:5432/examen_2SW?schema=public"

   # Autenticación JWT
   JWT_SECRET="tu_secreto_super_seguro_jwt"
   JWT_EXPIRES_IN=86400

   # Asistente de IA (Anthropic Claude con Tool Calling)
   ANTHROPIC_API_KEY="tu-api-key-de-anthropic"
   ANTHROPIC_MODEL=claude-sonnet-5

   # Base de datos NoSQL (MongoDB)
   MONGO_URI="mongodb://localhost:27017/examen_sw1_nosql"

   # Notificaciones Web Push (VAPID)
   VAPID_PUBLIC_KEY=BOCj0NPu-aXVoyxAjewBxNJlj_fHSNy7TewoNcWer3XIdgVf5p7-c0fqUUuj_9ximcuaiZAqtKHiF3c4pe29HRE
   VAPID_PRIVATE_KEY=Tgrb1l4-OAkyjmfcbb8W33e8VjVbDBApV_Odz_eSrYk

   # Red y Servidor
   FRONTEND_URL=http://localhost:5173
   PORT=3000
   ```

4. **Sincroniza la base de datos PostgreSQL con Prisma:**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

5. **Inicia el servidor en modo desarrollo:**
   ```bash
   npm run start:dev
   ```
   *El backend estará escuchando en `http://localhost:3000`.*

---

## 💻 Paso 2: Configurar el Frontend (`frontend-web`)

1. **Abre una nueva terminal y navega a la carpeta del frontend:**
   ```bash
   cd frontend-web
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno:**
   Crea o edita el archivo `.env` en la raíz de `frontend-web/`:
   ```env
   VITE_API_URL=http://localhost:3000
   VITE_VAPID_PUBLIC_KEY=BOCj0NPu-aXVoyxAjewBxNJlj_fHSNy7TewoNcWer3XIdgVf5p7-c0fqUUuj_9ximcuaiZAqtKHiF3c4pe29HRE
   ```

4. **Inicia el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   *El frontend estará disponible en `http://localhost:5173`.*

---

## 🎯 Características Principales

- **Editor UML en Tiempo Real:** Colaboración multiusuario mediante Socket.IO con cálculo inteligente de anclajes (*smart handles*).
- **Modo IA (Split-Screen Workspace):** Interruptor en la barra superior para interactuar con Claude mediante lenguaje natural, dictado por voz y ejecución de herramientas en vivo (*Tool Calling*).
- **Clases de Asociación Automáticas:** Detección de relaciones muchos a muchos (`0..*` a `0..*`) con renderizado UML estándar (línea punteada conectada al punto medio).
- **Interoperabilidad XMI 2.1:** Exportación e importación de diagramas compatibles con herramientas UML estándar (Enterprise Architect, etc.).
- **Generador Spring Boot:** Descarga de proyectos backend funcionales a partir del diagrama modelado.
```
