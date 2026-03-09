// commands/users.js
const config = require('../config');

/**
 * Comando: !menu - Muestra todos los comandos
 */
const showMenu = async (sock, groupId, isAdmin) => {
    let menuText = '📋 *COMANDOS DISPONIBLES*\n\n';
    
    // Comandos básicos
    menuText += '👥 *COMANDOS PÚBLICOS*\n';
    menuText += '└ !menu - Muestra este menú\n';
    menuText += '└ !admins - Lista de administradores\n';
    menuText += '└ !info - Información del grupo\n';
    menuText += '└ !rules - Reglas del grupo\n\n';
    
    // Comandos de interacción
    menuText += '🎮 *INTERACCIÓN*\n';
    menuText += '└ !hug / !abrazo [@usuario] - Dar un abrazo\n';
    menuText += '└ !kiss / !beso [@usuario] - Dar un beso\n';
    // menuText += '└ !fuck / !sexo [@usuario] - Subir el tono 😏\n';
    menuText += '└ !embarazar [@usuario] - Dejar embarazad@\n';
    menuText += '└ !slap / !bofetada [@usuario] - Dar una bofetada\n';
    menuText += '└ !marry / !casar [@usuario] - Casarse\n';
    menuText += '└ !kill / !matar [@usuario] - Asesinar (rol)\n';
    menuText += '└ *Responde o menciona*\n\n';
    
    // Dinámicas
    menuText += '📅 *DINÁMICAS*\n';
    menuText += '└ !dinamica - Actividad diaria\n\n';
    
    // Comandos de admin (solo visibles para admins)
    if (isAdmin) {
        menuText += '👑 *COMANDOS DE ADMIN*\n';
        menuText += '└ !kick (@responder) - Eliminar miembro\n';
        menuText += '└ !add [número] - Añadir miembro\n';
        menuText += '└ !promote (@responder) - Hacer admin\n';
        menuText += '└ !demote (@responder) - Quitar admin\n';
        menuText += '└ !groupclose - Cerrar grupo\n';
        menuText += '└ !groupopen - Abrir grupo\n';
        menuText += '└ !link - Link del grupo\n';
    }
    
    // Añadir los nuevos comandos al menú público para que todos los vean
    menuText += '\n✨ *NUEVOS*\n';
    menuText += '└ !piropo [@usuario] - Di algo bonito\n';
    menuText += '└ !frase - Frase aleatoria\n';
    
    await sock.sendMessage(groupId, { text: menuText });
};

/**
 * Comando: !admins - Lista administradores
 */
const listAdmins = async (sock, groupId) => {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const admins = groupMetadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => `👑 @${p.id.split('@')[0]}`);
        
        if (admins.length === 0) {
            await sock.sendMessage(groupId, { text: 'No hay administradores.' });
            return;
        }

        const adminList = '👑 *Administradores*\n\n' + admins.join('\n');
        
        await sock.sendMessage(groupId, {
            text: adminList,
            mentions: groupMetadata.participants
                .filter(p => p.admin)
                .map(p => p.id)
        });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al obtener admins.' });
    }
};

/**
 * Comando: !info - Información del grupo
 */
const groupInfo = async (sock, groupId) => {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const totalMembers = groupMetadata.participants.length;
        const totalAdmins = groupMetadata.participants.filter(
            p => p.admin === 'admin' || p.admin === 'superadmin'
        ).length;
        
        const info = `📊 *INFORMACIÓN DEL GRUPO*\n\n` +
                    `📌 *Nombre:* ${groupMetadata.subject}\n` +
                    `👥 *Miembros:* ${totalMembers}\n` +
                    `👑 *Admins:* ${totalAdmins}\n` +
                    `📅 *Creado:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}\n` +
                    `🔒 *Config:* ${groupMetadata.announce ? 'Solo admins' : 'Todos escriben'}`;
        
        await sock.sendMessage(groupId, { text: info });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ Error al obtener info.' });
    }
};

/**
 * Comando: !rules - Reglas del grupo
 */
const showRules = async (sock, groupId) => {
    const rules = `📜 *REGLAS DEL GRUPO*\n\n` +
                  `1️⃣ Respetar a todos los miembros\n` +
                  `2️⃣ No spam ni publicidad\n` +
                  `3️⃣ No contenido inapropiado\n` +
                  `4️⃣ Usar los comandos con responsabilidad\n` +
                  `5️⃣ ¡Diviértete! 🎉`;
    
    await sock.sendMessage(groupId, { text: rules });
};

/**
 * Comando: !link - Link del grupo (solo admins)
 */
const getGroupLink = async (sock, groupId, senderId, isAdmin) => {
    if (!isAdmin) {
        await sock.sendMessage(groupId, { text: config.MESSAGES.NOT_ADMIN });
        return;
    }

    try {
        const code = await sock.groupInviteCode(groupId);
        const inviteLink = `https://chat.whatsapp.com/${code}`;
        await sock.sendMessage(groupId, { text: `🔗 *LINK DEL GRUPO*\n${inviteLink}` });
    } catch (error) {
        await sock.sendMessage(groupId, { text: '❌ No se pudo obtener el link.' });
    }
};

/**
 * Comando: !frase - Envía una frase aleatoria
 */
const showPhrase = async (sock, groupId) => {
    const frases = [
        "✨ El éxito no es el final, el fracaso no es fatal: es el coraje para continuar lo que cuenta.",
        "🌈 Sé el cambio que quieres ver en el mundo.",
        "🚀 Lo único imposible es aquello que no intentas.",
        "💡 No cuentes los días, haz que los días cuenten.",
        "🌟 Sé tu propio arcoíris en un día nublado.",
        "🍃 La felicidad no es algo que se encuentra, es algo que se crea.",
        "🔥 No dejes que el ruido de las opiniones de los demás apague tu propia voz interior.",
        "💎 La mejor forma de predecir el futuro es creándolo.",
        "🌊 No puedes cruzar el mar simplemente mirando el agua.",
        "🌻 Cree en ti mismo y todo será posible."
    ];
    
    const frase = frases[Math.floor(Math.random() * frases.length)];
    await sock.sendMessage(groupId, { text: `📜 *FRASE DEL DÍA*\n\n"${frase}"` });
};

module.exports = {
    showMenu,
    listAdmins,
    groupInfo,
    showRules,
    getGroupLink,
    showPhrase
};