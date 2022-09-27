import { Router } from "../router";
import {describe, bench} from "vitest";
import { connect } from "nats";
import { request } from "urllib";
import { AddressInfo } from "net";

describe("bench mark calls", async () => {
	const server = await new Router({
		listenOpts: {
			port: 0
		}
	})
	.route({
		subject: 'hello',
		handle: async () => {
			return {
				code: 'OK',
				body: { msg: 'world' }
			}
		}
	})
	.start()

	const address = server.fastify.server.address() as AddressInfo;
	const nc = await connect();

	bench("using nats", async function () {
		await nc.request('hello')
	}, {
		warmupIterations: 20,
		iterations: 3 * 1000
	})

	bench("using bridge", async function () {
		await server.call('hello')
	}, {
		warmupIterations: 20,
		iterations: 3 * 1000
	})

	bench("using request", async function() {
		const response = await request(`http://${address.address}:${address.port}/hello`)
		JSON.parse(response.data.toString())
	}, {
		warmupIterations: 20,
		iterations: 3 * 1000
	})
})