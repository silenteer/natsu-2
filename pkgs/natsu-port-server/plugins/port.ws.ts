import fp from "fastify-plugin"
import { randomUUID } from 'crypto';
import '@fastify/websocket'; // to declare type

import type {
  NatsPortWSRequest,
  NatsPortWSErrorResponse,
  NatsResponse,
} from '@silenteer/natsu-type';

import NatsService from "./service-nats"
import { authenticate, getNamespace, sendWSResponse, validateWSRequest } from "./utils";

type PortWSOpts = {
	wsPath: string
}

export default fp(async function(server, config: PortWSOpts) {
	server.get(config.wsPath, { websocket: true }, (connection, request) => {
    const connectionId = randomUUID();
    const logger = request.log.child({
      id: `ws-${connectionId}`
    })

    logger.debug('incoming websocket request')

    connection.socket.on('close', () => {
			logger.info('connection closed, unsubscribing ...')
      NatsService.unsubscribeAllSubjects(connectionId);
    });

    connection.socket.on('message', async (message) => {
			let wsRequest: NatsPortWSRequest;
			
      try {
				logger.debug({ message: message.toString() }, 'incoming message')
        wsRequest = JSON.parse(message.toString()) as NatsPortWSRequest;
        request.headers = {
          ...wsRequest.headers,
          ...request.headers,
          ['nats-subject']: wsRequest.subject,
        };

        const validationResult = validateWSRequest(wsRequest);
        if (validationResult.code === 400) {
          const response: NatsPortWSErrorResponse = {
            subject: wsRequest.subject,
            code: validationResult.code,
          };
          sendWSResponse({ connection, response });
          return;
        }

        const authenticationResult = await authenticate(request);
        if (authenticationResult.code !== 'OK') {
          connection.destroy(
            new Error(JSON.stringify({ code: authenticationResult.code }))
          );
          return;
        }

        const getNamespaceResult = await getNamespace({
          httpRequest: request,
          natsAuthResponse: authenticationResult.authResponse as NatsResponse,
        });
        if (getNamespaceResult.code !== 'OK') {
          connection.destroy(
            new Error(JSON.stringify({ code: authenticationResult.code }))
          );
          return;
        }

        if (wsRequest.action === 'subscribe') {
          NatsService.subscribe({
            connectionId,
            subject: wsRequest.subject,
            namespace: getNamespaceResult.namespace,
            onHandle: (response) => {
              console.log("sending response", { response })
              sendWSResponse({ connection, response });
            },
          });
        } else if (wsRequest.action === 'unsubscribe') {
          NatsService.unsubscribe({
            connectionId,
            subject: wsRequest.subject,
            namespace: getNamespaceResult.namespace,
          });
        } else {
          connection.destroy(new Error('Unsupported operation'));
        }
      } catch (error) {
        const response: NatsPortWSErrorResponse = {
          subject: wsRequest?.subject,
          code: 500,
          body: JSON.stringify(error),
        };
        sendWSResponse({ connection, response });
      }
    });
  })
}, {
	name: 'nats-port-ws',
	dependencies: ['@fastify/websocket']
})