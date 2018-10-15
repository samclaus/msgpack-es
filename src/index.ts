import { Encoder } from "./Encoder";
import { Decoder } from "./Decoder";

export * from "./Encoder";
export * from "./Decoder";

window["msgpack"] = {
    Encoder: Encoder,
    Decoder: Decoder
};