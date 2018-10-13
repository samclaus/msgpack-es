/**
 * Class for decoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interfact with
 * the default/global Encoder.
 */
export declare class Decoder {
    decode<T>(_data: ArrayBuffer | Uint8Array): T;
}
