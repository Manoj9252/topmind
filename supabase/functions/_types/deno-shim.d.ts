// Lets `npm run typecheck:functions` check the Edge Functions with tsc.
// Not imported by any function, so Deno never loads it.
declare namespace Deno {
  const env: { get(name: string): string | undefined }
  function serve(handler: (req: Request) => Response | Promise<Response>): void
}
declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
