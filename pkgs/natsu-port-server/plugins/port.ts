import fp from "fastify-plugin";

import type { NatsResponse } from '@silenteer/natsu-type';
import { natsHelper, HelperConfig } from "./natsHelper";

export type PortConfig = {
	httpPath?: string
} & HelperConfig

export default fp(async function (fastify, opts: PortConfig) {

	const helper = natsHelper(opts)

	fastify.post(opts.httpPath || "/port", {
		schema: {
			headers: {
				type: 'object',
				properties: {
					'nats-subject': { type: 'string' }
				},
				required: ['nats-subject']
			},
			body: {
				type: "object",
				properties: {
					data: {type: "object"}
				},
				required: ['data']
			}
		}
	}, async (request, reply) => {
		const subject = request.headers['nats-subject'];
		const logger = request.log.child({ subject });

		logger.debug({
			headers: request.headers,
			body: request.body,
		}, 'begin validation');

		const validationResult = helper.validateHttpRequest(request);
		
		if (validationResult.code === 400) {
			logger.info('validation error, resulting 400')
			helper.return400(reply);
			return;
		}
		
		logger.debug(`begin authentication`);

		const authenticationResult = await helper.authenticate(request);
		if (authenticationResult.code !== 'OK') {
			reply.send({
				code: authenticationResult.code,
				body: authenticationResult.authResponse?.body,
			});
			return;
		}

		logger.debug(`end authentication`);

		logger.info(`forwarding nats request`);

		const { headers, response } = await helper.sendNatsRequest({
			request,
			natsAuthResponse: authenticationResult.authResponse as NatsResponse,
		});

		logger.info({headers, response}, `received nats response`)

		if (headers?.['set-cookie']) {
			logger.info('request containing cookie, returning cookie value to client')
			reply.header('set-cookie', headers['set-cookie']);
		}

		return response;
	})

}, {
	name: 'nats-port'
})