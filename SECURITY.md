# Security and responsible configuration

- Never commit `.env` or any real API/database credentials.
- The supplied archive contained a populated `.env`; it has been excluded from this public-ready package.
- Before using this source publicly or in a new deployment, rotate any credentials from the supplied `.env` if they are still active.
- Keep MongoDB, JWT, Razorpay, webhook and Resend secrets in private environment configuration only.
- Use test-mode payment credentials for local development.
- Review client data, domain assets and business identifiers before making a client project public.
- Report suspected vulnerabilities to the project owner through an authorised channel.
