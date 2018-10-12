import { IEEE754 } from "./IEEE754";

declare class Object {
    static values(obj: object): any[];
}

/**
 * Class for encoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interact with
 * the default/global Encoder.
 */
export class Encoder
{
    encode(data: any): Uint8Array
    {
        const buffer = new Uint8Array(this.computeLen(data));
        this.recursiveEncode(data, buffer, 0);
        return buffer;
    }

    /**
     * Compute the encoded length of a value.
     */
    private computeLen(data: any): number
    {
        switch (typeof data)
        {
            case "undefined":
            case "function":
                return 0;
            case "boolean":
                return 1;
            case "number":
                return 9;
            case "string":
                const utf8Length = Encoder.textEncoder.encode(data).length;
                if (utf8Length < 32)
                    return 1 + utf8Length;
                else if (utf8Length < (1 << 8))
                    return 2 + utf8Length;
                else if (utf8Length < (1 << 16))
                    return 3 + utf8Length;
                else if (utf8Length < (1 << 32))
                    return 5 + utf8Length;
                else
                    throw new Error("string too long to encode (more than 2^32 - 1 UTF-8 characters)");
            case "object":
                if (data === null)
                    return 1;
                if (data instanceof ArrayBuffer)
                    return binLen(data.byteLength);
                if (data instanceof Uint8Array)
                    return binLen(data.length);
                if (Array.isArray(data))
                    return data.reduce((acc, elem) => acc + this.computeLen(elem), arrLen(data.length));
                if (data instanceof Map) {
                    
                }
        }
    }

    private recursiveEncode(data: any, buffer: Uint8Array, offset: number)
    {

    }
    
    private static readonly textEncoder = new TextEncoder();
    private static readonly bitmask = 255;

    private static writeNil(buffer: Uint8Array, offset: number)
    {
        buffer[offset] = 0xc0;
    }
    
    private static writeBoolean(data: boolean, buffer: Uint8Array, offset: number)
    {
        buffer[offset] = data ? 0xc3 : 0xc2;
    }
    
    private static writeFloat64(data: number, buffer: Uint8Array, offset: number)
    {
        IEEE754.write(buffer, data, offset);
    }
    
    private static writeString(data: string, buffer: Uint8Array, offset: number)
    {
        const utf8 = this.textEncoder.encode(data);

        if (utf8.length < 32)
        {
            buffer[offset] = 0xa0 | length;
            buffer.set(utf8, offset + 1);
        }
        else
        {
            try
            {
                this.writeBinLike(utf8, buffer, offset, {
                    _1byte: 0xd9,
                    _2byte: 0xda,
                    _4byte: 0xdb
                });
            }
            catch
            {
                // String specific error
                throw new Error("string too long to encode (more than 2^32 - 1 UTF-8 characters)");
            }
        }
    }

    private static writeBinary(data: Uint8Array | ArrayBuffer, buffer: Uint8Array, offset: number)
    {
        if (data instanceof ArrayBuffer)
            data = new Uint8Array(data);

        this.writeBinLike(data, buffer, offset, {
            _1byte: 0xc4,
            _2byte: 0xc5,
            _4byte: 0xc6
        });
    }

    private static writeBinLike(data: Uint8Array, buffer: Uint8Array, offset: number, identifiers: {
        _1byte: number;
        _2byte: number;
        _4byte: number;
    })
    {
        const length = data.length;

        if (length < (1 << 8))
        {
            buffer[offset] = identifiers._1byte;
            buffer[offset + 1] = length;
            buffer.set(data, offset + 2);
        }
        else if (length < (1 << 16))
        {
            buffer[offset] = identifiers._2byte;
            buffer[offset + 1] = length >> 8;
            buffer[offset + 2] = length & this.bitmask;
            buffer.set(data, offset + 3);
        }
        else if (length < (1 << 32))
        {
            buffer[offset] = identifiers._4byte;
            buffer[offset + 1] = length >> 24;
            buffer[offset + 2] = length & (this.bitmask << 16);
            buffer[offset + 3] = length & (this.bitmask << 8);
            buffer[offset + 4] = length & this.bitmask;
            buffer.set(data, offset + 5);
        }
        else throw new Error("buffer too long to encode (more than 2^32 - 1 bytes)");
    }

    /**
     * DOES NOT encode array elements. Only encodes that the following n items are
     * in an array. Excludes `undefined` elements.
     */
    private static writeArray(data: any[], buffer: Uint8Array, offset: number)
    {
        let length = 0;
        data.forEach(elem => {
            if (elem !== undefined) ++length;
        });

        if (length < 16)
        {
            buffer[offset] = 0x90 | length;
        }
        else if (length < (1 << 16))
        {
            buffer[offset] = 0xdc;
            buffer[offset + 1] = length >> 8;
            buffer[offset + 2] = length & this.bitmask;
        }
        else // ECMA dictates that array length will never exceed a uint32
        {
            buffer[offset] = 0xdd;
            buffer[offset + 1] = length >> 24;
            buffer[offset + 2] = length & (this.bitmask << 16);
            buffer[offset + 3] = length & (this.bitmask << 8);
            buffer[offset + 4] = length & this.bitmask;
        }
    }

    /**
     * DOES NOT encode map elements. Only encodes that the following n key-value pairs are
     * in a map. Excludes `undefined` values.
     */
    private static writeMap(data: object | Map<any, any>, buffer: Uint8Array, offset: number)
    {
        let numValues = 0;
        if (data instanceof Map)
        {
            data.forEach(value => {
                if (value !== undefined) ++numValues;
            });
        }
        else
        {
            Object.values(data).forEach(value => {
                if (value !== undefined) ++numValues;
            });
        }

        if (numValues < 16)
        {
            buffer[offset] = 0x80 | numValues;
        }
        else if (numValues < (1 << 16))
        {
            buffer[offset] = 0xde;
            buffer[offset + 1] = numValues >> 8;
            buffer[offset + 2] = numValues & this.bitmask;
        }
        else if (numValues < (1 << 32))
        {
            buffer[offset] = 0xdf;
            buffer[offset + 1] = numValues >> 24;
            buffer[offset + 2] = numValues & (this.bitmask << 16);
            buffer[offset + 3] = numValues & (this.bitmask << 8);
            buffer[offset + 4] = numValues & this.bitmask;
        }
        else throw new Error("map too large to encode (more than 2^32 - 1 defined values)");
    }
}

/**
 * Computes the total [encoded] length of a binary buffer, given the length
 * of the buffer, in bytes.
 */
function binLen(size: number): number
{
    if (size < (1 << 8))
        return 2 + size;
    if (size < (1 << 16))
        return 3 + size;
    return 5 + size;
}

/**
 * Computes the length needed to encode an array PREFIX, given the number of
 * elements. The length does not include the size of encoded elements.
 */
function arrLen(elementCount: number): number
{
    if (elementCount < 16)
        return 1;
    if (elementCount < (1 << 16))
        return 3;
    return 5;
}

/**
 * Computes the length needed to encode a map PREFIX, given the number of keys
 * in the map. The length does not include the size of encoded keys/elements.
 */
function mapLen(keyCount: number): number
{
    if (keyCount < 16)
        return 1;
    if (keyCount < (1 << 16))
        return 3;
    return 5;
}