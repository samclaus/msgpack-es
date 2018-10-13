/**
 * Class for encoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interact with
 * the default/global Encoder.
 */
export class Encoder {
    constructor() {
        /**
         * The starting buffer size when encoding an object, in KiB. The buffer will
         * then be grown by factors of 2 as needed. Will be configurable in the future.
         */
        this.initialBufferSize = 4;
        this.recursiveEncode = (data) => {
            switch (typeof data) {
                case "function":
                    throw new TypeError("cannot encode a function");
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
                    if (data === null) {
                        this.writeNil();
                    }
                    else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
                        this.writeBinary(data);
                    }
                    else if (Array.isArray(data)) {
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
                    else {
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
        };
    }
    encode(data) {
        this.buffer = new Uint8Array(this.initialBufferSize * 1024);
        this.view = new DataView(this.buffer.buffer);
        this.offset = 0;
        this.recursiveEncode(data);
        return this.buffer.subarray(0, this.offset);
    }
    ensureSufficientSpace(bytesToEncode) {
        if (this.offset + bytesToEncode > this.view.byteLength) {
            const newBuffer = new Uint8Array(this.buffer.byteLength * 2);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
            this.view = new DataView(this.buffer.buffer);
        }
    }
    writeNil() {
        this.ensureSufficientSpace(1);
        this.view.setUint8(this.offset++, 0xc0);
    }
    writeBoolean(value) {
        this.ensureSufficientSpace(1);
        this.view.setUint8(this.offset++, value ? 0xc3 : 0xc2);
    }
    writeNumber(value) {
        this.ensureSufficientSpace(9);
        this.view.setUint8(this.offset++, 0xcb);
        this.view.setFloat64(this.offset, value);
        this.offset += 8;
    }
    writeString(value) {
        const utf8 = Encoder.textEncoder.encode(value);
        if (utf8.length < 32) {
            this.ensureSufficientSpace(1 + utf8.byteLength);
            this.view.setUint8(this.offset++, 0xa0 | utf8.byteLength);
            this.buffer.set(utf8, this.offset);
            this.offset += utf8.byteLength;
        }
        else {
            try {
                this.writeBytes(utf8, 0xd9, 0xda, 0xdb);
            }
            catch (_a) {
                // String specific error
                throw new Error("string too long to encode (more than 2^32 - 1 UTF-8 characters)");
            }
        }
    }
    writeBinary(value) {
        if (value instanceof ArrayBuffer)
            value = new Uint8Array(value);
        this.writeBytes(value, 0xc4, 0xc5, 0xc6);
    }
    writeBytes(data, oneByteLenSeqIdentifier, twoByteLenSeqIdentifier, fourByteLenSeqIdentifier) {
        if (data.byteLength < (1 << 8)) {
            this.ensureSufficientSpace(2 + data.byteLength);
            this.view.setUint8(this.offset++, oneByteLenSeqIdentifier);
            this.view.setUint8(this.offset++, data.byteLength);
        }
        else if (data.byteLength < (1 << 16)) {
            this.ensureSufficientSpace(3 + data.byteLength);
            this.view.setUint8(this.offset++, twoByteLenSeqIdentifier);
            this.view.setUint16(this.offset, data.byteLength);
            this.offset += 2;
        }
        else if (length < (1 << 32)) {
            this.ensureSufficientSpace(5 + data.byteLength);
            this.view.setUint8(this.offset++, fourByteLenSeqIdentifier);
            this.view.setUint32(this.offset, data.byteLength);
            this.offset += 4;
        }
        else
            throw new Error("buffer too long to encode (more than 2^32 - 1 bytes)");
        this.buffer.set(data, this.offset);
        this.offset += data.byteLength;
    }
    writeArrayPrefix(length) {
        if (length < 16) {
            this.ensureSufficientSpace(1);
            this.view.setUint8(this.offset++, 0x90 | length);
        }
        else if (length < (1 << 16)) {
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
    writeMapPrefix(keyCount) {
        if (keyCount < 16) {
            this.ensureSufficientSpace(1);
            this.view.setUint8(this.offset++, 0x80 | keyCount);
        }
        else if (keyCount < (1 << 16)) {
            this.ensureSufficientSpace(3);
            this.view.setUint8(this.offset++, 0xde);
            this.view.setUint16(this.offset, keyCount);
            this.offset += 2;
        }
        else if (keyCount < (1 << 32)) {
            this.ensureSufficientSpace(5);
            this.view.setUint8(this.offset++, 0xdf);
            this.view.setUint32(this.offset, keyCount);
            this.offset += 4;
        }
        else
            throw new Error("map too large to encode (more than 2^32 - 1 defined values)");
    }
}
Encoder.textEncoder = new TextEncoder();
