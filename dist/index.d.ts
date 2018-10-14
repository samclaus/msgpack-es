declare module "Encoder" {
    /**
     * Class for encoding arrays, objects, and primitives to msgpack
     * format. You can create indepently configured instances, but you will
     * most likely want to simply use the static methods and interact with
     * the default/global Encoder.
     */
    export class Encoder {
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
}
declare module "Decoder" {
    /**
     * Class for decoding arrays, objects, and primitives to msgpack
     * format. You can create indepently configured instances, but you will
     * most likely want to simply use the static methods and interfact with
     * the default/global Encoder.
     */
    export class Decoder {
        private static textDecoder;
        /**
         * When reading msgpack string/binary objects from the data, determines if
         * the data should be copied to new buffers, or simply returned as subviews
         * of the buffer being decoded (better performance, but dangerous if you do
         * stuff to the message data after decoding it).
         */
        copyBuffers: boolean;
        /**
         * Value to deserialize msgpack's nil as. Should be set to either null or undefined.
         */
        nilValue: null | undefined;
        /**
         * What to do when a msgpack string value is encountered but the binary data is not
         * valid UTF-8. Can either throw an error or just return the raw binary data as a
         * Uint8Array.
         */
        invalidUTFBehavior: "throw" | "raw";
        /**
         * If true, msgpack maps will be decoded as ES6 Map objects. Otherwise, they will be
         * decoded as plain objects.
         */
        useES6Maps: boolean;
        private buffer;
        private view;
        private offset;
        decode<T>(data: ArrayBuffer | Uint8Array): T;
        readValue(): any;
        takeUint8(): number;
        takeUint16(): number;
        takeUint32(): number;
        takeUint64(): number;
        takeInt8(): number;
        takeInt16(): number;
        takeInt32(): number;
        takeInt64(): number;
        takeFloat32(): number;
        takeFloat64(): number;
        takeBuffer(length: number): Uint8Array;
        takeString(length: number): string | Uint8Array;
        takeArray(length: number): any[];
        takeMap(keyCount: number): object | Map<any, any>;
    }
}
declare module "index" {
    export * from "Encoder";
    export * from "Decoder";
}
