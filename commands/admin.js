// commands/admin.js
const config = require('../config');

/**
 * Normaliza un ID de WhatsApp (quita @s.whatsapp.net, @lid, :0, etc.)
 */
const normalizeId = (id) => {
    if (!id) return '';
    return id.split(':')[0].split('@')[0];
};

/**
 * Verifica si un usuario es administrador
 */
const isAdmin = async (sock, groupId, participantId) => {
    try {
        const normalizedSender = normalizeId(participantId);
        const normalizedConfigAdmin = normalizeId(config.ADMIN_NUMBER);
        
        // 1. Verificar si es el admin de la configuración
        if (normalizedSender === normalizedConfigAdmin) {
            return true;
        }

        // 2. Verificar en los metadatos del grupo
        const groupMetadata = await sock.groupMetadata(groupId);
        if (!groupMetadata || !groupMetadata.participants) return false;

        const participant = groupMetadata.participants.find(p => normalizeId(p.id) === normalizedSender);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
        console.error('❌ Error en isAdmin:', error);
        return false;
    }
};

/**
 * Verifica si el bot es administrador
 */
const isBotAdmin = async (sock, groupId) => {
    try {
        // 1. Intento por ID (JID o LID)
        const jid = sock.user?.id;
        const lid = sock.user?.lid || sock.authState?.creds?.me?.lid;
        
        const botIds = [
            jid ? normalizeId(jid) : null,
            lid ? normalizeId(lid) : null
        ].filter(Boolean);

        const groupMetadata = await sock.groupMetadata(groupId);
        if (groupMetadata && groupMetadata.participants) {
            const bot = groupMetadata.participants.find(p => botIds.includes(normalizeId(p.id)));
            if (bot?.admin === 'admin' || bot?.admin === 'superadmin') {
                return true;
            }
        }

        // 2. PRUEBA FUNCIONAL DEFINITIVA:
        // Solo un administrador puede obtener el código de invitación del grupo.
        // Si esto funciona, el bot es admin sin importar qué ID estemos comparando.
        try {
            await sock.groupInviteCode(groupId);
            return true;
        } catch (err) {
            // Si falla con error 401/403, es que no es admin.
            return false;
        }
    } catch (error) {
        console.error('❌ Error verificando bot admin:', error);
        return false;
    }
};

/**
 * Comando: !kick - Eliminar miembro (soporta etiquetas y respuesta)
 */
const kickMember = async (sock, message, groupId, senderId) => {
    // Verificar si es admin
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    // Verificar si el bot es admin
    if (!(await isBotAdmin(sock, groupId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.BOT_NOT_ADMIN });
        return;
    }

    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
    
    let usersToKick = [...mentions];
    if (quotedMessage?.participant && !usersToKick.includes(quotedMessage.participant)) {
        usersToKick.push(quotedMessage.participant);
    }

    if (usersToKick.length === 0) {
        await sock.sendMessage(groupId, { text: '❌ Debes etiquetar a alguien o responder a su mensaje para usar este comando.' });
        return;
    }

    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const allProtected = [...config.PROTECTED_NUMBERS, botId];
    
    // Filtrar fuera a los protegidos de la lista a eliminar
    usersToKick = usersToKick.filter(u => !allProtected.includes(u));

    if (usersToKick.length === 0) {
        await sock.sendMessage(groupId, { text: '❌ No puedo eliminar a miembros protegidos (dueño, bot o lista blanca).' });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(groupId, usersToKick, 'remove');
        await sock.sendMessage(groupId, { text: `✅ Eliminado(s) con éxito: ${usersToKick.length} usuario(s).` });
    } catch (error) {
        console.error('Error al eliminar:', error);
        await sock.sendMessage(groupId, { text: '❌ Error al eliminar al usuario(s).' });
    }
};

/**
 * Comando: !inactivos - Lista usuarios sin actividad reciente
 */
const listInactive = async (sock, groupId, senderId, activityCache) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participants = groupMetadata.participants;
        const groupActivity = activityCache.get(groupId) || {};
        
        // Usuarios sin actividad registrada
        const inactive = participants.filter(p => !groupActivity[p.id]);

        if (inactive.length === 0) {
            await sock.sendMessage(groupId, { text: '✅ Todos los miembros han estado activos desde que el bot inició.' });
            return;
        }

        let msg = `📉 *USUARIOS INACTIVOS* (${inactive.length})\n\n`;
        msg += `_Nota: Solo detecto inactividad desde que estoy en línea._\n\n`;
        
        inactive.forEach((p, i) => {
            msg += `${i + 1}. @${p.id.split('@')[0]}\n`;
        });

        await sock.sendMessage(groupId, { 
            text: msg, 
            mentions: inactive.map(p => p.id) 
        });
    } catch (error) {
        console.error('Error en listInactive:', error);
        await sock.sendMessage(groupId, { text: '❌ Error al obtener lista de inactivos.' });
    }
};

/**
 * Comando: !todos - Menciona a todos los miembros
 */
const tagAll = async (sock, groupId, senderId, args) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participants = groupMetadata.participants;
        const message = args.join(' ') || '📢 ¡Atención a todos!';
        
        let text = `📢 *MENCIÓN GENERAL*\n\n`;
        text += `📝 *Mensaje:* ${message}\n\n`;
        
        participants.forEach((p, i) => {
            text += `@${p.id.split('@')[0]} `;
        });

        await sock.sendMessage(groupId, {
            text: text,
            mentions: participants.map(p => p.id)
        });
    } catch (error) {
        console.error('Error en tagAll:', error);
        await sock.sendMessage(groupId, { text: '❌ Error al mencionar a todos.' });
    }
};

/**
 * Comando: !add - Añadir miembro
 */
const addMember = async (sock, message, groupId, senderId, args) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    if (!(await isBotAdmin(sock, groupId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.BOT_NOT_ADMIN });
        return;
    }

    let rawNumber = args[0]?.replace(/[^0-9]/g, '');
    if (!rawNumber) {
        await sock.sendMessage(groupId, { text: '❌ Indica el número a añadir.' });
        return;
    }

    const targetId = rawNumber + '@s.whatsapp.net';
    try {
        await sock.groupParticipantsUpdate(groupId, [targetId], 'add');
        await sock.sendMessage(groupId, { text: `✅ Añadido exitosamente.` });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al añadir. Puede que el número no exista o tenga privacidad activada.' });
    }
};

/**
 * Comando: !promote - Hacer admin
 */
const promoteToAdmin = async (sock, message, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
    const targetId = mentions[0] || quotedMessage?.participant;

    if (!targetId) {
        await sock.sendMessage(groupId, { text: '❌ Menciona o responde a alguien.' });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(groupId, [targetId], 'promote');
        await sock.sendMessage(groupId, { text: `✅ Ahora es administrador.` });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al promover.' });
    }
};

/**
 * Comando: !demote - Quitar admin
 */
const demoteFromAdmin = async (sock, message, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
    const targetId = mentions[0] || quotedMessage?.participant;

    if (!targetId) {
        await sock.sendMessage(groupId, { text: '❌ Menciona o responde a alguien.' });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(groupId, [targetId], 'demote');
        await sock.sendMessage(groupId, { text: `✅ Ya no es administrador.` });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al quitar admin.' });
    }
};

/**
 * Comando: !groupclose - Cerrar grupo
 */
const closeGroup = async (sock, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    try {
        await sock.groupSettingUpdate(groupId, 'announcement');
        await sock.sendMessage(groupId, { text: '🔒 Grupo cerrado. Solo admins pueden escribir.' });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al cerrar grupo.' });
    }
};

/**
 * Comando: !groupopen - Abrir grupo
 */
const openGroup = async (sock, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    try {
        await sock.groupSettingUpdate(groupId, 'not_announcement');
        await sock.sendMessage(groupId, { text: '🔓 Grupo abierto. Todos pueden escribir.' });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al abrir grupo.' });
    }
};

module.exports = {
    isAdmin,
    isBotAdmin,
    kickMember,
    addMember,
    promoteToAdmin,
    demoteFromAdmin,
    closeGroup,
    openGroup,
    listInactive,
    tagAll
};