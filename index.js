const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const adminCommands = require('./commands/admin');
const userCommands = require('./commands/users');
const { handleInteraction } = require('./commands/interactions');
const { sendDailyActivity } = require('./commands/daily');

const app = express();
const PORT = config.PORT || 8080;

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';
let reconnectAttempts = 0;

/**
 * Limpia la carpeta de sesiones
 */
function cleanSessions() {
    const sessionsPath = path.join(__dirname, 'sessions');
    if (fs.existsSync(sessionsPath)) {
        console.log('🧹 Limpiando carpeta sessions...');
        fs.rmSync(sessionsPath, { recursive: true, force: true });
    }
}

/**
 * Espera un tiempo determinado
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Inicializa la conexión con WhatsApp - VERSIÓN ANTI-BLOQUEO
 */
async function connectToWhatsApp() {
    try {
        reconnectAttempts++;
        
        // Si hay muchos intentos, esperar más tiempo
        if (reconnectAttempts > 3) {
            const waitTime = Math.min(30000, reconnectAttempts * 5000);
            console.log(`⏳ Muchos intentos fallidos. Esperando ${waitTime/1000} segundos...`);
            await sleep(waitTime);
        }
        
        console.log(`🔄 Intento de conexión #${reconnectAttempts}...`);
        
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`💻 Usando versión de WhatsApp v${version.join('.')} (Latest: ${isLatest})`);

        const { state, saveCreds } = await useMultiFileAuthState('sessions');
        
        // Configuración especial para evitar bloqueo
        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'error' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            version,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            defaultQueryTimeoutMs: 60000,
            generateHighQualityLinkPreview: false,
            shouldSyncHistory: false,
            retryRequestDelayMs: 2000
        });

        sock.ev.on('creds.update', saveCreds);

        // Evento de conexión - Versión ANTI-BLOQUEO
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Capturar QR
            if (qr) {
                console.log('\n📱 ==================================');
                console.log('📱 CÓDIGO QR GENERADO - ESCANEA YA!');
                console.log('📱 ==================================');
                console.log('📱 PASOS:');
                console.log('1. Abre WhatsApp en tu teléfono');
                console.log('2. Toca los 3 puntos (Android) o Configuración (iPhone)');
                console.log('3. Selecciona "Dispositivos vinculados"');
                console.log('4. Toca "Vincular un dispositivo"');
                console.log('5. Escanea este código:\n');
                
                // Mostrar QR en terminal
                try {
                    const qrASCII = await QRCode.toString(qr, { type: 'terminal', small: true });
                    console.log(qrASCII);
                    console.log('\n📱 O escanea desde: http://localhost:' + PORT + '/qr');
                    console.log('📱 El QR expira en 60 segundos. Date prisa!\n');
                } catch (err) {
                    console.log('Error generando QR');
                }
                
                // Guardar QR para web
                try {
                    qrCode = await QRCode.toDataURL(qr);
                } catch (err) {}
                
                connectionStatus = 'awaiting_scan';
                reconnectAttempts = 0;
                return;
            }

            // Conexión exitosa
            if (connection === 'open') {
                console.log('\n✅ ============================');
                console.log('✅ BOT CONECTADO CON ÉXITO');
                console.log('✅ ============================');
                
                const botNumber = sock.user?.id?.split(':')[0] || 'Desconocido';
                console.log('📱 Número del bot:', botNumber);
                console.log('🌐 Web: http://localhost:' + PORT);
                console.log('📝 Para probar:');
                console.log('   1. Agrega este número a un grupo');
                console.log('   2. Hazlo administrador');
                console.log('   3. Escribe: !menu\n');
                
                connectionStatus = 'connected';
                qrCode = null;
                reconnectAttempts = 0;
            }

            // Conexión cerrada
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || 'Error desconocido';
                
                console.log(`\n❌ Conexión cerrada: ${errorMessage}`);
                
                // Si es error de logout, limpiar y generar nuevo QR
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🚫 Sesión cerrada. Generando nuevo QR...\n');
                    connectionStatus = 'disconnected';
                    cleanSessions();
                    reconnectAttempts = 0;
                    await sleep(3000);
                    connectToWhatsApp();
                } 
                // Si es error de conexión, esperar y reintentar
                else {
                    const waitTime = reconnectAttempts > 5 ? 30000 : 5000;
                    console.log(`🔄 Reintentando en ${waitTime/1000} segundos...\n`);
                    connectionStatus = 'reconnecting';
                    await sleep(waitTime);
                    connectToWhatsApp();
                }
            }
        });

        // Escucha de mensajes
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg.message) return;
                
                if (!msg.key.remoteJid?.endsWith('@g.us')) return;
                
                let messageContent = '';
                if (msg.message.conversation) {
                    messageContent = msg.message.conversation;
                } else if (msg.message.extendedTextMessage?.text) {
                    messageContent = msg.message.extendedTextMessage.text;
                } else {
                    return;
                }
                
                if (!messageContent.startsWith(config.PREFIX)) return;
                
                console.log('📨 Comando:', messageContent);
                
                const groupId = msg.key.remoteJid;
                const senderId = msg.key.participant || msg.key.remoteJid;
                const args = messageContent.slice(config.PREFIX.length).trim().split(/\s+/);
                const command = args.shift().toLowerCase();
                
                const isAdmin = await adminCommands.isAdmin(sock, groupId, senderId);
                
                switch(command) {
                    case 'menu':
                        await userCommands.showMenu(sock, groupId, isAdmin);
                        break;
                    case 'admins':
                        await userCommands.listAdmins(sock, groupId);
                        break;
                    case 'info':
                        await userCommands.groupInfo(sock, groupId);
                        break;
                    case 'rules':
                        await userCommands.showRules(sock, groupId);
                        break;
                    case 'link':
                        await userCommands.getGroupLink(sock, groupId, senderId, isAdmin);
                        break;
                    case 'hug': case 'abrazo':
                    case 'kiss': case 'beso':
                    // case 'fuck': case 'sexo': case 'coger':
                    case 'embarazar': case 'impregnate':
                    case 'slap': case 'bofetada':
                    case 'marry': case 'casar':
                    case 'kill': case 'matar':
                        await handleInteraction(sock, msg, groupId, senderId, command, args);
                        break;
                    case 'dinamica': case 'daily':
                        await sendDailyActivity(sock, groupId);
                        break;
                    case 'kick':
                        if (!isAdmin) {
                            await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
                            break;
                        }
                        await adminCommands.kickMember(sock, msg, groupId, senderId);
                        break;
                    case 'add':
                        if (!isAdmin) {
                            await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
                            break;
                        }
                        await adminCommands.addMember(sock, msg, groupId, senderId, args);
                        break;
                    case 'promote':
                        if (!isAdmin) {
                            await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
                            break;
                        }
                        await adminCommands.promoteToAdmin(sock, msg, groupId, senderId);
                        break;
                    case 'demote':
                        if (!isAdmin) {
                            await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
                            break;
                        }
                        await adminCommands.demoteFromAdmin(sock, msg, groupId, senderId);
                        break;
                    case 'groupclose':
                        if (!isAdmin) {
                            await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
                            break;
                        }
                        await adminCommands.closeGroup(sock, groupId, senderId);
                        break;
                    case 'groupopen':
                        if (!isAdmin) {
                            await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
                            break;
                        }
                        await adminCommands.openGroup(sock, groupId, senderId);
                        break;
                    default:
                        await sock.sendMessage(groupId, { 
                            text: `❌ Usa ${config.PREFIX}menu` 
                        });
                }
            } catch (err) {
                console.error('Error:', err);
            }
        });

    } catch (err) {
        console.error('Error fatal:', err);
        console.log('🔄 Reiniciando en 30 segundos...');
        await sleep(30000);
        connectToWhatsApp();
    }
}

// ================== SERVIDOR WEB ==================
app.use(express.json());

// Página principal
app.get('/', (req, res) => {
    let statusText = '';
    let statusClass = '';
    let qrSection = '';
    
    switch(connectionStatus) {
        case 'connected':
            statusText = '✅ Conectado';
            statusClass = 'connected';
            break;
        case 'awaiting_scan':
            statusText = '📱 ESCANEA EL QR';
            statusClass = 'awaiting';
            if (qrCode) {
                qrSection = `
                    <div class="qr-container">
                        <h3 style="color:red;">⚠️ ESCANEA YA - EL QR EXPIRA EN 60 SEGUNDOS</h3>
                        <img src="${qrCode}" alt="QR Code">
                        <div class="steps">
                            <p>1️⃣ Abre WhatsApp en tu teléfono</p>
                            <p>2️⃣ Toca los 3 puntos (Android) o Configuración (iPhone)</p>
                            <p>3️⃣ Selecciona "Dispositivos vinculados"</p>
                            <p>4️⃣ Toca "Vincular un dispositivo"</p>
                            <p>5️⃣ Escanea este código AHORA</p>
                        </div>
                    </div>
                `;
            }
            break;
        case 'reconnecting':
            statusText = '🔄 Reconectando...';
            statusClass = 'reconnecting';
            break;
        default:
            statusText = '❌ Desconectado';
            statusClass = 'disconnected';
    }
    
    res.send(`
        <html>
            <head>
                <title>WhatsApp Bot</title>
                <style>
                    body { font-family: Arial; max-width: 800px; margin: 50px auto; text-align: center; }
                    .status { padding: 20px; border-radius: 10px; margin: 20px; font-size: 24px; }
                    .connected { background: #d4edda; color: #155724; }
                    .disconnected { background: #f8d7da; color: #721c24; }
                    .awaiting { background: #fff3cd; color: #856404; }
                    .reconnecting { background: #cce5ff; color: #004085; }
                    button { padding: 15px 30px; font-size: 18px; margin: 10px; cursor: pointer; }
                    .qr-container { margin: 30px; }
                    img { max-width: 300px; border: 10px solid #eee; border-radius: 10px; }
                    .steps { text-align: left; max-width: 400px; margin: 20px auto; }
                </style>
            </head>
            <body>
                <h1>🤖 Bot para Grupos de WhatsApp</h1>
                <div class="status ${statusClass}">
                    <h2>Estado: ${statusText}</h2>
                </div>
                
                ${qrSection}
                
                <div>
                    <a href="/qr"><button>📱 Ver QR</button></a>
                    <a href="/clean"><button>🧹 Limpiar y reiniciar</button></a>
                </div>
                
                <p style="margin-top: 30px;">
                    <strong>Comandos:</strong> !menu | !hug @usuario | !dinamica
                </p>
            </body>
        </html>
    `);
});

// Página QR
app.get('/qr', (req, res) => {
    if (qrCode) {
        res.send(`
            <html>
                <head>
                    <title>Escanear QR</title>
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; }
                        img { max-width: 300px; border: 10px solid #eee; border-radius: 10px; }
                        .steps { text-align: left; max-width: 400px; margin: 30px auto; }
                        .warning { color: red; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h1>📱 ESCANEA ESTE QR AHORA</h1>
                    <p class="warning">⚠️ EL QR EXPIRA EN 60 SEGUNDOS</p>
                    <div class="steps">
                        <p>1️⃣ Abre WhatsApp en tu teléfono</p>
                        <p>2️⃣ Toca los 3 puntos (Android) o Configuración (iPhone)</p>
                        <p>3️⃣ Selecciona "Dispositivos vinculados"</p>
                        <p>4️⃣ Toca "Vincular un dispositivo"</p>
                        <p>5️⃣ Escanea este código YA:</p>
                    </div>
                    <img src="${qrCode}" alt="QR Code">
                    <p><a href="/">← Volver</a></p>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <body>
                    <h1>No hay QR disponible</h1>
                    <p>Estado: ${connectionStatus}</p>
                    <p><a href="/clean">🧹 Limpiar y generar nuevo QR</a></p>
                </body>
            </html>
        `);
    }
});

// Limpiar sesión
app.get('/clean', (req, res) => {
    res.send('<html><body><h1>Limpiando sesión...</h1><p>Generando nuevo QR...</p><script>setTimeout(()=>window.location="/",3000);</script></body></html>');
    console.log('🧹 Limpieza manual');
    cleanSessions();
    if (sock) {
        sock.end();
    }
    reconnectAttempts = 0;
    setTimeout(connectToWhatsApp, 2000);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n✅ Servidor web corriendo en http://localhost:${PORT}`);
    console.log(`📱 Estado inicial: ${connectionStatus}\n`);
    
    // cleanSessions(); // ELIMINADO: No borrar sesión al iniciar
    connectToWhatsApp();
});

process.on('SIGINT', () => {
    console.log('\n👋 Cerrando bot...');
    if (sock) sock.end();
    process.exit();
});