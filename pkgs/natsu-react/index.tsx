import React, { useContext, useEffect } from 'react';

import type { Client, NatsuSocket } from '@silenteer/natsu-port-2';
import type {
  NatsChannel,
  NatsPortWSResponse,
  NatsService,
} from '@silenteer/natsu-type';

import { useQuery, QueryClient, QueryClientProvider, UseQueryOptions, useMutation, UseMutationOptions, QueryClientConfig } from "@tanstack/react-query"

export type NatsuOptions<
  A extends NatsService<string, unknown, unknown>,
  B extends NatsChannel<string, unknown, unknown>
> = {
  natsuClient: Client<A>;
  makeNatsuSocketClient?: () => NatsuSocket<B>;
  queryClient?: QueryClient,
  queryClientConfig?: QueryClientConfig 
};

const createNatsuProvider = <
  A extends NatsService<string, unknown, unknown>,
  B extends NatsChannel<string, unknown, unknown>
>({
  natsuClient,
  makeNatsuSocketClient,
  queryClient,
  queryClientConfig
}: NatsuOptions<A, B>) => {
  console.log(">>>>>>>>>>>>>>>>>>>> should call once only")
  const natsuSocket =
    typeof window !== 'undefined' ? makeNatsuSocketClient?.() : undefined;

  const context = React.createContext({
    natsuClient,
    natsuSocket,
  });

  const QueryClientProviderWrapper = ({ children }) => {
    return queryClient
      ? <>{children}</>
      : <QueryClientProvider client={new QueryClient(queryClientConfig)}>
        {children}
      </QueryClientProvider>
  }

  const NatsuProvider = (props: React.PropsWithChildren<{}>) => (
    <QueryClientProviderWrapper>
      <context.Provider
        value={{
          natsuClient,
          natsuSocket,
        }}
      >
        {props.children}
      </context.Provider>
    </QueryClientProviderWrapper>
  );

  const useNatsuClient = () => {
    const { natsuClient } = useContext(context);
    return natsuClient;
  };

  const useNatsuSocket = () => {
    const { natsuSocket } = useContext(context);
    return natsuSocket;
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
    const natsuClient = useNatsuClient();
    const queryFn = async () => natsuClient(address, data)

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
    NatsuProvider,
    useNatsuClient,
    useQuery: _useQuery,
    useMutation: _useMutation,
    useSubscribe,
  };
};

export { createNatsuProvider };
