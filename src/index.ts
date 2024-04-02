import { U32_CAP } from './constants.js';
import { registerExtension } from './extensions.js';

export { DECODE_OPTS, DecodeOpts, UnknownExt, decode } from './decoding.js';
export { encode, encodeView } from './encoding.js';
export { registerExtension };

/**
 * Standard timestamp extension (-1 identifier) from MessagePack spec.
 * 
 * @see https://github.com/msgpack/msgpack/blob/master/spec.md#timestamp-extension-type
 */
registerExtension<Date>(
    -1,
    Date,
    (d: Date): Uint8Array => {
        const ms = d.getTime();
    
        // CAUTION: there is a distinction between floor and other methods of integer
        // division (casting away decimal) when the milliseconds are negative, i.e.,
        // the date is before the UNIX epoch. Only the 96-bit MessagePack format
        // supports negative timestamps and even within that format, only seconds are
        // signed. Say we want to represent -34.2 seconds; the intuitive way to
        // break it up would be -34 seconds and -200 million nanoseconds. However,
        // because nanoseconds are still not signed in the 96-bit format, we must floor
        // -34.2 to -35 seconds and then use 800 million nanoseconds to raise the end
        // value back up!
        const s = Math.floor(ms / 1000);
    
        // Proof that 'ns' is guaranteed to be positive:
        //      1. s <= ms / 1000                   # definition of floor function
        //      2. s * 1000 <= ms                   # algebra (multiply both sides by 1000)
        //      3. 0 <= ms - (s * 1000)             # algebra (subtract s * 1000 from both sides)
        //      4. 0 <= (ms - (s * 1000)) * 1e6     # algebra (multiply both sides by 1e6)
        const ns = (ms - (s * 1000)) * 1e6;
    
        // If timestamp is negative we must resort the 96-bit format
        if (ms >= 0) {
            if (ns === 0 && s < U32_CAP) {
                // Only seconds and they fit in uint32 -> use 32-bit representation
                const buff = new ArrayBuffer(4);
                const view = new DataView(buff);
    
                // 32 bits for seconds
                view.setUint32(0, s);
    
                return new Uint8Array(buff);
            }
            if (s < (2 ** 34)) {
                // Seconds fit in uint34 -> use 64-bit representation
                const buff = new ArrayBuffer(8);
                const view = new DataView(buff);
    
                // 30 bits for nanoseconds and upper 2 bits of seconds
                view.setUint32(0, (ns << 2) + Math.floor(s / U32_CAP));
    
                // Lower 32 bits of seconds
                view.setUint32(4, s % U32_CAP);
    
                return new Uint8Array(buff);
            }
        }
    
        // 96-bit representation (worst case if numbers are big or negative)
        const buff = new ArrayBuffer(12);
        const view = new DataView(buff);
    
        // TODO: not sure if this actually encodes int64 seconds correctly
        view.setUint32(0, ns);
        view.setInt32(4, Math.trunc(s / U32_CAP));
        view.setUint32(8, s % U32_CAP);
    
        return new Uint8Array(buff);
    },
    (data: Uint8Array): Date => {
        const view = new DataView(data.buffer, data.byteOffset, data.length);

        switch (data.length)
        {
            case 4:
            {
                return new Date(view.getUint32(0) * 1000);
            }
            case 8:
            {
                const first32Bits = view.getUint32(0);
                const nano = first32Bits >>> 2;
                const sec = ((first32Bits & 0x3) * U32_CAP) + view.getUint32(4);

                return new Date((sec * 1000) + Math.floor(nano / 1e6));
            }
            case 12:
            {
                // TODO: not sure if this actually decodes the int64 seconds correctly
                const nano = view.getUint32(0);
                const sec = (view.getInt32(4) * U32_CAP) + view.getUint32(8);
                const ms = (sec * 1000) + Math.floor(nano / 1e6);

                if (!Number.isSafeInteger(ms))
                    throw new RangeError("msgpack: decodeDate (ext -1): timestamp exceeds safe JS integer range");
            }
            default:
                throw new RangeError(`msgpack: decodeDate (ext -1): invalid data length (${data.length})`);
        }
    },
);
