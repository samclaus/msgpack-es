import { U32_CAP } from './constants.js';
import { extDecoders } from './extensions.js';

export interface DecodeOpts {
     /**
     * Value to deserialize MsgPack's `Nil` type as. Should be set to either `null` or
     * `undefined`; default is `null`.
     */
    nilValue: null | undefined;
    /**
     * Determines behavior when a `String` value is encountered whose data is not valid UTF-8.
     * Default is just to produce a Uint8Array copy of the invalid UTF-8 data.
     */
    badUTF8Handler: (utf8: Uint8Array) => any;
    /**
     * Determines behavior when an extension value is encountered for which no decoding function
     * has been registered. Default is to return an `UnknownExt` instance and avoid blowing up
     * the entire decoding operation with an error.
     */
    unknownExtHandler: (id: number, data: Uint8Array) => any;
    /**
     * By default, MessagePack `map` types will be decoded as plain JavaScript objects and the
     * library will fall back to using an ES6 `Map` instance if a key is encountered which is
     * not a primitive value (using `typeof key === "object"`). Use this flag to force the
     * library to always decode as ES6 `Map` instances.
     */
    forceES6Map: boolean;
}

/**
 * UnknownExt describes an unrecognized extension sequence that
 * was encountered during decoding and passed through opaquely.
 */
export class UnknownExt {
    constructor(
        /**
         * Extension type identifier.
         */
        readonly type: number,
        /**
         * Extension sequence data.
         */
        readonly data: Uint8Array,
    ) {}
}

const enum Type {
    // CAUTION: the type lookup initialization code depends on the
    // order of these values for the sake of being efficient.
    PosFixInt,
    FixMap,
    FixArray,
    FixString,
    Nil,
    NeverUsed,
    False,
    True,
    Bin8,
    Bin16,
    Bin32,
    Ext8,
    Ext16,
    Ext32,
    Float32,
    Float64,
    Uint8,
    Uint16,
    Uint32,
    Uint64,
    Int8,
    Int16,
    Int32,
    Int64,
    FixExt1,
    FixExt2,
    FixExt4,
    FixExt8,
    FixExt16,
    String8,
    String16,
    String32,
    Array16,
    Array32,
    Map16,
    Map32,
    NegFixInt
}

const typeLookup = new Uint8Array(256); {
    let i = 0x00;
    while (i < 0x80) typeLookup[i++] = Type.PosFixInt;
    while (i < 0x90) typeLookup[i++] = Type.FixMap;
    while (i < 0xa0) typeLookup[i++] = Type.FixArray;
    while (i < 0xc0) typeLookup[i++] = Type.FixString;
    for (; i < 0xe0; ++i) typeLookup[i] = i - 188;
    for (i = 0xe0; i <= 0xff; ++i) typeLookup[i] = Type.NegFixInt;
};

const
    utf8Decoder = new TextDecoder("utf-8", { fatal: true }),
    opts: DecodeOpts = Object.seal<DecodeOpts>({
        nilValue: undefined,
        badUTF8Handler: utf8 => utf8.slice(),
        unknownExtHandler: (id, data) => new UnknownExt(id, data),
        forceES6Map: false,
    });

export { opts as DECODE_OPTS };

let
    /**
     * Buffer is a Uint8Array "view" on top of the buffer being decoded. It compliments
     * this.view, because Uint8Array and DataView support different operations.
     */
    buffer: Uint8Array,
    /**
     * View is a DataView "view" on top of the buffer being decoded. It compliments this.buffer,
     * because Uint8Array and DataView support different operations.
     */
    view: DataView,
    /**
     * Offset is the current location in the buffer we are decoding.
     */
    offset: number;

function takeUint8(): number {
    return view.getUint8(offset++);
}

function takeUint16(): number {
    const value = view.getUint16(offset);
    offset += 2;
    return value;
}

function takeUint32(): number {
    const value = view.getUint32(offset);
    offset += 4;
    return value;
}

function takeUint64(): number | bigint {
    const hi32 = view.getUint32(offset);

    if (hi32 >= (1 << 21)) {
        // I think it's reasonable to just propagate a "'getBigUint64'
        // is not defined" error if they are receiving massive values
        // in an outdated browser (or other ECMAScript runtime)
        const value = view.getBigUint64(offset);
        offset += 8;
        return value;
    }

    offset += 4;
    const value = hi32 * U32_CAP + view.getUint32(offset);
    offset += 4;
    return value;
}

function takeInt8(): number {
    return view.getInt8(offset++);
}

function takeInt16(): number {
    const value = view.getInt16(offset);
    offset += 2;
    return value;
}

function takeInt32(): number {
    const value = view.getInt32(offset);
    offset += 4;
    return value;
}

function takeInt64(): number | bigint {
    // TODO: inspect high 4 bytes and support numbers within safe range
    // for regular JS number (-2^53, 2^53), just like I do for uint64s
    if (typeof BigInt === "function") {
        const value = view.getBigInt64(offset);
        offset += 8;

        // BigInts are annoying to work with in JavaScript, so prefer traditional floating point
        // numbers where possible.
        return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
    }
    throw new TypeError("msgpack: encountered 64-bit signed integer but BigInts are not supported (fallback code is possible which decodes 4 bytes at a time and computes the final number but implementation is tricky--PRs welcome!)");
}

function takeFloat32(): number {
    const value = view.getFloat32(offset);
    offset += 4;
    return value;
}

function takeFloat64(): number {
    const value = view.getFloat64(offset);
    offset += 8;
    return value;
}

function takeBinary(length: number): Uint8Array {
    const start = offset;
    offset += length;
    return buffer.slice(start, offset);
}

function takeString(length: number): string | Uint8Array {
    const start = offset;
    offset += length;
    const utf8 = buffer.subarray(start, offset);

    try {
        return utf8Decoder.decode(utf8);
    } catch {
        return opts.badUTF8Handler(utf8);
    }
}

function takeArray(length: number): any[] {
    const arr = [];

    for (let i = 0; i < length; ++i)
        arr.push(takeGeneric());

    return arr;
}

function takeMap(keyCount: number, forceMap = opts.forceES6Map): object | Map<any, any> {
    if (forceMap) {
        const map = new Map();

        for (let i = 0; i < keyCount; ++i) {
            map.set(takeGeneric(), takeGeneric());
        }

        return map;
    }

    const
        mapStart = offset,
        map: {[key: string]: any} = {};

    for (let i = 0; i < keyCount; ++i) {
        const key = takeGeneric();

        if (typeof key === "object")
        {
            offset = mapStart;
            return takeMap(keyCount, true);
        }

        map[key as any] = takeGeneric();
    }

    return map;
}

function takeExt(dataLength: number): any {
    const
        type = takeInt8(),
        data = takeBinary(dataLength),
        decodeFn = extDecoders[type + 128];

    return decodeFn ? decodeFn(data) : opts.unknownExtHandler(type, data);
}

function takeGeneric(): unknown {
    const
        seqByte = takeUint8(),
        seqType = typeLookup[seqByte] as Type;

    switch (seqType) {
        case Type.PosFixInt: return seqByte;
        case Type.FixMap:    return takeMap(seqByte & 0xf);
        case Type.FixArray:  return takeArray(seqByte & 0xf);
        case Type.FixString: return takeString(seqByte & 0x1f);
        case Type.Nil:       return opts.nilValue;
        case Type.NeverUsed: return undefined;
        case Type.False:     return false;
        case Type.True:      return true;
        case Type.Bin8:      return takeBinary(takeUint8());
        case Type.Bin16:     return takeBinary(takeUint16());
        case Type.Bin32:     return takeBinary(takeUint32());
        case Type.Ext8:      return takeExt(takeUint8());
        case Type.Ext16:     return takeExt(takeUint16());
        case Type.Ext32:     return takeExt(takeUint32());
        case Type.Float32:   return takeFloat32();
        case Type.Float64:   return takeFloat64();
        case Type.Uint8:     return takeUint8();
        case Type.Uint16:    return takeUint16();
        case Type.Uint32:    return takeUint32();
        case Type.Uint64:    return takeUint64();
        case Type.Int8:      return takeInt8();
        case Type.Int16:     return takeInt16();
        case Type.Int32:     return takeInt32();
        case Type.Int64:     return takeInt64();
        case Type.FixExt1:   return takeExt(1);
        case Type.FixExt2:   return takeExt(2);
        case Type.FixExt4:   return takeExt(4);
        case Type.FixExt8:   return takeExt(8);
        case Type.FixExt16:  return takeExt(16);
        case Type.String8:   return takeString(takeUint8());
        case Type.String16:  return takeString(takeUint16());
        case Type.String32:  return takeString(takeUint32());
        case Type.Array16:   return takeArray(takeUint16());
        case Type.Array32:   return takeArray(takeUint32());
        case Type.Map16:     return takeMap(takeUint16());
        case Type.Map32:     return takeMap(takeUint32());
        case Type.NegFixInt: return seqByte - 256;
    }
}

/**
 * Decode the first MsgPack value encountered.
 * 
 * @param data The buffer to decode from.
 */
export function decode<T = unknown>(data: ArrayBuffer | Uint8Array): T {
    // Store previous state in case decode is called while decoding
    const prevBuffer = buffer
    const prevView = view
    const prevOffset = offset

    buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
    view = new DataView(buffer.buffer, buffer.byteOffset);
    offset = 0;

    const result = takeGeneric() as T;

    // Revert state in case decode is called while decoding
    buffer = prevBuffer
    view = prevView
    offset = prevOffset

    return result;
}
