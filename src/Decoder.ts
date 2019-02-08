/**
 * Class for decoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interfact with
 * the default/global Encoder.
 */
export class Decoder
{
    /**
     * Global Decoder instance, purely for convenience because most applications will
     * likely use the same decoding rules for all situations.
     */
    static readonly global = new Decoder();

    private static textDecoder = new TextDecoder("utf-8", { fatal: true });

    /**
     * Shortcut to call `Decoder.global.decode()`.
     */
    static decode<T>(data: ArrayBuffer | Uint8Array): T
    {
        return Decoder.global.decode<T>(data);
    }

    /**
     * Value to deserialize MsgPack's `Nil` type as. Should be set to either `null` or
     * `undefined`; default is `null`.
     */
    nilValue: null | undefined = null;

    /**
     * Determines behavior when a `String` value is encountered whose data is not valid UTF-8.
     * If true, deserializing the value will simply produce a raw Uint8Array containing the
     * data. Otherwise, a TypeError will be thrown and decoding will fail (default).
     */
    allowInvalidUTF8 = false;

    /**
     * If true, MsgPack `Map` types will always be decoded as ES6 Map objects. Otherwise, the
     * decoder will first attempt to decode each `Map` into a regular JS object, but will switch
     * to an ES6 Map if it encounters a key whose decoded JS type is `"object"`. If a switch to
     * an ES6 Map is performed, any key-value pairs that were already decoded will be abandoned
     * in case some of the keys were converted to strings, like numbers or booleans, and can now
     * be represented in their "true" form.
     */
    alwaysUseES6Maps = false;

    private buffer: Uint8Array;
    private view: DataView;
    private offset: number;

    decode<T>(data: ArrayBuffer | Uint8Array): T
    {
        this.buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
        this.offset = 0;

        return this.readValue();
    }

    readValue(): any
    {
        const seqID = this.takeUint8();

        // First handle types with a static identifier byte
        switch (seqID) {
            // Nil
            case 0xc0: return this.nilValue;

            // Booleans
            case 0xc2: return false;
            case 0xc3: return true;

            // Unsigned integers
            case 0xcc: return this.takeUint8();
            case 0xcd: return this.takeUint16();
            case 0xce: return this.takeUint32();
            case 0xcf: return this.takeUint64();

            // Signed integers
            case 0xd0: return this.takeInt8();
            case 0xd1: return this.takeInt16();
            case 0xd2: return this.takeInt32();
            case 0xd3: return this.takeInt64();

            // Floating points
            case 0xca: return this.takeFloat32();
            case 0xcb: return this.takeFloat64();

            // Strings
            case 0xd9: return this.takeString(this.takeUint8());
            case 0xda: return this.takeString(this.takeUint16());
            case 0xdb: return this.takeString(this.takeUint32());

            // Binary
            case 0xc4: return this.takeBuffer(this.takeUint8());
            case 0xc5: return this.takeBuffer(this.takeUint16());
            case 0xc6: return this.takeBuffer(this.takeUint32());

            // Arrays
            case 0xdc: return this.takeArray(this.takeUint16());
            case 0xdd: return this.takeArray(this.takeUint32());

            // Maps
            case 0xde: return this.takeMap(this.takeUint16());
            case 0xdf: return this.takeMap(this.takeUint32());
        }

        if ((seqID & (1 << 7)) === 0) // positive fixnum
            return seqID;
        throw Error("msgpack-ts: Decoder encountered fixed type that is not yet implemented");
    }

    takeUint8(): number
    {
        return this.view.getUint8(this.offset++);
    }

    takeUint16(): number
    {
        const value = this.view.getUint16(this.offset);
        this.offset += 2;
        return value;
    }

    takeUint32(): number
    {
        const value = this.view.getUint32(this.offset);
        this.offset += 4;
        return value;
    }

    takeUint64(): number
    {
        throw new Error("msgpack-ts: JavaScript does not support 64-bit integers");
    }

    takeInt8(): number
    {
        return this.view.getInt8(this.offset++);
    }

    takeInt16(): number
    {
        const value = this.view.getInt16(this.offset);
        this.offset += 2;
        return value;
    }

    takeInt32(): number
    {
        const value = this.view.getInt32(this.offset);
        this.offset += 4;
        return value;
    }

    takeInt64(): number
    {
        throw new TypeError("msgpack-ts: JavaScript does not support 64-bit integers");
    }

    takeFloat32(): number
    {
        const value = this.view.getFloat32(this.offset);
        this.offset += 4;
        return value;
    }

    takeFloat64(): number
    {
        const value = this.view.getFloat64(this.offset);
        this.offset += 8;
        return value;
    }

    takeBuffer(length: number): Uint8Array
    {
        // I might be pushing it with this one-liner (works in Chrome and FF)
        return this.buffer.subarray(this.offset, this.offset += length);
    }

    takeString(length: number): string | Uint8Array
    {
        const utf8 = this.takeBuffer(length);
        try
        {
            return Decoder.textDecoder.decode(utf8);
        }
        catch (error)
        {
            if (this.allowInvalidUTF8)
                return utf8;
            else
                throw error;
        }
    }

    takeArray(length: number): any[]
    {
        let array = new Array(length);

        for (let i = 0; i < array.length; ++i)
            array[i] = this.readValue();

        return array;
    }

    takeMap(keyCount: number, useES6Map = this.alwaysUseES6Maps): object | Map<any, any>
    {
        if (useES6Map)
        {
            const map = new Map();

            for (let i = 0; i < keyCount; ++i)
                map.set(this.readValue(), this.readValue());

            return map;
        }

        const mapStart = this.offset;
        const map = {};

        for (let i = 0; i < keyCount; ++i)
        {
            const key = this.readValue();

            if (typeof key === "object" && key !== null)
            {
                this.offset = mapStart;
                return this.takeMap(keyCount, true);
            }

            map[key] = this.readValue();
        }

        return map;
    }
}