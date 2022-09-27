import { vi, expect, test, it, describe, beforeEach, afterEach } from "vitest";
import { request } from "urllib";
import { RequestOptions } from "urllib/src/esm/Request";
import { NatsAuthorizationResult, NatsValidationResult } from "@silenteer/natsu";
import { z } from "zod";

import { createRoute } from "../route";
import { Router } from "../router";
import { getAddress } from "../utils";
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
	const handle = vi.fn().mockResolvedValue({ code: 'OK' });

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

describe("router", async () => {
	const [mockHandle, echoRoute] = mockRoute('echo')

	const mockValidation = vi.fn().mockResolvedValue({ code: 'OK' })
	const mockAuthorization = vi.fn().mockResolvedValue({ code: 'OK'})
	const [mockLegacyHandle, legacyRoute] = mockLegacyRoute('hello', {
		authorization: mockValidation,
		validation: mockAuthorization
	})

	const provider = makeProvider('test', { value: 'something' })
	const	server = await new Router({
			serverOpts: {
				logger: {
					name: expect.getState().currentTestName
				}
			},
			listenOpts: {
				port: 0
			},
			portEnabled: true
		})
			.use(provider)
			.route(echoRoute)
			.route(legacyRoute)
		.start()

	const	call = makeClient(server)

	test("server should be able to register with old and new format", async () => {
		mockLegacyHandle.mockResolvedValue({ code: 'OK', body: { msg: 'world' } })
		mockHandle.mockResolvedValue({ code: 'OK', body: { msg: 'echo' } })

		expect(JSON.parse((await call('echo')).data.toString())).toStrictEqual({
			body: { msg: 'echo' },
			code: 'OK'
		});
		expect(JSON.parse((await call('hello')).data.toString())).toStrictEqual({ 
			body: { msg: 'world'},
			code: 'OK' 
		});
	})

	test("server should pass the provider context to handler", async () => {

		await call('echo')
		expect(mockHandle).toBeCalledWith(
			expect.anything(),
			expect.objectContaining({
				'test': { value: 'something' }
			})
		)
	})

	test("query parameter would work", async () => {

		await call('echo?msg=hello')
		expect(mockHandle).toBeCalledWith(
			expect.objectContaining({
				body: { msg: 'hello' }
			}),
			expect.anything()
		)
	})

	test("body should work", async () => {
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

		mockHandle.mockResolvedValue({
			code: 'OK',
			headers: { 'x-header': 'hello' }
		})

		const result = await call('echo')
		expect(JSON.parse(result.data)).toStrictEqual({
			code: 'OK',
			headers: { 'x-header': 'hello' }
		})
	})

	test("unexpected exception should cause 500", async () => {
		mockHandle.mockRejectedValue(new Error('fake error'))

		const result = await call('echo')

		expect(result.statusCode).toBe(500)
		console.log(result.data.toString())
	})

	/**
	 * Need to rewrite the mock
	 */
	test("input validation should work", async () => {
		const validationServer = new Router({ listenOpts: { port: 0 }})

		const [mockHandler, emailOnlyRoute] = mockRoute('current', {
			input: z.object({
				value: z.string().email()
			})
		})
		mockHandler.mockResolvedValue({ body: { msg: 'hello' } })

		validationServer.route(emailOnlyRoute)
		await validationServer.start()

		const validationCall = makeClient(validationServer)


		expect((await validationCall('current?value=email@abc.com')).statusCode).toBe(200)
		expect((await validationCall('current?value=1234')).statusCode).toBe(400)
	})

	test("legacy validation should work", async () => {

		mockValidation.mockResolvedValue({
			code: 400,
			errors: 'invalid email address'
		})
		expect((await call('hello')).statusCode).toBe(400)

		mockValidation.mockResolvedValue({
			code: 'OK'
		})
		expect((await call('hello')).statusCode).toBe(200)
	})

	test("authorization should work", async () => {
		mockAuthorization.mockResolvedValue({
			code: 403,
			errors: 'invalid email address'
		})
		
		expect((await call('hello')).statusCode).toBe(403)
		expect((await call('hello')).data.toString()).toBe('invalid email address')

		mockAuthorization.mockResolvedValue({
			code: 'OK'
		})
		expect((await call('hello')).statusCode).toBe(200)
	})

	test("expect 404 on non sense route", async () => {
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