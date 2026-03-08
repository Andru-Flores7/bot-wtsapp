// config.js
module.exports = {
    // Prefijo para comandos (ej: !menu, !kick)
    PREFIX: '!',
    
    // Tu número como administrador principal (con código de país, sin + ni espacios)
    ADMIN_NUMBER: '5493884636451', // ¡CAMBIAR A TU NÚMERO!
    
    // Puerto para el servidor web
    PORT: process.env.PORT || 8080,
    
    // Mensajes del sistema
    MESSAGES: {
        NOT_ADMIN: '❌ Solo los administradores pueden usar este comando.',
        NEED_REPLY: '❌ Debes responder a un mensaje para usar este comando.',
        USER_REMOVED: '✅ Usuario eliminado del grupo.',
        BOT_NOT_ADMIN: '❌ Necesito ser administrador para hacer eso.',
        WELCOME: '🎉 ¡Bienvenido al grupo!',
        GOODBYE: '👋 Ha salido un miembro del grupo.'
    }
};