
export type Encoder<T> = (val: T) => Uint8Array;
export type Decoder<T> = (src: Uint8Array) => T;

type Constructor<T> = new (...args: any[]) => T;

export const extEncoders = new Map<Constructor<any>, [number, Encoder<any>]>();
export const extDecoders = new Array<Decoder<any>>(256);

/**
 * Register a MessagePack extension. Negative extension types are technically
 * reserved by the spec, but this library will not prevent you from registering
 * a negative extension type in case you have reason to.
 * 
 * NOTE: This library does provide the standard MessagePack date extension (-1),
 * using standard JavaScript `Date` objects.
 * 
 * @see https://github.com/msgpack/msgpack/blob/master/spec.md#extension-types
 * @see https://github.com/msgpack/msgpack/blob/master/spec.md#timestamp-extension-type
 * 
 * ## Simple Example
 * 
 * ```ts
 * class Color {
 *     constructor(
 *         readonly r: number, // integer [0, 255]
 *         readonly g: number, // integer [0, 255]
 *         readonly b: number, // integer [0, 255]
 *     ) {}
 * }
 * 
 * registerExtension(
 *     15,
 *     Color,
 *     color => new Uint8Array([color.r, color.g, color.b]), // Encode
 *     buffer => new Color(buffer[0], buffer[1], buffer[2]), // Decode
 * );
 * ```
 */
export function registerExtension<T extends object>(
    /**
     * Numerical ID for the extension that should be used when
     * encoding/decoding. Should be an integer in the range [0, 127].
     * Values [-128, -1] are reserved by the MessagePack spec, but
     * you may register one of those values in case it's necessary.
     */
    msgpackID: number,
    /**
     * The class (constructor function) that should be encoded using
     * this extension. E.g., if you have an ES6 class named `MyClass`,
     * pass the class itself as the value here. (Classes are
     * technically functions in JavaScript.)
     */
    ctor: Constructor<T>,
    /**
     * Callback to encode instances of the relevant class. Do not
     * create MessagePack header information: this library will do
     * that for you, so you just need to encode the raw information
     * as an array of bytes in a manner where you could recreate
     * your object instance from scratch if given back the array of
     * bytes.
     */
    encode: Encoder<T>,
    /**
     * Callback to decode a byte array back into an instance of the
     * class. Basically this will be given an array of bytes exactly
     * like what your encoding function spits out--no MessagePack
     * header information will be present.
     */
    decode: Decoder<T>,
): void {
    extEncoders.set(ctor, [msgpackID, encode]);
    extDecoders[msgpackID + 128] = decode;
}