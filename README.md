# Fatboy · Rotación de mesas

Aplicación interna para el control táctil de rotación de meseros y asignación de mesas. SQLite es la fuente de verdad; la pantalla se sincroniza automáticamente cada 1.8 segundos.

## Requisitos

- Node.js 20.9 o posterior y npm.
- Docker para ejecutar el contenedor.
- La app opera conectada al servidor en la red local. No utiliza cuentas, servicios externos ni almacenamiento operativo en el navegador.

## Desarrollo local

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Abre `http://localhost:3000`. Para compilar, usa `npm run build` y `npm start`.

## Coolify

1. Crea una aplicación de tipo Dockerfile apuntando a este directorio y publica el puerto interno `3000`.
2. En **Persistent Storage**, agrega un volumen persistente montado exactamente en `/app/data`.
3. Define `DATABASE_URL=file:/app/data/fatboy-meseros.db` y `TZ=America/Tijuana`.
4. Despliega una sola réplica de la aplicación. El contenedor ejecuta `prisma migrate deploy`, carga el seed idempotente y luego inicia Next.js.

Como no hay cuentas de usuario, limita el dominio o la entrada de red a la LAN/VPN del restaurante; no expongas este servicio directamente a internet.

El archivo de base de datos reside en el volumen, fuera de la capa reemplazable de la imagen. Conserva el volumen al recrear o desplegar la aplicación. No uses varias réplicas compartiendo SQLite.

## Backup y restauración

El backup más simple y consistente es detener temporalmente la aplicación en Coolify y copiar `fatboy-meseros.db` desde el volumen `/app/data` a almacenamiento seguro con acceso restringido. Guarda más de una copia fechada fuera del volumen.

Para restaurar, detén la app, copia el backup como `/app/data/fatboy-meseros.db`, confirma permisos de lectura/escritura para el usuario del contenedor y vuelve a iniciar. No copies el archivo mientras la app escribe. Si aparecen archivos `-wal` o `-shm`, detén el servicio de forma limpia antes de copiar y conserva juntos los archivos SQLite presentes.

## Uso

- Inicia el turno y registra llegadas en el orden real para crear la rotación.
- Al asignar una mesa, el siguiente mesero elegible pasa al final. Las asignaciones manuales, cambios y acciones quedan en historial.
- Los meseros en descanso, comiendo o fuera se omiten hasta que se reactiven. `Atendiendo` es un estado visual derivado de sus mesas abiertas; no altera su lugar en la rotación.
- Liberar una mesa no cambia el orden. El cierre del turno se bloquea mientras existan mesas abiertas y muestra los números que faltan liberar.
- La auditoría usa el actor `Sin usuario`, conforme al modo kiosco sin autenticación.

## Datos

El seed crea únicamente el proyecto Roma, sin mesas ni empleados de muestra. Es idempotente. El modelo relaciona turnos y meseros por participación histórica, y la rotación se conserva en registros ordenados independientes. Puedes añadir mesas y meseros desde la pantalla de administración.

## Verificación

`npm test` prepara una base SQLite temporal y comprueba llegada, orden, asignación, rotación, pausa/reactivación, liberación, transferencia manual, concurrencia, historial, cierre, resumen y reconexión a la base. `npm run build` valida la compilación de producción.
