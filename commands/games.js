// commands/games.js

/**
 * Juego: !suerte - Da un número del 1 al 100
 */
const showLuck = async (sock, groupId, senderId) => {
    const luck = Math.floor(Math.random() * 100) + 1;
    let comment = '';

    if (luck > 80) comment = '🤩 ¡Hoy es tu día de suerte!';
    else if (luck > 50) comment = '😎 Nada mal.';
    else if (luck > 20) comment = '😐 Podría ser mejor.';
    else comment = '💀 Mejor no salgas de casa hoy...';

    await sock.sendMessage(groupId, { 
        text: `🎲 *PRUEBA DE SUERTE*\n\n@${senderId.split('@')[0]}, tu nivel de suerte hoy es: *${luck}%*\n\n${comment}`,
        mentions: [senderId]
    });
};

/**
 * Juego: !dado - Lanza un dado
 */
const rollDice = async (sock, groupId) => {
    const dice = Math.floor(Math.random() * 6) + 1;
    const emojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    
    await sock.sendMessage(groupId, { 
        text: `🎲 *LANZAMIENTO DE DADO*\n\nHas sacado un: *${dice}* ${emojis[dice-1]}`
    });
};

/**
 * Juego: !slot - Tragamonedas
 */
const playSlot = async (sock, groupId, senderId) => {
    const items = ['🍒', '🍋', '🍇', '💎', '🔔', '7️⃣'];
    const r1 = items[Math.floor(Math.random() * items.length)];
    const r2 = items[Math.floor(Math.random() * items.length)];
    const r3 = items[Math.floor(Math.random() * items.length)];

    let result = `🎰 *TRAGAMONEDAS*\n\n`;
    result += `[ ${r1} | ${r2} | ${r3} ]\n\n`;

    if (r1 === r2 && r2 === r3) {
        result += `🏆 ¡JACKPOT! @${senderId.split('@')[0]} ha ganado!`;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        result += `✨ ¡Casi! Premio menor para @${senderId.split('@')[0]}.`;
    } else {
        result += `❌ Inténtalo de nuevo, @${senderId.split('@')[0]}.`;
    }

    await sock.sendMessage(groupId, { 
        text: result,
        mentions: [senderId]
    });
};

module.exports = {
    showLuck,
    rollDice,
    playSlot
};
