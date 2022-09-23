import { vi, expect, test, it, describe, beforeEach, afterEach } from "vitest";
import { request } from "urllib";
import { RequestOptions } from "urllib/src/esm/Request";
import { NatsAuthorizationResult, NatsValidationResult } from "@silenteer/natsu";
import { z } from "zod";

import { createRoute } from "../route";
import { Router } from "../builder";
import { getAddress } from "../plugins/client";
import { createProvider } from "../plugins/provider";

function mockRoute(subject: string, validation?: {
	input?: z.Schema,
	output?: z.Schema
}) {
	const handle = vi.fn();
	handle.mockResolvedValue({ code: 'OK' })

	return [handle, createRoute({
		subject,
		handle,
		input: validation?.input,
		output: validation?.output
	})] as const
}

function mockLegacyRoute(subject: string, options?: {
	input?: z.Schema,
	output?: z.Schema,
	validation?: (...args: any[]) => Promise<NatsValidationResult>
	authorization?: (...args: any[]) => Promise<NatsAuthorizationResult>
}) {
	const handle = vi.fn();

	return [handle, {
		subject,
		handle,
		validate: options?.validation || (async () => { return { code: 'OK' } }),
		authorize: options?.authorization || (async () => { return { code: 'OK' } })
	}] as const
}

function makeProvider(name: string, value: any) {
	return createProvider({
		name,
		path: name,
		value: async () => value
	})
}

function makeClient(server: Router) {
	return async (path: string, opts?: RequestOptions) => request(
		getAddress(server.fastify.server.address()) + '/' + path,
		{
			...opts,
			timeout: 100000
		},
	)
}

describe("server wrapper should be able to declare routes", async () => {
	let server: Router
	let call: ReturnType<typeof makeClient>

	const [mockHandle, echoRoute] = mockRoute('echo')
	const [mockLegacyHandle, legacyRoute] = mockLegacyRoute('hello')
	const provider = makeProvider('test', { value: 'something' })
	beforeEach(async () => {
		server = new Router({
			serverOpts: {
				logger: true
			},
			listenOpts: {
				port: 0
			},
			portEnabled: true
		})
			.use(provider)
			.route(echoRoute)
			.route(legacyRoute)

		call = makeClient(server)
	})

	afterEach(async () => {
		vi.resetAllMocks()
		server?.fastify.server.close()
	})

	test("server should be able to register with old and new format", async () => {
		mockLegacyHandle.mockResolvedValue({ code: 'OK', body: { msg: 'world' } })
		mockHandle.mockResolvedValue({ code: 'OK', body: { msg: 'echo' } })

		await server.start()

		expect(JSON.parse((await call('echo')).data.toString())).toStrictEqual({ msg: 'echo' });
		expect(JSON.parse((await call('hello')).data.toString())).toStrictEqual({ msg: 'world' });
	})

	test("server should pass the provider context to handler", async () => {
		await server.start()
		await call('echo')
		expect(mockHandle).toBeCalledWith(
			expect.anything(),
			expect.objectContaining({
				'test': { value: 'something' }
			})
		)
	})

	test("query parameter would work", async () => {
		await server.start();
		await call('echo?msg=hello')
		expect(mockHandle).toBeCalledWith(
			expect.objectContaining({
				body: { msg: 'hello' }
			}),
			expect.anything()
		)
	})

	test("body should work", async () => {
		await server.start();
		await call('echo', {
			data: {
				msg: 'echo'
			}
		})

		expect(mockHandle).toBeCalledWith(
			expect.objectContaining({
				body: { msg: 'echo' }
			}),
			expect.anything()
		)
	})

	test("headers should work", async () => {
		await server.start()
		await call('echo', {
			headers: {
				'x-header': 'hello'
			}
		})

		expect(mockHandle).toBeCalledWith(
			expect.objectContaining({
				headers: expect.objectContaining({ "x-header": "hello" })
			}),
			expect.anything()
		)
	})

	test("return headers should work", async () => {
		await server.start();

		mockHandle.mockResolvedValue({
			code: 'OK',
			headers: { 'x-header': 'hello' }
		})

		const result = await call('echo')
		expect(result.headers).contains({ 'x-header': 'hello' })
	})

	test("unexpected exception should cause 500", async () => {
		await server.start();
		mockHandle.mockRejectedValue(new Error('fake error'))

		const result = await call('echo')

		expect(result.statusCode).toBe(500)
		console.log(result.data.toString())
	})

	test("input validation should work", async () => {
		const [mockHandler, emailOnlyRoute] = mockRoute('current', {
			input: z.object({
				value: z.string().email()
			})
		})
		mockHandler.mockResolvedValue({ body: { msg: 'hello' } })

		const mockValidation = vi.fn()

		server.route(emailOnlyRoute)
		await server.start()

		expect((await call('current?value=email@abc.com')).statusCode).toBe(200)
		expect((await call('current?value=1234')).statusCode).toBe(400)
	})

	test("legacy validation should work", async () => {
		const mockValidation = vi.fn()
		const [legacyHandler, legacyRoute] = mockLegacyRoute('legacy', {
			validation: mockValidation
		})
		legacyHandler.mockResolvedValue({ body: { msg: 'validation' } })

		server.route(legacyRoute)
		await server.start()

		mockValidation.mockResolvedValueOnce({
			code: 400,
			errors: 'invalid email address'
		})
		expect((await call('legacy')).statusCode).toBe(400)

		mockValidation.mockResolvedValue({
			code: 'OK'
		})
		expect((await call('legacy')).statusCode).toBe(200)
	})

	test("authorization should work", async () => {
		const mockAuthorization = vi.fn()
		const [legacyHandler, legacyRoute] = mockLegacyRoute('legacy', {
			authorization: mockAuthorization
		})
		legacyHandler.mockResolvedValue({ body: { msg: 'validation' } })

		server.route(legacyRoute)
		await server.start()

		mockAuthorization.mockResolvedValue({
			code: 403,
			errors: 'invalid email address'
		})
		expect((await call('legacy')).statusCode).toBe(403)
		expect((await call('legacy')).data.toString()).toBe('invalid email address')

		mockAuthorization.mockResolvedValue({
			code: 'OK'
		})
		expect((await call('legacy')).statusCode).toBe(200)
	})

	test("expect 404 on non sense route", async () => {
		await server.start()

		expect((await call('something')).statusCode).toBe(404)
	})

	test("test timeout", async () => {
		const timeoutServer = new Router({
			serverOpts: {
				logger: { level: 'debug' },
			},
			listenOpts: {
				port: 0
			},
			handler: {
				timeout: 200
			}
		})

		timeoutServer.route({
			subject: 'long',
			async handle() {
				await new Promise(r => setTimeout(r, 500));
				return {
					code: 'OK',
					body: 'not supposed to be there'
				}
			}
		})

		await timeoutServer.start()
		const result = await makeClient(timeoutServer)('long')

		expect(result.statusCode).toBe(504)
		expect(result.data.toString()).not.toBe('not supposed to be there')
	})
})