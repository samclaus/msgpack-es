
type Constructor<T> = new (...args: any[]) => T;

type ExtEncoderFn<T> = (value: T) => Uint8Array;

interface ExtEncoder<T> {
    readonly type: number;
    readonly fn:   ExtEncoderFn<T>;
}

/**
 * Class for encoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to configure the encode.encoder instance and simply
 * use encode().
 */
export class Encoder
{
    private static readonly textEncoder = new TextEncoder();

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
     * Register an extension encoder. Negative extension types are reserved by the spec, but
     * it is legal for you, the library user, to register encoders for such extensions in case
     * this library has not been updated to provide one or it does not fit your use case.
     */
    registerExt<T>(constructor: Constructor<T>, type: number, encoderFn: ExtEncoderFn<T>): void
    {
        this.extensions.set(constructor, { type: type, fn: encoderFn });
    }

    /**
     * Release the current encoding buffer and allocate a new one.
     * @param newSize Size, in bytes, to allocate for the new buffer.
     */
    resize(newSize: number): void
    {
        this.buffer = new Uint8Array(newSize);
        this.view = new DataView(this.buffer.buffer);
    }

    /**
     * Encode a value to the MsgPack binary format.
     * 
     * @param value   The data to encode.
     * @param reserve If provided and greater than the size of the
     *                current encoding buffer, a new buffer of this
     *                size will be reserved.
     */
    encode(value: any, reserve?: number): Uint8Array
    {
        if (typeof reserve === "number" && reserve > this.buffer.length)
            this.resize(reserve);

        this.offset = 0;
        this.recursiveEncode(value);

        return this.buffer.slice(0, this.offset);
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
                else if (this.extensions.has(data.constructor))
                {
                    const {type, fn} = this.extensions.get(data.constructor);
                    this.writeExt(type, fn(data));
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
                else if (data instanceof Map)
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
        if (this.offset + bytesToEncode > this.buffer.length)
        {
            const newBuffer = new Uint8Array(this.buffer.length * 2);
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
                else if (value < Math.pow(2, 32))
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
                    this.view.setUint32(this.offset, value / Math.pow(2, 32));
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
                else if (value >= -Math.pow(2, 32))
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
        else
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
        else if (length < Math.pow(2, 32))
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
        else if (keyCount < Math.pow(2, 32))
        {
            this.ensureSufficientSpace(5);
            this.view.setUint8(this.offset++, 0xdf);
            this.view.setUint32(this.offset, keyCount);
            this.offset += 4;
        }
        else throw new RangeError("msgpack: map too large to encode (more than 2^32 - 1 defined values)");
    }

    private writeExt(type: number, data: Uint8Array)
    {
        switch (data.length)
        {
            case 1:
                this.ensureSufficientSpace(3);
                this.buffer[this.offset++] = 0xd4;
                this.buffer[this.offset++] = type;
                this.buffer[this.offset++] = data[0];
                break;
            case 2:
                this.ensureSufficientSpace(4);
                this.buffer[this.offset++] = 0xd5;
                this.buffer[this.offset++] = type;
                this.buffer.set(data, this.offset);
                this.offset += 2;
                break;
            case 4:
                this.ensureSufficientSpace(6);
                this.buffer[this.offset++] = 0xd6;
                this.buffer[this.offset++] = type;
                this.buffer.set(data, this.offset);
                this.offset += 4;
                break;
            case 8:
                this.ensureSufficientSpace(10);
                this.buffer[this.offset++] = 0xd7;
                this.buffer[this.offset++] = type;
                this.buffer.set(data, this.offset);
                this.offset += 8;
                break;
            case 16:
                this.ensureSufficientSpace(6);
                this.buffer[this.offset++] = 0xd8;
                this.buffer[this.offset++] = type;
                this.buffer.set(data, this.offset);
                this.offset += 16;
                break;
            default:
                if (data.length < (1 << 8))
                {
                    this.ensureSufficientSpace(3 + data.length);
                    this.buffer[this.offset++] = 0xc7;
                    this.buffer[this.offset++] = data.length;
                    this.buffer[this.offset++] = type;
                    this.buffer.set(data, this.offset);
                    this.offset += data.length;
                }
                else if (data.length < (1 << 16))
                {
                    this.ensureSufficientSpace(4 + data.length);
                    this.buffer[this.offset++] = 0xc8;
                    this.view.setUint16(this.offset, data.length);
                    this.offset += 2;
                    this.buffer[this.offset++] = type;
                    this.buffer.set(data, this.offset);
                    this.offset += data.length;
                }
                else if (data.length < Math.pow(2, 32))
                {
                    this.ensureSufficientSpace(6 + data.length);
                    this.buffer[this.offset++] = 0xc9;
                    this.view.setUint32(this.offset, data.length);
                    this.offset += 4;
                    this.buffer[this.offset++] = type;
                    this.buffer.set(data, this.offset);
                    this.offset += data.length;
                }
                else throw new Error(
                    `msgpack: ext (${type}) data too large to encode (length > 2^32 - 1)`
                );
        }
    }

    /**
     * Construct a new Encoder.
     * @param reserve Starting size, in bytes, for the encoding buffer.
     */
    constructor(reserve = 128)
    {
        this.resize(reserve);
        this.registerExt(Date, -1, Encoder.encodeDate);
    }
}