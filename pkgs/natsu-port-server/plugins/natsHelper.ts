import * as fastifyWebsocket from '@fastify/websocket';
import { } from "@silenteer/natsu";
import {
	NatsPortErrorResponse, NatsPortRequest, NatsPortResponse, NatsPortWSErrorResponse, NatsPortWSRequest, NatsPortWSResponse, NatsRequest, NatsResponse
} from "@silenteer/natsu-type";
import { FastifyReply, FastifyRequest } from "fastify";
import * as yup from "yup";

import { JSONCodec } from 'nats';
import { NatsConfig, natsService } from './natsService';

const httpRequestSchema = yup.object({
	subject: yup.string().trim().required(),
	traceId: yup.string().trim().notRequired(),
	contentType: yup
		.string()
});

const wsRequestSchema = yup.object({
	subject: yup.string().trim().required(),
	action: yup
		.string()
		.oneOf(['subscribe', 'unsubscribe'] as Array<
			NatsPortWSRequest<string>['action']
		>),
});

export type HelperConfig = {
  wsPath?: string

  natsAuthSubjects?: Array<string>
  natsNonAuthorizedSubjects?: Array<string>

  natsNamespaceSubjects?: Array<string>
  getNamespaceSubject?: string 
} & NatsConfig;

export function natsHelper(config: HelperConfig) {
	const { encode, decode } = JSONCodec()
	const nats = natsService(config)

	async function sendNatsAuthRequest(request: FastifyRequest) {
		let natsResponse: NatsResponse | undefined;

		if (config.natsAuthSubjects) {
			for (const subject of config.natsAuthSubjects) {
				const natsRequest: NatsRequest<string> = {
					headers: natsResponse ? natsResponse.headers : request.headers,
				};

				request.log.info({ natsRequest, subject }, 'sending nats auth')

				const message = await nats.request({
					subject,
					data: encode(natsRequest),
				});
				natsResponse = decode(message.data) as any;

				request.log.info({ natsResponse }, 'finished nats auth')
				if (natsResponse?.code !== 200) {
					break;
				}
			}
		}

		return natsResponse;
	}

	async function authenticate(request: FastifyRequest) {
		let result: {
			code: 'OK' | 401 | 403 | 500;
			authResponse?: NatsPortResponse | NatsPortErrorResponse;
		};
		const subject = request.headers['nats-subject'] as string;

		const shouldAuthenticate = config?.natsAuthSubjects 
		&& config?.natsAuthSubjects?.length > 0 
		&& !config.natsNonAuthorizedSubjects?.includes(subject);

		if (shouldAuthenticate) {
			request.log.info(`forwarding nats authentication request`);
			const natsAuthResponse = await sendNatsAuthRequest(request);

			if (natsAuthResponse?.code !== 200) {
				request.log.info(natsAuthResponse, 'received an abnormal response')
				result = {
					code: natsAuthResponse?.code as any,
					authResponse: natsAuthResponse as
						| NatsPortResponse
						| NatsPortErrorResponse,
				};
			} else {
				result = {
					code: 'OK',
					authResponse: natsAuthResponse as
						| NatsPortResponse
						| NatsPortErrorResponse,
				};
			}
			request.log.info(`finished nats auth`);
			return result;
		}

		result = { code: 'OK' };
		return result;
	}

	async function getNamespace(params: {
		httpRequest: FastifyRequest
		natsAuthResponse: NatsResponse;
	}) {
		const { httpRequest, natsAuthResponse } = params;
		const subject = httpRequest.headers['nats-subject'] as string;

		let result: {
			code: 'OK' | 400 | 401 | 403 | 500;
			namespace?: string;
		};

		const shouldSetNamespace = config.natsNamespaceSubjects?.includes(subject);

		if (shouldSetNamespace) {
			const natsRequest: NatsRequest<unknown> = {
				headers: natsAuthResponse
					? natsAuthResponse.headers
					: httpRequest.headers,
				body: { subject },
			};

			const message = await nats.request({
				subject: config.getNamespaceSubject as string,
				data: encode(natsRequest),
			});
			const natsResponse = decode(message.data) as any;
			const namespace =
				natsResponse?.['code'] === 200 ? natsResponse?.['body']?.namespace : undefined;

			if (namespace) {
				result = { code: 'OK', namespace };
				return result;
			} else {
				result = { code: natsResponse?.['code'] as any };
				return result;
			}
		}

		result = { code: 'OK' };
		return result;
	}

	function validateWSRequest(request: NatsPortWSRequest) {
		let result: {
			code: 'OK' | 400;
		};

		if (!wsRequestSchema.isValidSync(request)) {
			result = { code: 400 };
			return result;
		}

		result = { code: 'OK' };
		return result;
	}

	function sendWSResponse(params: {
		connection: fastifyWebsocket.SocketStream;
		response: NatsPortWSResponse<string> | NatsPortWSErrorResponse<string>;
	}) {
		const { connection, response } = params;
		if (response?.subject) {
			connection.socket.send(JSON.stringify(response));
		}
	}

	function validateHttpRequest(request: FastifyRequest) {
		const contentType = request.headers['content-type'];
		const subject = request.headers['nats-subject'] as string;
		const traceId = request.headers['trace-id'] as string;
		let result: {
			code: 'OK' | 400;
		};

		if (!httpRequestSchema.isValidSync({ contentType, subject, traceId })) {
			result = { code: 400 };
			return result;
		}

		result = { code: 'OK' };
		return result;
	}

	async function sendNatsRequest(params: {
		request: FastifyRequest
		natsAuthResponse: NatsResponse;
	}) {
		const { request, natsAuthResponse } = params;
		const natsRequest: NatsRequest<unknown> = {
			headers: natsAuthResponse ? natsAuthResponse.headers : request.headers,
			body: (request.body as NatsPortRequest)?.data,
		};
		request.log.info(natsRequest, 'forwarding request to nats')

		const message = await nats.request({
			subject: request.headers['nats-subject'] as string,
			data: encode(natsRequest),
		});
		const natsResponse = decode(message.data) as any;

		request.log.info(
			natsResponse,
			`nats response with`,
		);

		const portResponse: NatsPortResponse | NatsPortErrorResponse = {
			code: natsResponse?.['code'] as
				| NatsPortResponse['code']
				| NatsPortErrorResponse['code'],
			body: natsResponse?.['body'],
		};

		request.log.info(
			portResponse,
			`sending back`,
		);

		return { headers: natsResponse?.['headers'], response: portResponse };
	}

	function return400(reply: FastifyReply) {
		reply.statusCode = 400;
		reply.send();
	}

	function return500(reply: FastifyReply) {
		reply.statusCode = 500;
		reply.send();
	}

	return {
		return400, return500,
		sendNatsRequest,
		validateHttpRequest,
		validateWSRequest,
		sendWSResponse,
		getNamespace,
		authenticate
	}
}