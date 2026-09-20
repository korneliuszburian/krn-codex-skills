import { escapeRegExp } from "./escape-a.mjs";
export const pattern = (value) => new RegExp(escapeRegExp(value));
