System.register("Encoder", [], function (exports_1, context_1) {
    "use strict";
    var Encoder;
    var __moduleName = context_1 && context_1.id;
    return {
        setters: [],
        execute: function () {
            /**
             * Class for encoding arrays, objects, and primitives to msgpack
             * format. You can create indepently configured instances, but you will
             * most likely want to simply use the static methods and interact with
             * the default/global Encoder.
             */
            Encoder = class Encoder {
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
                    if (Number.isSafeInteger(value)) {
                        if (value >= 0) {
                            if (value < (1 << 7)) {
                                this.ensureSufficientSpace(1);
                                this.view.setUint8(this.offset++, value);
                            }
                            else if (value < (1 << 8)) {
                                this.ensureSufficientSpace(2);
                                this.view.setUint8(this.offset++, 0xcc);
                                this.view.setUint8(this.offset++, value);
                            }
                            else if (value < (1 << 16)) {
                                this.ensureSufficientSpace(3);
                                this.view.setUint8(this.offset++, 0xcd);
                                this.view.setUint16(this.offset, value);
                                this.offset += 2;
                            }
                            else if (value < (1 << 32)) {
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
                        else {
                            if (value >= -32) {
                                this.ensureSufficientSpace(1);
                                this.view.setInt8(this.offset++, value);
                            }
                            else if (value >= -(1 << 8)) {
                                this.ensureSufficientSpace(2);
                                this.view.setUint8(this.offset++, 0xd0);
                                this.view.setInt8(this.offset++, value);
                            }
                            else if (value >= -(1 << 16)) {
                                this.ensureSufficientSpace(3);
                                this.view.setUint8(this.offset++, 0xd1);
                                this.view.setInt16(this.offset, value);
                                this.offset += 2;
                            }
                            else if (value >= -(1 << 32)) {
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
            };
            Encoder.textEncoder = new TextEncoder();
            exports_1("Encoder", Encoder);
        }
    };
});
System.register("Decoder", [], function (exports_2, context_2) {
    "use strict";
    var Decoder;
    var __moduleName = context_2 && context_2.id;
    return {
        setters: [],
        execute: function () {
            /**
             * Class for decoding arrays, objects, and primitives to msgpack
             * format. You can create indepently configured instances, but you will
             * most likely want to simply use the static methods and interfact with
             * the default/global Encoder.
             */
            Decoder = class Decoder {
                constructor() {
                    /**
                     * When reading msgpack string/binary objects from the data, determines if
                     * the data should be copied to new buffers, or simply returned as subviews
                     * of the buffer being decoded (better performance, but dangerous if you do
                     * stuff to the message data after decoding it).
                     */
                    this.copyBuffers = false;
                    /**
                     * Value to deserialize msgpack's nil as. Should be set to either null or undefined.
                     */
                    this.nilValue = null;
                    /**
                     * What to do when a msgpack string value is encountered but the binary data is not
                     * valid UTF-8. Can either throw an error or just return the raw binary data as a
                     * Uint8Array.
                     */
                    this.invalidUTFBehavior = "throw";
                    /**
                     * If true, msgpack maps will be decoded as ES6 Map objects. Otherwise, they will be
                     * decoded as plain objects.
                     */
                    this.useES6Maps = false;
                }
                decode(data) {
                    this.buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
                    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
                    this.offset = 0;
                    return this.readValue();
                }
                readValue() {
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
                takeUint8() {
                    return this.view.getUint8(this.offset++);
                }
                takeUint16() {
                    const value = this.view.getUint16(this.offset);
                    this.offset += 2;
                    return value;
                }
                takeUint32() {
                    const value = this.view.getUint32(this.offset);
                    this.offset += 4;
                    return value;
                }
                takeUint64() {
                    throw new Error("msgpack-ts: JavaScript does not support 64-bit integers");
                }
                takeInt8() {
                    return this.view.getInt8(this.offset++);
                }
                takeInt16() {
                    const value = this.view.getInt16(this.offset);
                    this.offset += 2;
                    return value;
                }
                takeInt32() {
                    const value = this.view.getInt32(this.offset);
                    this.offset += 4;
                    return value;
                }
                takeInt64() {
                    throw new Error("msgpack-ts: JavaScript does not support 64-bit integers");
                }
                takeFloat32() {
                    const value = this.view.getFloat32(this.offset);
                    this.offset += 4;
                    return value;
                }
                takeFloat64() {
                    const value = this.view.getFloat64(this.offset);
                    this.offset += 8;
                    return value;
                }
                takeBuffer(length) {
                    const end = this.offset + length;
                    const buffer = this.copyBuffers ?
                        this.buffer.slice(this.offset, end) :
                        this.buffer.subarray(this.offset, end);
                    this.offset += length;
                    return buffer;
                }
                takeString(length) {
                    const utf8 = this.takeBuffer(length);
                    try {
                        return Decoder.textDecoder.decode(utf8);
                    }
                    catch (error) {
                        if (this.invalidUTFBehavior === "raw")
                            return utf8;
                        else
                            throw error;
                    }
                }
                takeArray(length) {
                    let array = new Array(length);
                    for (let i = 0; i < array.length; ++i)
                        array[i] = this.readValue();
                    return array;
                }
                takeMap(keyCount) {
                    if (this.useES6Maps) {
                        const map = new Map();
                        for (let i = 0; i < keyCount; ++i)
                            map.set(this.readValue(), this.readValue());
                        return map;
                    }
                    else {
                        const map = {};
                        for (let i = 0; i < keyCount; ++i)
                            map[this.readValue()] = this.readValue();
                        return map;
                    }
                }
            };
            Decoder.textDecoder = new TextDecoder("utf-8", {
                fatal: true
            });
            exports_2("Decoder", Decoder);
        }
    };
});
System.register("index", ["Encoder", "Decoder"], function (exports_3, context_3) {
    "use strict";
    var Encoder_1, Decoder_1;
    var __moduleName = context_3 && context_3.id;
    function exportStar_1(m) {
        var exports = {};
        for (var n in m) {
            if (n !== "default") exports[n] = m[n];
        }
        exports_3(exports);
    }
    return {
        setters: [
            function (Encoder_1_1) {
                Encoder_1 = Encoder_1_1;
                exportStar_1(Encoder_1_1);
            },
            function (Decoder_1_1) {
                Decoder_1 = Decoder_1_1;
                exportStar_1(Decoder_1_1);
            }
        ],
        execute: function () {
            window["msgpack"] = {
                Encoder: Encoder_1.Encoder,
                Decoder: Decoder_1.Decoder
            };
        }
    };
});
