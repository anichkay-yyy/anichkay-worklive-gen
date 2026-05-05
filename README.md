# anichkay-worklive-gen

Vue + Vite app with a Node backend and a separate cookie-based auth service.

## Development

```sh
npm install
npm run dev
```

- Web: `http://127.0.0.1:5173`
- API service: `http://127.0.0.1:3001`
- Auth service: `http://127.0.0.1:3002`

Vite proxies `/api/*` to the API service and `/auth/*` to the auth service.

Run only the auth service:

```sh
npm run auth
```

Run the auth service without watch mode:

```sh
npm run start:auth
```

## Auth Service

The auth service stores users and sessions in `data/auth.sqlite`.

Endpoints:

- `GET /auth/health`
- `POST /auth/register` with `{ "email": "...", "password": "..." }`
- `POST /auth/login` with `{ "email": "...", "password": "..." }`
- `GET /auth/me`
- `POST /auth/logout`

Sessions use an `HttpOnly` cookie named `worklive_session`. The raw session token is only sent to the browser as a cookie; SQLite stores a SHA-256 hash of the token.
