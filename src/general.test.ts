import { it, expect } from 'vitest';
import { encode, decode, DECODE_OPTS, registerExtension } from '.';

it('Encode+decode produces the original input', () => {
    const data = {
        name: 'Sam',
        age: 69,
        array: [324, false, 23424, 232, 5, 5, 21312.111, 'hmm', {
            nested: 'object',
            value: undefined,
        }],
        es6MapWithObjKey: new Map<any, any>([
            [{ an: 'object key' }, 'hello'],
            [41, 'not the answer'],
        ]),
        nestedObj: {
            something: 'else',
            timestamp: new Date(),
        },
    };

    expect(decode(encode(data))).toEqual(data);
});

it("Respects 'forceES6Map' preference", () => {
    const basicObj = {
        foo: 1,
        bar: 2,
        baz: 3,
    };
    const mapWithStringKeys = new Map<string, number>([
        ['foo', 1],
        ['bar', 2],
        ['baz', 3],
    ]);
    const mapWithMapKeys = new Map<object, number>([
        [new Map([['value', 'foo']]), 1],
        [new Map([['value', 'bar']]), 2],
        [new Map([['value', 'baz']]), 3],
    ]);
    const mapWithObjKeys = new Map<object, number>([
        [{ value: 'foo' }, 1],
        [{ value: 'bar' }, 2],
        [{ value: 'baz' }, 3],
    ]);
    const origForceES6Map = DECODE_OPTS.forceES6Map;

    DECODE_OPTS.forceES6Map = false;

    expect(decode(encode(mapWithStringKeys))).toStrictEqual(basicObj);
    expect(decode(encode(mapWithMapKeys))).toStrictEqual(mapWithObjKeys);

    DECODE_OPTS.forceES6Map = true;

    expect(decode(encode(mapWithStringKeys))).toStrictEqual(mapWithStringKeys);
    expect(decode(encode(mapWithMapKeys))).toStrictEqual(mapWithMapKeys);

    DECODE_OPTS.forceES6Map = origForceES6Map;
});

it("Respects 'nilValue' and omits undefined map values", () => {
    const data = {
        boolean: false,
        another: true,
        undefined: undefined,
        null: null,
    };
    const origNilValue = DECODE_OPTS.nilValue;

    DECODE_OPTS.nilValue = undefined;

    expect(decode(encode(data))).toStrictEqual({
        boolean: false,
        another: true,
        null: undefined,
    });

    DECODE_OPTS.nilValue = null;

    expect(decode(encode(data))).toStrictEqual({
        boolean: false,
        another: true,
        null: null,
    });

    DECODE_OPTS.nilValue = origNilValue;
});

it("Handles nested calls to encode and decode", () => {
    class CustomA {
        constructor(readonly valueA: CustomB) {}
    }
    class CustomB {
        constructor(readonly valueB: number) {}
    }

    registerExtension(
        1,
        CustomA,
        (custom) => encode(custom.valueA),
        (buffer) => new CustomA(decode(buffer))
    )
    registerExtension(
        2,
        CustomB,
        (custom) => new Uint8Array([custom.valueB]),
        (buffer) => new CustomB(buffer[0])
    )

    const data = new CustomA(new CustomB(0))
    const output = decode(encode(data)) as any

    expect(output).toBeInstanceOf(CustomA)
    expect(output.valueA).toBeInstanceOf(CustomB)
    expect(output.valueA.valueB).toStrictEqual(0)
})

// TODO: more tests, refine tests
