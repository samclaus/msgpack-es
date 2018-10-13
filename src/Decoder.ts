/**
 * Class for decoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interfact with
 * the default/global Encoder.
 */
export class Decoder
{
    private static textDecoder = new TextDecoder("utf-8", {
        fatal: true
    });

    /**
     * When reading msgpack string/binary objects from the data, determines if
     * the data should be copied to new buffers, or simply returned as subviews
     * of the buffer being decoded (better performance, but dangerous if you do
     * stuff to the message data after decoding it).
     */
    copyBuffers = false;

    /**
     * Value to deserialize msgpack's nil as. Should be set to either null or undefined.
     */
    nilValue: null | undefined = null;

    /**
     * What to do when a msgpack string value is encountered but the binary data is not
     * valid UTF-8. Can either throw an error or just return the raw binary data as a
     * Uint8Array.
     */
    invalidUTFBehavior: "throw" | "raw" = "throw";

    /**
     * Determines whether 
     */
    useES6Maps = false;

    private buffer: Uint8Array;
    private view: DataView;
    private offset: number;

    decode<T>(data: ArrayBuffer | Uint8Array): T {
        this.buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
        this.offset = 0;

        return this.readValue();
    }

    readValue(): any {
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
            case 0xdc: {
                const array = new Array(this.takeUint16());

                for (let i = 0; i < array.length; ++i)
                    array[i] = this.readValue();
                
                return array;
            }
            case 0xdd: {
                const array = new Array(this.takeUint32());

                for (let i = 0; i < array.length; ++i)
                    array[i] = this.readValue();
                
                return array;
            }

            // Maps
            case 0xde: {
                const keyCount = this.takeUint16();
                const map = {};

                for (let i = 0; i < keyCount; ++i)
                    map[this.readValue()] = this.readValue();

                return map;
            }
            case 0xdf: {
                const keyCount = this.takeUint32();
                const map = {};

                for 
            }
        }

        // Now detect fixed types (positive fixnum, fixstr, etc.)

    }

    takeUint8(): number {
        return this.view.getUint8(this.offset++);
    }

    takeUint16(): number {
        const value = this.view.getUint16(this.offset);
        this.offset += 2;
        return value;
    }

    takeUint32(): number {
        const value = this.view.getUint32(this.offset);
        this.offset += 4;
        return value;
    }

    takeUint64(): number {
        throw new Error("msgpack-ts: JavaScript does not support 64-bit integers");
    }

    takeInt8(): number {
        return this.view.getInt8(this.offset++);
    }

    takeInt16(): number {
        const value = this.view.getInt16(this.offset);
        this.offset += 2;
        return value;
    }

    takeInt32(): number {
        const value = this.view.getInt32(this.offset);
        this.offset += 4;
        return value;
    }

    takeInt64(): number {
        throw new Error("msgpack-ts: JavaScript does not support 64-bit integers");
    }

    takeFloat32(): number {
        const value = this.view.getFloat32(this.offset);
        this.offset += 4;
        return value;
    }

    takeFloat64(): number {
        const value = this.view.getFloat64(this.offset);
        this.offset += 8;
        return value;
    }

    takeBuffer(length: number): Uint8Array {
        const end = this.offset + length;
        const buffer = this.copyBuffers ?
            this.buffer.slice(this.offset, end) :
            this.buffer.subarray(this.offset, end);
        this.offset += length;
        return buffer;
    }

    takeString(length: number): string | Uint8Array {
        const utf8 = this.takeBuffer(length);
        try
        {
            return Decoder.textDecoder.decode(utf8);
        }
        catch (error)
        {
            if (this.invalidUTFBehavior === "raw")
                return utf8;
            else
                throw error;
        }
    }

    takeArray(length: number): any[] {
        let array = new Array(length);

        for (let i = 0; i < array.length; ++i)
            array[i] = this.readValue();

        return array;
    }

    takeMap(keyCount: number): object | Map<any, any>
    {
        let map = {};

        for (let i = 0; i < keyCount; ++i)


        return map;
    }
}