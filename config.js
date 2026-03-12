// config.js
module.exports = {
    // Prefijo para comandos (ej: !menu, !kick)
    PREFIX: '!',
    
    // Tu número como administrador principal (con código de país, sin + ni espacios)
    ADMIN_NUMBER: '5493884636451', // ¡CAMBIAR A TU NÚMERO!
    
    // Puerto para el servidor web
    PORT: process.env.PORT || 8080,
    
    // Configuración de Supabase para persistencia de sesión
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://hwasdoyheozbdvlxjavb.supabase.co',
    SUPABASE_KEY: process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3YXNkb3loZW96YmR2bHhqYXZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzA5MzMzNywiZXhwIjoyMDg4NjY5MzM3fQ.oe54GvqHJPCLdW_j8ALLfwbXmT0xOMOim-PLGvwhZoM',

    // Mensajes del sistema
    MESSAGES: {
        NOT_ADMIN: '❌ Solo los administradores pueden usar este comando.',
        NEED_REPLY: '❌ Debes responder a un mensaje para usar este comando.',
        USER_REMOVED: '✅ Usuario eliminado del grupo.',
        BOT_NOT_ADMIN: '❌ Necesito ser administrador para hacer eso.',
        WELCOME: '🎉 ¡Bienvenido al grupo!',
        GOODBYE: '👋 Ha salido un miembro del grupo.',
        PROTECTION_WARNING: '⚠️ ¡Intento de eliminar a un miembro PROTEGIDO detectado!',
        NSFW_WARNING: '🔞 El envío de contenido inapropiado está prohibido en este grupo.'
    },

    // Filtro Anti-NSFW
    BAD_WORDS: ['porno', 'porn', 'xxx', 'hentai', 'sexo', 'pene', 'vagina', 'culo', 'tetas'],

    // Números protegidos (el bot se añade automáticamente en index.js)
    PROTECTED_NUMBERS: [
        '543884636451@s.whatsapp.net', // Dueño
        '527971415726@s.whatsapp.net'  // Amiga
    ]
};