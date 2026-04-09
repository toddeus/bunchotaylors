import { CognitoJwtVerifier } from 'aws-jwt-verify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  tokenUse: 'access',
});

/**
 * Verify a Cognito access token from an Authorization header.
 * Strips the "Bearer " prefix before verifying.
 * Throws if the token is missing or invalid.
 * @param {string|undefined} authHeader
 * @returns {Promise<object>} decoded JWT payload
 */
export async function verifyToken(authHeader) {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    throw new Error('Empty token in Authorization header');
  }

  const payload = await verifier.verify(token);
  return payload;
}
