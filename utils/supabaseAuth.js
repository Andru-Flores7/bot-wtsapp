const { createClient } = require('@supabase/supabase-js');
const { proto, Curve, generateRegistrationId, BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

/**
 * Proveedor de autenticación personalizado para guardar sesión en Supabase
 * @param {string} supabaseUrl 
 * @param {string} supabaseKey 
 */
async function useSupabaseAuthState(supabaseUrl, supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    /**
     * Función recursiva para buscar y convertir objetos que deberían ser Buffers.
     * Supabase JSONB maneja objetos JSON, por lo que debemos reconstruir los Buffers.
     */
    const fixBuffers = (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;

        // Formato oficial de Baileys/BufferJSON: { type: 'Buffer', data: 'base64...' }
        if (obj.type === 'Buffer' && obj.data !== undefined) {
            if (typeof obj.data === 'string') {
                return Buffer.from(obj.data, 'base64');
            }
            if (Array.isArray(obj.data)) {
                return Buffer.from(obj.data);
            }
            if (typeof obj.data === 'object' && obj.data !== null) {
                return Buffer.from(Object.values(obj.data));
            }
        }

        // Recursión para arrays
        if (Array.isArray(obj)) {
            return obj.map(fixBuffers);
        }

        // Recursión para objetos
        const newObj = {};
        for (const key in obj) {
            newObj[key] = fixBuffers(obj[key]);
        }
        return newObj;
    };

    const writeData = async (id, data) => {
        try {
            // Usamos el serializador oficial de Baileys
            const jsonStr = JSON.stringify(data, BufferJSON.replacer);
            const payload = JSON.parse(jsonStr);

            if (id === 'creds') console.log('💾 Guardando credenciales en Supabase...');

            const { error } = await supabase
                .from('sessions')
                .upsert({ id: id.toString(), data: payload }, { onConflict: 'id' });
            
            if (error) console.error(`❌ Error Supabase al guardar ${id}:`, error.message);
        } catch (e) {
            console.error(`❌ Error serializando ${id}:`, e.message);
        }
    };

    const readData = async (id) => {
        try {
            const { data, error } = await supabase
                .from('sessions')
                .select('data')
                .eq('id', id.toString())
                .single();

            if (error || !data || !data.data) return null;
            
            // Reconstrucción recursiva de Buffers
            const content = fixBuffers(data.data);

            if (id === 'creds' && content) {
                console.log('📖 Credenciales cargadas de Supabase.');
                // Verificación profunda de llaves críticas
                if (content.noiseKey && content.signedIdentityKey && content.signedPreKey) {
                    const noiseOK = Buffer.isBuffer(content.noiseKey.public);
                    const identOK = Buffer.isBuffer(content.signedIdentityKey.public);
                    const preKeyOK = content.signedPreKey.keyPair && Buffer.isBuffer(content.signedPreKey.keyPair.public);
                    
                    console.log(`🔍 Diagnóstico: Noise: ${noiseOK ? '✅':'❌'}, Ident: ${identOK ? '✅':'❌'}, PreKey: ${preKeyOK ? '✅':'❌'}`);
                }
            }

            return content;
        } catch (error) {
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await supabase
                .from('sessions')
                .delete()
                .eq('id', id.toString());
        } catch (error) {
            console.error(`❌ Error eliminando ${id} de Supabase:`, error.message);
        }
    };

    // Cargar o inicializar credenciales usando la función OFICIAL de Baileys
    let creds = await readData('creds');
    if (!creds) {
        console.log('🆕 Inicializando nuevas credenciales...');
        creds = initAuthCreds();
        await writeData('creds', creds);
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(key, value));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData('creds', creds),
    };
}

module.exports = { useSupabaseAuthState };
