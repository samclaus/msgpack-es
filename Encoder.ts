import { IEEE754 } from "./IEEE754";

/**
 * Class for encoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interfact with
 * the default/global Encoder.
 */
export class Encoder {

    encode(): Uint8Array {
        
    }
    
    private static textEncoder = new TextEncoder();

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

        if (utf8.length < (1 << 5))
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
                throw new Error("string too long to encode");
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
        const bitmask = 255;

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
            buffer[offset + 2] = length & bitmask;
            buffer.set(data, offset + 3);
        }
        else if (length < (1 << 32))
        {
            buffer[offset] = identifiers._4byte;
            buffer[offset + 1] = length >> 24;
            buffer[offset + 2] = length & (bitmask << 16);
            buffer[offset + 3] = length & (bitmask << 8);
            buffer[offset + 4] = length & bitmask;
            buffer.set(data, offset + 5);
        }
        else throw new Error("buffer too long to encode");
    }

}