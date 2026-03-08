// commands/daily.js

const dailyActivities = [
    {
        name: 'PREGUNTA DEL DÍA',
        description: '🤔 ¿Cuál es el mejor consejo que has recibido?'
    },
    {
        name: 'RETO FOTOGRÁFICO',
        description: '📸 Envía una foto de algo que empiece con la letra de tu nombre'
    },
    {
        name: 'DEBATE',
        description: '🗣️ ¿Prefieres viajar al pasado o al futuro?'
    },
    {
        name: 'JUEGO',
        description: '🎮 El primero que responda a este mensaje pierde. ¡Ya!'
    },
    {
        name: 'ENCUESTA',
        description: '📊 ¿Café o té? Responde con ☕ o 🫖'
    },
    {
        name: 'ADIVINANZA',
        description: '🧩 Tengo ciudades pero no casas, bosques pero no árboles. ¿Qué soy? (Respuesta: Un mapa)'
    },
    {
        name: 'CULTURA',
        description: '🌍 Comparte una tradición curiosa de tu país'
    },
    {
        name: 'MÚSICA',
        description: '🎵 Recomienda una canción que te ponga de buen humor'
    }
];

function getTodaysActivity() {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    
    const index = dayOfYear % dailyActivities.length;
    return dailyActivities[index];
}

async function sendDailyActivity(sock, groupId) {
    const activity = getTodaysActivity();
    const message = `🌟 *${activity.name}* 🌟\n\n${activity.description}\n\n_¡Participa y diviértete!_`;
    
    await sock.sendMessage(groupId, { text: message });
}

module.exports = { sendDailyActivity };