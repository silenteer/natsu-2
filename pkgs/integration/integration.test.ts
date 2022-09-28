
import { beforeAll, describe, test, expect } from "vitest"

import portSrv from "@silenteer/natsu-port-server-2";
import { connect, JSONCodec, type Msg } from "nats"
import * as portClient from "../natsu-port";
import { NatsPortWSResponse } from "../natsu-port/websocket-client";

import fetchPonyfill from 'fetch-ponyfill'

beforeAll(() => {
	global.fetch = fetchPonyfill().fetch
})

const SERVER_PORT = '8080'

const { encode, decode } = JSONCodec()

describe("port integration", async () => {
	// make sure that nats in open
	const nc = await connect()
	await portSrv.start()

	const client = portClient.connect({
		serverURL: new URL(`http://localhost:${SERVER_PORT}`)
	})

	const suber = portClient.connectWS({
		serverURL: new URL(`ws://localhost:${SERVER_PORT}/`)
	})

	const TEST_SUBJECT = 'test'
	const SUB_SUBJECT = 'sub'

	test("subscribe via websocket", async (done) => new Promise(async (resolve, reject) => {

		let result: any
		const mockHandler = async (response: NatsPortWSResponse) => {
			result = response
		}

		const {unsubscribe} = await suber.subscribe(SUB_SUBJECT, mockHandler)
		nc.publish(SUB_SUBJECT, encode({ code: 200, body: 'test' }))

		const interval = setInterval(() => {
			if (result) {
				expect(result?.['body']).toBe('test')
				unsubscribe()
				resolve(result)
				clearInterval(interval)
			}
		}, 500)
	})
	, {timeout: 20000})

	// for some reason, likely due to side-effect, this test needs to be the latter
	test("send request to nats via port", async () => {
		const listen = async () => {
			const sub = nc.subscribe(TEST_SUBJECT, {
				max: 1
			})
			
			const result: Array<any> = []
			for await (const m of sub) {
				const content = decode(m.data)
				result.push(content) 
				
				if (m.reply) {
					m.respond(encode({
						code: 200,
						...content as any
					}))
				}
			}
	
			return result
		}

		const resultPromise = listen();
		await client(TEST_SUBJECT, { content: 'test' });

		const result = await resultPromise

		expect(result[0]).toStrictEqual(
			expect.objectContaining({
				body: {
					content: 'test'
				}
			})
		)

	})
})

