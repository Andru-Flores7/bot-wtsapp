const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const adminCommands = require('./commands/admin');
const userCommands = require('./commands/users');
const gameCommands = require('./commands/games');
const { handleInteraction } = require('./commands/interactions');
const { sendDailyActivity } = require('./commands/daily');
const { useSupabaseAuthState } = require('./utils/supabaseAuth');
const NodeCache = require('node-cache');

const app = express();
const PORT = config.PORT || 8080;

// Caché para rastrear actividad (groupId: { userId: timestamp })
const activityCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';
let reconnectAttempts = 0;
let heartbeatInterval = null;

/**
 * Espera un tiempo determinado
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Inicializa la conexión con WhatsApp - VERSIÓN SUPABASE
 */
async function connectToWhatsApp() {
    try {
        reconnectAttempts++;
        
        console.log(`🔄 Intento de conexión #${reconnectAttempts}...`);
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`💻 Versión WhatsApp v${version.join('.')} (Latest: ${isLatest})`);

        // Inicializar estado de autenticación en Supabase
        const { state, saveCreds } = await useSupabaseAuthState(config.SUPABASE_URL, config.SUPABASE_KEY);
        
        sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'error' }))
            },
            logger: pino({ level: 'error' }),
            browser: ['Windows', 'Chrome', '114.0.5735.199'],
            version,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            defaultQueryTimeoutMs: 60000,
            generateHighQualityLinkPreview: false,
            shouldSyncHistory: false,
            retryRequestDelayMs: 2000,
            keepAliveIntervalMs: 30000 // Heartbeat interno de Baileys
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

                // --- SISTEMA ANTI-ZOMBIE ---
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                heartbeatInterval = setInterval(async () => {
                    if (sock && connectionStatus === 'connected') {
                        try {
                            await sock.sendPresenceUpdate('available');
                            console.log('💓 Pulso de actividad (Anti-Zombie)');
                        } catch (e) {
                            console.log('⚠️ Fallo en pulso de actividad');
                        }
                    }
                }, 120000); // Cada 2 minutos
            }

            // Conexión cerrada
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || 'Error desconocido';
                
                console.log(`\n❌ Conexión cerrada: ${errorMessage} (Status: ${statusCode})`);
                
                // Si es error de logout, limpiar y generar nuevo QR
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🚫 Sesión cerrada por el usuario. Generando nuevo QR...\n');
                    connectionStatus = 'disconnected';
                    reconnectAttempts = 0;
                    await sleep(3000);
                    connectToWhatsApp();
                } 
                // Para fallos de red/Wi-Fi: reintentar SIN borrar la sesión
                else {
                    if (heartbeatInterval) clearInterval(heartbeatInterval);
                    const waitTime = Math.min(30000, (reconnectAttempts * 5000) + 2000);
                    console.log(`🔄 Problema de conexión. Reintentando en ${waitTime/1000}s...\n`);
                    connectionStatus = 'reconnecting';
                    
                    if (sock) {
                        try { sock.end(); } catch (e) {}
                    }

                    await sleep(waitTime);
                    connectToWhatsApp();
                }
            }
        });

        // Detección de entradas y salidas
        sock.ev.on('group-participants.update', async (update) => {
            const { id, participants, action } = update;
            console.log(`👥 Evento de grupo en ${id}: ${action} para ${participants.length} usuarios`);

            for (const participant of participants) {
                try {
                    if (action === 'add') {
                        await sock.sendMessage(id, { 
                            text: `${config.MESSAGES.WELCOME}\n\n@${participant.split('@')[0]}`,
                            mentions: [participant]
                        });
                    } else if (action === 'remove') {
                        // REGLA DE PROTECCIÓN: Si alguien elimina a un protegido
                        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                        const allProtected = [...config.PROTECTED_NUMBERS, botId];
                        
                        if (allProtected.includes(participant)) {
                            const author = update.author; // Quién hizo la acción
                            
                            // Si hay un autor y no es el bot mismo ni otro protegido
                            if (author && !allProtected.includes(author)) {
                                console.log(`🛡️ PROTECCIÓN: ${author} intentó eliminar a ${participant}. Ejecutando contragolpe...`);
                                
                                await sock.sendMessage(id, {
                                    text: `${config.MESSAGES.PROTECTION_WARNING}\n\n@${author.split('@')[0]} será eliminado por atrevido.`,
                                    mentions: [author]
                                });
                                
                                // Eliminar al infractor
                                try {
                                    await sock.groupParticipantsUpdate(id, [author], 'remove');
                                } catch (e) {
                                    console.error('Fallo al ejecutar contragolpe:', e);
                                }
                            }
                        }

                        await sock.sendMessage(id, { 
                            text: `${config.MESSAGES.GOODBYE}\n\n@${participant.split('@')[0]}`,
                            mentions: [participant]
                        });
                    }
                } catch (err) {
                    console.error('Error enviando mensaje de bienvenida/despedida:', err);
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
                
                const groupId = msg.key.remoteJid;
                const senderId = msg.key.participant || msg.key.remoteJid;
                
                // --- FILTRO ANTI-NSFW ---
                const normalizedContent = messageContent.toLowerCase();
                const isForbidden = config.BAD_WORDS.some(word => normalizedContent.includes(word));
                
                if (isForbidden) {
                    console.log(`🔞 NSFW Detectado: [${senderId}] escribió contenido prohibido.`);
                    
                    // Enviar advertencia
                    await sock.sendMessage(groupId, { 
                        text: `@${senderId.split('@')[0]} ${config.MESSAGES.NSFW_WARNING}`,
                        mentions: [senderId]
                    });

                    // Intentar borrar el mensaje si soy admin
                    if (await adminCommands.isBotAdmin(sock, groupId)) {
                        try {
                            await sock.sendMessage(groupId, { delete: msg.key });
                            console.log('🗑️ Mensaje NSFW eliminado.');
                        } catch (e) {
                            console.error('Fallo al eliminar mensaje NSFW:', e);
                        }
                    }
                    return; // No procesar más comandos si el mensaje es prohibido
                }

                // Actualizar actividad del usuario
                const groupActivity = activityCache.get(groupId) || {};
                groupActivity[senderId] = Date.now();
                activityCache.set(groupId, groupActivity);

                const args = messageContent.slice(config.PREFIX.length).trim().split(/\s+/);
                const command = args.shift().toLowerCase();

                console.log(`📩 Comando: [${command}] de [${senderId}]`);
                
                const isAdmin = await adminCommands.isAdmin(sock, groupId, senderId);
                console.log(`🛡️ Resultado isAdmin en index.js: ${isAdmin}`);
                
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
                    case 'piropo':
                    case 'embarazar': case 'impregnate':
                    case 'slap': case 'bofetada':
                    case 'marry': case 'casar':
                    case 'kill': case 'matar':
                        await handleInteraction(sock, msg, groupId, senderId, command, args);
                        break;
                    case 'frase':
                        await userCommands.showPhrase(sock, groupId);
                        break;
                    case 'dinamica': case 'daily':
                        await sendDailyActivity(sock, groupId);
                        break;
                    case 'kick':
                        await adminCommands.kickMember(sock, msg, groupId, senderId);
                        break;
                    case 'add':
                        await adminCommands.addMember(sock, msg, groupId, senderId, args);
                        break;
                    case 'promote':
                        await adminCommands.promoteToAdmin(sock, msg, groupId, senderId);
                        break;
                    case 'demote':
                        await adminCommands.demoteFromAdmin(sock, msg, groupId, senderId);
                        break;
                    case 'groupclose':
                        await adminCommands.closeGroup(sock, groupId, senderId);
                        break;
                    case 'groupopen':
                        await adminCommands.openGroup(sock, groupId, senderId);
                        break;
                    case 'inactivos':
                        await adminCommands.listInactive(sock, groupId, senderId, activityCache);
                        break;
                    case 'suerte':
                        await gameCommands.showLuck(sock, groupId, senderId);
                        break;
                    case 'dado':
                        await gameCommands.rollDice(sock, groupId);
                        break;
                    case 'slot':
                        await gameCommands.playSlot(sock, groupId, senderId);
                        break;
                    case 'todos':
                        await adminCommands.tagAll(sock, groupId, senderId, args);
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
    res.send('<html><body><h1>Reiniciando conexión...</h1><p>Generando nuevo QR si es necesario...</p><script>setTimeout(()=>window.location="/",3000);</script></body></html>');
    console.log('🔄 Reinicio manual');
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