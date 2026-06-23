import { sha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';
import { CID } from 'multiformats/cid';

export const predictCID = async (input: File | string) => {
    try {
        let buffer: Uint8Array;

        if (typeof input === 'string') {
            // Convert string to Uint8Array for hashing
            buffer = new TextEncoder().encode(input);
        } else if (input instanceof File) {
            // Convert File to Uint8Array for hashing
            buffer = new Uint8Array(await input.arrayBuffer());
        } else {
            throw new Error("Input must be a File or a string");
        }

        // The backend logs show CIDs starting with 'bafkre...', which are CIDv1
        // with a 'raw' codec. This means we must hash the raw bytes of the file
        // and create the CID directly, without wrapping it in a UnixFS/dag-pb structure.
        const hash = await sha256.digest(buffer);
        const cid = CID.create(1, raw.code, hash);

        return cid.toString();

    } catch (err) {
        console.error("Error predicting CID:", err);
        throw err;
    }
};
