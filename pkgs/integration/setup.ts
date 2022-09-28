import { beforeAll } from "vitest"
import fetchPonyfill from "fetch-ponyfill"

Object.assign(globalThis, {
	fetch: fetchPonyfill().fetch
})