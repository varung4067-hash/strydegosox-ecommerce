const jwt = require('jsonwebtoken');

/*
 * Authentication middleware for the StrydeGoSox admin API.
 *
 * Accepts the admin JWT from:
 *   1. Authorization: Bearer <token>
 *   2. The secure sg_auth HTTP-only cookie
 *
 * Supporting both is important because the storefront login
 * uses the HTTP-only cookie, while the standalone admin login
 * also stores a bearer token for the admin dashboard.
 */

function getToken(req) {
  const authorization = req.headers.authorization || '';

  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim();

    if (token) {
      return token;
    }
  }

  const cookieHeader = req.headers.cookie || '';

  const cookies = cookieHeader
    .split(';')
    .map(value => value.trim())
    .filter(Boolean);

  const authCookie = cookies.find(
    cookie => cookie.startsWith('sg_auth=')
  );

  if (authCookie) {
    return decodeURIComponent(
      authCookie.slice('sg_auth='.length)
    );
  }

  return null;
}

function requireAdmin(req, res, next) {
  const token = getToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const isAdmin =
      decoded?.role === 'admin' ||
      decoded?.isAdmin === true;

    if (!isAdmin) {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    req.admin = decoded;

    next();

  } catch (error) {

    console.error(
      'Admin authentication error:',
      error.message
    );

    return res.status(401).json({
      error: 'Session expired. Please sign in again.'
    });
  }
}

module.exports = {
  requireAdmin
};