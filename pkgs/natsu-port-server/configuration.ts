import * as yup from 'yup';

import dotenv from 'dotenv';
import { PortConfig } from './plugins/port';
import { PortWSConfig } from './plugins/port.ws';
import { FastifyInstance } from 'fastify';

const schema = yup.object({
  natsURI: yup.string().trim().required(),
  natsAuthSubjects: yup
    .array(yup.string().trim().required())
    .optional(),
  natsNonAuthorizedSubjects: yup
    .array(yup.string().trim().required())
    .optional(),
  natsNamespaceSubjects: yup
    .array(yup.string().trim().required())
    .optional(),
  getNamespaceSubject: yup.string().when('natsNamespaceSubjects', {
    is: (natsNamespaceSubjects: any) =>
      natsNamespaceSubjects?.every((item: any) => !!item.trim()),
    then: yup.string().trim().required(),
    otherwise: yup.string().trim().notRequired(),
  }),
  natsUser: yup.string().trim().notRequired(),
  natsPass: yup.string().trim().notRequired(),
  httpPath: yup.string(),
  wsPath: yup.string(),
  
  origin: yup.array(yup.string().required()),
  port: yup.number().lessThan(65000).moreThan(0),
  credentials: yup.bool()
});

// console.log('Config set', JSON.stringify(result, undefined, 2));
type ServerConfig = {
  fastify?: FastifyInstance
  autoStart?: boolean

  port?: number
  origin?: Array<string>
  credentials?: boolean
}

type Config = PortConfig & PortWSConfig & ServerConfig

export type { Config };

function load(): Config {
  dotenv.config();

  const config: Config = {
    natsURI: process.env.NATS_URI || 'localhost:4222',
    natsAuthSubjects: process.env.NATS_AUTH_SUBJECTS?.split(',').filter(
      (item) => !!item
    ) || [],
    natsNonAuthorizedSubjects: process.env.NATS_NON_AUTHORIZED_SUBJECTS?.split(
      ','
    ).filter((item) => !!item) || [],
    natsNamespaceSubjects: process.env.NATS_NAMESPACE_SUBJECTS?.split(',').filter(
      (item) => !!item
    ) || [],
    getNamespaceSubject: process.env.NATS_GET_NAMESPACE_SUBJECT as any,
    natsUser: process.env.NATS_USER,
    natsPass: process.env.NATS_PASS,
    port: (process.env.SERVER_PORT && parseInt(process.env.SERVER_PORT)) || 8080,
    httpPath: process.env.SERVER_HTTP_PATH || '/',
    wsPath: process.env.SERVER_WS_PATH || '/',
    origin: ['*'].concat(process.env.SERVER_ORIGIN?.split(',') || []),
    credentials: !!process.env.SERVER_CREDENTIALS
  };
  
  schema.validateSync(config);
  return config
}

export default load;
