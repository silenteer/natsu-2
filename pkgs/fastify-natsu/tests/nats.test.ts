import { connect, JSONCodec, MsgHdrsImpl } from "nats"
import { test, describe, beforeEach, afterEach, expect, afterAll } from "vitest"
import { Router } from "../router"

describe("nats plugin function", async () => {

	let router = await new Router({
		serverOpts: {
			logger: {
				name: expect.getState().currentTestName
			}
		},
		listenOpts: {
			port: 0
		}
	})
		.route({
			subject: 'echo',
			async handle(data) {
				return {
					code: 'OK',
					body: data.body,
					headers: data.headers
				} 
			}
		})
		.start()

	afterAll(() => {
		router.fastify.close()
	})

	const {encode, decode} = JSONCodec()
	const nc = await connect();

	test("nats function", async () => {
		const response = await nc.request('echo', encode({ body: { msg: 'hello' } }))
		const decoded = JSONCodec().decode(response.data)

		expect(decoded).toStrictEqual({
			body: { msg: 'hello'},
			headers: expect.anything(),
			code: 200
		})
	})

	test("nats send header via msg header", async () => {
		const response = await nc.request('echo', encode({
			headers: {
				x: "test"
			},
			body: {
				msg: "hello"
			}
		}))

		const decoded = JSONCodec().decode(response.data)
		expect(decoded).toStrictEqual({
			headers: expect.objectContaining({
				'x': 'test',
			}),
			code: 200,
			body: {
				msg: "hello"
			}
		})
	})

	test("send empty call should work", async () => {
		const response = await nc.request('echo')
		const decoded = JSONCodec().decode(response.data)
		console.log(decoded)
	})

})