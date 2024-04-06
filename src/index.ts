import { U32_CAP } from './constants.js';
import { registerExtension } from './extensions.js';

export { DECODE_OPTS, UnknownExt, decode, type DecodeOpts } from './decoding.js';
export { encode, encodeView, resizeEncodingBuffer } from './encoding.js';
export { registerExtension };

// Allocate only once up-front for Date encoding
const
    dateBuff = new Uint8Array(12),
    dateView = new DataView(dateBuff.buffer);

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
    
        // If timestamp is negative or too large we must resort the 96-bit format;
        // we never use the 32-bit format because it does not support sub-second
        // precision and ECMAScript Dates always have millisecond precision so it
        // is rare that they will be an even number of seconds
        if (ms >= 0 && s < (2 ** 34)) {
            // 30 bits for nanoseconds and upper 2 bits of seconds
            dateView.setUint32(0, (ns << 2) + Math.floor(s / U32_CAP));

            // Lower 32 bits of seconds
            dateView.setUint32(4, s % U32_CAP);

            return dateBuff.subarray(0, 8);
        }
    
        // 96-bit representation (worst case if numbers are big or negative)
        // TODO: not sure if this actually encodes int64 seconds correctly
        dateView.setUint32(0, ns);
        dateView.setInt32(4, Math.trunc(s / U32_CAP));
        dateView.setUint32(8, s % U32_CAP);
    
        return dateBuff;
    },
    (data: Uint8Array): Date => {
        const view = new DataView(data.buffer, data.byteOffset, data.length);

        switch (data.length) {
            case 4: {
                return new Date(view.getUint32(0) * 1000);
            }
            case 8: {
                const first32Bits = view.getUint32(0);
                const nano = first32Bits >>> 2;
                const sec = ((first32Bits & 0x3) * U32_CAP) + view.getUint32(4);

                return new Date((sec * 1000) + Math.floor(nano / 1e6));
            }
            case 12: {
                // TODO: not sure if this actually decodes the int64 seconds correctly
                const nano = view.getUint32(0);
                const sec = (view.getInt32(4) * U32_CAP) + view.getUint32(8);
                const ms = (sec * 1000) + Math.floor(nano / 1e6);

                if (!Number.isSafeInteger(ms))
                    throw new RangeError("msgpack: decodeDate (ext -1): timestamp exceeds safe JS integer range");
            }
            default: {
                throw new RangeError(`msgpack: decodeDate (ext -1): invalid data length (${data.length})`);
            }
        }
    },
);
