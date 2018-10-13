/**
 * Class for encoding arrays, objects, and primitives to msgpack
 * format. You can create indepently configured instances, but you will
 * most likely want to simply use the static methods and interact with
 * the default/global Encoder.
 */
export declare class Encoder {
    private static readonly textEncoder;
    /**
     * The starting buffer size when encoding an object, in KiB. The buffer will
     * then be grown by factors of 2 as needed. Will be configurable in the future.
     */
    private readonly initialBufferSize;
    private buffer;
    private view;
    private offset;
    encode(data: any): Uint8Array;
    private recursiveEncode;
    private ensureSufficientSpace;
    private writeNil;
    private writeBoolean;
    private writeNumber;
    private writeString;
    private writeBinary;
    private writeBytes;
    private writeArrayPrefix;
    private writeMapPrefix;
}
