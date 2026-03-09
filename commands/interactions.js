// commands/interactions.js

// Base de datos de respuestas creativas
const reactions = {
    hug: [
        '🤗 {author} le dio un abrazo gigante a {target}. ¡Qué bonito!',
        '🫂 {target} recibe un abrazo cálido de {author}',
        '💕 {author} abraza fuertemente a {target}',
        '🤱 {author} envuelve en un abrazo de oso a {target}'
    ],
    kiss: [
        '😘 {author} le da un besito en la mejilla a {target}',
        '💋 {target} recibe un beso apasionado de {author}',
        '💏 {author} y {target} se dan un beso romántico',
        '👄 {author} planta un beso a {target}'
    ],
    fuck: [
        '🔥 {author} se lleva a {target} a la cama. ¡Al loro!',
        '💦 Vaya, {author} y {target} han desaparecido juntos...',
        '🌶️ {author} le hace cosas muy subidas de tono a {target}',
        '🍑 {author} y {target} necesitan una habitación YA'
    ],
    impregnate: [
        '🤰 ¡Noticia bomba! {author} ha dejado embarazad@ a {target}. ¡Felicidades!',
        '🍼 {target} está esperando un hij@ de {author}',
        '👶 La cigüeña visita a {author} y {target}',
        '🎉 {target} anuncia que {author} será el/la progenitor@'
    ],
    slap: [
        '👋 ¡Zasca! {author} le suelta una bofetada a {target}',
        '🤚 {target} se lleva un sopapo de {author}',
        '💢 {author} abofetea a {target}',
        '🖐️ {target} recibe un guantazo de {author}'
    ],
    marry: [
        '💍 {author} y {target} se casan. La boda será este sábado',
        '👰 {target} acepta casarse con {author} ¡Vivan los novios!',
        '⚭ {author} le pide matrimonio a {target} y dice que sí',
        '🎊 ¡Enhorabuena! {author} y {target} forman un matrimonio'
    ],
    kill: [
        '🔪 ¡Drama! {author} asesina a {target}',
        '💀 {target} ha muerto a manos de {author}',
        '⚰️ RIP {target}. {author} te ha enviado al otro barrio',
        '🔫 {author} ejecuta a {target}'
    ],
    piropo: [
        '🌹 {author} le dice un piropo a {target}: ¿De qué dulcería te escapaste? ¡Porque eres un bombón!',
        '✨ {author} le susurra a {target}: Si fueras una estrella, serías la más brillante del cielo.',
        '😊 {author} se sonroja y le dice a {target}: Tus ojos son como el café, me quitan el sueño.',
        '💖 {author} le dedica un piropo a {target}: No es que tengas mucha ropa, es que me sobran ganas de verte.',
        '🔥 {author} le dice a {target}: ¿Te dolió cuando te caíste del cielo? Porque pareces un ángel.',
        '🍭 {author} endulza a {target} diciendo: Si la belleza fuera pecado, tú no tendrías perdón de Dios.'
    ]
};

/**
 * Obtiene un elemento aleatorio
 */
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Procesa comandos de interacción
 */
async function handleInteraction(sock, message, groupId, senderId, command, args) {
    // Obtener nombre del remitente
    let authorName = senderId.split('@')[0];
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const sender = groupMetadata.participants.find(p => p.id === senderId);
        authorName = sender?.notify || authorName;
    } catch (e) {}

    // Determinar objetivo
    let targetId = null;
    let targetName = 'alguien';

    // Caso 1: Respondió a un mensaje
    const quotedMessage = message.message?.extendedTextMessage?.contextInfo;
    if (quotedMessage?.participant) {
        targetId = quotedMessage.participant;
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            const target = groupMetadata.participants.find(p => p.id === targetId);
            targetName = target?.notify || targetId.split('@')[0];
        } catch (e) {
            targetName = targetId.split('@')[0];
        }
    }
    // Caso 2: Mencionó a alguien
    else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        targetId = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        try {
            const groupMetadata = await sock.groupMetadata(groupId);
            const target = groupMetadata.participants.find(p => p.id === targetId);
            targetName = target?.notify || targetId.split('@')[0];
        } catch (e) {
            targetName = targetId.split('@')[0];
        }
    }
    // Caso 3: Número como argumento
    else if (args && args.length > 0) {
        let rawNumber = args[0].replace('@', '');
        targetId = rawNumber + '@s.whatsapp.net';
        targetName = args[0].replace('@', '');
    }

    // Si no hay objetivo, interactúa consigo mismo
    if (!targetId) {
        targetId = senderId;
        targetName = 'sí mismo';
    }

    // No permitir interacción con el bot
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    if (targetId === botId) {
        await sock.sendMessage(groupId, {
            text: '🤖 Prefiero no participar en esas cosas, gracias.'
        });
        return;
    }

    // Seleccionar reacción según comando
    let reactionArray = null;
    switch(command) {
        case 'hug': case 'abrazo': reactionArray = reactions.hug; break;
        case 'kiss': case 'beso': reactionArray = reactions.kiss; break;
        // case 'fuck': case 'sexo': case 'coger': reactionArray = reactions.fuck; break;
        case 'embarazar': case 'impregnate': reactionArray = reactions.impregnate; break;
        case 'slap': case 'bofetada': reactionArray = reactions.slap; break;
        case 'marry': case 'casar': reactionArray = reactions.marry; break;
        case 'kill': case 'matar': reactionArray = reactions.kill; break;
        case 'piropo': reactionArray = reactions.piropo; break;
        default: return;
    }

    if (!reactionArray) return;

    // Generar mensaje
    const template = getRandomElement(reactionArray);
    const finalMessage = template
        .replace('{author}', `@${authorName}`)
        .replace('{target}', `@${targetName}`);

    // Enviar mencionando a ambos
    await sock.sendMessage(groupId, {
        text: finalMessage,
        mentions: [senderId, targetId]
    });
}

module.exports = { handleInteraction };