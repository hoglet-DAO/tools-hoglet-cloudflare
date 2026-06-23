// src/app/utils/ipfsUtils.ts

// Elige uno de estos, o incluso prueba varios para ver cuál funciona mejor para ti
// const PREFERRED_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
// const PREFERRED_IPFS_GATEWAY = 'https://cloudflare-ipfs.com/ipfs/';
// const PREFERRED_IPFS_GATEWAY = 'https://gateway.lighthouse.storage/ipfs/';
const PREFERRED_IPFS_GATEWAY = 'https://ipfs.hoglet.xyz/ipfs/';
// const PREFERRED_IPFS_GATEWAY = 'https://ipfs.trustwallet.com/ipfs/'; // Otra opción

export const resolveIpfsUri = (uri: string | undefined | null): string => {
  if (!uri) {
    return '/default-token-icon.png'; // Mantén tu lógica de fallback
  }

  // Interceptar gateways de IPFS problemáticos (como w3s.link o nftstorage.link)
  if (uri.includes('.ipfs.w3s.link')) {
    const match = uri.match(/https:\/\/([^.]+)\.ipfs\.w3s\.link/);
    if (match && match[1]) {
      return `${PREFERRED_IPFS_GATEWAY}${match[1]}`;
    }
  }
  if (uri.includes('.ipfs.nftstorage.link')) {
    const match = uri.match(/https:\/\/([^.]+)\.ipfs\.nftstorage\.link/);
    if (match && match[1]) {
      return `${PREFERRED_IPFS_GATEWAY}${match[1]}`;
    }
  }

  // Si la URI ya es una URL HTTP/HTTPS (que no sea de los problemáticos) o data URI, devuélvela tal cual
  if (uri.startsWith('https://') || uri.startsWith('http://') || uri.startsWith('data:image')) {
    return uri;
  }

  // Si es una URI ipfs://, conviértela usando el gateway preferido
  if (uri.startsWith('ipfs://')) {
    const cid = uri.substring(7); // Extrae el CID
    return `${PREFERRED_IPFS_GATEWAY}${cid}`;
  }

  // Opcional: si es solo un CID (sin ipfs://), también conviértelo
  // Puedes usar una regex más robusta para identificar CIDs si es necesario
  if (uri.match(/^[a-zA-Z0-9]{46,59}$/)) { // Heurística para CIDv0 y CIDv1
      return `${PREFERRED_IPFS_GATEWAY}${uri}`;
  }
  
  // Si no coincide con ninguno de los anteriores, podría ser una URL relativa o algo inesperado.
  // Decide cómo manejarlo, quizás devolver la URI original o una de fallback.
  // Por seguridad, si no es un formato esperado, podrías devolver el icono por defecto.
  console.warn(`Unrecognized URI format in resolveIpfsUri: ${uri}`);
  return '/default-token-icon.png'; // O devuelve 'uri' si quieres ser más permisivo
};
