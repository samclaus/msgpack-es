import { U32_CAP } from './constants.js';
import { extEncoders } from './extensions.js';

const utf8Encoder = new TextEncoder();

let
    /**
     * Buffer is a Uint8Array "view" on top of the underlying data buffer. It compliments
     * this.view, because Uint8Array and DataView support different operations.
     */
    buffer = new Uint8Array(128),
    /**
     * View is a DataView "view" on top of the underlying data buffer. It compliments
     * this.buffer, because Uint8Array and DataView support different operations.
     */
    view = new DataView(buffer.buffer),
    /**
     * Offset is the current location in the buffer we are encoding to.
     */
    offset = 0;

function rangeError(msg: string): void {
    throw new RangeError('[msgpack-es] cannot encode: ' + msg);
}

/**
 * Release the current encoding buffer and allocate a new one with the
 * given size. Use this function to optimize: sometimes you know how much
 * memory will be needed up front and therefore you can avoid the library
 * automatically "growing" its buffer repeatedly as it encodes, and
 * sometimes you may want to release a massive buffer (so it can get
 * garbage collected) after you are done encoding a lot of information.
 * 
 * @param newSize Size, in bytes, to allocate for the new buffer.
 */
export function resizeEncodingBuffer(newSize: number): void {
    buffer = new Uint8Array(newSize);
    view = new DataView(buffer.buffer);
}

function growIfNeeded(bytesToEncode: number): void {
    const need = offset + bytesToEncode;

    if (need > buffer.length) {
        const old = buffer;
        resizeEncodingBuffer(Math.max(old.length * 2, need));
        buffer.set(old);
    }
}

function writeNil(): void {
    growIfNeeded(1);
    view.setUint8(offset++, 0xc0);
}

function writeBool(value: boolean): void {
    growIfNeeded(1);
    view.setUint8(offset++, value ? 0xc3 : 0xc2);
}

/**
 * Encode a numeric value which has been guaranteed to be an integer
 * in the range [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER].
 */
function unsafeWriteInt(value: number): void {
    if (value >= 0) {
        if (value < (1 << 7)) {
            growIfNeeded(1);
            view.setUint8(offset++, value);
        } else if (value < (1 << 8)) {
            growIfNeeded(2);
            view.setUint8(offset++, 0xcc);
            view.setUint8(offset++, value);
        } else if (value < (1 << 16)) {
            growIfNeeded(3);
            view.setUint8(offset++, 0xcd);
            view.setUint16(offset, value);
            offset += 2;
        } else if (value < U32_CAP) {
            growIfNeeded(5);
            view.setUint8(offset++, 0xce);
            view.setUint32(offset, value);
            offset += 4;
        } else {
            // uint64; cannot use bitwise operators (casts to int32)
            growIfNeeded(9);
            view.setUint8(offset++, 0xcf);
            view.setUint32(offset, value / U32_CAP);
            offset += 4;
            view.setUint32(offset, value);
            offset += 4;
        }
    } else if (value >= -32) {
        growIfNeeded(1);
        view.setInt8(offset++, value);
    } else if (value >= -(1 << 8)) {
        growIfNeeded(2);
        view.setUint8(offset++, 0xd0);
        view.setInt8(offset++, value);
    } else if (value >= -(1 << 16)) {
        growIfNeeded(3);
        view.setUint8(offset++, 0xd1);
        view.setInt16(offset, value);
        offset += 2;
    } else if (value >= -U32_CAP) {
        growIfNeeded(5);
        view.setUint8(offset++, 0xd2);
        view.setInt32(offset, value);
        offset += 4;
    } else {
        // TODO: figure out how to encode int64
        growIfNeeded(9);
        view.setUint8(offset++, 0xcb);
        view.setFloat64(offset, value);
        offset += 8;
    }
}

function writeNumber(value: number): void {
    if (Number.isSafeInteger(value)) {
        unsafeWriteInt(value);
    } else {
        growIfNeeded(9);
        view.setUint8(offset++, 0xcb);
        view.setFloat64(offset, value);
        offset += 8;
    }
}

function writeBigInt(value: bigint): void {
    if (
        value >= BigInt(Number.MIN_SAFE_INTEGER) &&
        value <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
        unsafeWriteInt(Number(value));
    } else if (value < 0) {
        if (value <= -(BigInt(2)**BigInt(63))) {
            rangeError(`BigInt (${value}) is <= -2^63`);
        }

        growIfNeeded(9);
        view.setUint8(offset++, 0xd3);
        view.setBigInt64(offset, value);
        offset += 8;
    } else if (value < BigInt(2)**BigInt(64)) {
        growIfNeeded(9);
        view.setUint8(offset++, 0xcf);
        view.setBigUint64(offset, value);
        offset += 8;
    } else {
        rangeError(`BigInt (${value}) is >= 2^64`);
    }
}

function writeBytes(
    data: Uint8Array,
    oneByteLenSeqIdentifier: number,
    twoByteLenSeqIdentifier: number,
    fourByteLenSeqIdentifier: number
): void {
    if (data.length < (1 << 8)) {
        growIfNeeded(2 + data.length);
        view.setUint8(offset++, oneByteLenSeqIdentifier);
        view.setUint8(offset++, data.length);
    } else if (data.length < (1 << 16)) {
        growIfNeeded(3 + data.length);
        view.setUint8(offset++, twoByteLenSeqIdentifier);
        view.setUint16(offset, data.length);
        offset += 2;
    } else if (length < U32_CAP) {
        growIfNeeded(5 + data.length);
        view.setUint8(offset++, fourByteLenSeqIdentifier);
        view.setUint32(offset, data.length)
        offset += 4;
    } else {
        rangeError(`binary/string length (${data.length}) >= 2^32`);
    }

    buffer.set(data, offset);
    offset += data.byteLength;
}

function writeString(value: string): void {
    const utf8 = utf8Encoder.encode(value);

    if (utf8.length < 32) {
        growIfNeeded(1 + utf8.byteLength);
        view.setUint8(offset++, 0xa0 | utf8.byteLength);
        buffer.set(utf8, offset);
        offset += utf8.byteLength;
    } else {
        writeBytes(utf8, 0xd9, 0xda, 0xdb);
    }
}

function writeBinary(value: Uint8Array | ArrayBuffer): void {
    writeBytes(value instanceof ArrayBuffer ? new Uint8Array(value) : value, 0xc4, 0xc5, 0xc6);
}

function writeArrayPrefix(length: number): void {
    if (length < 16) {
        growIfNeeded(1);
        view.setUint8(offset++, 0x90 | length);
    } else if (length < (1 << 16)) {
        growIfNeeded(3);
        view.setUint8(offset++, 0xdc);
        view.setUint16(offset, length);
        offset += 2;
    } else {
        // ECMA dictates that array length will never exceed a uint32
        growIfNeeded(5);
        view.setUint8(offset++, 0xdd);
        view.setUint32(offset, length);
        offset += 4;
    }
}

function writeMapPrefix(keyCount: number): void {
    if (keyCount < 16) {
        growIfNeeded(1);
        view.setUint8(offset++, 0x80 | keyCount);
    } else if (keyCount < (1 << 16)) {
        growIfNeeded(3);
        view.setUint8(offset++, 0xde);
        view.setUint16(offset, keyCount);
        offset += 2;
    } else if (keyCount < U32_CAP) {
        growIfNeeded(5);
        view.setUint8(offset++, 0xdf);
        view.setUint32(offset, keyCount);
        offset += 4;
    } else {
        rangeError(`2^32 or more (${keyCount}) entries in map`);
    }
}

function writeExt(type: number, data: Uint8Array): void {
    // Common case for encoding ECMAScript Date objects FIRST
    // so we avoid excess branch checks!
    //
    // NOTE: this library does not use fix ext 1/2/4/16 or ext 8
    // because they hardly save any bandwidth while incurring
    // lots of branching and increasing code size!
    if (data.length === 8) {
        growIfNeeded(10);
        buffer[offset++] = 0xd7;
        buffer[offset++] = type;
        buffer.set(data, offset);
        offset += 8;
    } else if (data.length < (1 << 16)) {
        growIfNeeded(4 + data.length);
        buffer[offset++] = 0xc8;
        view.setUint16(offset, data.length);
        offset += 2;
        buffer[offset++] = type;
        buffer.set(data, offset);
        offset += data.length;
    } else if (data.length < U32_CAP) {
        growIfNeeded(6 + data.length);
        buffer[offset++] = 0xc9;
        view.setUint32(offset, data.length);
        offset += 4;
        buffer[offset++] = type;
        buffer.set(data, offset);
        offset += data.length;
    } else {
        rangeError(`ext length (${data.length}) >= 2^32`);
    }
}

function recursiveEncode(data: any): void {
    switch (typeof data)
    {
        case "undefined":
            writeNil();
            break;
        case "boolean":
            writeBool(data);
            break;
        case "number":
            writeNumber(data);
            break;
        case "bigint":
            writeBigInt(data);
            break;
        case "string":
            writeString(data);
            break;
        case "object":
            if (data === null) {
                writeNil();
                return;
            }

            const ext = extEncoders.get(data.constructor);

            if (ext)
            {
                writeExt(ext[0], ext[1](data));
            }
            else if (data instanceof Uint8Array || data instanceof ArrayBuffer)
            {
                writeBinary(data);
            }
            else if (Array.isArray(data))
            {
                writeArrayPrefix(data.length);
                data.forEach(recursiveEncode);
            }
            else if (data instanceof Map)
            {
                const validKeys = Array.from(data.keys()).filter(key => {
                    const keyType = typeof key;
                    const valType = typeof data.get(key);

                    return keyType !== "function" && valType !== "function" && valType !== "undefined";
                });
                writeMapPrefix(validKeys.length);
                validKeys.forEach(key => {
                    recursiveEncode(key);
                    recursiveEncode(data.get(key));                        
                });
            }
            else
            {
                const validKeys = Object.keys(data).filter(key => {
                    const valType = typeof data[key];
                    return valType !== "undefined" && valType !== "function";
                });
                writeMapPrefix(validKeys.length);
                validKeys.forEach(key => {
                    recursiveEncode(key);
                    recursiveEncode(data[key]);
                });
            }
            break;
    }
}

/**
 * **READ BEFORE USING**
 * 
 * This is like the `encode()` function, but rather than returning
 * a _copy_ of the encoding buffer once encoding is finished, it
 * returns a _pointer/view_ of the current encoding buffer. If you
 * understand what that means, use this function to get much better
 * performance when possible. If you don't understand what that
 * means, you should not use this function until you do because you
 * might introduce subtle bugs in your software!
 */
export function encodeView(value: any, reserve = 0): Uint8Array {
    if (reserve > buffer.length) {
        resizeEncodingBuffer(reserve);
    }

    offset = 0;
    recursiveEncode(value);

    return buffer.subarray(0, offset);
}

/**
 * Encode a value to the MsgPack binary format. Prefer `encodeView()`
 * to avoid copying the encoding buffer whenever it is safe to do so.
 * 
 * @param value   The data to encode.
 * @param reserve If provided and greater than the size of the
 *                current encoding buffer, a new buffer of this
 *                size will be reserved. Useful for optimizing because
 *                you can avoid automatic buffer "growing" during the
 *                encoding process.
 */
export function encode(value: any, reserve = 0): Uint8Array {
    // Store previous state in case encode is called while encoding
    const prevBuffer = buffer
    const prevView = view
    const prevOffset = offset

    const result = encodeView(value, reserve).slice();

    // Revert state in case encode was called while encoding
    buffer = prevBuffer
    view = prevView
    offset = prevOffset

    return result
}
