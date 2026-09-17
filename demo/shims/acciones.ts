/**
 * Las acciones de servidor no existen en el demo.
 *
 * Los componentes que las importan (la tarjeta de aviso, por ejemplo) se
 * reutilizan tal cual; acá reciben funciones que no hacen nada, y el demo
 * maneja los cambios con su propio estado en memoria.
 */
const nada = async () => {};
const estadoInicial = async () => ({ status: "idle" as const });

export const claimTask = estadoInicial;
export const closeTask = estadoInicial;
export const releaseTask = estadoInicial;
export const assignTask = estadoInicial;
export const reassignTask = estadoInicial;
export const editTask = estadoInicial;
export const cancelTask = estadoInicial;
export const createTask = estadoInicial;
export const acknowledgeAlert = nada;
export const sweepNow = nada;
export const updateMember = estadoInicial;
export const updateSettings = estadoInicial;
export const createSkill = estadoInicial;
export const deleteSkill = nada;
export const saveProfileSkills = estadoInicial;
export const saveTaskSkills = nada;
export const savePushSubscription = async () => ({ ok: false });
export const deletePushSubscription = async () => ({ ok: false });
export const updateProfile = estadoInicial;
export const signOut = nada;
