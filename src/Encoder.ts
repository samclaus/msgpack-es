
type Constructor<T> = new (...args: any[]) => T;

type ExtEncoderFn<T> = (value: T) => Uint8Array;

interface ExtEncoder<T> {
    readonly type: number;
    readonly fn:   ExtEncoderFn<T>;
}

/**
 * Class for encoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interact with
 * the default/global Encoder.
 */
export class Encoder
{
    private static readonly textEncoder = new TextEncoder();

    /**
     * The starting buffer size when encoding an object, in bytes. The buffer will
     * then be grown by factors of 2 as needed. Default is 128.
     */
    initialBufferSize = 128;

    private static encodeDate(date: Date): Uint8Array
    {
        const ms = date.getTime();
        const sec = Math.floor(ms / 1000);
        const nano = (ms % 1000) * 1e6;
        const buffer = new Uint32Array(2);

        // 8 bytes - first 30 bits are nanoseconds, last 34 are seconds
        buffer[0] = (nano << 2) | (sec / Math.pow(2, 32));
        buffer[1]; // TODO: get last 32 bits of seconds (bitwise doesn't behave, gives 0 if number is greater than 2^32 - 1)

        return new Uint8Array(buffer.buffer);
    }

    /**
     * Registered extension decoders.
     */
    private readonly extensions = new Map<Constructor<any>, ExtEncoder<any>>();

    /**
     * Buffer is a Uint8Array "view" on top of the underlying data buffer. It compliments
     * this.view, because Uint8Array and DataView support different operations.
     */
    private buffer: Uint8Array;

    /**
     * View is a DataView "view" on top of the underlying data buffer. It compliments
     * this.buffer, because Uint8Array and DataView support different operations.
     */
    private view: DataView;

    /**
     * Offset is the current location in the buffer we are encoding to.
     */
    private offset: number;

    /**
     * Encode a value to the MsgPack binary format. The returned Uint8Array will be a slice of
     * the larger underlying ArrayBuffer used for encoding, so you will need to call slice() on
     * it and grab the ArrayBuffer of the result if you need the result as a raw ArrayBuffer.
     * 
     * @param data              The data to encode.
     * @param initialBufferSize Optional override for this.initialBufferSize.
     */
    encode(data: any, initialBufferSize = this.initialBufferSize): Uint8Array
    {
        this.buffer = new Uint8Array(initialBufferSize);
        this.view = new DataView(this.buffer.buffer);
        this.offset = 0;
        this.recursiveEncode(data);

        return this.buffer.subarray(0, this.offset);
    }

    /**
     * Register an extension encoder. Negative extension types are reserved by the spec, but
     * it is legal for you, the library user, to register encoders for such extensions in case
     * this library has not been updated to provide one or it does not fit your use case.
     */
    registerExt<T>(constructor: Constructor<T>, type: number, encoderFn: ExtEncoderFn<T>)
    {
        this.extensions.set(constructor, { type: type, fn: encoderFn });
    }

    private recursiveEncode = (data: any) =>
    {
        switch (typeof data)
        {
            case "undefined":
                this.writeNil();
                break;
            case "boolean":
                this.writeBoolean(data);
                break;
            case "number":
                this.writeNumber(data);
                break;
            case "string":
                this.writeString(data);
                break;
            case "object":
                if (data === null)
                {
                    this.writeNil();
                }
                else if (data instanceof Uint8Array || data instanceof ArrayBuffer)
                {
                    this.writeBinary(data);
                }
                else if (Array.isArray(data))
                {
                    this.writeArrayPrefix(data.length);
                    data.forEach(this.recursiveEncode);
                }
                else if (data instanceof Map) // this is gonna need some work
                {
                    const validKeys = Array.from(data.keys()).filter(key => {
                        const keyType = typeof key;
                        const valType = typeof data.get(key);

                        return keyType !== "function" && valType !== "function" && valType !== "undefined";
                    });
                    this.writeMapPrefix(validKeys.length);
                    validKeys.forEach(key => {
                        this.recursiveEncode(key);
                        this.recursiveEncode(data.get(key));                        
                    });
                }
                else
                {
                    const validKeys = Object.keys(data).filter(key => {
                        const valType = typeof data[key];
                        return valType !== "undefined" && valType !== "function";
                    });
                    this.writeMapPrefix(validKeys.length);
                    validKeys.forEach(key => {
                        this.recursiveEncode(key);
                        this.recursiveEncode(data[key]);
                    });
                }
                break;
        }
    }

    private ensureSufficientSpace(bytesToEncode: number)
    {
        if (this.offset + bytesToEncode > this.view.byteLength)
        {
            const newBuffer = new Uint8Array(this.buffer.byteLength * 2);
            newBuffer.set(this.buffer);

            this.buffer = newBuffer;
            this.view = new DataView(this.buffer.buffer);
        }
    }

    private writeNil()
    {
        this.ensureSufficientSpace(1);
        this.view.setUint8(this.offset++, 0xc0);
    }
    
    private writeBoolean(value: boolean)
    {
        this.ensureSufficientSpace(1);
        this.view.setUint8(this.offset++, value ? 0xc3 : 0xc2);
    }
    
    private writeNumber(value: number)
    {
        if (Number.isSafeInteger(value))
        {
            if (value >= 0)
            {
                if (value < (1 << 7))
                {
                    this.ensureSufficientSpace(1);
                    this.view.setUint8(this.offset++, value);
                }
                else if (value < (1 << 8))
                {
                    this.ensureSufficientSpace(2);
                    this.view.setUint8(this.offset++, 0xcc);
                    this.view.setUint8(this.offset++, value);
                }
                else if (value < (1 << 16))
                {
                    this.ensureSufficientSpace(3);
                    this.view.setUint8(this.offset++, 0xcd);
                    this.view.setUint16(this.offset, value);
                    this.offset += 2;
                }
                else if (value < (1 << 32))
                {
                    this.ensureSufficientSpace(5);
                    this.view.setUint8(this.offset++, 0xce);
                    this.view.setUint32(this.offset, value);
                    this.offset += 4;
                }
                else // uint64; cannot use bitwise operators (casts to uint32)
                {
                    this.ensureSufficientSpace(9);
                    this.view.setUint8(this.offset++, 0xcf);
                    this.view.setUint32(this.offset, value / (1 << 32));
                    this.offset += 4;
                    this.view.setUint32(this.offset, value);
                    this.offset += 4;
                }
            }
            else
            {
                if (value >= -32)
                {
                    this.ensureSufficientSpace(1);
                    this.view.setInt8(this.offset++, value);
                }
                else if (value >= -(1 << 8))
                {
                    this.ensureSufficientSpace(2);
                    this.view.setUint8(this.offset++, 0xd0);
                    this.view.setInt8(this.offset++, value);
                }
                else if (value >= -(1 << 16))
                {
                    this.ensureSufficientSpace(3);
                    this.view.setUint8(this.offset++, 0xd1);
                    this.view.setInt16(this.offset, value);
                    this.offset += 2;
                }
                else if (value >= -(1 << 32))
                {
                    this.ensureSufficientSpace(5);
                    this.view.setUint8(this.offset++, 0xd2);
                    this.view.setInt32(this.offset, value);
                    this.offset += 4;
                }
                else // TODO: figure out how to encode int64
                {
                    this.ensureSufficientSpace(9);
                    this.view.setUint8(this.offset++, 0xcb);
                    this.view.setFloat64(this.offset, value);
                    this.offset += 8;
                }
            }
        }
        else // TODO: check if it can fit in a float32
        {
            this.ensureSufficientSpace(9);
            this.view.setUint8(this.offset++, 0xcb);
            this.view.setFloat64(this.offset, value);
            this.offset += 8;
        }
    }
    
    private writeString(value: string)
    {
        const utf8 = Encoder.textEncoder.encode(value);

        if (utf8.length < 32)
        {
            this.ensureSufficientSpace(1 + utf8.byteLength);
            this.view.setUint8(this.offset++, 0xa0 | utf8.byteLength);
            this.buffer.set(utf8, this.offset);
            this.offset += utf8.byteLength;
        }
        else
        {
            try
            {
                this.writeBytes(utf8, 0xd9, 0xda, 0xdb);
            }
            catch
            {
                // String specific error
                throw new RangeError("msgpack: string too long to encode (more than 2^32 - 1 UTF-8 runes)");
            }
        }
    }

    private writeBinary(value: Uint8Array | ArrayBuffer)
    {
        this.writeBytes(value instanceof ArrayBuffer ? new Uint8Array(value) : value, 0xc4, 0xc5, 0xc6);
    }

    private writeBytes(
        data: Uint8Array,
        oneByteLenSeqIdentifier: number,
        twoByteLenSeqIdentifier: number,
        fourByteLenSeqIdentifier: number
    )
    {
        if (data.byteLength < (1 << 8))
        {
            this.ensureSufficientSpace(2 + data.byteLength);
            this.view.setUint8(this.offset++, oneByteLenSeqIdentifier);
            this.view.setUint8(this.offset++, data.byteLength);
        }
        else if (data.byteLength < (1 << 16))
        {
            this.ensureSufficientSpace(3 + data.byteLength);
            this.view.setUint8(this.offset++, twoByteLenSeqIdentifier);
            this.view.setUint16(this.offset, data.byteLength);
            this.offset += 2;
        }
        else if (length < (1 << 32))
        {
            this.ensureSufficientSpace(5 + data.byteLength);
            this.view.setUint8(this.offset++, fourByteLenSeqIdentifier);
            this.view.setUint32(this.offset, data.byteLength)
            this.offset += 4;
        }
        else throw new RangeError("msgpack: buffer too long to encode (more than 2^32 - 1 bytes)");

        this.buffer.set(data, this.offset);
        this.offset += data.byteLength;
    }

    private writeArrayPrefix(length: number)
    {
        if (length < 16)
        {
            this.ensureSufficientSpace(1);
            this.view.setUint8(this.offset++, 0x90 | length);
        }
        else if (length < (1 << 16))
        {
            this.ensureSufficientSpace(3);
            this.view.setUint8(this.offset++, 0xdc);
            this.view.setUint16(this.offset, length);
            this.offset += 2;
        }
        else // ECMA dictates that array length will never exceed a uint32
        {
            this.ensureSufficientSpace(5);
            this.view.setUint8(this.offset++, 0xdd);
            this.view.setUint32(this.offset, length);
            this.offset += 4;
        }
    }

    private writeMapPrefix(keyCount: number)
    {
        if (keyCount < 16)
        {
            this.ensureSufficientSpace(1);
            this.view.setUint8(this.offset++, 0x80 | keyCount);
        }
        else if (keyCount < (1 << 16))
        {
            this.ensureSufficientSpace(3);
            this.view.setUint8(this.offset++, 0xde);
            this.view.setUint16(this.offset, keyCount);
            this.offset += 2;
        }
        else if (keyCount < (1 << 32))
        {
            this.ensureSufficientSpace(5);
            this.view.setUint8(this.offset++, 0xdf);
            this.view.setUint32(this.offset, keyCount);
            this.offset += 4;
        }
        else throw new RangeError("msgpack: map too large to encode (more than 2^32 - 1 defined values)");
    }

    constructor()
    {
        this.registerExt(Date, -1, Encoder.encodeDate);
    }
}