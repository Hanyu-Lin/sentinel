// c imports a, creating the cycle a → b → c → a
import { a } from "./a";
export const c: string = a ?? "c";
