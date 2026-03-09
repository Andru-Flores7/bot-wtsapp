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
 * Comando: !kick - Eliminar miembro (requiere responder)
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

    // Obtener usuario a eliminar (del mensaje respondido)
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
    if (!quotedMessage?.participant) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NEED_REPLY });
        return;
    }

    const userToKick = quotedMessage.participant;
    
    // No permitir eliminar al bot
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    if (userToKick === botId) {
        await sock.sendMessage(groupId, { text: '❌ No puedo eliminarme a mí mismo.' });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(groupId, [userToKick], 'remove');
        await sock.sendMessage(groupId, { text: config.MESSAGES.USER_REMOVED });
    } catch (error) {
        console.error('Error al eliminar:', error);
        await sock.sendMessage(groupId, { text: '❌ Error al eliminar al usuario.' });
    }
};

/**
 * Comando: !add 521234567890 - Añadir miembro
 */
const addMember = async (sock, message, groupId, senderId, args) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    if (!args || args.length < 1) {
        await sock.sendMessage(groupId, { text: '❌ Uso: !add 521234567890' });
        return;
    }

    // Limpiar el número de teléfono (quitar +, espacios, guiones)
    const cleanNumber = args[0].replace(/\D/g, '');
    const phoneNumber = cleanNumber + '@s.whatsapp.net';
    
    try {
        await sock.groupParticipantsUpdate(groupId, [phoneNumber], 'add');
        await sock.sendMessage(groupId, { text: `✅ Usuario añadido: ${cleanNumber}` });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ No se pudo añadir. La privacidad del usuario puede impedirlo o el número es incorrecto.' });
    }
};

/**
 * Comando: !promote - Hacer admin (requiere responder)
 */
const promoteToAdmin = async (sock, message, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
    if (!quotedMessage?.participant) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NEED_REPLY });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(groupId, [quotedMessage.participant], 'promote');
        await sock.sendMessage(groupId, { text: '✅ Usuario promovido a administrador.' });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al promover.' });
    }
};

/**
 * Comando: !demote - Quitar admin (requiere responder)
 */
const demoteFromAdmin = async (sock, message, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
    if (!quotedMessage?.participant) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NEED_REPLY });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(groupId, [quotedMessage.participant], 'demote');
        await sock.sendMessage(groupId, { text: '✅ Administrador degradado.' });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al degradar.' });
    }
};

/**
 * Comando: !groupclose - Cerrar grupo (solo admins)
 */
const closeGroup = async (sock, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    try {
        await sock.groupSettingUpdate(groupId, 'announcement');
        await sock.sendMessage(groupId, { text: '🔒 Grupo cerrado. Solo admins pueden enviar mensajes.' });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al cerrar grupo.' });
    }
};

/**
 * Comando: !groupopen - Abrir grupo (solo admins)
 */
const openGroup = async (sock, groupId, senderId) => {
    if (!(await isAdmin(sock, groupId, senderId))) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    try {
        await sock.groupSettingUpdate(groupId, 'not_announcement');
        await sock.sendMessage(groupId, { text: '🔓 Grupo abierto. Todos pueden enviar mensajes.' });
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
    openGroup
};