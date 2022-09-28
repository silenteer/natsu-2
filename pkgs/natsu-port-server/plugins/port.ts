import fp from "fastify-plugin"

import type {
	NatsResponse,
} from '@silenteer/natsu-type';
import { authenticate, return400, sendNatsRequest, validateHttpRequest } from "./utils";

type NatsPortOpts = {
	portPath: string
}

// nats port does few things
// 1. chheck header for nats-subject
// 2. forward body to nats connection

export default fp(async function (fastify, opts: NatsPortOpts) {

	fastify.post(opts.portPath, async (request, reply) => {
		const subject = request.headers['nats-subject'];
		const logger = request.log.child({ subject });

		logger.debug({
			headers: request.headers,
			body: request.body,
		}, 'begin validation');

		const validationResult = validateHttpRequest(request);
		
		if (validationResult.code === 400) {
			logger.info('validation error, resulting 400')
			return400(reply);
			return;
		}
		
		logger.debug(`begin authentication`);

		const authenticationResult = await authenticate(request);
		if (authenticationResult.code !== 'OK') {
			reply.send({
				code: authenticationResult.code,
				body: authenticationResult.authResponse?.body,
			});
			return;
		}

		logger.debug(`end authentication`);

		logger.info(`forwarding nats request`);

		const { headers, response } = await sendNatsRequest({
			request,
			natsAuthResponse: authenticationResult.authResponse as NatsResponse,
		});

		if (headers?.['set-cookie']) {
			logger.info('request containing cookie, returning cookie value to client')
			reply.header('set-cookie', headers['set-cookie']);
		}

		return response;
	})



}, {
	name: 'nats-port'
})