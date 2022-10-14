import React, { useContext, useEffect } from 'react';
import { connect, connectWS } from '@silenteer/natsu-port-2';

import type {
  NatsChannel,
  NatsPortWSResponse,
  NatsService,
} from '@silenteer/natsu-type';

import { useQuery, QueryClient, QueryClientProvider, UseQueryOptions, useMutation, UseMutationOptions, QueryClientConfig } from "@tanstack/react-query"

export type ClientOptions = {
  host: URL
  wsHost?: URL
  queryClient?: QueryClient,
  queryClientConfig?: QueryClientConfig 
}

function makeSocketClient(wsHost?: URL) {
  return wsHost 
    ? connectWS({ serverURL: wsHost }) 
    : undefined
}

function makeNatsuClient(url?: URL) {
  return url
    ? connect({ serverURL: url })
    : undefined
}

function createClient<
  A extends NatsService<string, unknown, unknown>,
  B extends NatsChannel<string, unknown, unknown>
>(clientOpts: ClientOptions) {
  console.log("Creating client")
  const queryClient = clientOpts?.queryClient || new QueryClient(clientOpts?.queryClientConfig)

  const natsu = typeof window !== 'undefined' ? makeNatsuClient(clientOpts.host) : undefined;
  const socket = typeof window !== 'undefined' ? makeSocketClient(clientOpts.wsHost) : undefined;

  const context = React.createContext({ natsu, socket });
  console.log("Context", { natsu, socket })
  const Provider = (props: React.PropsWithChildren<{}>) => (
    <QueryClientProvider client={queryClient}>
      <context.Provider
        value={{
          natsu,
          socket,
        }}
      >
        {props.children}
      </context.Provider>
    </QueryClientProvider>
  );

  function useNatsuClient() {
    console.log("Retrieving natsu")
    return useContext(context)?.natsu;
  };
  
  function useNatsuSocket() {
    console.log("Retrieving socket")
    return useContext(context)?.socket;
  };
  
  function useSubscribe<Subject extends B['subject']>(
    address: Subject,
    handler: (
      response: NatsPortWSResponse<
        Subject,
        Extract<B, { subject: Subject }>['response']
      >
    ) => Promise<void>
  ) {
    const natsuSocket = useNatsuSocket();
  
    useEffect(() => {
      const subscriber = natsuSocket?.subscribe(address, handler);
  
      return () => {
        subscriber.then(unsub => unsub.unsubscribe())
      };
    }, [address]);
  }
  
  const _useQuery = <Subject extends A['subject']>(
    address: Subject,
    data?: Extract<A, { subject: Subject }>['request'],
    queryOpts?: UseQueryOptions
  ) => {
    console.log("Forwarding to useQuery", {address, data})
    const natsuClient = useNatsuClient();
    const queryFn = async () => {
      console.log("executing query fn", { natsuClient })
      const result = await natsuClient?.(address, data)
      console.log(result)
      return result
    }
  
    return useQuery([address, data], queryFn, queryOpts)
  };
  
  const _useMutation = <Subject extends A['subject']>(
    address: Subject,
    data?: Extract<A, { subject: Subject }>['request'],
    dependencies: [] = [],
    mutationOpts?: UseMutationOptions
  ) => {
    const natsuClient = useNatsuClient();
    const queryFn = async () => natsuClient(address, data)
  
    return useMutation([address, data, ...dependencies], queryFn, mutationOpts)
  };

  return {
    Provider,
    useNatsuClient,
    useNatsuSocket,
    useSubscribe,
    useQuery: _useQuery,
    useMutation: _useMutation
  }
}



export default createClient;
export { createClient }
