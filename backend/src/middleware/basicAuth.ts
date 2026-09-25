import { Request, Response, NextFunction } from 'express';

export function basicAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const expectedUser = process.env.BULLBOARD_USER || 'admin';
  const expectedPass = process.env.BULLBOARD_PASS || 'admin123';

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board Admin"');
    return res.status(401).send('Authentication required to access Bull Board dashboard.');
  }

  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8');
  const separatorIndex = credentials.indexOf(':');

  if (separatorIndex === -1) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board Admin"');
    return res.status(401).send('Invalid credentials format.');
  }

  const username = credentials.substring(0, separatorIndex);
  const password = credentials.substring(separatorIndex + 1);

  if (username === expectedUser && password === expectedPass) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board Admin"');
  return res.status(401).send('Invalid credentials.');
}
