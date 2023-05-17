// import "server-only";

import { TRPCClientError, TRPCLink } from '@trpc/client';
import { AnyRouter, callProcedure, inferRouterContext } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { unstable_cache } from 'next/cache';
import { generateCacheTag } from '../shared';

type NextCacheLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
};

export function nextCacheLink<TRouter extends AnyRouter>(
  opts: NextCacheLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type, context } = op;

        const cacheTag = generateCacheTag(path, input);
        const revalidate =
          typeof context?.revalidate === 'number' ? context.revalidate : false;

        const promise = opts
          .createContext()
          .then(async (ctx) => {
            const callProc = async () =>
              callProcedure({
                procedures: opts.router._def.procedures,
                path,
                rawInput: input,
                ctx: ctx,
                type,
              });

            if (type === 'query') {
              return unstable_cache(callProc, path.split('.'), {
                revalidate,
                tags: [cacheTag],
              })();
            }

            return callProc();
          })
          .catch((cause) => observer.error(TRPCClientError.from(cause)));

        promise
          .then((data) => {
            observer.next({ result: { data } });
            observer.complete();
          })
          .catch((cause) => observer.error(TRPCClientError.from(cause)));
      });
}
