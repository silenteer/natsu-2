import fp from 'fastify-plugin'
import { AddressInfo } from 'net'
import { request } from 'urllib'
import { RequestOptions } from 'urllib/src/esm/Request'

export function getAddress(address: string | AddressInfo | null) {
	if (!address) {
		throw new Error("call the client on a yet started server")
	}

	let host: string
	let protocol: string = 'http://'
	let port: string = ''

	if (typeof address === 'string') {
		host = address
	} else {
		host = address.address
		port = `:${address.port}`
	}

	return `${protocol}${host}${port}`
}

export default fp(async function(f) {
	const logger = f.log.child({ name: 'fastify-client' })

	async function send(subject: string, data: any, opts?: RequestOptions) {
		const address = getAddress(f.server.address());
		
		const requestOptions: Partial<RequestOptions> = { 
			method: 'POST',
			contentType: 'application/json', 
			...opts 
		}

		if (data?.['headers'] || data?.['body']) {
			Object.assign(requestOptions, ...data?.['headers'], { data: data?.['body'] })
		} else {
			Object.assign(requestOptions, { data })
		}
		
		logger.info({subject, opts: requestOptions}, "sending to server")
		const result = await request(`${address}/${subject}`, requestOptions);

		return result
	}

	// expect header and body
	async function call(path: string, body: any, opts?: RequestOptions) {
		const result = await send(path, body, opts)
		return result;
	}

	f.decorate('call', call)
}, {
	name: 'fastify-client'
})

declare module 'fastify' {
	interface FastifyInstance {
		call: (subject: string, body: any, opts?: RequestOptions) => any
	}
}