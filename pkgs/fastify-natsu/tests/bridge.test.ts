import { describe, test, beforeEach, afterEach, expect, bench } from "vitest";

import fastify from "fastify";
import bridge from "../plugins/bridge";

describe("bridge function", async function() {

	const server = fastify({ logger: true })
	server.register(bridge)
	server.all('/echo', (req, rep) => {
		return { msg: "hello" }
	})

	await server.listen({ port: 0 })

	afterEach(async () => {
		server.close()
	})

	test("bridge should function", async () => {
		const result = await server.bridge('echo', {
			data: { msg: 'hello' }
		})

		expect(result).toStrictEqual({ msg: 'hello' })
	})

})
