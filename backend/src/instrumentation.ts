/**
 * Server start-up hook (Next calls `register()` once, before serving).
 *
 * On AWS the secrets — OPENROUTER_API_KEY, APP_PASSCODE, SESSION_SECRET,
 * ORIGIN_VERIFY_SECRET — are not Lambda environment variables (which anyone
 * with read access to the function configuration can see). They live in SSM
 * Parameter Store as KMS-encrypted SecureStrings under `SECRETS_SSM_PATH`, and
 * are decrypted into `process.env` here, in memory only.
 *
 * Without `SECRETS_SSM_PATH` (local dev, Railway) this does nothing.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const path = process.env.SECRETS_SSM_PATH;
  if (!path) return;

  const { SSMClient, GetParametersByPathCommand } = await import('@aws-sdk/client-ssm');
  const client = new SSMClient({});
  const prefix = path.endsWith('/') ? path : `${path}/`;

  let nextToken: string | undefined;
  let loaded = 0;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({
        Path: prefix,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );
    for (const parameter of page.Parameters ?? []) {
      const name = parameter.Name?.slice(prefix.length);
      if (name && parameter.Value !== undefined && /^[A-Z][A-Z0-9_]*$/.test(name)) {
        process.env[name] = parameter.Value;
        loaded += 1;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  // Names only — never values.
  console.info(`[secrets] loaded ${loaded} secret(s) from SSM ${prefix}`);
}
