# ALTURA Auth / Users API — Phase 2

Base URL: `http://localhost:4000/api/v1`

## Authentication model

- Access token: signed HS256 JWT, short-lived (`JWT_ACCESS_TTL`, default `15m`).
- Refresh token: opaque 48-byte random token, long-lived (`JWT_REFRESH_TTL`, default `30d`).
- Refresh tokens are stored in PostgreSQL only as an HMAC-SHA256 hash. Raw refresh tokens are never stored.
- Refresh tokens rotate on every successful refresh. A used refresh token is immediately revoked.
- Browser clients also receive the refresh token in an HttpOnly, SameSite=Lax cookie under `/api/v1/auth`.
- The raw refresh token is never returned by register/login/refresh JSON responses. Browser sessions use only the HttpOnly cookie.
- `authVersion` is embedded in access tokens. `logout-all` and password changes increment it, invalidating existing access tokens in addition to revoking refresh sessions.

Passwords are hashed with Node's built-in `scrypt` using a random 16-byte salt. Plaintext passwords are never stored.

## Auth routes

### `POST /auth/register`

Creates a customer account and a default empty wishlist, then opens a session.

Example:

```json
{
  "email": "runner@example.com",
  "password": "a-long-local-password",
  "firstName": "Alex",
  "lastName": "Runner",
  "phone": "+1 555 555 0101"
}
```

### `POST /auth/login`

```json
{
  "email": "runner@example.com",
  "password": "a-long-local-password"
}
```

### `POST /auth/refresh`

Browser clients can send no token in JSON if the HttpOnly refresh cookie is present.

For Swagger/local API testing:

```json
{
  "refreshToken": "..."
}
```

Successful refresh rotates the refresh token.

### `POST /auth/logout`

Revokes the current refresh token and clears the refresh cookie.

### `POST /auth/logout-all`

Bearer token required. Revokes every active refresh token for the account and increments `authVersion`, so previously-issued access tokens become invalid too.

### `GET /auth/me`

Bearer token required. Returns the authenticated identity embedded in the request after database status/version validation.

## Profile routes

All routes below require `Authorization: Bearer <access-token>`.

- `GET /users/me`
- `PATCH /users/me`
- `POST /users/me/password`

`PATCH /users/me` currently changes first name, last name, and phone. Email changes are intentionally deferred until the email-verification flow exists.

Changing password:

1. verifies the current password;
2. requires a different new password;
3. writes a fresh scrypt hash;
4. increments `authVersion`;
5. revokes every refresh session.

The client should treat a successful password change as a sign-out and return the customer to login.

## Address routes

Bearer token required.

- `GET /users/me/addresses`
- `POST /users/me/addresses`
- `GET /users/me/addresses/:addressId`
- `PATCH /users/me/addresses/:addressId`
- `DELETE /users/me/addresses/:addressId`

Rules:

- A customer can only access addresses belonging to their own user ID.
- The first saved address automatically becomes shipping and billing default.
- Setting another address as default unsets the previous default atomically.
- Deleting a default address promotes the newest remaining address where possible.
- Country codes use ISO-style two-letter uppercase values (`CA`, `US`, `EG`, etc.).

## Roles

Database roles are:

- `CUSTOMER`
- `ADMIN`

`JwtAuthGuard`, `RolesGuard`, and the `@Roles(...)` decorator are ready for later protected admin/catalog routes.
